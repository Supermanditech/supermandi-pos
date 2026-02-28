// T-199: Daily Report — daily sales summary with breakdown
import { Router, Request, Response } from "express";
import { getPool } from "../../../db/client";
import { requireDeviceToken, type PosDeviceContext } from "../../../middleware/deviceToken";
import { log } from "../../../lib/logger";

export const posReportsRouter = Router();

interface PosRequest extends Request {
  posDevice: PosDeviceContext;
}

// GET /reports/daily?date=YYYY-MM-DD
posReportsRouter.get(
  "/reports/daily",
  requireDeviceToken,
  async (req: Request, res: Response) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "database unavailable" });

    const { storeId } = (req as PosRequest).posDevice;
    const date = (req.query.date as string) || new Date().toISOString().split("T")[0];

    try {
      // STG-147: Compute item count from sale_items instead of non-existent sales.item_count
      // STG-156: Use IST timezone for date comparison
      // STG-161: Add status filter to exclude cancelled/voided sales
      const salesResult = await pool.query(
        `SELECT
          COALESCE(SUM(s.total_minor), 0)::text as total_sales_minor,
          COUNT(*)::text as total_bills,
          COALESCE(AVG(s.total_minor), 0)::text as average_bill_minor,
          COALESCE((SELECT SUM(si.quantity) FROM sale_items si WHERE si.sale_id = ANY(ARRAY_AGG(s.id))), 0)::text as total_items_sold,
          COALESCE(SUM(CASE WHEN s.payment_mode = 'CASH' THEN s.total_minor ELSE 0 END), 0)::text as cash_minor,
          COALESCE(SUM(CASE WHEN s.payment_mode = 'UPI' THEN s.total_minor ELSE 0 END), 0)::text as upi_minor,
          COALESCE(SUM(CASE WHEN s.payment_mode = 'DUE' THEN s.total_minor ELSE 0 END), 0)::text as due_minor
        FROM sales s
        WHERE s.store_id = $1
          AND DATE(s.created_at AT TIME ZONE 'Asia/Kolkata') = $2
          AND s.status IN ('completed', 'PAID_CASH', 'PAID_UPI', 'DUE', 'SPLIT')`,
        [storeId, date]
      );

      // STG-148: Use orders.refunds (correct schema) and refund_amount_minor (correct column)
      // STG-156: Use IST timezone for date comparison
      const refundsResult = await pool.query(
        `SELECT
          COUNT(*)::text as refund_count,
          COALESCE(SUM(refund_amount_minor), 0)::text as refund_total_minor
        FROM orders.refunds
        WHERE store_id = $1 AND DATE(created_at AT TIME ZONE 'Asia/Kolkata') = $2`,
        [storeId, date]
      );

      // Top selling products — STG-156: IST timezone
      const topProductsResult = await pool.query(
        `SELECT
          si.product_name as name,
          SUM(si.quantity)::text as quantity_sold,
          SUM(si.line_total_minor)::text as revenue_minor
        FROM sale_items si
        JOIN sales s ON si.sale_id = s.id
        WHERE s.store_id = $1
          AND DATE(s.created_at AT TIME ZONE 'Asia/Kolkata') = $2
          AND s.status IN ('completed', 'PAID_CASH', 'PAID_UPI', 'DUE', 'SPLIT')
        GROUP BY si.product_name
        ORDER BY SUM(si.quantity) DESC
        LIMIT 10`,
        [storeId, date]
      );

      // Hourly breakdown — STG-156: IST timezone
      const hourlyResult = await pool.query(
        `SELECT
          EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Kolkata')::integer as hour,
          COUNT(*)::text as bill_count,
          COALESCE(SUM(total_minor), 0)::text as sales_minor
        FROM sales
        WHERE store_id = $1
          AND DATE(created_at AT TIME ZONE 'Asia/Kolkata') = $2
          AND status IN ('completed', 'PAID_CASH', 'PAID_UPI', 'DUE', 'SPLIT')
        GROUP BY EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Kolkata')
        ORDER BY hour`,
        [storeId, date]
      );

      const sales = salesResult.rows[0];
      const refunds = refundsResult.rows[0];

      const totalSalesMinor = parseInt(sales.total_sales_minor, 10);
      const refundTotalMinor = parseInt(refunds.refund_total_minor, 10);

      const report = {
        date,
        totalSalesMinor,
        totalRevenueMinor: totalSalesMinor - refundTotalMinor,
        transactionCount: parseInt(sales.total_bills, 10),
        paymentSplit: {
          cashMinor: parseInt(sales.cash_minor, 10),
          upiMinor: parseInt(sales.upi_minor, 10),
          dueMinor: parseInt(sales.due_minor, 10),
        },
        topProducts: topProductsResult.rows.map((r: any) => ({
          productName: r.name,
          qtySold: parseInt(r.quantity_sold, 10),
          revenueMinor: parseInt(r.revenue_minor, 10),
        })),
        hourlyBreakdown: hourlyResult.rows.map((r: any) => ({
          hour: r.hour,
          billCount: parseInt(r.bill_count, 10),
          salesMinor: parseInt(r.sales_minor, 10),
        })),
      };

      return res.json({ report });
    } catch (err) {
      log.error("[reports/daily] Error:", err);
      return res.status(500).json({ error: "Failed to generate daily report" });
    }
  }
);
