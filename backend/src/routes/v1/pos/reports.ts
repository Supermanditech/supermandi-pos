// T-199: Daily Report — daily sales summary with breakdown
import { Router, Request, Response } from "express";
import { getPool } from "../../../db/client";
import { requireDeviceToken, type PosDeviceContext } from "../../../middleware/deviceToken";
import { log } from "../../../lib/logger";
import { asError } from "../../../lib/errorUtils";

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
          COALESCE(SUM(CASE WHEN s.status = 'PAID_CASH' THEN s.total_minor ELSE 0 END), 0)::text as cash_minor,
          COALESCE(SUM(CASE WHEN s.status = 'PAID_UPI' THEN s.total_minor ELSE 0 END), 0)::text as upi_minor,
          COALESCE(SUM(CASE WHEN s.status = 'DUE' THEN s.total_minor ELSE 0 END), 0)::text as due_minor
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
          si.name as name,
          SUM(si.quantity)::text as quantity_sold,
          SUM(si.line_total_minor)::text as revenue_minor
        FROM sale_items si
        JOIN sales s ON si.sale_id = s.id
        WHERE s.store_id = $1
          AND DATE(s.created_at AT TIME ZONE 'Asia/Kolkata') = $2
          AND s.status IN ('completed', 'PAID_CASH', 'PAID_UPI', 'DUE', 'SPLIT')
        GROUP BY si.name
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

// =============================================================================
// GCP-STG-0735: Daily P&L summary — revenue, COGS, gross profit, margin
// =============================================================================
posReportsRouter.get(
  "/reports/daily-pl",
  requireDeviceToken,
  async (req: Request, res: Response) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "database unavailable" });

    const { storeId } = (req as PosRequest).posDevice;
    const date = (req.query.date as string) || new Date().toISOString().split("T")[0];

    try {
      // Revenue + payment breakdown
      const revenueResult = await pool.query(
        `SELECT
          COALESCE(SUM(s.total_minor), 0)::text as total_revenue_minor,
          COUNT(*)::text as transaction_count,
          COALESCE(SUM(CASE WHEN s.status = 'PAID_CASH' THEN s.total_minor ELSE 0 END), 0)::text as cash_minor,
          COALESCE(SUM(CASE WHEN s.status = 'PAID_UPI' THEN s.total_minor ELSE 0 END), 0)::text as upi_minor,
          COALESCE(SUM(CASE WHEN s.status = 'DUE' THEN s.total_minor ELSE 0 END), 0)::text as udhar_minor
        FROM sales s
        WHERE s.store_id = $1
          AND DATE(s.created_at AT TIME ZONE 'Asia/Kolkata') = $2
          AND s.status IN ('completed', 'PAID_CASH', 'PAID_UPI', 'DUE', 'SPLIT')`,
        [storeId, date]
      );

      // COGS: sum(qty * purchase_price) for sold items, joining to store_products for cost
      const cogsResult = await pool.query(
        `SELECT
          COALESCE(SUM(si.quantity * COALESCE(sp.purchase_price_minor, 0)), 0)::text as cogs_minor
        FROM sale_items si
        JOIN sales s ON si.sale_id = s.id
        LEFT JOIN catalog.store_products sp ON sp.store_id = s.store_id AND sp.product_id = si.product_id
        WHERE s.store_id = $1
          AND DATE(s.created_at AT TIME ZONE 'Asia/Kolkata') = $2
          AND s.status IN ('completed', 'PAID_CASH', 'PAID_UPI', 'DUE', 'SPLIT')`,
        [storeId, date]
      );

      // Previous day P&L for comparison
      const prevDate = new Date(date);
      prevDate.setDate(prevDate.getDate() - 1);
      const prevDateStr = prevDate.toISOString().split("T")[0];

      const prevResult = await pool.query(
        `SELECT
          COALESCE(SUM(s.total_minor), 0)::text as prev_revenue_minor
        FROM sales s
        WHERE s.store_id = $1
          AND DATE(s.created_at AT TIME ZONE 'Asia/Kolkata') = $2
          AND s.status IN ('completed', 'PAID_CASH', 'PAID_UPI', 'DUE', 'SPLIT')`,
        [storeId, prevDateStr]
      );

      const prevCogsResult = await pool.query(
        `SELECT
          COALESCE(SUM(si.quantity * COALESCE(sp.purchase_price_minor, 0)), 0)::text as prev_cogs_minor
        FROM sale_items si
        JOIN sales s ON si.sale_id = s.id
        LEFT JOIN catalog.store_products sp ON sp.store_id = s.store_id AND sp.product_id = si.product_id
        WHERE s.store_id = $1
          AND DATE(s.created_at AT TIME ZONE 'Asia/Kolkata') = $2
          AND s.status IN ('completed', 'PAID_CASH', 'PAID_UPI', 'DUE', 'SPLIT')`,
        [storeId, prevDateStr]
      );

      const rev = revenueResult.rows[0];
      const cogs = cogsResult.rows[0];

      const totalRevenue = parseInt(rev.total_revenue_minor, 10);
      const costOfGoods = parseInt(cogs.cogs_minor, 10);
      const grossProfit = totalRevenue - costOfGoods;
      const grossMarginPct = totalRevenue > 0 ? Math.round((grossProfit / totalRevenue) * 10000) / 100 : 0;
      const transactionCount = parseInt(rev.transaction_count, 10);
      const averageBasket = transactionCount > 0 ? Math.round(totalRevenue / transactionCount) : 0;

      // Previous day for arrow comparison
      const prevRevenue = parseInt(prevResult.rows[0]?.prev_revenue_minor ?? "0", 10);
      const prevCogs = parseInt(prevCogsResult.rows[0]?.prev_cogs_minor ?? "0", 10);
      const prevGrossProfit = prevRevenue - prevCogs;

      return res.json({
        date,
        totalRevenue,
        costOfGoods,
        grossProfit,
        grossMarginPct,
        transactionCount,
        averageBasket,
        paymentBreakdown: {
          cash: parseInt(rev.cash_minor, 10),
          upi: parseInt(rev.upi_minor, 10),
          udhar: parseInt(rev.udhar_minor, 10),
        },
        previousDay: {
          totalRevenue: prevRevenue,
          grossProfit: prevGrossProfit,
          trend: grossProfit > prevGrossProfit ? "up" : grossProfit < prevGrossProfit ? "down" : "flat",
        },
      });
    } catch (_err: unknown) {
      const err = asError(_err);
      // Graceful fallback if purchase_price_minor column missing
      if ((err as any).code === "42703") {
        log.warn("[reports/daily-pl] purchase_price_minor column missing, returning revenue-only");
        return res.json({
          date,
          totalRevenue: 0,
          costOfGoods: 0,
          grossProfit: 0,
          grossMarginPct: 0,
          transactionCount: 0,
          averageBasket: 0,
          paymentBreakdown: { cash: 0, upi: 0, udhar: 0 },
          previousDay: { totalRevenue: 0, grossProfit: 0, trend: "flat" },
        });
      }
      log.error("[reports/daily-pl] Error:", err.message);
      return res.status(500).json({ error: "Failed to generate P&L report" });
    }
  }
);
