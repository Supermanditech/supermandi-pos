// T-198: Opening Stock — set initial stock levels for products
// BLK-SP1-FIX: Dual-write to inventory_ledger + stock_balances + store_products
import { Router, Request, Response } from "express";
import { randomUUID } from "crypto";
import { getPool } from "../../../db/client";
import { requireDeviceToken, type PosDeviceContext } from "../../../middleware/deviceToken";
import { requireActiveStore } from "../../../middleware/storeStatusGate";
import { log } from "../../../lib/logger";

export const posOpeningStockRouter = Router();

interface PosRequest extends Request {
  posDevice: PosDeviceContext;
}

// POST /inventory/opening-stock
// Body: { items: [{ productId: string, quantity: number, costPriceMinor?: number }] }
posOpeningStockRouter.post(
  "/inventory/opening-stock",
  requireDeviceToken,
  requireActiveStore,
  async (req: Request, res: Response) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "database unavailable" });

    const { storeId } = (req as PosRequest).posDevice;
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "items array is required" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      let processedCount = 0;

      const skippedDuplicates: string[] = [];

      for (const item of items) {
        if (!item.productId || typeof item.quantity !== "number" || item.quantity <= 0) {
          continue;
        }

        // GCP-STG-0331: Idempotency guard — reject if opening_stock already exists for this product
        const dupCheck = await client.query(
          `SELECT COUNT(*)::int AS cnt FROM inventory.inventory_ledger
           WHERE store_id = $1 AND product_id = $2 AND transaction_type = 'opening_stock'`,
          [storeId, item.productId]
        );
        if (Number(dupCheck.rows[0]?.cnt) > 0) {
          skippedDuplicates.push(item.productId);
          continue;
        }

        const deltaQty = item.quantity;

        // 1. Lock and read current stock_balances for accurate snapshot
        const balanceResult = await client.query(
          `SELECT current_qty FROM inventory.stock_balances
           WHERE store_id = $1 AND product_id = $2
           FOR UPDATE`,
          [storeId, item.productId]
        );
        const stockBefore = Number(balanceResult.rows[0]?.current_qty ?? 0);
        const stockAfter = stockBefore + deltaQty;

        // 2. Insert ledger entry with stock snapshot (satisfies NOT NULL + consistency check)
        const ledgerId = randomUUID();
        await client.query(
          `INSERT INTO inventory.inventory_ledger
           (id, store_id, product_id, delta_qty, transaction_type, reference_type,
            stock_before, stock_after, unit_cost, source, notes, created_at)
           VALUES ($1, $2, $3, $4, 'opening_stock', 'manual',
                   $5, $6, $7, 'POS_OPENING_STOCK', 'Opening stock entry', NOW())`,
          [ledgerId, storeId, item.productId, deltaQty, stockBefore, stockAfter, item.costPriceMinor || null]
        );

        // 3. Upsert stock_balances (matches pattern from stockIn.ts)
        await client.query(
          `INSERT INTO inventory.stock_balances (store_id, product_id, current_qty, last_ledger_id, updated_at)
           VALUES ($1, $2, $3, $4, NOW())
           ON CONFLICT (store_id, product_id) DO UPDATE SET
             current_qty = inventory.stock_balances.current_qty + $5,
             last_ledger_id = $4,
             updated_at = NOW()`,
          [storeId, item.productId, stockAfter, ledgerId, deltaQty]
        );

        // 4. Update store_products denormalized stock
        await client.query(
          `UPDATE catalog.store_products
           SET current_stock = current_stock + $3, updated_at = NOW()
           WHERE store_id = $1 AND product_id = $2`,
          [storeId, item.productId, deltaQty]
        );

        processedCount++;
      }

      await client.query("COMMIT");

      // GCP-STG-0331: If ALL items were duplicates, return 409
      if (processedCount === 0 && skippedDuplicates.length > 0) {
        return res.status(409).json({
          error: "Opening stock already set for this product. Use stock adjustment to correct.",
          duplicateProductIds: skippedDuplicates,
        });
      }

      return res.status(200).json({ processedCount, skippedDuplicates });
    } catch (err) {
      await client.query("ROLLBACK");
      log.error("[opening-stock] Error:", err);
      return res.status(500).json({ error: "Failed to process opening stock" });
    } finally {
      client.release();
    }
  }
);
