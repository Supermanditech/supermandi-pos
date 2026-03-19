/**
 * V3-HARDEN-188: POS lifecycle event endpoints
 *
 * GET /api/v1/pos/lifecycle/events — Order lifecycle timeline for a store
 * GET /api/v1/pos/lifecycle/events/:orderId — Events for a specific order
 * GET /api/v1/pos/lifecycle/stats — Fan-out stats (observability)
 */

import { Router, Request, Response } from "express";
import { requireDeviceToken, PosDeviceContext } from "../../../middleware/deviceToken";
import {
  getStoreLifecycleEvents,
  getOrderLifecycleEvents,
  getLifecycleStats,
} from "../../../services/lifecycleEventService";
import type { LifecycleEventType } from "../../../services/storeDemandSignal";
import { log } from "../../../lib/logger";
import { asError } from "../../../lib/errorUtils";

export const posLifecycleEventsRouter = Router();

function getStoreIdFromDevice(req: Request): string {
  const posDevice = (req as any).posDevice as PosDeviceContext;
  return posDevice.storeId!;
}

/**
 * GET /api/v1/pos/lifecycle/events
 * Store lifecycle timeline.
 */
posLifecycleEventsRouter.get("/lifecycle/events", requireDeviceToken, async (req: Request, res: Response) => {
  try {
    const storeId = getStoreIdFromDevice(req);
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 200);
    const eventType = req.query.eventType as LifecycleEventType | undefined;

    const events = await getStoreLifecycleEvents(storeId, { limit, eventType });
    return res.json({ success: true, data: events });
  } catch (err) {
    log.error("lifecycle:pos:events", asError(err).message);
    return res.status(500).json({ error: "Failed to load lifecycle events" });
  }
});

/**
 * GET /api/v1/pos/lifecycle/events/:orderId
 * Events for a specific order.
 */
posLifecycleEventsRouter.get("/lifecycle/events/:orderId", requireDeviceToken, async (req: Request, res: Response) => {
  try {
    const storeId = getStoreIdFromDevice(req);
    const { orderId } = req.params;

    // P0-4: Enforce store ownership — verify order belongs to this device's store
    const { getPool } = require("../../../db/client");
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "Database unavailable" });

    const ownerCheck = await pool.query(
      `SELECT 1 FROM public.lifecycle_event_log
       WHERE order_id = $1 AND store_id = $2
       LIMIT 1`,
      [orderId, storeId]
    );

    if (ownerCheck.rows.length === 0) {
      // Also check purchase_orders as fallback (order may have no lifecycle events yet)
      const poCheck = await pool.query(
        `SELECT 1 FROM orders.purchase_orders
         WHERE id = $1 AND store_id = $2
         LIMIT 1`,
        [orderId, storeId]
      );
      if (poCheck.rows.length === 0) {
        return res.status(404).json({ error: "Order not found" });
      }
    }

    const events = await getOrderLifecycleEvents(orderId);
    return res.json({ success: true, data: events });
  } catch (err) {
    log.error("lifecycle:pos:order-events", asError(err).message);
    return res.status(500).json({ error: "Failed to load order events" });
  }
});

/**
 * GET /api/v1/pos/lifecycle/stats
 * Fan-out observability stats.
 */
posLifecycleEventsRouter.get("/lifecycle/stats", requireDeviceToken, async (_req: Request, res: Response) => {
  try {
    const stats = getLifecycleStats();
    return res.json({ success: true, data: stats });
  } catch (err) {
    log.error("lifecycle:pos:stats", asError(err).message);
    return res.status(500).json({ error: "Failed to load lifecycle stats" });
  }
});
