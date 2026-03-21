// GCP-STG-0108: SuperAdmin SSE Events
// Platform-wide real-time events for admin dashboard

import { Router, Request, Response } from "express";
import { requireAdminToken, requirePermission } from "../../../middleware/adminToken";
import { registerGlobalSseClient, getSseStats } from "../../../services/sseService";

export const adminSseRouter = Router();

/**
 * GET /api/v1/admin/events/stream
 * Global SSE stream for SuperAdmin — all order, payment, delivery events across all stores
 */
adminSseRouter.get("/events/stream", requireAdminToken, requirePermission("products", "read"), (req: Request, res: Response) => {
  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  // Register global client
  const cleanup = registerGlobalSseClient(res);

  // Send connected event
  const stats = getSseStats();
  res.write(`event: connected\ndata: ${JSON.stringify({ role: "admin", connectedAt: new Date().toISOString(), stats })}\n\n`);

  // Cleanup on close
  req.on("close", cleanup);
  req.on("error", cleanup);
});

/**
 * GET /api/v1/admin/events/stats
 * SSE connection statistics
 */
adminSseRouter.get("/events/stats", requireAdminToken, requirePermission("products", "read"), (_req: Request, res: Response) => {
  const stats = getSseStats();
  res.json({ success: true, data: stats });
});
