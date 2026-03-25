// GCP-STG-0106: Supplier Settlement History
// GCP-STG-0742: Settlement dashboard with receivables, aging buckets, recent payments
// Read-only view of settlement records for the authenticated supplier

import { Router, Response, NextFunction } from "express";
import { getPool } from "../../../db/client";
import { requireSupplierAuth, SupplierAuthRequest } from "./auth";
import { getSupplierSettlements } from "../../../services/settlementService";

export const supplierSettlementsRouter = Router();

/**
 * GET /api/v1/supplier/settlements
 * List settlement records for this supplier with summary
 */
supplierSettlementsRouter.get("/", requireSupplierAuth, async (req: SupplierAuthRequest, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    if (!pool) { res.status(503).json({ error: { code: "DB_UNAVAILABLE", message: "Database unavailable" } }); return; }

    const supplierId = req.supplierId;
    if (!supplierId) { res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Supplier auth required" } }); return; }

    const limit = Math.min(parseInt(String(req.query.limit)) || 50, 100);
    const offset = Math.max(parseInt(String(req.query.offset)) || 0, 0);

    const result = await getSupplierSettlements(pool, supplierId, limit, offset);

    res.json({
      data: result.data,
      total: result.total,
      summary: result.summary,
    });
  } catch (err: any) {
    // Graceful fallback if table doesn't exist yet
    if (err?.code === "42P01") {
      res.json({ data: [], total: 0, summary: { totalPendingMinor: 0, totalApprovedMinor: 0, totalPaidMinor: 0, pendingCount: 0, approvedCount: 0, paidCount: 0 } });
      return;
    }
    next(err);
  }
});

/**
 * GET /api/v1/supplier/settlements/dashboard
 * GCP-STG-0742: Settlement summary dashboard
 * Returns: totalReceivable, paidThisMonth, overdueAmount, agingBuckets, recentPayments
 */
supplierSettlementsRouter.get("/dashboard", requireSupplierAuth, async (req: SupplierAuthRequest, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    if (!pool) { res.status(503).json({ error: { code: "DB_UNAVAILABLE", message: "Database unavailable" } }); return; }

    const supplierId = req.supplierId;
    if (!supplierId) { res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Supplier auth required" } }); return; }

    // Aggregate receivables
    const summaryResult = await pool.query(
      `SELECT
        COALESCE(SUM(amount_minor) FILTER (WHERE status IN ('pending','approved')), 0)::bigint AS total_receivable,
        COALESCE(SUM(amount_minor) FILTER (WHERE status = 'paid' AND paid_at >= DATE_TRUNC('month', CURRENT_DATE)), 0)::bigint AS paid_this_month,
        COALESCE(SUM(amount_minor) FILTER (WHERE status IN ('pending','approved') AND due_date < CURRENT_DATE), 0)::bigint AS overdue_amount,
        COALESCE(SUM(amount_minor) FILTER (WHERE status IN ('pending','approved') AND (due_date IS NULL OR due_date >= CURRENT_DATE)), 0)::bigint AS current_bucket,
        COALESCE(SUM(amount_minor) FILTER (WHERE status IN ('pending','approved') AND due_date < CURRENT_DATE AND due_date >= CURRENT_DATE - INTERVAL '30 days'), 0)::bigint AS bucket_30d,
        COALESCE(SUM(amount_minor) FILTER (WHERE status IN ('pending','approved') AND due_date < CURRENT_DATE - INTERVAL '30 days' AND due_date >= CURRENT_DATE - INTERVAL '60 days'), 0)::bigint AS bucket_60d,
        COALESCE(SUM(amount_minor) FILTER (WHERE status IN ('pending','approved') AND due_date < CURRENT_DATE - INTERVAL '60 days'), 0)::bigint AS bucket_90plus
      FROM supplier.settlements
      WHERE supplier_id = $1`,
      [supplierId]
    );

    // Recent payments (last 10 paid settlements)
    const recentResult = await pool.query(
      `SELECT id, amount_minor, paid_at, reference_number, store_id
       FROM supplier.settlements
       WHERE supplier_id = $1 AND status = 'paid'
       ORDER BY paid_at DESC
       LIMIT 10`,
      [supplierId]
    );

    const s = summaryResult.rows[0];

    res.json({
      data: {
        totalReceivable: parseInt(s.total_receivable) || 0,
        paidThisMonth: parseInt(s.paid_this_month) || 0,
        overdueAmount: parseInt(s.overdue_amount) || 0,
        agingBuckets: {
          current: parseInt(s.current_bucket) || 0,
          days30: parseInt(s.bucket_30d) || 0,
          days60: parseInt(s.bucket_60d) || 0,
          days90Plus: parseInt(s.bucket_90plus) || 0,
        },
        recentPayments: recentResult.rows.map(r => ({
          id: r.id,
          amountMinor: parseInt(r.amount_minor) || 0,
          paidAt: r.paid_at,
          referenceNumber: r.reference_number,
          storeId: r.store_id,
        })),
      },
    });
  } catch (err: any) {
    // Graceful fallback if table doesn't exist yet
    if (err?.code === "42P01") {
      res.json({
        data: {
          totalReceivable: 0, paidThisMonth: 0, overdueAmount: 0,
          agingBuckets: { current: 0, days30: 0, days60: 0, days90Plus: 0 },
          recentPayments: [],
        },
      });
      return;
    }
    next(err);
  }
});
