// SM-018: Webhook Routes for External Payment Providers
// Handles Razorpay payout webhooks and manual payout processing triggers

import { Router, Request, Response } from "express";
import { getPool } from "../../db/client";
import {
  verifyWebhookSignature,
  handlePayoutWebhook,
  processAllScheduledPayouts,
  getScheduledPayouts,
  isRazorpayConfigured,
} from "../../services/supplierPayoutService";

export const webhooksRouter = Router();

/**
 * POST /api/v1/webhooks/razorpay
 * SM-018: Handle Razorpay webhook events
 * Events: payout.processed, payout.failed, payout.reversed
 */
webhooksRouter.post("/razorpay", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  // Get raw body for signature verification
  const rawBody = JSON.stringify(req.body);
  const signature = req.headers["x-razorpay-signature"] as string | undefined;

  // Verify webhook signature (skip in development if not configured)
  if (signature && !verifyWebhookSignature(rawBody, signature)) {
    console.warn("[SM-018] Invalid Razorpay webhook signature");
    return res.status(401).json({ error: "Invalid signature" });
  }

  const { event, payload } = req.body;

  if (!event || !payload) {
    return res.status(400).json({ error: "Missing event or payload" });
  }

  console.log(`[SM-018] Razorpay webhook received: ${event}`);

  // Handle payout events
  const payoutEvents = ["payout.processed", "payout.failed", "payout.reversed", "payout.queued"];
  if (payoutEvents.includes(event)) {
    const success = await handlePayoutWebhook(pool, event, payload);
    if (success) {
      return res.json({ status: "ok", event });
    } else {
      return res.status(422).json({ error: "Failed to process webhook" });
    }
  }

  // Acknowledge other events without processing
  console.log(`[SM-018] Ignoring webhook event: ${event}`);
  return res.json({ status: "ignored", event });
});

/**
 * POST /api/v1/webhooks/payouts/process
 * SM-018: Manually trigger processing of scheduled payouts
 * This can be called by a cron job or admin action
 *
 * Security: In production, this should be protected by API key or internal network
 */
webhooksRouter.post("/payouts/process", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  // Simple API key protection (should use proper auth in production)
  const apiKey = req.headers["x-api-key"] as string | undefined;
  const expectedKey = process.env.PAYOUT_PROCESS_API_KEY || "sm_payout_dev_key";

  if (apiKey !== expectedKey) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  console.log("[SM-018] Manual payout processing triggered");

  try {
    const result = await processAllScheduledPayouts(pool);

    console.log(`[SM-018] Payout processing complete: ${result.processed} processed, ${result.succeeded} succeeded, ${result.failed} failed`);

    return res.json({
      success: true,
      razorpayConfigured: isRazorpayConfigured(),
      ...result,
    });
  } catch (error: any) {
    console.error("[SM-018] Payout processing error:", error.message);
    return res.status(500).json({
      success: false,
      error: "Failed to process payouts",
    });
  }
});

/**
 * GET /api/v1/webhooks/payouts/pending
 * SM-018: Get list of pending payouts for monitoring
 *
 * Security: In production, this should be protected
 */
webhooksRouter.get("/payouts/pending", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  // Simple API key protection
  const apiKey = req.headers["x-api-key"] as string | undefined;
  const expectedKey = process.env.PAYOUT_PROCESS_API_KEY || "sm_payout_dev_key";

  if (apiKey !== expectedKey) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const payouts = await getScheduledPayouts(pool);

    return res.json({
      success: true,
      count: payouts.length,
      razorpayConfigured: isRazorpayConfigured(),
      payouts: payouts.map((p) => ({
        id: p.id,
        supplierId: p.supplierId,
        supplierName: p.supplierName,
        purchaseOrderId: p.purchaseOrderId,
        amountMinor: p.amountMinor,
        payoutMethod: p.payoutMethod,
      })),
    });
  } catch (error: any) {
    console.error("[SM-018] Get pending payouts error:", error.message);
    return res.status(500).json({
      success: false,
      error: "Failed to get pending payouts",
    });
  }
});

/**
 * GET /api/v1/webhooks/health
 * Health check for webhook system
 */
webhooksRouter.get("/health", async (req: Request, res: Response) => {
  const pool = getPool();

  return res.json({
    status: "ok",
    service: "webhooks",
    database: pool ? "connected" : "unavailable",
    razorpayConfigured: isRazorpayConfigured(),
    timestamp: new Date().toISOString(),
  });
});

export default webhooksRouter;
