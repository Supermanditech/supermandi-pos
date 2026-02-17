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
      // Sales summary
      const salesResult = await pool.query(
        `SELECT
          COALESCE(SUM(total_minor), 0)::text as total_sales_minor,
          COUNT(*)::text as total_bills,
          COALESCE(AVG(total_minor), 0)::text as average_bill_minor,
          COALESCE(SUM(item_count), 0)::text as total_items_sold,
          COALESCE(SUM(CASE WHEN payment_mode = 'CASH' THEN total_minor ELSE 0 END), 0)::text as cash_minor,
          COALESCE(SUM(CASE WHEN payment_mode = 'UPI' THEN total_minor ELSE 0 END), 0)::text as upi_minor,
          COALESCE(SUM(CASE WHEN payment_mode = 'DUE' THEN total_minor ELSE 0 END), 0)::text as due_minor,
          COALESCE(SUM(CASE WHEN payment_mode = 'CARD' THEN total_minor ELSE 0 END), 0)::text as card_minor
        FROM sales
        WHERE store_id = $1 AND DATE(created_at) = $2`,
        [storeId, date]
      );

      // Refunds
      const refundsResult = await pool.query(
        `SELECT
          COUNT(*)::text as refund_count,
          COALESCE(SUM(amount_minor), 0)::text as refund_total_minor
        FROM refunds
        WHERE store_id = $1 AND DATE(created_at) = $2`,
        [storeId, date]
      );

      // Top selling products
      const topProductsResult = await pool.query(
        `SELECT
          si.product_name as name,
          SUM(si.quantity)::text as quantity_sold,
          SUM(si.line_total_minor)::text as revenue_minor
        FROM sale_items si
        JOIN sales s ON si.sale_id = s.id
        WHERE s.store_id = $1 AND DATE(s.created_at) = $2
        GROUP BY si.product_name
        ORDER BY SUM(si.quantity) DESC
        LIMIT 10`,
        [storeId, date]
      );

      // Hourly breakdown
      const hourlyResult = await pool.query(
        `SELECT
          EXTRACT(HOUR FROM created_at)::integer as hour,
          COUNT(*)::text as bill_count,
          COALESCE(SUM(total_minor), 0)::text as sales_minor
        FROM sales
        WHERE store_id = $1 AND DATE(created_at) = $2
        GROUP BY EXTRACT(HOUR FROM created_at)
        ORDER BY hour`,
        [storeId, date]
      );

      const sales = salesResult.rows[0];
      const refunds = refundsResult.rows[0];

      const report = {
        date,
        totalSalesMinor: parseInt(sales.total_sales_minor, 10),
        totalBills: parseInt(sales.total_bills, 10),
        averageBillMinor: Math.round(parseFloat(sales.average_bill_minor)),
        totalItemsSold: parseInt(sales.total_items_sold, 10),
        paymentBreakdown: {
          cashMinor: parseInt(sales.cash_minor, 10),
          upiMinor: parseInt(sales.upi_minor, 10),
          dueMinor: parseInt(sales.due_minor, 10),
          cardMinor: parseInt(sales.card_minor, 10),
        },
        refundCount: parseInt(refunds.refund_count, 10),
        refundTotalMinor: parseInt(refunds.refund_total_minor, 10),
        netSalesMinor: parseInt(sales.total_sales_minor, 10) - parseInt(refunds.refund_total_minor, 10),
        topProducts: topProductsResult.rows.map((r: any) => ({
          name: r.name,
          quantitySold: parseInt(r.quantity_sold, 10),
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
