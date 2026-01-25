// Inventory Routes - V3.0.10 compliant
// Stock transactions and ledger endpoints

import { Router, Request, Response } from "express";
import { getPool } from "../../../db/client";
import { requireDeviceToken, type PosDeviceStatusContext } from "../../../middleware/deviceToken";
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

  const status = (req as any).posDeviceStatus as PosDeviceStatusContext;
  if (!status.storeId) {
    return res.status(400).json({ error: "Store not configured" });
  }

  const { transactionType, referenceType, startDate, endDate, limit = "50", offset = "0" } = req.query;

  try {
    let whereClause = "WHERE il.store_id = $1";
    const params: any[] = [status.storeId];
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
      `SELECT COUNT(*) as total FROM catalog.inventory_ledger il ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.total || "0", 10);

    // Get paginated results with product details
    const result = await pool.query(
      `SELECT
        il.id,
        il.store_id as "storeId",
        il.product_id as "productId",
        sp.name as "productName",
        sp.barcode,
        il.delta_qty as "deltaQty",
        il.transaction_type as "transactionType",
        il.reference_type as "referenceType",
        il.reference_id as "referenceId",
        il.stock_before as "stockBefore",
        il.stock_after as "stockAfter",
        il.unit_cost as "unitCost",
        il.created_at as "createdAt"
      FROM catalog.inventory_ledger il
      LEFT JOIN catalog.store_products sp ON sp.store_id = il.store_id AND sp.product_id = il.product_id
      ${whereClause}
      ORDER BY il.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limitNum, offsetNum]
    );

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

  const status = (req as any).posDeviceStatus as PosDeviceStatusContext;
  if (!status.storeId) {
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
        `SELECT stock_on_hand FROM catalog.store_products
         WHERE store_id = $1 AND product_id = $2
         FOR UPDATE`,
        [status.storeId, productId]
      );

      const currentStock = stockResult.rows[0]?.stock_on_hand ?? 0;

      // Calculate delta based on transaction type
      let deltaQty = quantity;
      if (transactionType === "sale" || transactionType === "adjustment_out") {
        deltaQty = -Math.abs(quantity);
      } else if (transactionType === "purchase_received" || transactionType === "sale_return" || transactionType === "adjustment_in") {
        deltaQty = Math.abs(quantity);
      }

      const newStock = Math.max(0, currentStock + deltaQty);

      // Update stock
      await client.query(
        `UPDATE catalog.store_products
         SET stock_on_hand = $3, updated_at = NOW()
         WHERE store_id = $1 AND product_id = $2`,
        [status.storeId, productId, newStock]
      );

      // Insert ledger entry to catalog.inventory_ledger
      const ledgerResult = await client.query(
        `INSERT INTO catalog.inventory_ledger
         (store_id, product_id, delta_qty, transaction_type, reference_type, reference_id, stock_before, stock_after, unit_cost, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
          status.storeId,
          productId,
          deltaQty,
          transactionType,
          referenceType || null,
          referenceId || null,
          currentStock,
          newStock,
          unitCost || null,
          notes || null,
        ]
      );

      // MT-10: Dual-write to inventory.stock_balances for dashboard consistency
      // Get current stock_balances entry
      const balanceResult = await client.query(
        `SELECT current_qty FROM inventory.stock_balances
         WHERE store_id = $1 AND product_id = $2
         FOR UPDATE`,
        [status.storeId, productId]
      );
      const catalogStockBefore = balanceResult.rows[0]?.current_qty ?? 0;
      const catalogStockAfter = Math.max(0, catalogStockBefore + deltaQty);

      // Map transaction type for inventory schema
      const invTransactionType = transactionType === 'adjustment_in' ? 'adjustment' :
                                 transactionType === 'adjustment_out' ? 'adjustment' :
                                 transactionType;

      // Insert ledger entry to inventory.inventory_ledger
      const invLedgerId = randomUUID();
      await client.query(
        `INSERT INTO inventory.inventory_ledger
         (id, store_id, product_id, delta_qty, transaction_type, reference_type, reference_id,
          stock_before, stock_after, unit_cost, source, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'POS_INVENTORY', $11)`,
        [
          invLedgerId,
          status.storeId,
          productId,
          deltaQty,
          invTransactionType,
          referenceType || 'manual',
          referenceId || null,
          catalogStockBefore,
          catalogStockAfter,
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
        [status.storeId, productId, catalogStockAfter, invLedgerId, deltaQty]
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
