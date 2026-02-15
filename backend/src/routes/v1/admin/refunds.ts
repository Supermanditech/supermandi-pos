/**
 * T-219: SuperAdmin Refund Management Routes
 * View, approve, reject refund requests across all stores
 */

import { Router, Request, Response } from 'express';
import { requireAdminToken } from '../../../middleware/adminToken';
import { getPool } from '../../../db/client';

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

    const result = await pool.query(
      `SELECT r.id, r.store_id, r.order_id, r.payment_id,
              r.refund_amount_minor AS "refundAmount",
              r.reason, r.status, r.razorpay_refund_id,
              r.processed_at, r.failure_reason, r.created_at,
              s.name AS store_name
       FROM orders.refund_requests r
       LEFT JOIN stores.stores s ON s.id = r.store_id
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
        orderId: r.order_id,
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

// POST /admin/refunds/:id/approve — Approve a refund (mark as processing)
adminRefundsRouter.post('/refunds/:id/approve', async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database unavailable' });

  try {
    const result = await pool.query(
      `UPDATE orders.refund_requests SET status = 'processing', updated_at = NOW()
       WHERE id = $1::uuid AND status = 'initiated'
       RETURNING id`,
      [req.params.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Refund not found or not in initiated state' });
    }
    return res.json({ success: true });
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
