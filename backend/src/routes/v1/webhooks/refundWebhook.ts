/**
 * T-219: Razorpay Refund Webhook Handler
 *
 * Handles Razorpay refund status updates:
 * - payment.refund.processed → Update refund to 'completed'
 * - payment.refund.failed → Update refund to 'failed'
 * - payment.refund.created → Update with razorpay_refund_id
 *
 * Security: timingSafeEqual for signature, idempotent updates, transaction wrapping
 */

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { getPool } from '../../../db/client';
import { log } from "../../../lib/logger";

export const refundWebhookRouter = Router();

/**
 * Constant-time signature comparison to prevent timing attacks.
 * Returns false (instead of crashing) when buffer lengths differ.
 */
function safeTimingEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// POST /webhooks/razorpay/refund — Razorpay refund status webhook
refundWebhookRouter.post('/razorpay/refund', async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database unavailable' });

  // Verify webhook signature — REQUIRED (reject if secret not configured)
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    log.error('[T-219] RAZORPAY_WEBHOOK_SECRET not configured — rejecting webhook');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const signature = req.headers['x-razorpay-signature'] as string;
  // STG-521: Validate signature format before HMAC comparison
  if (!signature || typeof signature !== 'string' || signature.length < 64 || !/^[a-f0-9]+$/i.test(signature)) {
    return res.status(400).json({ error: 'Invalid signature format' });
  }

  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (!safeTimingEqual(signature, expectedSignature)) {
    log.warn('[T-219] Invalid Razorpay webhook signature');
    return res.status(400).json({ error: 'Invalid signature' });
  }

  const event = req.body as {
    event?: string;
    payload?: {
      refund?: {
        entity?: {
          id?: string;
          payment_id?: string;
          amount?: number;
          status?: string;
        };
      };
      payment?: {
        entity?: {
          id?: string;
        };
      };
    };
  };

  const eventType = event.event;
  const refundEntity = event.payload?.refund?.entity;
  const paymentId = refundEntity?.payment_id || event.payload?.payment?.entity?.id;

  if (!paymentId) {
    return res.json({ received: true, skipped: 'no payment ID' });
  }

  log.info(`[T-219] Razorpay refund webhook: ${eventType} for payment ${paymentId}`);

  // Wrap all DB updates in a transaction for atomicity
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    switch (eventType) {
      case 'refund.created': {
        if (refundEntity?.id) {
          // Idempotent: skip if razorpay_refund_id already set to a different value
          await client.query(
            `UPDATE orders.refund_requests
             SET razorpay_refund_id = $1, razorpay_status = $2, status = 'processing',
                 webhook_payload = $3, updated_at = NOW()
             WHERE razorpay_payment_id = $4
               AND status IN ('initiated', 'processing')
               AND (razorpay_refund_id IS NULL OR razorpay_refund_id = $1)`,
            [refundEntity.id, refundEntity.status || 'created', JSON.stringify(event), paymentId]
          );
        }
        break;
      }

      case 'refund.processed':
      case 'payment.refund.processed': {
        // Idempotent: only update rows not already completed
        await client.query(
          `UPDATE orders.refund_requests
           SET status = 'completed', razorpay_status = 'processed',
               completed_at = NOW(), webhook_payload = $1, updated_at = NOW()
           WHERE razorpay_payment_id = $2
             AND status IN ('initiated', 'processing')`,
          [JSON.stringify(event), paymentId]
        );

        // Update original payment status (idempotent: skip if already refunded)
        await client.query(
          `UPDATE orders.payments
           SET status = 'refunded', updated_at = NOW()
           WHERE razorpay_payment_id = $1 AND status != 'refunded'`,
          [paymentId]
        );
        break;
      }

      case 'refund.failed':
      case 'payment.refund.failed': {
        const errorDesc = refundEntity?.status || 'Refund failed';
        // Idempotent: only update rows not already failed/completed
        await client.query(
          `UPDATE orders.refund_requests
           SET status = 'failed', razorpay_status = 'failed',
               failed_at = NOW(), failure_reason = $1, webhook_payload = $2, updated_at = NOW()
           WHERE razorpay_payment_id = $3
             AND status IN ('initiated', 'processing')`,
          [errorDesc, JSON.stringify(event), paymentId]
        );
        break;
      }

      default:
        log.info(`[T-219] Unhandled refund webhook event: ${eventType}`);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    log.error('[T-219] Refund webhook processing error:', err);
    // Return 200 to prevent Razorpay retries for non-transient errors
  } finally {
    client.release();
  }

  return res.json({ received: true, event: eventType });
});
