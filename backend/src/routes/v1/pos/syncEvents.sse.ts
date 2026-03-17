import { Router, Request, Response } from "express";
import { requireDeviceToken } from "../../../middleware/auth";
import { getPool } from "../../../db/client";
import { log } from "../../../lib/logger";

// AUDIT-013: Server-Sent Events (SSE) for real-time POS sync
// POS app connects to this endpoint and receives push notifications when:
// - Product prices change
// - Stock levels change (from other devices or web)
// - New products are added to store
// - Orders are fulfilled (GRN updates)

export const posSyncSseRouter = Router();

// GET /api/v1/pos/sync/events — SSE stream
posSyncSseRouter.get("/sync/events", requireDeviceToken, async (req: Request, res: Response) => {
  const { storeId } = (req as any).posDevice as { storeId: string };
  if (!storeId) {
    return res.status(401).json({ error: "Store not identified" });
  }

  // SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no", // Disable nginx buffering
  });

  // Send initial heartbeat
  res.write(`data: ${JSON.stringify({ type: "connected", storeId, timestamp: new Date().toISOString() })}\n\n`);

  // Poll for changes every 15 seconds (lightweight — no LISTEN/NOTIFY needed)
  let lastCheck = new Date();
  const intervalId = setInterval(async () => {
    try {
      const pool = getPool();
      if (!pool) return;

      // PD-023: Check for recent changes including supplier order updates
      const changes = await pool.query(
        `SELECT 'product_update' as type, COUNT(*) as count
         FROM catalog.store_products
         WHERE store_id = $1 AND updated_at > $2
         UNION ALL
         SELECT 'stock_change' as type, COUNT(*) as count
         FROM inventory.stock_balances
         WHERE store_id = $1 AND updated_at > $2
         UNION ALL
         SELECT 'order_update' as type, COUNT(*) as count
         FROM orders.purchase_orders
         WHERE store_id = $1 AND updated_at > $2`,
        [storeId, lastCheck.toISOString()]
      );

      const hasChanges = changes.rows.some((r: any) => parseInt(r.count, 10) > 0);
      if (hasChanges) {
        const event = {
          type: "sync_required",
          changes: changes.rows.map((r: any) => ({ type: r.type, count: parseInt(r.count, 10) })),
          timestamp: new Date().toISOString(),
        };
        res.write(`data: ${JSON.stringify(event)}\n\n`);
        log.info(`[SSE] Sync event for store ${storeId}: ${JSON.stringify(event.changes)}`);
      } else {
        // Heartbeat every 15s to keep connection alive
        res.write(`: heartbeat ${new Date().toISOString()}\n\n`);
      }

      lastCheck = new Date();
    } catch (err) {
      log.error("[SSE] Poll error:", err);
    }
  }, 15000);

  // Cleanup on client disconnect
  req.on("close", () => {
    clearInterval(intervalId);
    log.info(`[SSE] Client disconnected: store ${storeId}`);
  });
});
