/**
 * T-219: SuperAdmin Refund Management Routes
 * T-259: Wire Razorpay refund API call on admin approval
 * View, approve, reject refund requests across all stores
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { requireAdminToken } from '../../../middleware/adminToken';
import { getPool } from '../../../db/client';
import { log } from "../../../lib/logger";

/**
 * T-259: Initiate Razorpay refund via API
 * Called after admin approves a refund — runs in background (non-blocking)
 */
async function initiateRazorpayRefund(
  pool: Pool,
  refundRequestId: string,
  razorpayPaymentId: string,
  amountPaise: number
): Promise<void> {
  const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
  const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!razorpayKeyId || !razorpayKeySecret) {
    log.warn('[T-259] Razorpay credentials not configured, refund stays in processing state');
    return;
  }

  try {
    const auth = Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString('base64');
    const response = await fetch(`https://api.razorpay.com/v1/payments/${razorpayPaymentId}/refund`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: amountPaise,
        speed: 'normal',
      }),
    });

    const data = await response.json() as {
      id?: string;
      status?: string;
      error?: { description?: string };
    };

    if (response.ok && data.id) {
      await pool.query(
        `UPDATE orders.refund_requests
         SET razorpay_refund_id = $2, razorpay_status = $3,
             status = CASE WHEN $3 = 'processed' THEN 'completed' ELSE 'processing' END,
             completed_at = CASE WHEN $3 = 'processed' THEN NOW() ELSE NULL END
         WHERE id = $1`,
        [refundRequestId, data.id, data.status || 'created']
      );
      log.info(`[T-259] Razorpay refund ${data.id} initiated for admin-approved request ${refundRequestId}`);
    } else {
      const errorMsg = data.error?.description || 'Razorpay refund API error';
      await pool.query(
        `UPDATE orders.refund_requests
         SET status = 'failed', failed_at = NOW(), failure_reason = $2
         WHERE id = $1`,
        [refundRequestId, errorMsg]
      );
      log.error(`[T-259] Razorpay refund failed for ${refundRequestId}:`, data.error);
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    await pool.query(
      `UPDATE orders.refund_requests
       SET status = 'failed', failed_at = NOW(), failure_reason = $2
       WHERE id = $1`,
      [refundRequestId, errorMsg]
    );
    log.error('[T-259] Razorpay refund exception:', err);
  }
}

export const adminRefundsRouter = Router();

adminRefundsRouter.use(requireAdminToken);

// GET /admin/refunds — List all refund requests (paginated, filterable)
adminRefundsRouter.get('/refunds', async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database unavailable' });

  const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
  const offset = parseInt(req.query.offset as string) || 0;
  const status = req.query.status as string;
  const storeId = req.query.storeId as string;

  try {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (status) {
      conditions.push(`r.status = $${paramIdx++}`);
      params.push(status);
    }
    if (storeId) {
      conditions.push(`r.store_id = $${paramIdx++}::uuid`);
      params.push(storeId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM orders.refund_requests r ${whereClause}`,
      params
    );

    // STG-424 FIX: Column names corrected — sale_id (not order_id), refund_amount (not refund_amount_minor)
    const result = await pool.query(
      `SELECT r.id, r.store_id, r.sale_id, r.payment_id,
              r.refund_amount AS "refundAmount",
              r.reason, r.status, r.razorpay_refund_id,
              r.processed_at, r.failure_reason, r.created_at,
              s.name AS store_name
       FROM orders.refund_requests r
       LEFT JOIN platform.stores s ON s.id = r.store_id
       ${whereClause}
       ORDER BY r.created_at DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...params, limit, offset]
    );

    return res.json({
      success: true,
      data: result.rows.map((r) => ({
        id: r.id,
        storeId: r.store_id,
        storeName: r.store_name,
        orderId: r.sale_id,
        paymentId: r.payment_id,
        refundAmount: r.refundAmount,
        reason: r.reason,
        status: r.status,
        razorpayRefundId: r.razorpay_refund_id,
        processedAt: r.processed_at,
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
    return res.status(500).json({ error: 'Failed to fetch refunds' });
  }
});

// POST /admin/refunds/:id/approve — Approve a refund and initiate via Razorpay
// T-259: Wire Razorpay refund API call on admin approval
adminRefundsRouter.post('/refunds/:id/approve', async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database unavailable' });

  try {
    // Fetch refund details including Razorpay payment ID
    // STG-424 FIX: refund_amount (not refund_amount_minor) — matches migration 152 schema
    const refundResult = await pool.query(
      `SELECT id, razorpay_payment_id, refund_amount
       FROM orders.refund_requests
       WHERE id = $1::uuid AND status = 'initiated'`,
      [req.params.id]
    );
    if (refundResult.rowCount === 0) {
      return res.status(404).json({ error: 'Refund not found or not in initiated state' });
    }

    const refund = refundResult.rows[0];

    // Mark as processing
    await pool.query(
      `UPDATE orders.refund_requests SET status = 'processing', processed_at = NOW()
       WHERE id = $1::uuid`,
      [refund.id]
    );

    // T-259: Initiate Razorpay refund if payment ID is available
    if (refund.razorpay_payment_id) {
      initiateRazorpayRefund(pool, refund.id, refund.razorpay_payment_id, refund.refund_amount).catch((err) => {
        log.error('[T-259] Admin refund Razorpay initiation failed:', err);
      });
    }

    return res.json({ success: true, razorpayInitiated: !!refund.razorpay_payment_id });
  } catch {
    return res.status(500).json({ error: 'Failed to approve refund' });
  }
});

// POST /admin/refunds/:id/reject — Reject a refund
adminRefundsRouter.post('/refunds/:id/reject', async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database unavailable' });

  const { reason } = req.body as { reason?: string };
  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: 'Rejection reason required' });
  }

  try {
    const result = await pool.query(
      `UPDATE orders.refund_requests SET status = 'cancelled', failure_reason = $2, updated_at = NOW()
       WHERE id = $1::uuid AND status IN ('initiated', 'processing')
       RETURNING id`,
      [req.params.id, reason.trim()]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Refund not found or already processed' });
    }
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: 'Failed to reject refund' });
  }
});
