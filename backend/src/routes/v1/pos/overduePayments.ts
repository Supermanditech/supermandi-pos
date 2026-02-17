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
      // Get all DUE payment sales where due_date has passed and not fully paid
      const result = await pool.query(
        `SELECT
          s.id, s.bill_ref, s.total_minor, s.customer_phone, s.customer_name,
          s.created_at, s.due_date,
          COALESCE(s.paid_amount_minor, 0) as paid_amount_minor,
          (s.total_minor - COALESCE(s.paid_amount_minor, 0)) as outstanding_minor,
          CURRENT_DATE - DATE(s.due_date) as days_overdue
        FROM sales s
        WHERE s.store_id = $1
          AND s.payment_mode = 'DUE'
          AND s.status != 'refunded'
          AND (s.total_minor - COALESCE(s.paid_amount_minor, 0)) > 0
          AND (s.due_date IS NULL OR s.due_date < CURRENT_DATE)
        ORDER BY s.due_date ASC NULLS FIRST, s.created_at ASC
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
