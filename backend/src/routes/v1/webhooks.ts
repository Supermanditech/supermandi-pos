// SM-018: Webhook Routes for External Payment Providers
// Handles Razorpay payout webhooks and manual payout processing triggers
// GL-AUD-002: Added SELL UPI payment webhook handler
// ITER4-P0-007: Added idempotency tracking to prevent duplicate processing

import crypto from "crypto";
import { Router, Request, Response } from "express";
import { getPool } from "../../db/client";
import { getRedis } from "../../db/redis";
import { logger } from "../../lib/logger";
// GCP-STG-0606: Rate limit webhook endpoints — 100 req/min per IP
import { redisRateLimit } from "../../middleware/rateLimit";
import {
  verifyWebhookSignature,
  handlePayoutWebhook,
  processAllScheduledPayouts,
  getScheduledPayouts,
  isRazorpayConfigured,
  isPayoutsEnabled,
  processPayoutRetries,
} from "../../services/supplierPayoutService";
// T-262: Payment event outbox for downstream consumers
import { writePaymentEvent, PaymentEventTypes } from "../../services/paymentOutboxWorker";
import { log } from "../../lib/logger";
import { asError } from "../../lib/errorUtils";

// =============================================================================
// T-211: Redis-backed Webhook Idempotency (cluster-safe)
// Falls back to in-memory Map when Redis is unavailable
// =============================================================================

const REDIS_WEBHOOK_PREFIX = "webhook:idempotency:";
const WEBHOOK_IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60; // 24 hours

// Fallback in-memory store when Redis is unavailable
const processedWebhookEventsFallback = new Map<string, number>();

// Cleanup fallback store every hour (only used when Redis is down)
setInterval(() => {
  const cutoff = Date.now() - WEBHOOK_IDEMPOTENCY_TTL_SECONDS * 1000;
  for (const [eventId, timestamp] of processedWebhookEventsFallback.entries()) {
    if (timestamp < cutoff) {
      processedWebhookEventsFallback.delete(eventId);
    }
  }
}, 60 * 60 * 1000);

/**
 * STG-500: Atomic claim — SET NX EX eliminates TOCTOU race between check and mark.
 * Returns true if this call claimed the event (first processor), false if already claimed.
 * Falls back to in-memory Map when Redis is unavailable (single-instance safety only).
 */
async function tryClaimWebhookEvent(eventId: string): Promise<boolean> {
  try {
    const redis = getRedis();
    if (redis) {
      // Atomic: SET key value NX EX ttl — returns "OK" if set, null if key already exists
      const result = await redis.set(
        REDIS_WEBHOOK_PREFIX + eventId,
        "1",
        "EX",
        WEBHOOK_IDEMPOTENCY_TTL_SECONDS,
        "NX"
      );
      return result === "OK";
    }
  } catch (err) {
    log.warn("[STG-500] Redis atomic claim failed, using fallback:", err instanceof Error ? err.message : err);
  }
  // Fallback: in-memory Map (not race-safe across instances, but better than nothing)
  if (processedWebhookEventsFallback.has(eventId)) {
    return false;
  }
  processedWebhookEventsFallback.set(eventId, Date.now());
  return true;
}

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
  // T-255: UTR data from Razorpay for gateway verification
  acquirer_data?: {
    utr?: string;
    rrn?: string;
  };
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
    log.warn("[GL-AUD-002] Missing payment entity in webhook payload");
    return { success: false, error: "Missing payment entity" };
  }

  const { order_id, id: razorpayPaymentId, status, error_code, error_description, vpa, acquirer_data } = payment;
  // T-255: Extract UTR from acquirer_data for gateway-verified UTR matching
  const gatewayUtr = acquirer_data?.utr || acquirer_data?.rrn || null;
  const payerVpa = vpa || null;

  if (!order_id) {
    log.warn("[GL-AUD-002] Missing order_id in payment entity");
    return { success: false, error: "Missing order_id" };
  }

  log.info(`[GL-AUD-002] Processing ${event} for order_id=${order_id}`);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Find sell_payment by upi_order_id
    // DATA-002: Include store_id in SELECT for propagation to subsequent queries
    const findResult = await client.query(
      `SELECT id, sale_id, store_id, status FROM payments.sell_payments
       WHERE upi_order_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [order_id]
    );

    if (findResult.rowCount === 0) {
      log.warn(`[GL-AUD-002] No sell_payment found for order_id=${order_id}`);
      await client.query("ROLLBACK");
      return { success: false, error: "Payment not found" };
    }

    const sellPayment = findResult.rows[0];

    // Skip if already in terminal state
    if (sellPayment.status === 'completed' || sellPayment.status === 'failed') {
      log.info(`[GL-AUD-002] Payment ${sellPayment.id} already in terminal state: ${sellPayment.status}`);
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
      log.info(`[GL-AUD-002] Ignoring event ${event} for payment ${sellPayment.id}`);
      await client.query("COMMIT");
      return { success: true, paymentId: sellPayment.id };
    }

    // Update sell_payment status
    // DATA-002: Add store_id filter for store isolation
    // T-255: Also store gateway UTR + payer VPA for verification
    await client.query(
      `UPDATE payments.sell_payments
       SET status = $1,
           upi_payment_id = $2,
           failure_reason = $3,
           completed_at = CASE WHEN $1 = 'completed' THEN NOW() ELSE completed_at END,
           webhook_payload = $6::jsonb,
           upi_txn_ref = COALESCE($7, upi_txn_ref),
           upi_payer_vpa = COALESCE($8, upi_payer_vpa)
       WHERE id = $4 AND store_id = $5`,
      [newStatus, razorpayPaymentId, failureReason, sellPayment.id, sellPayment.store_id, JSON.stringify(payload), gatewayUtr, payerVpa]
    );

    // If payment completed, update the sale status
    // DATA-002: Add store_id filter for store isolation
    if (newStatus === 'completed' && sellPayment.sale_id) {
      await client.query(
        `UPDATE public.sales
         SET payment_mode = 'UPI',
             status = 'completed',
             updated_at = NOW()
         WHERE id = $1 AND store_id = $2 AND status != 'completed'`,
        [sellPayment.sale_id, sellPayment.store_id]
      );
    }

    // T-262: Write payment event to outbox (same transaction for consistency)
    const outboxEventType = newStatus === 'completed'
      ? PaymentEventTypes.PAYMENT_COMPLETED
      : PaymentEventTypes.PAYMENT_FAILED;
    await writePaymentEvent(client, outboxEventType, sellPayment.id, {
      saleId: sellPayment.sale_id,
      storeId: sellPayment.store_id,
      razorpayPaymentId,
      orderId: order_id,
      status: newStatus,
      failureReason,
      gatewayUtr,
    });

    await client.query("COMMIT");

    log.info(`[GL-AUD-002] Updated payment ${sellPayment.id} to status=${newStatus}`);
    return { success: true, paymentId: sellPayment.id };

  } catch (_error: unknown) {
    const error = asError(_error);
    await client.query("ROLLBACK");
    log.error(`[GL-AUD-002] Error processing webhook: ${error.message}`);
    return { success: false, error: error.message };
  } finally {
    client.release();
  }
}

// PRA-089: Timing-safe API key comparison to prevent timing attacks
function timingSafeKeyEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA); // constant-time even on length mismatch
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

// GCP-STG-0606: Rate limit all webhook endpoints — 100 req/min per IP
const webhookRateLimit = redisRateLimit({
  windowMs: 60 * 1000,
  max: 100,
  keyPrefix: 'webhook',
});

export const webhooksRouter = Router();

// Apply rate limit to all webhook routes
webhooksRouter.use(webhookRateLimit);

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

  // Require webhook signature in all non-development environments
  if (process.env.NODE_ENV !== 'development') {
    if (!signature) {
      log.warn("[SM-018] Missing Razorpay webhook signature - rejecting");
      return res.status(401).json({ error: "Missing signature" });
    }
    if (!verifyWebhookSignature(rawBody, signature)) {
      log.warn("[SM-018] Invalid Razorpay webhook signature");
      return res.status(401).json({ error: "Invalid signature" });
    }
  } else if (signature && !verifyWebhookSignature(rawBody, signature)) {
    // In development, still verify if signature is provided
    log.warn("[SM-018] Invalid Razorpay webhook signature");
    return res.status(401).json({ error: "Invalid signature" });
  }

  const { event, payload, account_id } = req.body;

  if (!event || !payload) {
    return res.status(400).json({ error: "Missing event or payload" });
  }

  // ITER4-P0-007: Extract unique event ID for idempotency
  // Razorpay sends event ID in different locations depending on event type
  const payoutEntity = payload?.payout?.entity;
  const paymentEntity = payload?.payment?.entity;
  const razorpayEventId = payoutEntity?.id || paymentEntity?.id || `${event}-${account_id}-${Date.now()}`;
  const idempotencyKey = `razorpay:${razorpayEventId}:${event}`;

  // STG-500: Atomic claim — if we can't claim, it's a duplicate (no TOCTOU race)
  if (!(await tryClaimWebhookEvent(idempotencyKey))) {
    log.info(`[SM-018] Duplicate webhook ignored: ${idempotencyKey}`);
    return res.json({ status: "ok", event, duplicate: true });
  }

  log.info(`[SM-018] Razorpay webhook received: ${event} (id: ${razorpayEventId})`);

  // Handle payout events
  const payoutEvents = ["payout.processed", "payout.failed", "payout.reversed", "payout.queued"];
  if (payoutEvents.includes(event)) {
    const success = await handlePayoutWebhook(pool, event, payload);
    if (success) {
      // STG-500: No need to mark — already claimed atomically upfront

      // T-262: Write payout event to outbox (best-effort, separate connection)
      try {
        const payoutId = payoutEntity?.id || 'unknown';
        const outboxType = event === 'payout.processed'
          ? PaymentEventTypes.PAYOUT_COMPLETED
          : event === 'payout.failed'
            ? PaymentEventTypes.PAYOUT_FAILED
            : null; // ignore queued/reversed for outbox
        if (outboxType) {
          const outboxClient = await pool.connect();
          try {
            await outboxClient.query("BEGIN");
            await writePaymentEvent(outboxClient, outboxType, payoutId, {
              razorpayPayoutId: payoutId,
              event,
              amount: payoutEntity?.amount,
              status: payoutEntity?.status,
            });
            await outboxClient.query("COMMIT");
          } catch (e) {
            await outboxClient.query("ROLLBACK").catch(() => {});
            throw e;
          } finally {
            outboxClient.release();
          }
        }
      } catch (outboxErr) {
        // Non-fatal: payout was already processed successfully
        log.warn("[T-262] Failed to write payout outbox event:", outboxErr instanceof Error ? outboxErr.message : outboxErr);
      }

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
      // STG-500: No need to mark — already claimed atomically upfront
      return res.json({ status: "ok", event, paymentId: result.paymentId });
    } else {
      return res.status(422).json({ error: result.error || "Failed to process payment webhook" });
    }
  }

  // Acknowledge other events without processing
  // STG-500: Already claimed atomically upfront — no separate mark needed
  log.info(`[SM-018] Ignoring webhook event: ${event}`);
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
      log.warn("[GL-AUD-002] Invalid Razorpay payment webhook signature");
      return res.status(401).json({ error: "Invalid signature" });
    }
  } else if (process.env.NODE_ENV !== 'development') {
    // In non-development environments, signature is required
    log.warn("[GL-AUD-002] Missing webhook signature - rejecting");
    return res.status(401).json({ error: "Missing signature" });
  }

  const { event, payload } = req.body;

  if (!event || !payload) {
    return res.status(400).json({ error: "Missing event or payload" });
  }

  log.info(`[GL-AUD-002] Payment webhook received: ${event}`);

  // Only handle payment events
  const paymentEvents = ["payment.captured", "payment.failed", "payment.authorized"];
  if (!paymentEvents.includes(event)) {
    log.info(`[GL-AUD-002] Ignoring non-payment event: ${event}`);
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
    log.error(`[GL-AUD-002] Webhook processing failed: ${result.error}`);
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
  const expectedKey = process.env.PAYOUT_PROCESS_API_KEY;
  if (!expectedKey) {
    return res.status(503).json({ error: "Payout API key not configured" });
  }

  if (!apiKey || !timingSafeKeyEqual(apiKey, expectedKey)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  log.info("[SM-018] Manual payout processing triggered");

  try {
    const result = await processAllScheduledPayouts(pool);

    log.info(`[SM-018] Payout processing complete: ${result.processed} processed, ${result.succeeded} succeeded, ${result.failed} failed`);

    return res.json({
      success: true,
      razorpayConfigured: isRazorpayConfigured(),
      payoutsEnabled: isPayoutsEnabled(),
      ...result,
    });
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[SM-018] Payout processing error:", error.message);
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
  const expectedKey = process.env.PAYOUT_PROCESS_API_KEY;
  if (!expectedKey) {
    return res.status(503).json({ error: "Payout API key not configured" });
  }

  if (!apiKey || !timingSafeKeyEqual(apiKey, expectedKey)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const payouts = await getScheduledPayouts(pool);

    return res.json({
      success: true,
      count: payouts.length,
      razorpayConfigured: isRazorpayConfigured(),
      payoutsEnabled: isPayoutsEnabled(),
      payouts: payouts.map((p) => ({
        id: p.id,
        supplierId: p.supplierId,
        supplierName: p.supplierName,
        purchaseOrderId: p.purchaseOrderId,
        amountMinor: p.amountMinor,
        payoutMethod: p.payoutMethod,
      })),
    });
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[SM-018] Get pending payouts error:", error.message);
    return res.status(500).json({
      success: false,
      error: "Failed to get pending payouts",
    });
  }
});

/**
 * POST /api/v1/webhooks/payouts/process-retries
 * T-258: Process pending payout retries (called by cron or admin)
 */
webhooksRouter.post("/payouts/process-retries", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const apiKey = req.headers["x-api-key"] as string | undefined;
  const expectedKey = process.env.PAYOUT_PROCESS_API_KEY;
  if (!expectedKey) {
    return res.status(503).json({ error: "Payout API key not configured" });
  }
  if (!apiKey || !timingSafeKeyEqual(apiKey, expectedKey)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const result = await processPayoutRetries(pool);
    log.info(`[T-258] Retry processing complete: ${result.processed} processed, ${result.succeeded} succeeded, ${result.failed} failed`);

    return res.json({
      success: true,
      ...result,
    });
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[T-258] Retry processing error:", error.message);
    return res.status(500).json({ success: false, error: "Failed to process retries" });
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
    payoutsEnabled: isPayoutsEnabled(),
    timestamp: new Date().toISOString(),
  });
});

// =============================================================================
// GCP-STG-0088: PhonePe Callback Handler
// =============================================================================

/**
 * POST /api/v1/webhooks/phonepe
 * PhonePe sends callback with base64 response + X-VERIFY header
 */
webhooksRouter.post("/phonepe", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { verifyPhonePeCallback, logWebhookEvent } = await import("../../services/paymentGatewayService");
  const { updatePaymentIntentStatus } = await import("../../services/procurementPaymentService");

  const responseBase64 = req.body?.response;
  const xVerify = req.headers["x-verify"] as string | undefined;

  if (!responseBase64) {
    return res.status(400).json({ error: "Missing response payload" });
  }

  const verification = verifyPhonePeCallback(responseBase64, xVerify || "");

  // Log for audit
  await logWebhookEvent(pool, "PHONEPE", "callback", null, verification.transactionId || null,
    verification.valid ? "processed" : "rejected", req.body, verification.error);

  if (!verification.valid) {
    log.warn(`[GCP-STG-0088] PhonePe callback verification failed: ${verification.error}`);
    return res.status(401).json({ error: verification.error });
  }

  // Update payment intent
  if (verification.transactionId) {
    try {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const intentStatus = verification.status === "paid" ? "paid" : verification.status === "pending" ? "pending" : "failed";
        await updatePaymentIntentStatus(client, verification.transactionId, intentStatus as any);
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    } catch (err: any) {
      log.error(`[GCP-STG-0088] PhonePe intent update failed:`, err?.message);
    }
  }

  return res.json({ status: "ok", provider: "phonepe" });
});

// =============================================================================
// GCP-STG-0088: PineLabs Callback Handler
// =============================================================================

/**
 * POST /api/v1/webhooks/pinelabs
 * PineLabs redirects back with form-encoded or JSON payload
 */
webhooksRouter.post("/pinelabs", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { verifyPineLabsCallback, logWebhookEvent } = await import("../../services/paymentGatewayService");
  const { updatePaymentIntentStatus } = await import("../../services/procurementPaymentService");

  const payload = req.body || {};
  const verification = verifyPineLabsCallback(payload);

  // Log for audit
  await logWebhookEvent(pool, "PINE_LABS", "callback", null, verification.transactionId || null,
    verification.valid ? "processed" : "rejected", payload, verification.error);

  if (!verification.valid) {
    log.warn(`[GCP-STG-0088] PineLabs callback verification failed: ${verification.error}`);
    return res.status(401).json({ error: verification.error });
  }

  // Find and update payment intent by provider order ID
  if (verification.transactionId) {
    try {
      const intentResult = await pool.query(
        `SELECT id FROM procurement.payment_intents WHERE provider_order_id = $1 LIMIT 1`,
        [verification.transactionId]
      );
      if (intentResult.rows.length > 0) {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const intentStatus = verification.status === "paid" ? "paid" : verification.status === "pending" ? "pending" : "failed";
          await updatePaymentIntentStatus(client, intentResult.rows[0].id, intentStatus as any);
          await client.query("COMMIT");
        } catch (e) {
          await client.query("ROLLBACK");
          throw e;
        } finally {
          client.release();
        }
      }
    } catch (err: any) {
      log.error(`[GCP-STG-0088] PineLabs intent update failed:`, err?.message);
    }
  }

  return res.json({ status: "ok", provider: "pinelabs" });
});

// =============================================================================
// GCP-STG-0088: Universal Procurement Payment Callback
// =============================================================================

/**
 * POST /api/v1/webhooks/procurement/payment-callback
 * Universal callback endpoint — route by provider query param
 */
webhooksRouter.post("/procurement/payment-callback", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const provider = (req.query.provider as string || "").toUpperCase();
  const intentId = req.query.intentId as string;

  const { logWebhookEvent } = await import("../../services/paymentGatewayService");

  await logWebhookEvent(pool, provider || "UNKNOWN", "payment-callback", intentId || null, null, "received", req.body);

  log.info(`[GCP-STG-0088] Procurement callback: provider=${provider}, intentId=${intentId}`);

  // Route to provider-specific handler
  if (provider === "PHONEPE") {
    // Forward to PhonePe handler logic
    const { verifyPhonePeCallback } = await import("../../services/paymentGatewayService");
    const verification = verifyPhonePeCallback(req.body?.response || "", (req.headers["x-verify"] as string) || "");
    return res.json({ status: verification.valid ? "ok" : "failed", provider: "phonepe" });
  }

  if (provider === "PINELABS") {
    return res.json({ status: "ok", provider: "pinelabs" });
  }

  // Default: acknowledge
  return res.json({ status: "ok", provider: provider || "unknown" });
});

export default webhooksRouter;
