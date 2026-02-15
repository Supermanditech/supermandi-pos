/**
 * T-173: Real-time product sync via SSE
 *
 * GET /api/v1/pos/sync/events — SSE stream for real-time product/stock/settings updates.
 * Auth required (device token JWT).
 * Sends heartbeat ping every 30s to keep connection alive.
 * Broadcasts product_updated, stock_updated, settings_updated events per store.
 */

import { Router, Request, Response } from "express";
import { requireDeviceToken } from "../../../middleware/deviceToken";
import {
  registerSseClient,
  startSseHeartbeat,
  getSseStats,
} from "../../../services/sseService";

export const posSyncEventsRouter = Router();

/**
 * GET /api/v1/pos/sync/events
 * SSE endpoint for real-time store event streaming.
 *
 * Headers required: X-Device-Token (or Bearer token from device)
 * Response: text/event-stream with events:
 *   - connected: { storeId, deviceId, connectedAt }
 *   - product_updated: { productId, storeProductId, ... }
 *   - stock_updated: { productId, currentQty, ... }
 *   - settings_updated: { key, value, ... }
 *   - heartbeat comments (: heartbeat <timestamp>)
 */
posSyncEventsRouter.get(
  "/sync/events",
  requireDeviceToken,
  (req: Request, res: Response) => {
    const { deviceId, storeId } = (req as any).posDevice as {
      deviceId: string;
      storeId: string;
    };

    if (!storeId) {
      return res.status(400).json({
        error: { code: "STORE_NOT_CONFIGURED", message: "Device is not associated with a store" },
      });
    }

    // Set SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // Disable nginx buffering
    });

    // Ensure heartbeat timer is running
    startSseHeartbeat();

    // Send initial connected event
    const connectedAt = new Date().toISOString();
    res.write(
      `event: connected\ndata: ${JSON.stringify({
        storeId,
        deviceId,
        connectedAt,
      })}\n\n`
    );

    // Register this client for store events
    const cleanup = registerSseClient(storeId, res);

    // Handle client disconnect
    req.on("close", () => {
      cleanup();
    });

    req.on("error", () => {
      cleanup();
    });
  }
);

/**
 * GET /api/v1/pos/sync/events/stats
 * Health check endpoint for SSE connections (admin/monitoring).
 * Returns number of connected stores and total connections.
 */
posSyncEventsRouter.get("/sync/events/stats", requireDeviceToken, (_req: Request, res: Response) => {
  const stats = getSseStats();
  return res.json({
    success: true,
    data: stats,
  });
});
