// T-198: Opening Stock — set initial stock levels for products
import { Router, Request, Response } from "express";
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

      for (const item of items) {
        if (!item.productId || typeof item.quantity !== "number" || item.quantity <= 0) {
          continue;
        }

        // STG-123: Insert into inventory.inventory_ledger (correct table)
        await client.query(
          `INSERT INTO inventory.inventory_ledger (store_id, product_id, delta_qty, transaction_type, reference_type, notes, created_at)
           VALUES ($1, $2, $3, 'opening_stock', 'manual', 'Opening stock entry', NOW())`,
          [storeId, item.productId, item.quantity]
        );

        // STG-123: Update catalog.store_products.current_stock (correct table/column)
        await client.query(
          `UPDATE catalog.store_products
           SET current_stock = current_stock + $3, updated_at = NOW()
           WHERE store_id = $1 AND product_id = $2`,
          [storeId, item.productId, item.quantity]
        );

        processedCount++;
      }

      await client.query("COMMIT");
      return res.status(200).json({ processedCount });
    } catch (err) {
      await client.query("ROLLBACK");
      log.error("[opening-stock] Error:", err);
      return res.status(500).json({ error: "Failed to process opening stock" });
    } finally {
      client.release();
    }
  }
);
