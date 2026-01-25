// POS Stock-In Routes - GO-LIVE Phase-1
// Handles stock received at counter from suppliers.
// ReadinessGate probes GET /stock-in; PurchaseScreen submits POST /stock-in.

import { Router, Request, Response } from "express";
import { getPool } from "../../../db/client";
import { requireDeviceToken } from "../../../middleware/deviceToken";
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
    let whereClause = `WHERE il.store_id = $1 AND il.reference_type = 'po'`;
    const params: any[] = [storeId];
    let paramIdx = 2;

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
    const result = await pool.query(
      `SELECT
         il.reference_id as id,
         il.notes as "supplierName",
         COUNT(*) as "itemCount",
         SUM(ABS(il.delta_qty) * COALESCE(il.unit_cost, 0)) as "totalAmount",
         MIN(il.created_at) as "createdAt",
         'completed' as status
       FROM inventory.inventory_ledger il
       ${whereClause}
       GROUP BY il.reference_id, il.notes
       ORDER BY MIN(il.created_at) DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limitNum, offsetNum]
    );

    const entries = result.rows.map(row => ({
      id: row.id,
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

posStockInRouter.post("/stock-in", requireDeviceToken, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ success: false, error: "database unavailable" });

  const { storeId } = (req as any).posDevice as { storeId: string };
  if (!storeId) {
    return res.status(400).json({ success: false, error: "Store not configured" });
  }

  const { items, supplierName, notes, totalAmount } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, error: "items array is required" });
  }

  const ledgerEntryId = randomUUID();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    let itemsProcessed = 0;

    for (const item of items) {
      const { barcode, quantity, buyPrice } = item;

      if (!quantity || quantity <= 0) continue;

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

      // Update stock
      await client.query(
        `UPDATE catalog.store_products
         SET current_stock = $3, updated_at = NOW()
         WHERE store_id = $1 AND product_id = $2`,
        [storeId, productId, newStock]
      );

      // Insert ledger entry to inventory.inventory_ledger
      await client.query(
        `INSERT INTO inventory.inventory_ledger
         (store_id, product_id, delta_qty, transaction_type, reference_type, reference_id,
          stock_before, stock_after, unit_cost, notes)
         VALUES ($1, $2, $3, 'purchase_received', 'po', $4, $5, $6, $7, $8)`,
        [
          storeId,
          productId,
          deltaQty,
          ledgerEntryId,
          currentStock,
          newStock,
          buyPrice || null,
          supplierName || notes || null,
        ]
      );

      // MT-10: Dual-write to inventory.stock_balances for dashboard consistency
      // Get current stock_balances entry
      const balanceResult = await client.query(
        `SELECT current_qty FROM inventory.stock_balances
         WHERE store_id = $1 AND product_id = $2
         FOR UPDATE`,
        [storeId, productId]
      );
      const catalogStockBefore = balanceResult.rows[0]?.current_qty ?? 0;
      const catalogStockAfter = catalogStockBefore + deltaQty;

      // Insert ledger entry to inventory.inventory_ledger
      const invLedgerId = randomUUID();
      await client.query(
        `INSERT INTO inventory.inventory_ledger
         (id, store_id, product_id, delta_qty, transaction_type, reference_type, reference_id,
          stock_before, stock_after, unit_cost, source, notes)
         VALUES ($1, $2, $3, $4, 'purchase_received', 'po', $5, $6, $7, $8, 'POS_STOCK_IN', $9)`,
        [
          invLedgerId,
          storeId,
          productId,
          deltaQty,
          ledgerEntryId,
          catalogStockBefore,
          catalogStockAfter,
          buyPrice || null,
          supplierName || notes || null,
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
        [storeId, productId, catalogStockAfter, invLedgerId, deltaQty]
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
