// GCP-STG-0108: Retailer Admin SSE Events
// Real-time order/stock/delivery/payment updates for retailer dashboard

import { Router, Request, Response, NextFunction } from "express";
import { getStoreId, requireStoreContext } from "../../../middleware/retailerStoreContext";
import { registerSseClient, getSseStats } from "../../../services/sseService";

export const retailerSseRouter = Router();

/**
 * GET /api/v1/retailer-admin/events/stream
 * SSE stream for retailer dashboard — order, stock, delivery, payment events
 */
retailerSseRouter.get("/events/stream", requireStoreContext, (req: Request, res: Response) => {
  const storeId = getStoreId(req);
  if (!storeId) {
    res.status(400).json({ error: "Store context required" });
    return;
  }

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  // Register client
  const cleanup = registerSseClient(storeId, res);

  // Send connected event
  res.write(`event: connected\ndata: ${JSON.stringify({ storeId, connectedAt: new Date().toISOString() })}\n\n`);

  // Cleanup on close
  req.on("close", cleanup);
  req.on("error", cleanup);
});
