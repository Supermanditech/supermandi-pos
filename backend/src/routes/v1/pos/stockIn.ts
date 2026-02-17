// POS Stock-In Routes - GO-LIVE Phase-1
// Handles stock received at counter from suppliers.
// ReadinessGate probes GET /stock-in; PurchaseScreen submits POST /stock-in.

import { Router, Request, Response } from "express";
import { getPool } from "../../../db/client";
import { requireDeviceToken } from "../../../middleware/deviceToken";
import { requireActiveStore } from "../../../middleware/storeStatusGate";
import { requirePosStaff, requireRole } from "../../../middleware/posStaff";
import type { PosStaffContext } from "../../../middleware/posStaff";
import { randomUUID } from "crypto";

export const posStockInRouter = Router();

// =============================================================================
// GET /api/v1/pos/stock-in
// Returns recent stock-in entries for readinessGate probe + history display.
// =============================================================================

posStockInRouter.get("/stock-in", requireDeviceToken, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ success: false, error: "database unavailable" });

  const { storeId } = (req as any).posDevice as { storeId: string };
  if (!storeId) {
    return res.status(400).json({ success: false, error: "Store not configured" });
  }

  const { limit = "20", offset = "0", status: filterStatus } = req.query;
  const limitNum = Math.min(parseInt(limit as string, 10) || 20, 100);
  const offsetNum = parseInt(offset as string, 10) || 0;

  try {
    // Group inventory_ledger entries by reference_id where reference_type = 'po'
    const whereClause = `WHERE il.store_id = $1 AND il.reference_type = 'po'`;
    const params: any[] = [storeId];
    const paramIdx = 2;

    if (filterStatus && typeof filterStatus === "string") {
      // For now all stock-in entries are 'completed' once written
      // Future: could add pending/cancelled states
      if (filterStatus !== "completed") {
        // No entries with other statuses exist yet
        return res.json({
          success: true,
          data: { entries: [] },
          pagination: { total: 0, limit: limitNum, offset: offsetNum },
        });
      }
    }

    // Count distinct batches
    const countResult = await pool.query(
      `SELECT COUNT(DISTINCT reference_id) as total
       FROM inventory.inventory_ledger il
       ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.total || "0", 10);

    // Get grouped entries
    // AUD-074-A FIX: Include supplier_id and join with supplier.suppliers for name
    const result = await pool.query(
      `SELECT
         il.reference_id as id,
         il.supplier_id as "supplierId",
         COALESCE(s.business_name, s.trade_name, il.notes) as "supplierName",
         COUNT(*) as "itemCount",
         SUM(ABS(il.delta_qty) * COALESCE(il.unit_cost, 0)) as "totalAmount",
         MIN(il.created_at) as "createdAt",
         'completed' as status
       FROM inventory.inventory_ledger il
       LEFT JOIN supplier.suppliers s ON s.id = il.supplier_id
       ${whereClause}
       GROUP BY il.reference_id, il.supplier_id, s.business_name, s.trade_name, il.notes
       ORDER BY MIN(il.created_at) DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limitNum, offsetNum]
    );

    const entries = result.rows.map(row => ({
      id: row.id,
      supplierId: row.supplierId || undefined,
      supplierName: row.supplierName || undefined,
      itemCount: parseInt(row.itemCount, 10),
      totalAmount: parseFloat(row.totalAmount) || 0,
      createdAt: row.createdAt,
      status: row.status,
    }));

    return res.json({
      success: true,
      data: { entries },
      pagination: { total, limit: limitNum, offset: offsetNum },
    });
  } catch (error: any) {
    console.error("[stock-in] GET error:", error.message);

    // Table might not exist yet — return empty
    if (error.code === "42P01") {
      return res.json({
        success: true,
        data: { entries: [] },
        pagination: { total: 0, limit: limitNum, offset: offsetNum },
      });
    }

    return res.status(500).json({ success: false, error: "Failed to fetch stock-in entries" });
  }
});

// =============================================================================
// POST /api/v1/pos/stock-in
// Submit a stock-in batch (products received from supplier).
// =============================================================================

// BUG-003: Enforce store must be ACTIVE for stock-in
posStockInRouter.post("/stock-in", requireDeviceToken, requireActiveStore, requirePosStaff, requireRole("STOCK_MANAGER", "MANAGER"), async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ success: false, error: "database unavailable" });

  const { storeId } = (req as any).posDevice as { storeId: string };
  if (!storeId) {
    return res.status(400).json({ success: false, error: "Store not configured" });
  }

  // AUD-074-A FIX: Accept supplierId for proper FK tracking
  // SA-P0-004: Accept supplierGstin for GSTIN tracking on stock-in
  // T-207: Accept optional orderId for PO validation
  const { items, supplierId, supplierName, supplierGstin, notes, totalAmount, idempotencyKey, orderId } = req.body;

  // PRA-080 + AUDIT-API-011: Idempotency check — prevent duplicate stock-in on double-submit
  // Require idempotency key for all stock-in operations (backward-compat: warn if missing)
  if (idempotencyKey && typeof idempotencyKey === "string") {
    // Use advisory lock to prevent race condition (check-then-act atomicity)
    // hashCode of idempotencyKey as lock ID — advisory locks are session-scoped
    const lockId = Math.abs(idempotencyKey.split('').reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a; }, 0));
    const lockClient = await pool.connect();
    try {
      await lockClient.query(`SELECT pg_advisory_lock($1)`, [lockId]);
      const dupCheck = await lockClient.query(
        `SELECT id FROM inventory.inventory_ledger
         WHERE store_id = $1 AND reference_id = $2 AND transaction_type = 'purchase_received'
         LIMIT 1`,
        [storeId, idempotencyKey]
      );
      if (dupCheck.rows.length > 0) {
        await lockClient.query(`SELECT pg_advisory_unlock($1)`, [lockId]);
        lockClient.release();
        return res.json({
          success: true,
          data: { ledgerEntryId: idempotencyKey, itemsProcessed: 0, duplicate: true },
        });
      }
      await lockClient.query(`SELECT pg_advisory_unlock($1)`, [lockId]);
    } finally {
      lockClient.release();
    }
  }

  // SA-P0-004: Validate GSTIN format if provided
  if (supplierGstin && typeof supplierGstin === "string" && supplierGstin.trim()) {
    const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    if (!GSTIN_PATTERN.test(supplierGstin.trim())) {
      return res.status(400).json({ success: false, error: "Invalid GSTIN format" });
    }
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, error: "items array is required" });
  }

  // BUG-004: Validate all item quantities upfront before processing
  for (let i = 0; i < items.length; i++) {
    const qty = items[i]?.quantity;
    if (qty === undefined || qty === null || typeof qty !== "number" || !Number.isFinite(qty) || qty <= 0) {
      return res.status(400).json({
        success: false,
        error: "INVALID_QUANTITY",
        message: `Item ${i}: quantity must be a positive number, got: ${qty}`,
      });
    }
  }

  // T-207: Validate PO exists if orderId is provided (backward compatible — orderId is optional)
  if (orderId && typeof orderId === "string") {
    const poCheck = await pool.query(
      `SELECT id, status FROM orders.purchase_orders WHERE id = $1 AND store_id = $2 LIMIT 1`,
      [orderId, storeId]
    );
    if (poCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "PO_NOT_FOUND",
        message: "Purchase order not found for this store",
      });
    }
    const poStatus = poCheck.rows[0].status;
    if (poStatus === "cancelled") {
      return res.status(400).json({
        success: false,
        error: "PO_CANCELLED",
        message: "Cannot receive stock against a cancelled purchase order",
      });
    }
  }

  // AUDIT-API-011: Use client-provided idempotency key as ledger reference for dedup
  const ledgerEntryId = (idempotencyKey && typeof idempotencyKey === "string") ? idempotencyKey : randomUUID();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    let itemsProcessed = 0;

    for (const item of items) {
      const { barcode, quantity, buyPrice } = item;

      // BUG-004: quantity validated upfront — always positive here

      // Look up product by barcode in store_product_barcodes + store_products
      const productResult = await client.query(
        `SELECT sp.product_id, sp.current_stock
         FROM catalog.store_product_barcodes spb
         JOIN catalog.store_products sp ON sp.store_id = spb.store_id AND sp.id = spb.store_product_id
         WHERE spb.store_id = $1 AND spb.barcode = $2 AND sp.is_active = true
         LIMIT 1
         FOR UPDATE OF sp`,
        [storeId, barcode]
      );

      let productId: string;
      let currentStock: number;

      if (productResult.rows.length > 0) {
        productId = productResult.rows[0].product_id;
        currentStock = productResult.rows[0].current_stock ?? 0;
      } else {
        // Product not in store catalog — skip (can't stock-in unknown product)
        console.log(`[stock-in] Skipping unknown barcode ${barcode} for store ${storeId}`);
        continue;
      }

      const deltaQty = Math.abs(quantity);
      const newStock = currentStock + deltaQty;

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
      const stockBalancesAfter = stockBalancesBefore + deltaQty;

      // Insert single ledger entry to inventory.inventory_ledger with source tracking
      // AUD-074-A FIX: Include supplier_id FK for proper supplier tracking
      // SA-P0-004: Include supplier_gstin for GSTIN tracking
      const invLedgerId = randomUUID();
      await client.query(
        `INSERT INTO inventory.inventory_ledger
         (id, store_id, product_id, delta_qty, transaction_type, reference_type, reference_id,
          stock_before, stock_after, unit_cost, source, notes, supplier_id, supplier_gstin)
         VALUES ($1, $2, $3, $4, 'purchase_received', 'po', $5, $6, $7, $8, 'POS_STOCK_IN', $9, $10, $11)`,
        [
          invLedgerId,
          storeId,
          productId,
          deltaQty,
          ledgerEntryId,
          stockBalancesBefore,
          stockBalancesAfter,
          buyPrice || null,
          supplierName || notes || null,
          supplierId || null,
          (typeof supplierGstin === "string" ? supplierGstin.trim() : null) || null,
        ]
      );

      // Upsert stock_balances
      await client.query(
        `INSERT INTO inventory.stock_balances (store_id, product_id, current_qty, last_ledger_id, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (store_id, product_id) DO UPDATE SET
           current_qty = inventory.stock_balances.current_qty + $5,
           last_ledger_id = $4,
           updated_at = NOW()`,
        [storeId, productId, stockBalancesAfter, invLedgerId, deltaQty]
      );

      itemsProcessed++;
    }

    await client.query("COMMIT");

    return res.json({
      success: true,
      data: {
        ledgerEntryId,
        itemsProcessed,
        totalAmount: totalAmount || 0,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("[stock-in] POST error:", error.message);
    return res.status(500).json({ success: false, error: "Failed to record stock-in" });
  } finally {
    client.release();
  }
});
