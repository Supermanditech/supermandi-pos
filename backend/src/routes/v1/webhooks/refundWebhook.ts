/**
 * T-219: Razorpay Refund Webhook Handler
 *
 * Handles Razorpay refund status updates:
 * - payment.refund.processed → Update refund to 'completed'
 * - payment.refund.failed → Update refund to 'failed'
 * - payment.refund.created → Update with razorpay_refund_id
 */

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { getPool } from '../../../db/client';

export const refundWebhookRouter = Router();

// POST /webhooks/razorpay/refund — Razorpay refund status webhook
refundWebhookRouter.post('/razorpay/refund', async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database unavailable' });

  // Verify webhook signature
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (webhookSecret) {
    const signature = req.headers['x-razorpay-signature'] as string;
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (signature !== expectedSignature) {
      console.warn('[T-219] Invalid Razorpay webhook signature');
      return res.status(400).json({ error: 'Invalid signature' });
    }
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

  console.log(`[T-219] Razorpay refund webhook: ${eventType} for payment ${paymentId}`);

  try {
    switch (eventType) {
      case 'refund.created': {
        if (refundEntity?.id) {
          await pool.query(
            `UPDATE orders.refund_requests
             SET razorpay_refund_id = $1, razorpay_status = $2, status = 'processing',
                 webhook_payload = $3, updated_at = NOW()
             WHERE razorpay_payment_id = $4 AND status IN ('initiated', 'processing')`,
            [refundEntity.id, refundEntity.status || 'created', JSON.stringify(event), paymentId]
          );
        }
        break;
      }

      case 'refund.processed':
      case 'payment.refund.processed': {
        await pool.query(
          `UPDATE orders.refund_requests
           SET status = 'completed', razorpay_status = 'processed',
               completed_at = NOW(), webhook_payload = $1, updated_at = NOW()
           WHERE razorpay_payment_id = $2 AND status IN ('initiated', 'processing')`,
          [JSON.stringify(event), paymentId]
        );

        // Also update the original payment status
        await pool.query(
          `UPDATE orders.payments
           SET status = 'refunded', updated_at = NOW()
           WHERE razorpay_payment_id = $1`,
          [paymentId]
        );
        break;
      }

      case 'refund.failed':
      case 'payment.refund.failed': {
        const errorDesc = refundEntity?.status || 'Refund failed';
        await pool.query(
          `UPDATE orders.refund_requests
           SET status = 'failed', razorpay_status = 'failed',
               failed_at = NOW(), failure_reason = $1, webhook_payload = $2, updated_at = NOW()
           WHERE razorpay_payment_id = $3 AND status IN ('initiated', 'processing')`,
          [errorDesc, JSON.stringify(event), paymentId]
        );
        break;
      }

      default:
        console.log(`[T-219] Unhandled refund webhook event: ${eventType}`);
    }
  } catch (err) {
    console.error('[T-219] Refund webhook processing error:', err);
    // Return 200 to prevent Razorpay retries for non-transient errors
  }

  return res.json({ received: true, event: eventType });
});
