// GCP-STG-0378: Supplier SSE Events
// Real-time order/delivery/payment updates for supplier portal
// Service exists (registerSupplierSseClient) but had no route exposing it

import { Router, Response } from "express";
import { requireSupplierAuth, SupplierAuthRequest } from "./auth";
import { registerSupplierSseClient } from "../../../services/sseService";
import { log } from "../../../lib/logger";

export const supplierSseRouter = Router();

/**
 * GET /api/v1/supplier/events/stream
 * SSE stream for supplier portal — order, delivery, payment events scoped to supplierId
 */
supplierSseRouter.get(
  "/events/stream",
  requireSupplierAuth,
  (req: SupplierAuthRequest, res: Response) => {
    const supplierId = req.supplierId;
    if (!supplierId) {
      res.status(400).json({ error: "Supplier context required" });
      return;
    }

    // SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    // Register supplier SSE client
    const cleanup = registerSupplierSseClient(supplierId, res);

    log.info(`[SSE] Supplier stream opened: supplierId=${supplierId}`);

    // Send connected event
    res.write(
      `event: connected\ndata: ${JSON.stringify({
        supplierId,
        connectedAt: new Date().toISOString(),
      })}\n\n`
    );

    // Cleanup on close
    req.on("close", cleanup);
    req.on("error", cleanup);
  }
);
