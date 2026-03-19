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
    const events = await getOrderLifecycleEvents(req.params.orderId);
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
