// Inventory Routes - V3.0.10 compliant
// Stock transactions and ledger endpoints

import { Router, Request, Response } from "express";
import { getPool } from "../../../db/client";
import { requireDeviceToken } from "../../../middleware/deviceToken";
import { randomUUID } from "crypto";

export const posInventoryRouter = Router();

// =============================================================================
// LEDGER ENDPOINT - GO-LIVE-006/007
// =============================================================================

/**
 * GET /api/v1/pos/inventory/ledger
 * Get ledger entries for reports (Purchase History, Sales Statement)
 *
 * Query params:
 * - transactionType: filter by type (sale, purchase_received, etc.)
 * - referenceType: filter by reference (sale, po, manual, return)
 * - startDate: filter from date (ISO string)
 * - endDate: filter to date (ISO string)
 * - limit: page size (default 50, max 200)
 * - offset: pagination offset
 */
posInventoryRouter.get("/inventory/ledger", requireDeviceToken, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  // AUD-050: Fixed - use posDevice (set by requireDeviceToken), not posDeviceStatus
  const { storeId } = (req as any).posDevice as { storeId: string };
  if (!storeId) {
    return res.status(400).json({ error: "Store not configured" });
  }

  const { transactionType, referenceType, startDate, endDate, limit = "50", offset = "0" } = req.query;

  try {
    let whereClause = "WHERE il.store_id = $1";
    const params: any[] = [storeId];
    let paramIndex = 2;

    if (transactionType && typeof transactionType === "string") {
      whereClause += ` AND il.transaction_type = $${paramIndex}`;
      params.push(transactionType);
      paramIndex++;
    }

    if (referenceType && typeof referenceType === "string") {
      whereClause += ` AND il.reference_type = $${paramIndex}`;
      params.push(referenceType);
      paramIndex++;
    }

    if (startDate && typeof startDate === "string") {
      whereClause += ` AND il.created_at >= $${paramIndex}`;
      params.push(new Date(startDate).toISOString());
      paramIndex++;
    }

    if (endDate && typeof endDate === "string") {
      whereClause += ` AND il.created_at <= $${paramIndex}`;
      params.push(new Date(endDate).toISOString());
      paramIndex++;
    }

    const limitNum = Math.min(parseInt(limit as string, 10) || 50, 200);
    const offsetNum = parseInt(offset as string, 10) || 0;

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM inventory.inventory_ledger il ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.total || "0", 10);

    // Get paginated results with product details
    // AUD-050: Fixed sp.name -> COALESCE(sp.display_name, p.name), sp.barcode -> p.primary_barcode
    // ITER2: Added null-safe fallbacks for productName and barcode
    const result = await pool.query(
      `SELECT
        il.id,
        il.store_id as "storeId",
        il.product_id as "productId",
        COALESCE(sp.display_name, p.name, 'Unknown Product') as "productName",
        COALESCE(p.primary_barcode, '') as barcode,
        il.delta_qty as "deltaQty",
        il.transaction_type as "transactionType",
        il.reference_type as "referenceType",
        il.reference_id as "referenceId",
        il.stock_before as "stockBefore",
        il.stock_after as "stockAfter",
        il.unit_cost as "unitCost",
        il.created_at as "createdAt"
      FROM inventory.inventory_ledger il
      LEFT JOIN catalog.store_products sp ON sp.store_id = il.store_id AND sp.product_id = il.product_id
      LEFT JOIN catalog.products p ON p.id = il.product_id
      ${whereClause}
      ORDER BY il.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limitNum, offsetNum]
    );

    // ITER2: Log ledger query results for audit trail
    console.log(`[Ledger] Query: storeId=${storeId}, returned=${result.rows.length} of ${total} entries`);

    return res.json({
      success: true,
      data: result.rows,
      pagination: {
        total,
        limit: limitNum,
        offset: offsetNum,
        hasMore: offsetNum + result.rows.length < total,
      },
    });
  } catch (error: any) {
    console.error("[Ledger] Error:", error.message);

    // If table doesn't exist, return empty list
    if (error.code === "42P01") {
      return res.json({
        success: true,
        data: [],
        pagination: {
          total: 0,
          limit: 50,
          offset: 0,
          hasMore: false,
        },
      });
    }

    return res.status(500).json({
      success: false,
      error: "Failed to load ledger entries",
    });
  }
});

// =============================================================================
// INVENTORY TRANSACTIONS - GO-LIVE-004
// =============================================================================

/**
 * POST /api/v1/pos/inventory/transactions
 * Record stock transactions (inward, sale, adjustment)
 */
posInventoryRouter.post("/inventory/transactions", requireDeviceToken, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  // AUD-050: Fixed - use posDevice (set by requireDeviceToken), not posDeviceStatus
  const { storeId } = (req as any).posDevice as { storeId: string };
  if (!storeId) {
    return res.status(400).json({ error: "Store not configured" });
  }

  const { items, transactionType, referenceType, referenceId, notes } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "items array is required" });
  }

  if (!transactionType) {
    return res.status(400).json({ error: "transactionType is required" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const entries: any[] = [];

    for (const item of items) {
      const { productId, quantity, unitCost } = item;

      if (!productId || quantity === undefined || quantity === 0) {
        continue;
      }

      // Get current stock
      const stockResult = await client.query(
        `SELECT current_stock FROM catalog.store_products
         WHERE store_id = $1 AND product_id = $2
         FOR UPDATE`,
        [storeId, productId]
      );

      const currentStock = stockResult.rows[0]?.current_stock ?? 0;

      // Calculate delta based on transaction type
      let deltaQty = quantity;
      if (transactionType === "sale" || transactionType === "adjustment_out") {
        deltaQty = -Math.abs(quantity);
      } else if (transactionType === "purchase_received" || transactionType === "sale_return" || transactionType === "adjustment_in") {
        deltaQty = Math.abs(quantity);
      }

      const newStock = Math.max(0, currentStock + deltaQty);

      // Update store_products stock
      await client.query(
        `UPDATE catalog.store_products
         SET current_stock = $3, updated_at = NOW()
         WHERE store_id = $1 AND product_id = $2`,
        [storeId, productId, newStock]
      );

      // Get current stock_balances for accurate ledger entry
      const balanceResult = await client.query(
        `SELECT current_qty FROM inventory.stock_balances
         WHERE store_id = $1 AND product_id = $2
         FOR UPDATE`,
        [storeId, productId]
      );
      const stockBalancesBefore = balanceResult.rows[0]?.current_qty ?? 0;
      const stockBalancesAfter = Math.max(0, stockBalancesBefore + deltaQty);

      // Map transaction type for inventory schema check constraint
      const invTransactionType = transactionType === 'adjustment_in' ? 'adjustment' :
                                 transactionType === 'adjustment_out' ? 'adjustment' :
                                 transactionType;

      // Insert single ledger entry with source tracking
      const invLedgerId = randomUUID();
      const ledgerResult = await client.query(
        `INSERT INTO inventory.inventory_ledger
         (id, store_id, product_id, delta_qty, transaction_type, reference_type, reference_id,
          stock_before, stock_after, unit_cost, source, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'POS_INVENTORY', $11)
         RETURNING
           id,
           store_id as "storeId",
           product_id as "productId",
           delta_qty as "deltaQty",
           transaction_type as "transactionType",
           reference_type as "referenceType",
           reference_id as "referenceId",
           stock_before as "stockBefore",
           stock_after as "stockAfter",
           created_at as "createdAt"`,
        [
          invLedgerId,
          storeId,
          productId,
          deltaQty,
          invTransactionType,
          referenceType || 'manual',
          referenceId || null,
          stockBalancesBefore,
          stockBalancesAfter,
          unitCost || null,
          notes || null,
        ]
      );

      // Upsert stock_balances
      await client.query(
        `INSERT INTO inventory.stock_balances (store_id, product_id, current_qty, last_ledger_id, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (store_id, product_id) DO UPDATE SET
           current_qty = GREATEST(0, inventory.stock_balances.current_qty + $5),
           last_ledger_id = $4,
           updated_at = NOW()`,
        [storeId, productId, stockBalancesAfter, invLedgerId, deltaQty]
      );

      entries.push(ledgerResult.rows[0]);
    }

    await client.query("COMMIT");

    return res.json({
      success: true,
      data: { entries },
      message: `Recorded ${entries.length} transaction(s)`,
    });
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("[InventoryTransactions] Error:", error.message);

    return res.status(500).json({
      success: false,
      error: "Failed to record transactions",
    });
  } finally {
    client.release();
  }
});

// =============================================================================
// GAP-001: STOCK LOOKUP ENDPOINTS
// Single and batch stock balance queries
// =============================================================================

/**
 * GET /api/v1/pos/inventory/stock/:productId
 * Get current stock for a single product
 *
 * Returns: { data: { storeId, productId, currentQty } }
 */
posInventoryRouter.get("/inventory/stock/:productId", requireDeviceToken, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId } = (req as any).posDevice as { storeId: string };
  if (!storeId) {
    return res.status(400).json({ error: "Store not configured" });
  }

  const { productId } = req.params;
  if (!productId || typeof productId !== "string") {
    return res.status(400).json({ error: "productId is required" });
  }

  try {
    const result = await pool.query(
      `SELECT
        store_id as "storeId",
        product_id as "productId",
        COALESCE(current_qty, 0) as "currentQty"
      FROM inventory.stock_balances
      WHERE store_id = $1 AND product_id = $2`,
      [storeId, productId]
    );

    if (result.rowCount === 0) {
      // No balance record = 0 stock
      return res.json({
        data: {
          storeId,
          productId,
          currentQty: 0
        }
      });
    }

    return res.json({
      data: result.rows[0]
    });
  } catch (error: any) {
    console.error("[InventoryStock] Get error:", error.message);
    return res.status(500).json({ error: "Failed to get stock" });
  }
});

/**
 * POST /api/v1/pos/inventory/stock/batch
 * Get current stock for multiple products
 *
 * Body: { productIds: string[] }
 * Returns: { data: Array<{ storeId, productId, currentQty }> }
 */
posInventoryRouter.post("/inventory/stock/batch", requireDeviceToken, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId } = (req as any).posDevice as { storeId: string };
  if (!storeId) {
    return res.status(400).json({ error: "Store not configured" });
  }

  const { productIds } = req.body as { productIds?: string[] };
  if (!Array.isArray(productIds) || productIds.length === 0) {
    return res.status(400).json({ error: "productIds array is required" });
  }

  // Limit batch size to prevent abuse
  const MAX_BATCH_SIZE = 100;
  if (productIds.length > MAX_BATCH_SIZE) {
    return res.status(400).json({ error: `Batch size exceeds maximum of ${MAX_BATCH_SIZE}` });
  }

  try {
    // Query all requested products
    const result = await pool.query(
      `SELECT
        store_id as "storeId",
        product_id as "productId",
        COALESCE(current_qty, 0) as "currentQty"
      FROM inventory.stock_balances
      WHERE store_id = $1 AND product_id = ANY($2::uuid[])`,
      [storeId, productIds]
    );

    // Create a map of found results
    const foundMap = new Map<string, { storeId: string; productId: string; currentQty: number }>();
    for (const row of result.rows) {
      foundMap.set(row.productId, row);
    }

    // Return all requested products, defaulting to 0 for unfound
    const data = productIds.map((productId) => {
      const found = foundMap.get(productId);
      if (found) return found;
      return {
        storeId,
        productId,
        currentQty: 0
      };
    });

    return res.json({ data });
  } catch (error: any) {
    console.error("[InventoryStock] Batch error:", error.message);
    return res.status(500).json({ error: "Failed to get stock batch" });
  }
});
