// Inventory Routes - V3.0.10 compliant
// Stock transactions and ledger endpoints

import { Router, Request, Response } from "express";
import { getPool } from "../../../db/client";
import { requireDeviceToken } from "../../../middleware/deviceToken";
import { requireActiveStore } from "../../../middleware/storeStatusGate";
import { randomUUID } from "crypto";
import { log } from "../../../lib/logger";
import { asError } from "../../../lib/errorUtils";

export const posInventoryRouter = Router();

/**
 * BLK-SP1: PostgreSQL NUMERIC type serializes as string in JSON (e.g. "10.000").
 * This helper ensures stock values are always returned as JS numbers in API responses.
 */
function parseStock(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  return isNaN(n) ? 0 : n;
}

// =============================================================================
// GO-LIVE-100: STOCK CACHE WITH TTL
// In-memory cache for stock queries with configurable TTL
// =============================================================================

type StockCacheEntry = {
  currentQty: number;
  cachedAt: number;
};

// Cache: Map<storeId:productId, entry>
const stockCache = new Map<string, StockCacheEntry>();

// GO-LIVE-100: Configurable TTL (default 5 minutes)
const STOCK_CACHE_TTL_MS = parseInt(process.env.STOCK_CACHE_TTL_MS || '300000', 10);

// Cleanup interval (every 10 minutes)
const CACHE_CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

/**
 * GO-LIVE-100: Get cached stock or fetch from database
 */
function getCachedStock(storeId: string, productId: string): StockCacheEntry | null {
  const key = `${storeId}:${productId}`;
  const entry = stockCache.get(key);
  if (!entry) return null;

  // Check TTL
  if (Date.now() - entry.cachedAt > STOCK_CACHE_TTL_MS) {
    stockCache.delete(key);
    return null;
  }

  return entry;
}

/**
 * GO-LIVE-100: Update stock cache
 */
function setCachedStock(storeId: string, productId: string, currentQty: number): void {
  const key = `${storeId}:${productId}`;
  stockCache.set(key, {
    currentQty,
    cachedAt: Date.now(),
  });
}

/**
 * GO-LIVE-100: Invalidate stock cache for a product or entire store
 * GO-LIVE-034: Exported so sync.ts can invalidate cache for offline sales
 */
export function invalidateStockCache(storeId: string, productId?: string): void {
  if (productId) {
    stockCache.delete(`${storeId}:${productId}`);
  } else {
    // Invalidate all products for this store
    for (const key of stockCache.keys()) {
      if (key.startsWith(`${storeId}:`)) {
        stockCache.delete(key);
      }
    }
  }
}

// Periodic cache cleanup
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of stockCache.entries()) {
    if (now - entry.cachedAt > STOCK_CACHE_TTL_MS) {
      stockCache.delete(key);
    }
  }
}, CACHE_CLEANUP_INTERVAL_MS);

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
 * - supplierId: T-062: filter by supplier UUID
 * - productId: filter by product UUID
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

  const { transactionType, referenceType, supplierId, productId, startDate, endDate, limit = "50", offset = "0" } = req.query;

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

    // T-062: Supplier filter
    if (supplierId && typeof supplierId === "string") {
      whereClause += ` AND il.supplier_id = $${paramIndex}::uuid`;
      params.push(supplierId);
      paramIndex++;
    }

    // T-062: Product filter
    if (productId && typeof productId === "string") {
      whereClause += ` AND il.product_id = $${paramIndex}::uuid`;
      params.push(productId);
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
    // ISSUE-MICRO-040: Cap offset to prevent slow sequential scans on large tables
    const offsetNum = Math.min(Math.max(parseInt(offset as string, 10) || 0, 0), 100000);

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM inventory.inventory_ledger il ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.total || "0", 10);

    // Get paginated results with product details
    // T-062: Added supplier_id, adjustment_reason, reversal fields
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
        il.supplier_id as "supplierId",
        il.adjustment_reason as "adjustmentReason",
        il.reversal_of_id as "reversalOfId",
        il.reversed_by_id as "reversedById",
        il.reversed_at as "reversedAt",
        il.source,
        il.notes,
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
    log.info(`[Ledger] Query: storeId=${storeId}, returned=${result.rows.length} of ${total} entries`);

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
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[Ledger] Error:", error.message);

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
posInventoryRouter.post("/inventory/transactions", requireDeviceToken, requireActiveStore, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  // AUD-050: Fixed - use posDevice (set by requireDeviceToken), not posDeviceStatus
  const { storeId } = (req as any).posDevice as { storeId: string };
  if (!storeId) {
    return res.status(400).json({ error: "Store not configured" });
  }

  // ITER2-001 FIX (AUD-074-A): Accept supplierId for traceability
  const { items, transactionType, referenceType, referenceId, notes, supplierId, supplierName } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "items array is required" });
  }

  // ITER2-001: Build structured notes with supplier info for queryability
  // Format: [supplier_id=xxx|name=yyy] Original notes
  // This allows parsing supplier info without DB schema change
  let enrichedNotes = notes || null;
  if (supplierId || supplierName) {
    const supplierMeta = [];
    if (supplierId) supplierMeta.push(`supplier_id=${supplierId}`);
    if (supplierName) supplierMeta.push(`name=${supplierName}`);
    const prefix = `[${supplierMeta.join('|')}]`;
    enrichedNotes = notes ? `${prefix} ${notes}` : prefix;
  }

  if (!transactionType) {
    return res.status(400).json({ error: "transactionType is required" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const entries: any[] = [];

    for (const item of items) {
      // SCALE-C1: Destructure batchNumber and expiryDate for purchase_received tracking
      const { productId, quantity, unitCost, batchNumber, expiryDate } = item;

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

      const currentStock = parseStock(stockResult.rows[0]?.current_stock);

      // Calculate delta based on transaction type
      let deltaQty = quantity;
      if (transactionType === "sale" || transactionType === "adjustment_out") {
        deltaQty = -Math.abs(quantity);
      } else if (transactionType === "purchase_received" || transactionType === "sale_return" || transactionType === "adjustment_in" || transactionType === "stock_in") {
        deltaQty = Math.abs(quantity);
      }

      const newStock = Math.max(0, currentStock + deltaQty);

      // SCALE-C1: Update store_products stock (plus batch_number/expiry_date for purchase_received)
      const isPurchaseReceived = transactionType === "purchase_received" || transactionType === "stock_in";
      const hasBatch = isPurchaseReceived && batchNumber && typeof batchNumber === "string" && batchNumber.trim();
      const hasExpiry = isPurchaseReceived && expiryDate && typeof expiryDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(expiryDate.trim());

      if (hasBatch && hasExpiry) {
        await client.query(
          `UPDATE catalog.store_products
           SET current_stock = $3, batch_number = $4, expiry_date = $5, updated_at = NOW()
           WHERE store_id = $1 AND product_id = $2`,
          [storeId, productId, newStock, batchNumber.trim(), expiryDate.trim()]
        );
      } else if (hasBatch) {
        await client.query(
          `UPDATE catalog.store_products
           SET current_stock = $3, batch_number = $4, updated_at = NOW()
           WHERE store_id = $1 AND product_id = $2`,
          [storeId, productId, newStock, batchNumber.trim()]
        );
      } else if (hasExpiry) {
        await client.query(
          `UPDATE catalog.store_products
           SET current_stock = $3, expiry_date = $4, updated_at = NOW()
           WHERE store_id = $1 AND product_id = $2`,
          [storeId, productId, newStock, expiryDate.trim()]
        );
      } else {
        await client.query(
          `UPDATE catalog.store_products
           SET current_stock = $3, updated_at = NOW()
           WHERE store_id = $1 AND product_id = $2`,
          [storeId, productId, newStock]
        );
      }

      // Get current stock_balances for accurate ledger entry
      const balanceResult = await client.query(
        `SELECT current_qty FROM inventory.stock_balances
         WHERE store_id = $1 AND product_id = $2
         FOR UPDATE`,
        [storeId, productId]
      );
      const stockBalancesBefore = Number(balanceResult.rows[0]?.current_qty ?? 0);
      // Do NOT clamp to 0 — constraint requires stock_before + delta_qty = stock_after
      const stockBalancesAfter = stockBalancesBefore + deltaQty;

      // Map transaction type for inventory schema check constraint
      const invTransactionType = transactionType === 'adjustment_in' ? 'adjustment' :
                                 transactionType === 'adjustment_out' ? 'adjustment' :
                                 transactionType === 'stock_in' ? 'purchase_received' :
                                 transactionType;

      // Insert single ledger entry
      // POS-INV-003: Use proper source column instead of [source=X] notes pattern
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
          enrichedNotes || null,  // POS-INV-003: Source tracked via column, notes for extra info
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

      // GO-LIVE-100: Invalidate cache for this product
      invalidateStockCache(storeId, productId);
    }

    await client.query("COMMIT");

    return res.json({
      success: true,
      data: { entries },
      message: `Recorded ${entries.length} transaction(s)`,
    });
  } catch (_error: unknown) {
    const error = asError(_error);
    await client.query("ROLLBACK");
    log.error("[InventoryTransactions] Error:", error.message);

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
 * GO-LIVE-100: Now uses cache with TTL
 *
 * Query params:
 *   - refresh=true: Force bypass cache and refresh
 *
 * Returns: { data: { storeId, productId, currentQty, cached: boolean } }
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

  // GO-LIVE-100: Check for refresh parameter
  const forceRefresh = req.query.refresh === 'true';

  try {
    // GO-LIVE-100: Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = getCachedStock(storeId, productId);
      if (cached) {
        return res.json({
          data: {
            storeId,
            productId,
            currentQty: cached.currentQty,
            cached: true,
            cachedAt: cached.cachedAt,
          }
        });
      }
    }

    const result = await pool.query(
      `SELECT
        store_id as "storeId",
        product_id as "productId",
        COALESCE(current_qty, 0) as "currentQty"
      FROM inventory.stock_balances
      WHERE store_id = $1 AND product_id = $2`,
      [storeId, productId]
    );

    let currentQty = 0;
    if (result.rowCount && result.rowCount > 0) {
      currentQty = result.rows[0].currentQty;
    }

    // GO-LIVE-100: Update cache
    setCachedStock(storeId, productId, currentQty);

    return res.json({
      data: {
        storeId,
        productId,
        currentQty,
        cached: false,
      }
    });
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[InventoryStock] Get error:", error.message);
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
posInventoryRouter.post("/inventory/stock/batch", requireDeviceToken, requireActiveStore, async (req: Request, res: Response) => {
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
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[InventoryStock] Batch error:", error.message);
    return res.status(500).json({ error: "Failed to get stock batch" });
  }
});

// =============================================================================
// AUD-074-B: STOCK STATEMENT ENDPOINT
// Returns actual store inventory from stock_balances (not cached store_products)
// =============================================================================

/**
 * GET /api/v1/pos/inventory/statement
 * Get complete stock statement with actual inventory from inventory.stock_balances
 * AUD-074-B FIX: Returns ACTUAL store inventory, not supplier/cached stock
 *
 * Query params:
 *   - limit: number (default 200, max 500)
 *   - includeZeroStock: boolean (default true)
 *
 * Returns: { data: Array<{ id, productId, displayName, barcode, sellPrice, purchasePrice, currentStock, stockValue }> }
 */
posInventoryRouter.get("/inventory/statement", requireDeviceToken, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId } = (req as any).posDevice as { storeId: string };
  if (!storeId) {
    return res.status(400).json({ error: "Store not configured" });
  }

  // Parse query params
  const limitParam = Number(req.query.limit) || 200;
  const limit = Math.min(Math.max(1, limitParam), 500); // Clamp to 1-500
  const includeZeroStock = req.query.includeZeroStock !== "false";

  try {
    // AUD-074-B: Query from inventory.stock_balances (actual inventory)
    // JOIN with catalog.store_products and catalog.products for product metadata
    const result = await pool.query(
      `SELECT
        sp.id,
        sp.product_id as "productId",
        COALESCE(p.name, sp.display_name, 'Unknown') as "displayName",
        spb.barcode,
        sp.sell_price as "sellPrice",
        sp.purchase_price as "purchasePrice",
        COALESCE(sb.current_qty, sp.current_stock, 0) as "currentStock",
        sp.mrp,
        p.unit
      FROM catalog.store_products sp
      LEFT JOIN inventory.stock_balances sb
        ON sb.store_id = sp.store_id AND sb.product_id = sp.product_id
      LEFT JOIN catalog.products p
        ON p.id = sp.product_id
      LEFT JOIN LATERAL (
        SELECT barcode FROM catalog.store_product_barcodes
        WHERE store_id = sp.store_id AND store_product_id = sp.id
        LIMIT 1
      ) spb ON true
      WHERE sp.store_id = $1
        AND sp.is_active = true
        ${includeZeroStock ? '' : 'AND COALESCE(sb.current_qty, sp.current_stock, 0) > 0'}
      ORDER BY p.name, sp.display_name
      LIMIT $2`,
      [storeId, limit]
    );

    // Compute stock value for each item
    const data = result.rows.map((row: any) => ({
      id: row.id,
      productId: row.productId,
      displayName: row.displayName,
      barcode: row.barcode || row.productId,
      sellPrice: row.sellPrice ?? 0,
      purchasePrice: row.purchasePrice ?? 0,
      currentStock: parseStock(row.currentStock),
      // STG-129: Use purchasePrice (cost) for stock valuation, fallback to sellPrice
      stockValue: parseStock(row.currentStock) * (row.purchasePrice || row.sellPrice || 0),
      mrp: row.mrp ?? 0,
      unit: row.unit || 'pcs',
    }));

    return res.json({
      success: true,
      data,
      meta: {
        count: data.length,
        limit,
        includeZeroStock,
        source: 'inventory.stock_balances', // AUD-074-B: Indicate data source
      },
    });
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[InventoryStatement] Error:", error.message);
    return res.status(500).json({ error: "Failed to get stock statement" });
  }
});

/**
 * POS-INV-001: GET /api/v1/pos/inventory/statement/export
 * Export stock statement as CSV
 *
 * Query params:
 *   - format: "csv" (only csv supported for now)
 *   - includeZeroStock: boolean (default true)
 */
posInventoryRouter.get("/inventory/statement/export", requireDeviceToken, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId } = (req as any).posDevice as { storeId: string };
  if (!storeId) {
    return res.status(400).json({ error: "Store not configured" });
  }

  const includeZeroStock = req.query.includeZeroStock !== "false";

  try {
    const result = await pool.query(
      `SELECT
        sp.id,
        sp.product_id as "productId",
        COALESCE(p.name, sp.display_name, 'Unknown') as "displayName",
        spb.barcode,
        sp.sell_price as "sellPrice",
        sp.purchase_price as "purchasePrice",
        COALESCE(sb.current_qty, sp.current_stock, 0) as "currentStock",
        sp.mrp,
        p.unit
      FROM catalog.store_products sp
      LEFT JOIN inventory.stock_balances sb
        ON sb.store_id = sp.store_id AND sb.product_id = sp.product_id
      LEFT JOIN catalog.products p
        ON p.id = sp.product_id
      LEFT JOIN LATERAL (
        SELECT barcode FROM catalog.store_product_barcodes
        WHERE store_id = sp.store_id AND store_product_id = sp.id
        LIMIT 1
      ) spb ON true
      WHERE sp.store_id = $1
        AND sp.is_active = true
        ${includeZeroStock ? '' : 'AND COALESCE(sb.current_qty, sp.current_stock, 0) > 0'}
      ORDER BY p.name, sp.display_name`,
      [storeId]
    );

    // Build CSV
    const header = "Product Name,Barcode,Unit,Current Stock,Sell Price,Purchase Price,MRP,Stock Value\n";
    const escCsv = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = result.rows.map((r: any) => {
      const stock = parseStock(r.currentStock);
      const sellPrice = r.sellPrice ?? 0;
      return [
        escCsv(r.displayName),
        escCsv(r.barcode || r.productId),
        escCsv(r.unit || 'pcs'),
        stock,
        sellPrice,
        r.purchasePrice ?? 0,
        r.mrp ?? 0,
        stock * sellPrice,
      ].join(',');
    });

    const csv = header + rows.join('\n');
    const filename = `stock-statement-${new Date().toISOString().split('T')[0]}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csv);
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[InventoryExport] Error:", error.message);
    return res.status(500).json({ error: "Failed to export stock statement" });
  }
});

// =============================================================================
// T-062: INVENTORY VALUATION SUMMARY
// =============================================================================

/**
 * GET /api/v1/pos/inventory/valuation
 * Inventory valuation summary — total stock value at cost and sell price
 *
 * Returns aggregate metrics:
 *   - totalSkus: number of products with stock > 0
 *   - totalUnits: sum of all stock quantities
 *   - totalCostValue: sum(stock × purchase_price) in paise
 *   - totalSellValue: sum(stock × sell_price) in paise
 *   - totalMrpValue: sum(stock × mrp) in paise (where mrp exists)
 *   - potentialMargin: totalSellValue - totalCostValue
 */
posInventoryRouter.get("/inventory/valuation", requireDeviceToken, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId } = (req as any).posDevice as { storeId: string };
  if (!storeId) return res.status(400).json({ error: "Store not configured" });

  try {
    const result = await pool.query(
      `SELECT
        COUNT(*)::int AS "totalSkus",
        COALESCE(SUM(sb.current_qty), 0)::bigint AS "totalUnits",
        COALESCE(SUM(sb.current_qty * COALESCE(sp.purchase_price, 0)), 0)::bigint AS "totalCostValue",
        COALESCE(SUM(sb.current_qty * COALESCE(sp.sell_price, 0)), 0)::bigint AS "totalSellValue",
        COALESCE(SUM(sb.current_qty * COALESCE(sp.mrp, sp.sell_price, 0)), 0)::bigint AS "totalMrpValue"
      FROM inventory.stock_balances sb
      JOIN catalog.store_products sp ON sp.store_id = sb.store_id AND sp.product_id = sb.product_id
      WHERE sb.store_id = $1 AND sb.current_qty > 0 AND sp.is_active = true`,
      [storeId]
    );

    const row = result.rows[0] || {};
    const totalCostValue = Number(row.totalCostValue || 0);
    const totalSellValue = Number(row.totalSellValue || 0);

    return res.json({
      success: true,
      data: {
        totalSkus: Number(row.totalSkus || 0),
        totalUnits: Number(row.totalUnits || 0),
        totalCostValue,
        totalSellValue,
        totalMrpValue: Number(row.totalMrpValue || 0),
        potentialMargin: totalSellValue - totalCostValue,
        asOf: new Date().toISOString(),
      },
    });
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[Valuation] Error:", error.message);
    return res.status(500).json({ error: "Failed to compute valuation" });
  }
});

// =============================================================================
// GO-LIVE-100: MANUAL CACHE REFRESH ENDPOINT
// =============================================================================

/**
 * POST /api/v1/pos/inventory/stock/refresh
 * Manually invalidate and refresh stock cache for a product or entire store
 *
 * Body:
 *   - productId?: string (optional, if omitted invalidates all store products)
 *
 * Returns: { success: true, message: string }
 */
posInventoryRouter.post("/inventory/stock/refresh", requireDeviceToken, requireActiveStore, async (req: Request, res: Response) => {
  const { storeId } = (req as any).posDevice as { storeId: string };
  if (!storeId) {
    return res.status(400).json({ error: "Store not configured" });
  }

  const { productId } = req.body as { productId?: string };

  // GO-LIVE-100: Invalidate cache
  invalidateStockCache(storeId, productId);

  const message = productId
    ? `Cache invalidated for product ${productId}`
    : `Cache invalidated for all products in store`;

  log.info(`[InventoryCache] Refresh requested: storeId=${storeId}, productId=${productId || 'ALL'}`);

  return res.json({
    success: true,
    message,
  });
});

// =============================================================================
// GO-LIVE-094: STOCK BALANCE RECOMPUTE FUNCTION
// Recomputes stock_balances from inventory_ledger for data integrity
// =============================================================================

/**
 * POST /api/v1/pos/inventory/stock/recompute
 * Recompute stock balance from ledger entries for a specific product
 * GO-LIVE-094: This recalculates current_qty by summing all delta_qty from ledger
 *
 * Body:
 *   - productId: string (required)
 *
 * Returns: { success: true, before: number, after: number, ledgerEntries: number }
 */
posInventoryRouter.post("/inventory/stock/recompute", requireDeviceToken, requireActiveStore, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId } = (req as any).posDevice as { storeId: string };
  if (!storeId) {
    return res.status(400).json({ error: "Store not configured" });
  }

  const { productId } = req.body as { productId?: string };
  if (!productId || typeof productId !== "string") {
    return res.status(400).json({ error: "productId is required" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Get current stock balance (before)
    const beforeResult = await client.query(
      `SELECT current_qty FROM inventory.stock_balances
       WHERE store_id = $1 AND product_id = $2
       FOR UPDATE`,
      [storeId, productId]
    );
    const stockBefore = Number(beforeResult.rows[0]?.current_qty ?? 0);

    // GO-LIVE-094: Recompute from ledger entries
    const recomputeResult = await client.query(
      `SELECT
        COALESCE(SUM(delta_qty), 0) as computed_qty,
        COUNT(*) as entry_count
      FROM inventory.inventory_ledger
      WHERE store_id = $1 AND product_id = $2`,
      [storeId, productId]
    );

    const computedQty = Math.max(0, parseInt(recomputeResult.rows[0]?.computed_qty || '0', 10));
    const entryCount = parseInt(recomputeResult.rows[0]?.entry_count || '0', 10);

    // Update stock_balances with recomputed value
    await client.query(
      `INSERT INTO inventory.stock_balances (store_id, product_id, current_qty, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (store_id, product_id) DO UPDATE SET
         current_qty = $3,
         updated_at = NOW()`,
      [storeId, productId, computedQty]
    );

    // Also update denormalized stock in store_products
    await client.query(
      `UPDATE catalog.store_products
       SET current_stock = $3, updated_at = NOW()
       WHERE store_id = $1 AND product_id = $2`,
      [storeId, productId, computedQty]
    );

    await client.query("COMMIT");

    // Invalidate cache
    invalidateStockCache(storeId, productId);

    log.info(`[InventoryRecompute] storeId=${storeId}, productId=${productId}: ${stockBefore} -> ${computedQty} (${entryCount} ledger entries)`);

    return res.json({
      success: true,
      before: stockBefore,
      after: computedQty,
      ledgerEntries: entryCount,
      message: stockBefore !== computedQty
        ? `Stock recomputed: ${stockBefore} -> ${computedQty}`
        : `Stock verified: ${computedQty} (no change needed)`,
    });
  } catch (_error: unknown) {
    const error = asError(_error);
    await client.query("ROLLBACK");
    log.error("[InventoryRecompute] Error:", error.message);
    return res.status(500).json({ error: "Failed to recompute stock" });
  } finally {
    client.release();
  }
});

/**
 * POST /api/v1/pos/inventory/stock/recompute-all
 * Recompute ALL stock balances for the store from ledger entries
 * GO-LIVE-094: Batch recompute for store-wide integrity check
 *
 * WARNING: This can be slow for stores with many products. Use with caution.
 *
 * Returns: { success: true, productsChecked: number, productsFixed: number }
 */
posInventoryRouter.post("/inventory/stock/recompute-all", requireDeviceToken, requireActiveStore, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId } = (req as any).posDevice as { storeId: string };
  if (!storeId) {
    return res.status(400).json({ error: "Store not configured" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Get all products with ledger entries for this store
    const productsResult = await client.query(
      `SELECT DISTINCT product_id FROM inventory.inventory_ledger WHERE store_id = $1`,
      [storeId]
    );

    let productsChecked = 0;
    let productsFixed = 0;

    for (const row of productsResult.rows) {
      const productId = row.product_id;

      // Get current balance
      const balanceResult = await client.query(
        `SELECT current_qty FROM inventory.stock_balances
         WHERE store_id = $1 AND product_id = $2`,
        [storeId, productId]
      );
      const currentQty = Number(balanceResult.rows[0]?.current_qty ?? 0);

      // Recompute from ledger
      const recomputeResult = await client.query(
        `SELECT COALESCE(SUM(delta_qty), 0) as computed_qty
         FROM inventory.inventory_ledger
         WHERE store_id = $1 AND product_id = $2`,
        [storeId, productId]
      );
      const computedQty = Math.max(0, parseInt(recomputeResult.rows[0]?.computed_qty || '0', 10));

      productsChecked++;

      // Only update if different
      if (currentQty !== computedQty) {
        await client.query(
          `INSERT INTO inventory.stock_balances (store_id, product_id, current_qty, updated_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (store_id, product_id) DO UPDATE SET
             current_qty = $3,
             updated_at = NOW()`,
          [storeId, productId, computedQty]
        );

        await client.query(
          `UPDATE catalog.store_products
           SET current_stock = $3, updated_at = NOW()
           WHERE store_id = $1 AND product_id = $2`,
          [storeId, productId, computedQty]
        );

        productsFixed++;
        log.info(`[InventoryRecompute] Fixed: ${productId}: ${currentQty} -> ${computedQty}`);
      }
    }

    await client.query("COMMIT");

    // Invalidate entire store cache
    invalidateStockCache(storeId);

    log.info(`[InventoryRecompute] Store ${storeId}: checked=${productsChecked}, fixed=${productsFixed}`);

    return res.json({
      success: true,
      productsChecked,
      productsFixed,
      message: productsFixed > 0
        ? `Recomputed ${productsFixed} of ${productsChecked} products`
        : `All ${productsChecked} products verified correctly`,
    });
  } catch (_error: unknown) {
    const error = asError(_error);
    await client.query("ROLLBACK");
    log.error("[InventoryRecompute] Error:", error.message);
    return res.status(500).json({ error: "Failed to recompute stock" });
  } finally {
    client.release();
  }
});

// =============================================================================
// GO-LIVE-022: MANUAL STOCK ADJUSTMENT
// =============================================================================

/**
 * POST /api/v1/pos/inventory/stock/adjust
 * Manually adjust stock for a product (increase or decrease)
 * GO-LIVE-022: Allows store owners to correct stock discrepancies
 *
 * Body:
 *   - productId: string (required)
 *   - adjustment: number (required) - positive to add, negative to subtract
 *   - reason: string (required) - one of: damage, theft, expired, found, correction, other
 *   - notes: string (optional) - additional details
 *
 * Returns: { success: true, before: number, after: number, adjustment: number }
 */
posInventoryRouter.post("/inventory/stock/adjust", requireDeviceToken, requireActiveStore, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId } = (req as any).posDevice as { storeId: string };
  if (!storeId) {
    return res.status(400).json({ error: "Store not configured" });
  }

  const { productId, adjustment, reason, notes } = req.body as {
    productId?: string;
    adjustment?: number;
    reason?: string;
    notes?: string;
  };

  if (!productId || typeof productId !== "string") {
    return res.status(400).json({ error: "productId is required" });
  }

  if (typeof adjustment !== "number" || !Number.isFinite(adjustment) || adjustment === 0) {
    return res.status(400).json({ error: "adjustment must be a non-zero number" });
  }

  const validReasons = ["damage", "theft", "expired", "found", "correction", "other"];
  if (!reason || !validReasons.includes(reason)) {
    return res.status(400).json({
      error: "reason is required",
      validReasons
    });
  }

  // Limit adjustment magnitude to prevent abuse
  const MAX_ADJUSTMENT = 10000;
  if (Math.abs(adjustment) > MAX_ADJUSTMENT) {
    return res.status(400).json({
      error: "adjustment_too_large",
      message: `Adjustment cannot exceed ${MAX_ADJUSTMENT} units`
    });
  }

  const deltaQty = Math.round(adjustment);

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Get current stock balance
    const beforeResult = await client.query(
      `SELECT current_qty FROM inventory.stock_balances
       WHERE store_id = $1 AND product_id = $2
       FOR UPDATE`,
      [storeId, productId]
    );
    const stockBefore = Number(beforeResult.rows[0]?.current_qty ?? 0);
    const stockAfter = stockBefore + deltaQty;

    // Prevent negative stock
    if (stockAfter < 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: "insufficient_stock",
        message: `Cannot reduce stock below 0. Current: ${stockBefore}, Adjustment: ${deltaQty}`
      });
    }

    // Create ledger entry
    const invLedgerId = randomUUID();
    await client.query(
      `INSERT INTO inventory.inventory_ledger
       (id, store_id, product_id, delta_qty, transaction_type, reference_type,
        stock_before, stock_after, source, notes, adjustment_reason)
       VALUES ($1, $2, $3, $4, 'adjustment', 'manual', $5, $6, 'POS_MANUAL_ADJUST', $7, $8)`,
      [invLedgerId, storeId, productId, deltaQty, stockBefore, stockAfter, notes ?? null, reason]
    );

    // Update stock_balances
    await client.query(
      `INSERT INTO inventory.stock_balances (store_id, product_id, current_qty, last_ledger_id, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (store_id, product_id) DO UPDATE SET
         current_qty = $3,
         last_ledger_id = $4,
         updated_at = NOW()`,
      [storeId, productId, stockAfter, invLedgerId]
    );

    // Update denormalized stock in store_products
    await client.query(
      `UPDATE catalog.store_products
       SET current_stock = $3, updated_at = NOW()
       WHERE store_id = $1 AND product_id = $2`,
      [storeId, productId, stockAfter]
    );

    // Also update legacy store_inventory if exists
    await client.query(
      `UPDATE store_inventory
       SET available_qty = $3, updated_at = NOW()
       WHERE store_id = $1 AND global_product_id = $2`,
      [storeId, productId, stockAfter]
    );

    await client.query("COMMIT");

    // Invalidate cache
    invalidateStockCache(storeId, productId);

    log.info(`[InventoryAdjust] storeId=${storeId}, productId=${productId}: ${stockBefore} -> ${stockAfter} (${reason})`);

    return res.json({
      success: true,
      productId,
      before: stockBefore,
      after: stockAfter,
      adjustment: deltaQty,
      reason,
      message: `Stock adjusted: ${stockBefore} -> ${stockAfter}`,
    });
  } catch (_error: unknown) {
    const error = asError(_error);
    await client.query("ROLLBACK");
    log.error("[InventoryAdjust] Error:", error.message);
    return res.status(500).json({ error: "Failed to adjust stock" });
  } finally {
    client.release();
  }
});

// =============================================================================
// GO-LIVE-071: PHYSICAL COUNT ENDPOINTS
// =============================================================================

/**
 * POST /api/v1/pos/inventory/physical-count/start
 * Start a new physical count session
 * GO-LIVE-071: Begins a stock-take session
 *
 * Returns: { success: true, countId: string, startedAt: string }
 */
posInventoryRouter.post("/inventory/physical-count/start", requireDeviceToken, requireActiveStore, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId } = (req as any).posDevice as { storeId: string };
  if (!storeId) {
    return res.status(400).json({ error: "Store not configured" });
  }

  const { notes } = req.body as { notes?: string };

  try {
    // Check if there's already an in-progress count
    const existingRes = await pool.query(
      `SELECT id FROM inventory.physical_counts
       WHERE store_id = $1 AND status = 'in_progress'
       LIMIT 1`,
      [storeId]
    );

    if (existingRes.rows[0]) {
      return res.status(409).json({
        error: "count_in_progress",
        message: "A physical count is already in progress",
        countId: existingRes.rows[0].id
      });
    }

    // Create new count session
    const countId = randomUUID();
    await pool.query(
      `INSERT INTO inventory.physical_counts (id, store_id, status, notes)
       VALUES ($1, $2, 'in_progress', $3)`,
      [countId, storeId, notes ?? null]
    );

    // Pre-populate count items with all active products
    await pool.query(
      `INSERT INTO inventory.physical_count_items (count_id, product_id, expected_qty)
       SELECT $1, sp.product_id, COALESCE(sb.current_qty, 0)
       FROM catalog.store_products sp
       LEFT JOIN inventory.stock_balances sb
         ON sb.store_id = sp.store_id AND sb.product_id = sp.product_id
       WHERE sp.store_id = $2 AND sp.is_active = true`,
      [countId, storeId]
    );

    log.info(`[PhysicalCount] Started count ${countId} for store ${storeId}`);

    return res.json({
      success: true,
      countId,
      startedAt: new Date().toISOString(),
      message: "Physical count session started"
    });
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[PhysicalCount] Start error:", error.message);
    return res.status(500).json({ error: "Failed to start physical count" });
  }
});

/**
 * POST /api/v1/pos/inventory/physical-count/:countId/record
 * Record a count for a specific product
 * GO-LIVE-071: Records the physical count for one product
 *
 * Body:
 *   - productId: string (required)
 *   - countedQty: number (required) - the physical count
 *
 * Returns: { success: true, productId: string, expected: number, counted: number, variance: number }
 */
posInventoryRouter.post("/inventory/physical-count/:countId/record", requireDeviceToken, requireActiveStore, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId } = (req as any).posDevice as { storeId: string };
  if (!storeId) {
    return res.status(400).json({ error: "Store not configured" });
  }

  const countId = req.params.countId;
  const { productId, countedQty } = req.body as { productId?: string; countedQty?: number };

  if (!productId) {
    return res.status(400).json({ error: "productId is required" });
  }

  if (typeof countedQty !== "number" || !Number.isFinite(countedQty) || countedQty < 0) {
    return res.status(400).json({ error: "countedQty must be a non-negative number" });
  }

  try {
    // Verify count exists and is in progress
    const countRes = await pool.query(
      `SELECT id, status FROM inventory.physical_counts
       WHERE id = $1 AND store_id = $2`,
      [countId, storeId]
    );

    if (!countRes.rows[0]) {
      return res.status(404).json({ error: "count_not_found" });
    }

    if (countRes.rows[0].status !== "in_progress") {
      return res.status(409).json({
        error: "count_not_in_progress",
        message: `Count is ${countRes.rows[0].status}, cannot record`
      });
    }

    // Update or insert count item
    const result = await pool.query(
      `INSERT INTO inventory.physical_count_items (count_id, product_id, expected_qty, counted_qty, counted_at)
       VALUES ($1, $2, COALESCE((SELECT current_qty FROM inventory.stock_balances WHERE store_id = $3 AND product_id = $2), 0), $4, NOW())
       ON CONFLICT (count_id, product_id) DO UPDATE SET
         counted_qty = $4,
         counted_at = NOW()
       RETURNING expected_qty, counted_qty, variance`,
      [countId, productId, storeId, Math.round(countedQty)]
    );

    const item = result.rows[0];

    return res.json({
      success: true,
      productId,
      expected: item.expected_qty,
      counted: item.counted_qty,
      variance: item.variance
    });
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[PhysicalCount] Record error:", error.message);
    return res.status(500).json({ error: "Failed to record count" });
  }
});

/**
 * POST /api/v1/pos/inventory/physical-count/:countId/complete
 * Complete a physical count session and apply adjustments
 * GO-LIVE-071: Finalizes count and creates adjustment ledger entries for variances
 *
 * Body:
 *   - applyAdjustments: boolean (default: true) - whether to apply variances to stock
 *
 * Returns: { success: true, itemsCounted: number, variancesFound: number, adjustmentsApplied: boolean }
 */
posInventoryRouter.post("/inventory/physical-count/:countId/complete", requireDeviceToken, requireActiveStore, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId } = (req as any).posDevice as { storeId: string };
  if (!storeId) {
    return res.status(400).json({ error: "Store not configured" });
  }

  const countId = req.params.countId;
  const { applyAdjustments = true } = req.body as { applyAdjustments?: boolean };

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Verify count exists and is in progress
    const countRes = await client.query(
      `SELECT id, status FROM inventory.physical_counts
       WHERE id = $1 AND store_id = $2
       FOR UPDATE`,
      [countId, storeId]
    );

    if (!countRes.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "count_not_found" });
    }

    if (countRes.rows[0].status !== "in_progress") {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "count_not_in_progress",
        message: `Count is ${countRes.rows[0].status}, cannot complete`
      });
    }

    // Get count items with variances
    const itemsRes = await client.query(
      `SELECT product_id, expected_qty, counted_qty, variance
       FROM inventory.physical_count_items
       WHERE count_id = $1 AND counted_qty IS NOT NULL`,
      [countId]
    );

    const itemsCounted = itemsRes.rows.length;
    let variancesFound = 0;

    if (applyAdjustments) {
      for (const item of itemsRes.rows) {
        if (item.variance === 0) continue;
        variancesFound++;

        const productId = item.product_id;
        const deltaQty = item.variance;
        const stockBefore = item.expected_qty;
        const stockAfter = item.counted_qty;

        // Create adjustment ledger entry
        const invLedgerId = randomUUID();
        await client.query(
          `INSERT INTO inventory.inventory_ledger
           (id, store_id, product_id, delta_qty, transaction_type, reference_type, reference_id,
            stock_before, stock_after, source, notes, adjustment_reason)
           VALUES ($1, $2, $3, $4, 'adjustment', 'manual', $5, $6, $7, 'PHYSICAL_COUNT', $8, 'correction')`,
          [invLedgerId, storeId, productId, deltaQty, countId, stockBefore, stockAfter,
           `Physical count adjustment: ${stockBefore} -> ${stockAfter}`]
        );

        // Update stock_balances
        await client.query(
          `INSERT INTO inventory.stock_balances (store_id, product_id, current_qty, last_ledger_id, updated_at)
           VALUES ($1, $2, $3, $4, NOW())
           ON CONFLICT (store_id, product_id) DO UPDATE SET
             current_qty = $3,
             last_ledger_id = $4,
             updated_at = NOW()`,
          [storeId, productId, stockAfter, invLedgerId]
        );

        // Update store_products
        await client.query(
          `UPDATE catalog.store_products
           SET current_stock = $3, updated_at = NOW()
           WHERE store_id = $1 AND product_id = $2`,
          [storeId, productId, stockAfter]
        );

        // Update legacy store_inventory
        await client.query(
          `UPDATE store_inventory
           SET available_qty = $3, updated_at = NOW()
           WHERE store_id = $1 AND global_product_id = $2`,
          [storeId, productId, stockAfter]
        );

        // Invalidate cache
        invalidateStockCache(storeId, productId);
      }
    } else {
      variancesFound = itemsRes.rows.filter(i => i.variance !== 0).length;
    }

    // Mark count as completed
    await client.query(
      `UPDATE inventory.physical_counts
       SET status = 'completed', completed_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [countId]
    );

    await client.query("COMMIT");

    log.info(`[PhysicalCount] Completed count ${countId}: ${itemsCounted} items, ${variancesFound} variances`);

    return res.json({
      success: true,
      countId,
      itemsCounted,
      variancesFound,
      adjustmentsApplied: applyAdjustments && variancesFound > 0,
      message: applyAdjustments && variancesFound > 0
        ? `Count completed. Applied ${variancesFound} stock adjustments.`
        : `Count completed. ${variancesFound} variances found (not applied).`
    });
  } catch (_error: unknown) {
    const error = asError(_error);
    await client.query("ROLLBACK");
    log.error("[PhysicalCount] Complete error:", error.message);
    return res.status(500).json({ error: "Failed to complete physical count" });
  } finally {
    client.release();
  }
});
