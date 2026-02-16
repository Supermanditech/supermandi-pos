// T-260: Payment Reconciliation Report endpoint
// Aggregates sell_payments by date + payment mode for the retailer-admin dashboard
// DD/MM/YYYY display + INR format is handled by the frontend

import { Router, Request, Response } from "express";
import { getPool } from "../../../db/client";
import { getStoreId, requireStoreContext } from "../../../middleware/retailerStoreContext";

export const retailerReconciliationRouter = Router();

retailerReconciliationRouter.use(requireStoreContext);

/**
 * GET /api/v1/retailer-admin/reports/reconciliation?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Returns daily aggregate of payments by method (UPI, Cash, Due) plus refunds
 * DATA-002: All queries filtered by store_id from JWT
 */
retailerReconciliationRouter.get(
  "/reports/reconciliation",
  async (req: Request, res: Response) => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: "DB_UNAVAILABLE", message: "Database unavailable" } });
      return;
    }

    const storeId = getStoreId(req);
    if (!storeId) {
      res.status(400).json({ error: { code: "NO_STORE", message: "Store context required" } });
      return;
    }

    // Default: last 7 days
    const fromDate = typeof req.query.from === "string" ? req.query.from : null;
    const toDate = typeof req.query.to === "string" ? req.query.to : null;

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (fromDate && !dateRegex.test(fromDate)) {
      res.status(400).json({ error: { code: "INVALID_DATE", message: "from must be YYYY-MM-DD" } });
      return;
    }
    if (toDate && !dateRegex.test(toDate)) {
      res.status(400).json({ error: { code: "INVALID_DATE", message: "to must be YYYY-MM-DD" } });
      return;
    }

    try {
      // Build date filter
      const dateConditions: string[] = [];
      const params: (string | null)[] = [storeId];
      let paramIdx = 2;

      if (fromDate) {
        dateConditions.push(`DATE(sp.created_at) >= $${paramIdx}::date`);
        params.push(fromDate);
        paramIdx++;
      }
      if (toDate) {
        dateConditions.push(`DATE(sp.created_at) <= $${paramIdx}::date`);
        params.push(toDate);
        paramIdx++;
      }

      const dateWhere = dateConditions.length > 0
        ? "AND " + dateConditions.join(" AND ")
        : "";

      // Aggregate sell_payments by date and mode
      // Only count completed payments for revenue, but include all for reconciliation
      const dayQuery = `
        SELECT
          DATE(sp.created_at) AS day,
          COALESCE(SUM(CASE WHEN sp.mode = 'UPI' AND sp.status = 'completed' THEN sp.amount_minor ELSE 0 END), 0) AS upi_minor,
          COALESCE(SUM(CASE WHEN sp.mode = 'CASH' AND sp.status = 'completed' THEN sp.amount_minor ELSE 0 END), 0) AS cash_minor,
          COALESCE(SUM(CASE WHEN sp.mode = 'DUE' AND sp.status = 'completed' THEN sp.amount_minor ELSE 0 END), 0) AS due_minor,
          COALESCE(SUM(CASE WHEN sp.status = 'completed' THEN sp.amount_minor ELSE 0 END), 0) AS net_total_minor
        FROM payments.sell_payments sp
        WHERE sp.store_id = $1
          AND sp.status IN ('completed', 'refunded')
          ${dateWhere}
        GROUP BY DATE(sp.created_at)
        ORDER BY day DESC
      `;

      const dayResult = await pool.query(dayQuery, params);

      // Get refunds per day (from orders.refund_requests)
      const refundParams: (string | null)[] = [storeId];
      const refundDateConditions: string[] = [];
      let refundIdx = 2;
      if (fromDate) {
        refundDateConditions.push(`DATE(rr.created_at) >= $${refundIdx}::date`);
        refundParams.push(fromDate);
        refundIdx++;
      }
      if (toDate) {
        refundDateConditions.push(`DATE(rr.created_at) <= $${refundIdx}::date`);
        refundParams.push(toDate);
        refundIdx++;
      }
      const refundDateWhere = refundDateConditions.length > 0
        ? "AND " + refundDateConditions.join(" AND ")
        : "";

      const refundQuery = `
        SELECT
          DATE(rr.created_at) AS day,
          COALESCE(SUM(rr.amount_minor), 0) AS refunds_minor
        FROM orders.refund_requests rr
        WHERE rr.store_id = $1
          AND rr.status IN ('approved', 'completed')
          ${refundDateWhere}
        GROUP BY DATE(rr.created_at)
      `;

      let refundMap = new Map<string, number>();
      try {
        const refundResult = await pool.query(refundQuery, refundParams);
        for (const row of refundResult.rows) {
          refundMap.set(row.day.toISOString().split("T")[0], parseInt(row.refunds_minor, 10));
        }
      } catch {
        // orders.refund_requests may not exist yet — graceful degradation
      }

      // Build response
      const data = dayResult.rows.map((row: any) => {
        const dayStr = row.day instanceof Date ? row.day.toISOString().split("T")[0] : String(row.day);
        const refundsMinor = refundMap.get(dayStr) || 0;
        return {
          date: dayStr,
          upiMinor: parseInt(row.upi_minor, 10),
          cashMinor: parseInt(row.cash_minor, 10),
          dueMinor: parseInt(row.due_minor, 10),
          refundsMinor,
          netTotalMinor: parseInt(row.net_total_minor, 10) - refundsMinor,
        };
      });

      // Summary totals
      const summary = {
        totalRevenueMinor: data.reduce((s: number, r: any) => s + r.upiMinor + r.cashMinor + r.dueMinor, 0),
        upiTotalMinor: data.reduce((s: number, r: any) => s + r.upiMinor, 0),
        cashTotalMinor: data.reduce((s: number, r: any) => s + r.cashMinor, 0),
        dueTotalMinor: data.reduce((s: number, r: any) => s + r.dueMinor, 0),
        refundsTotalMinor: data.reduce((s: number, r: any) => s + r.refundsMinor, 0),
      };

      res.json({ success: true, data, summary });
    } catch (err: any) {
      console.error("[T-260] Reconciliation query error:", err.message);
      res.status(500).json({ error: { code: "QUERY_ERROR", message: "Failed to load reconciliation data" } });
    }
  }
);
