// GCP-STG-0658: Payment reconciliation endpoint for SuperAdmin
// Provides aggregate payment data by method for a date range,
// enabling comparison against external payment gateways (e.g. Razorpay dashboard).

import { Router } from "express";
import { getPool } from "../../../db/client";
import { requireAdminToken, requirePermission } from "../../../middleware/adminToken";
import { log } from "../../../lib/logger";

export const adminReconciliationRouter = Router();

/**
 * GET /api/v1/admin/payments/reconciliation
 * Query internal payment records for a date range and return summary by method.
 *
 * Query params:
 *   storeId  — required, UUID of the store
 *   from     — required, ISO date string (inclusive)
 *   to       — required, ISO date string (exclusive)
 *
 * Response:
 * {
 *   success: true,
 *   storeId, from, to,
 *   summary: { totalPayments, totalAmountMinor, byMethod: [{ method, count, totalMinor }] }
 * }
 */
adminReconciliationRouter.get(
  "/payments/reconciliation",
  requireAdminToken,
  requirePermission("stores", "read"),
  async (req, res) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "database unavailable" });

    const storeId = req.query.storeId as string;
    const from = req.query.from as string;
    const to = req.query.to as string;

    if (!storeId || !from || !to) {
      return res.status(400).json({
        error: "missing_params",
        message: "storeId, from, and to query parameters are required",
      });
    }

    // Validate date formats
    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      return res.status(400).json({
        error: "invalid_dates",
        message: "from and to must be valid ISO date strings",
      });
    }

    if (fromDate >= toDate) {
      return res.status(400).json({
        error: "invalid_date_range",
        message: "'from' must be before 'to'",
      });
    }

    try {
      // GCP-STG-0658: Aggregate from payments.sell_payments (UPI/CASH/DUE mode column)
      const result = await pool.query(
        `SELECT
           mode AS payment_method,
           COUNT(*)::int AS count,
           COALESCE(SUM(amount_minor), 0)::bigint AS total_minor
         FROM payments.sell_payments
         WHERE store_id = $1::uuid
           AND created_at >= $2
           AND created_at < $3
           AND status = 'completed'
         GROUP BY mode
         ORDER BY mode`,
        [storeId, fromDate.toISOString(), toDate.toISOString()]
      );

      const byMethod = result.rows.map((r) => ({
        method: r.payment_method,
        count: Number(r.count),
        totalMinor: Number(r.total_minor),
      }));

      const totalPayments = byMethod.reduce((sum, m) => sum + m.count, 0);
      const totalAmountMinor = byMethod.reduce((sum, m) => sum + m.totalMinor, 0);

      return res.json({
        success: true,
        storeId,
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
        summary: {
          totalPayments,
          totalAmountMinor,
          byMethod,
        },
      });
    } catch (err: any) {
      log.error("[GCP-STG-0658] Reconciliation query error:", err);
      // Graceful degradation if table doesn't exist yet
      if (err.code === "42P01") {
        return res.json({
          success: true,
          storeId,
          from: fromDate.toISOString(),
          to: toDate.toISOString(),
          summary: { totalPayments: 0, totalAmountMinor: 0, byMethod: [] },
        });
      }
      return res.status(500).json({ error: "Failed to query reconciliation data" });
    }
  }
);
