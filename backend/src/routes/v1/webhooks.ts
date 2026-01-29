// SM-018: Webhook Routes for External Payment Providers
// Handles Razorpay payout webhooks and manual payout processing triggers
// GL-AUD-002: Added SELL UPI payment webhook handler

import { Router, Request, Response } from "express";
import { getPool } from "../../db/client";
import {
  verifyWebhookSignature,
  handlePayoutWebhook,
  processAllScheduledPayouts,
  getScheduledPayouts,
  isRazorpayConfigured,
} from "../../services/supplierPayoutService";

// =============================================================================
// GL-AUD-002: SELL UPI Payment Webhook Handler
// =============================================================================

interface RazorpayPaymentEntity {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: string;
  method: string;
  vpa?: string;
  error_code?: string;
  error_description?: string;
}

/**
 * Handle Razorpay payment webhook events for SELL UPI payments
 * Updates payments.sell_payments based on payment status
 */
async function handleSellPaymentWebhook(
  pool: any,
  event: string,
  payload: { payment?: { entity?: RazorpayPaymentEntity } }
): Promise<{ success: boolean; paymentId?: string; error?: string }> {
  const payment = payload?.payment?.entity;

  if (!payment) {
    console.warn("[GL-AUD-002] Missing payment entity in webhook payload");
    return { success: false, error: "Missing payment entity" };
  }

  const { order_id, id: razorpayPaymentId, status, error_code, error_description } = payment;

  if (!order_id) {
    console.warn("[GL-AUD-002] Missing order_id in payment entity");
    return { success: false, error: "Missing order_id" };
  }

  console.log(`[GL-AUD-002] Processing ${event} for order_id=${order_id}`);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Find sell_payment by upi_order_id
    const findResult = await client.query(
      `SELECT id, sale_id, status FROM payments.sell_payments
       WHERE upi_order_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [order_id]
    );

    if (findResult.rowCount === 0) {
      console.warn(`[GL-AUD-002] No sell_payment found for order_id=${order_id}`);
      await client.query("ROLLBACK");
      return { success: false, error: "Payment not found" };
    }

    const sellPayment = findResult.rows[0];

    // Skip if already in terminal state
    if (sellPayment.status === 'completed' || sellPayment.status === 'failed') {
      console.log(`[GL-AUD-002] Payment ${sellPayment.id} already in terminal state: ${sellPayment.status}`);
      await client.query("COMMIT");
      return { success: true, paymentId: sellPayment.id };
    }

    let newStatus: string;
    let failureReason: string | null = null;

    if (event === 'payment.captured') {
      newStatus = 'completed';
    } else if (event === 'payment.failed') {
      newStatus = 'failed';
      failureReason = error_description || error_code || 'Payment failed';
    } else {
      // For other events (payment.authorized, etc.), just log
      console.log(`[GL-AUD-002] Ignoring event ${event} for payment ${sellPayment.id}`);
      await client.query("COMMIT");
      return { success: true, paymentId: sellPayment.id };
    }

    // Update sell_payment status
    await client.query(
      `UPDATE payments.sell_payments
       SET status = $1,
           upi_payment_id = $2,
           failure_reason = $3,
           completed_at = CASE WHEN $1 = 'completed' THEN NOW() ELSE completed_at END,
           webhook_payload = $5::jsonb
       WHERE id = $4`,
      [newStatus, razorpayPaymentId, failureReason, sellPayment.id, JSON.stringify(payload)]
    );

    // If payment completed, update the sale status
    if (newStatus === 'completed' && sellPayment.sale_id) {
      await client.query(
        `UPDATE public.sales
         SET payment_mode = 'UPI',
             status = 'completed',
             updated_at = NOW()
         WHERE id = $1 AND status != 'completed'`,
        [sellPayment.sale_id]
      );
    }

    await client.query("COMMIT");

    console.log(`[GL-AUD-002] Updated payment ${sellPayment.id} to status=${newStatus}`);
    return { success: true, paymentId: sellPayment.id };

  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error(`[GL-AUD-002] Error processing webhook: ${error.message}`);
    return { success: false, error: error.message };
  } finally {
    client.release();
  }
}

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

  // ITER4-P0-006: Require webhook signature in production - never process unsigned webhooks
  if (process.env.NODE_ENV === 'production') {
    if (!signature) {
      console.warn("[SM-018] Missing Razorpay webhook signature in production - rejecting");
      return res.status(401).json({ error: "Missing signature" });
    }
    if (!verifyWebhookSignature(rawBody, signature)) {
      console.warn("[SM-018] Invalid Razorpay webhook signature");
      return res.status(401).json({ error: "Invalid signature" });
    }
  } else if (signature && !verifyWebhookSignature(rawBody, signature)) {
    // In development, still verify if signature is provided
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

  // GL-AUD-002: Handle SELL UPI payment events
  const paymentEvents = ["payment.captured", "payment.failed", "payment.authorized"];
  if (paymentEvents.includes(event)) {
    const result = await handleSellPaymentWebhook(pool, event, payload);
    if (result.success) {
      return res.json({ status: "ok", event, paymentId: result.paymentId });
    } else {
      return res.status(422).json({ error: result.error || "Failed to process payment webhook" });
    }
  }

  // Acknowledge other events without processing
  console.log(`[SM-018] Ignoring webhook event: ${event}`);
  return res.json({ status: "ignored", event });
});

/**
 * POST /api/v1/webhooks/razorpay/payments
 * GL-AUD-002: Dedicated endpoint for Razorpay payment webhooks
 * Events: payment.captured, payment.failed
 *
 * This endpoint is specifically for SELL UPI payment confirmations.
 * Signature verification is enforced.
 */
webhooksRouter.post("/razorpay/payments", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  // Get signature for verification
  const rawBody = JSON.stringify(req.body);
  const signature = req.headers["x-razorpay-signature"] as string | undefined;

  // Verify webhook signature - always verify for payment webhooks
  if (signature) {
    if (!verifyWebhookSignature(rawBody, signature)) {
      console.warn("[GL-AUD-002] Invalid Razorpay payment webhook signature");
      return res.status(401).json({ error: "Invalid signature" });
    }
  } else if (process.env.NODE_ENV === 'production') {
    // In production, signature is required
    console.warn("[GL-AUD-002] Missing signature in production");
    return res.status(401).json({ error: "Missing signature" });
  }

  const { event, payload } = req.body;

  if (!event || !payload) {
    return res.status(400).json({ error: "Missing event or payload" });
  }

  console.log(`[GL-AUD-002] Payment webhook received: ${event}`);

  // Only handle payment events
  const paymentEvents = ["payment.captured", "payment.failed", "payment.authorized"];
  if (!paymentEvents.includes(event)) {
    console.log(`[GL-AUD-002] Ignoring non-payment event: ${event}`);
    return res.json({ status: "ignored", event });
  }

  const result = await handleSellPaymentWebhook(pool, event, payload);

  if (result.success) {
    return res.json({
      status: "ok",
      event,
      paymentId: result.paymentId
    });
  } else {
    // Return 200 even for not-found to prevent Razorpay retries
    // Log the error for debugging
    console.error(`[GL-AUD-002] Webhook processing failed: ${result.error}`);
    return res.json({
      status: "error",
      event,
      error: result.error
    });
  }
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
