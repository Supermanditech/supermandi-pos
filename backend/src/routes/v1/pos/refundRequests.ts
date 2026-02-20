/**
 * T-219: UPI Refund Request System
 *
 * Endpoints:
 * - POST   /refund-requests                 Initiate a refund request
 * - GET    /refund-requests                  List refund requests for store
 * - GET    /refund-requests/:id              Get refund request detail
 * - POST   /refund-requests/:id/cancel       Cancel a pending refund
 */

import { Router, Request, Response } from 'express';
import { requireDeviceToken } from '../../../middleware/deviceToken.js';
import { getPool } from '../../../db/client';
import { log } from "../../../lib/logger";

export const posRefundRequestsRouter = Router();

posRefundRequestsRouter.use(requireDeviceToken);

// POST /refund-requests — Initiate a UPI refund request
posRefundRequestsRouter.post('/refund-requests', async (req: Request, res: Response) => {
  const storeId = (req as any).storeId;
  const userId = (req as any).deviceUserId || (req as any).storeUserId;
  if (!storeId) return res.status(401).json({ error: 'Store context required' });

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database unavailable' });

  const { paymentId, saleId, refundAmount, reason } = req.body as {
    paymentId?: string;
    saleId?: string;
    refundAmount?: number;
    reason?: string;
  };

  if (!paymentId) return res.status(400).json({ error: 'paymentId is required' });
  if (!refundAmount || refundAmount <= 0) {
    return res.status(400).json({ error: 'refundAmount must be a positive number (paise)' });
  }

  try {
    // Verify the payment belongs to this store and is UPI
    const paymentResult = await pool.query(
      `SELECT id, store_id, amount, payment_method, razorpay_payment_id, status
       FROM orders.payments
       WHERE id = $1::uuid AND store_id = $2`,
      [paymentId, storeId]
    );

    if (paymentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    const payment = paymentResult.rows[0];

    if (payment.payment_method !== 'upi') {
      return res.status(400).json({ error: 'Only UPI payments can be refunded via this endpoint' });
    }

    if (refundAmount > payment.amount) {
      return res.status(400).json({ error: 'Refund amount cannot exceed payment amount' });
    }

    // Check for existing active refund on same payment
    const existingRefund = await pool.query(
      `SELECT id, status FROM orders.refund_requests
       WHERE payment_id = $1::uuid AND status IN ('initiated', 'processing')`,
      [paymentId]
    );

    if (existingRefund.rows.length > 0) {
      return res.status(409).json({
        error: 'Active refund already exists for this payment',
        existingRefundId: existingRefund.rows[0].id,
        existingStatus: existingRefund.rows[0].status,
      });
    }

    // Create refund request
    const refundResult = await pool.query(
      `INSERT INTO orders.refund_requests
         (store_id, payment_id, sale_id, razorpay_payment_id, refund_amount, reason, status, initiated_by)
       VALUES ($1, $2, $3, $4, $5, $6, 'initiated', $7)
       RETURNING id, status, initiated_at, created_at`,
      [storeId, paymentId, saleId || null, payment.razorpay_payment_id, refundAmount, reason || null, userId]
    );

    const refund = refundResult.rows[0];

    // If we have a Razorpay payment ID, attempt to initiate the refund via Razorpay API
    if (payment.razorpay_payment_id) {
      // Non-blocking: attempt Razorpay refund in background
      initiateRazorpayRefund(refund.id, payment.razorpay_payment_id, refundAmount).catch((err) => {
        log.error('[T-219] Razorpay refund initiation failed:', err);
      });
    }

    return res.status(201).json({
      success: true,
      data: {
        id: refund.id,
        paymentId,
        refundAmount,
        status: refund.status,
        initiatedAt: refund.initiated_at,
        razorpayPaymentId: payment.razorpay_payment_id || null,
      },
    });
  } catch (err) {
    log.error('[T-219] Create refund request error:', err);
    return res.status(500).json({ error: 'Failed to create refund request' });
  }
});

// GET /refund-requests — List refund requests for store
posRefundRequestsRouter.get('/refund-requests', async (req: Request, res: Response) => {
  const storeId = (req as any).storeId;
  if (!storeId) return res.status(401).json({ error: 'Store context required' });

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database unavailable' });

  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const offset = parseInt(req.query.offset as string) || 0;
  const status = req.query.status as string | undefined;

  try {
    let query = `
      SELECT rr.id, rr.payment_id, rr.sale_id, rr.razorpay_payment_id,
             rr.razorpay_refund_id, rr.refund_amount, rr.reason, rr.status,
             rr.initiated_at, rr.completed_at, rr.failed_at, rr.failure_reason,
             rr.created_at,
             p.payment_method, p.amount AS payment_amount
      FROM orders.refund_requests rr
      LEFT JOIN orders.payments p ON p.id = rr.payment_id
      WHERE rr.store_id = $1
    `;
    const params: (string | number)[] = [storeId];
    let paramIdx = 2;

    if (status) {
      query += ` AND rr.status = $${paramIdx++}`;
      params.push(status);
    }

    query += ` ORDER BY rr.created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(limit, offset);

    const [dataResult, countResult] = await Promise.all([
      pool.query(query, params),
      pool.query(
        `SELECT COUNT(*)::int AS total FROM orders.refund_requests WHERE store_id = $1${status ? ' AND status = $2' : ''}`,
        status ? [storeId, status] : [storeId]
      ),
    ]);

    return res.json({
      success: true,
      data: dataResult.rows.map((r) => ({
        id: r.id,
        paymentId: r.payment_id,
        saleId: r.sale_id,
        razorpayPaymentId: r.razorpay_payment_id,
        razorpayRefundId: r.razorpay_refund_id,
        refundAmount: r.refund_amount,
        paymentAmount: r.payment_amount,
        paymentMethod: r.payment_method,
        reason: r.reason,
        status: r.status,
        initiatedAt: r.initiated_at,
        completedAt: r.completed_at,
        failedAt: r.failed_at,
        failureReason: r.failure_reason,
        createdAt: r.created_at,
      })),
      pagination: {
        total: countResult.rows[0]?.total || 0,
        limit,
        offset,
        hasMore: offset + limit < (countResult.rows[0]?.total || 0),
      },
    });
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '42P01') {
      return res.json({ success: true, data: [], pagination: { total: 0, limit, offset, hasMore: false } });
    }
    log.error('[T-219] List refund requests error:', err);
    return res.status(500).json({ error: 'Failed to list refund requests' });
  }
});

// GET /refund-requests/:id — Get single refund request detail
posRefundRequestsRouter.get('/refund-requests/:id', async (req: Request, res: Response) => {
  const storeId = (req as any).storeId;
  if (!storeId) return res.status(401).json({ error: 'Store context required' });

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database unavailable' });

  try {
    const result = await pool.query(
      `SELECT rr.*, p.payment_method, p.amount AS payment_amount
       FROM orders.refund_requests rr
       LEFT JOIN orders.payments p ON p.id = rr.payment_id
       WHERE rr.id = $1::uuid AND rr.store_id = $2`,
      [req.params.id, storeId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Refund request not found' });
    }

    const r = result.rows[0];
    return res.json({
      success: true,
      data: {
        id: r.id,
        paymentId: r.payment_id,
        saleId: r.sale_id,
        refundAmount: r.refund_amount,
        status: r.status,
        reason: r.reason,
        razorpayPaymentId: r.razorpay_payment_id,
        razorpayRefundId: r.razorpay_refund_id,
        razorpayStatus: r.razorpay_status,
        initiatedAt: r.initiated_at,
        processedAt: r.processed_at,
        completedAt: r.completed_at,
        failedAt: r.failed_at,
        failureReason: r.failure_reason,
      },
    });
  } catch (err) {
    log.error('[T-219] Get refund request error:', err);
    return res.status(500).json({ error: 'Failed to get refund request' });
  }
});

// POST /refund-requests/:id/cancel — Cancel a pending refund request
posRefundRequestsRouter.post('/refund-requests/:id/cancel', async (req: Request, res: Response) => {
  const storeId = (req as any).storeId;
  if (!storeId) return res.status(401).json({ error: 'Store context required' });

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database unavailable' });

  try {
    const result = await pool.query(
      `UPDATE orders.refund_requests
       SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1::uuid AND store_id = $2 AND status = 'initiated'
       RETURNING id, status`,
      [req.params.id, storeId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Refund not found or cannot be cancelled (only initiated refunds can be cancelled)' });
    }

    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    log.error('[T-219] Cancel refund error:', err);
    return res.status(500).json({ error: 'Failed to cancel refund request' });
  }
});

// =============================================================================
// RAZORPAY REFUND INTEGRATION (Background)
// =============================================================================

async function initiateRazorpayRefund(
  refundRequestId: string,
  razorpayPaymentId: string,
  amount: number
): Promise<void> {
  const pool = getPool();
  if (!pool) return;

  const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
  const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!razorpayKeyId || !razorpayKeySecret) {
    log.warn('[T-219] Razorpay credentials not configured, refund stays in initiated state');
    return;
  }

  try {
    // Update status to processing
    await pool.query(
      `UPDATE orders.refund_requests SET status = 'processing', processed_at = NOW() WHERE id = $1`,
      [refundRequestId]
    );

    // Call Razorpay Refund API
    const auth = Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString('base64');
    const response = await fetch(`https://api.razorpay.com/v1/payments/${razorpayPaymentId}/refund`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount,  // paise
        speed: 'normal',  // 'optimum' for instant refunds (higher fee)
      }),
    });

    const data = await response.json() as {
      id?: string;
      status?: string;
      error?: { code?: string; description?: string };
    };

    if (response.ok && data.id) {
      // Refund initiated with Razorpay
      await pool.query(
        `UPDATE orders.refund_requests
         SET razorpay_refund_id = $2, razorpay_status = $3,
             status = CASE WHEN $3 = 'processed' THEN 'completed' ELSE 'processing' END,
             completed_at = CASE WHEN $3 = 'processed' THEN NOW() ELSE NULL END
         WHERE id = $1`,
        [refundRequestId, data.id, data.status || 'created']
      );
      log.info(`[T-219] Razorpay refund ${data.id} initiated for request ${refundRequestId}`);
    } else {
      // Razorpay API error
      const errorMsg = data.error?.description || 'Razorpay refund API error';
      await pool.query(
        `UPDATE orders.refund_requests
         SET status = 'failed', failed_at = NOW(), failure_reason = $2
         WHERE id = $1`,
        [refundRequestId, errorMsg]
      );
      log.error(`[T-219] Razorpay refund failed:`, data.error);
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    await pool.query(
      `UPDATE orders.refund_requests
       SET status = 'failed', failed_at = NOW(), failure_reason = $2
       WHERE id = $1`,
      [refundRequestId, errorMsg]
    );
    log.error('[T-219] Razorpay refund exception:', err);
  }
}
