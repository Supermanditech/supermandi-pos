// T-193: Overdue DUE Payments — list overdue bills for collection
import { Router, Request, Response } from "express";
import { getPool } from "../../../db/client";
import { requireDeviceToken, type PosDeviceContext } from "../../../middleware/deviceToken";
import { log } from "../../../lib/logger";

export const posOverduePaymentsRouter = Router();

interface PosRequest extends Request {
  posDevice: PosDeviceContext;
}

// GET /payments/overdue
posOverduePaymentsRouter.get(
  "/payments/overdue",
  requireDeviceToken,
  async (req: Request, res: Response) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "database unavailable" });

    const { storeId } = (req as PosRequest).posDevice;

    try {
      // STG-138: due_date and paid_amount_minor don't exist on public.sales
      // JOIN with payments.sell_payments which has these columns (migration 146)
      // STG-137: Return key as 'overdues' (matches frontend fix below)
      const result = await pool.query(
        `SELECT
          s.id, s.bill_ref, s.total_minor, s.customer_phone, s.customer_name,
          s.created_at,
          sp.due_date,
          COALESCE(sp.paid_amount_minor, 0) as paid_amount_minor,
          (s.total_minor - COALESCE(sp.paid_amount_minor, 0)) as outstanding_minor,
          CASE WHEN sp.due_date IS NOT NULL
            THEN CURRENT_DATE - DATE(sp.due_date)
            ELSE NULL
          END as days_overdue
        FROM sales s
        LEFT JOIN payments.sell_payments sp ON sp.sale_id = s.id
        WHERE s.store_id = $1
          AND s.status = 'DUE'
          AND s.status != 'refunded'
          AND (s.total_minor - COALESCE(sp.paid_amount_minor, 0)) > 0
          AND (sp.due_date IS NULL OR sp.due_date < CURRENT_DATE)
        ORDER BY sp.due_date ASC NULLS FIRST, s.created_at ASC
        LIMIT 100`,
        [storeId]
      );

      const overdues = result.rows.map((r: any) => ({
        id: r.id,
        billRef: r.bill_ref,
        totalMinor: parseInt(r.total_minor, 10),
        customerPhone: r.customer_phone,
        customerName: r.customer_name,
        createdAt: r.created_at,
        dueDate: r.due_date,
        paidAmountMinor: parseInt(r.paid_amount_minor, 10),
        outstandingMinor: parseInt(r.outstanding_minor, 10),
        daysOverdue: r.days_overdue ? parseInt(r.days_overdue, 10) : null,
      }));

      const totalOutstandingMinor = overdues.reduce(
        (sum: number, o: any) => sum + o.outstandingMinor, 0
      );

      return res.json({
        overdues,
        totalCount: overdues.length,
        totalOutstandingMinor,
      });
    } catch (err) {
      log.error("[payments/overdue] Error:", err);
      return res.status(500).json({ error: "Failed to fetch overdue payments" });
    }
  }
);
