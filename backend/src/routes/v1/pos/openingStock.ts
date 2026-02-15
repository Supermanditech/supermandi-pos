// T-198: Opening Stock — set initial stock levels for products
import { Router, Request, Response } from "express";
import { getPool } from "../../../db/client";
import { requireDeviceToken, type PosDeviceContext } from "../../../middleware/deviceToken";
import { requireActiveStore } from "../../../middleware/storeStatusGate";

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

        // Insert inventory transaction for opening stock
        await client.query(
          `INSERT INTO inventory_transactions (store_id, product_id, type, quantity, reason, created_at)
           VALUES ($1, $2, 'opening_stock', $3, 'Opening stock entry', NOW())`,
          [storeId, item.productId, item.quantity]
        );

        // Update store_products stock
        await client.query(
          `UPDATE store_products
           SET stock = stock + $3, updated_at = NOW()
           WHERE store_id = $1 AND product_id = $2`,
          [storeId, item.productId, item.quantity]
        );

        processedCount++;
      }

      await client.query("COMMIT");
      return res.status(200).json({ processedCount });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("[opening-stock] Error:", err);
      return res.status(500).json({ error: "Failed to process opening stock" });
    } finally {
      client.release();
    }
  }
);
