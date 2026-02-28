// POS-DAILY-001: Daily Closing (End-of-Day Reconciliation) API
// Endpoints: summary, close, history

import { Router, Request, Response } from "express";
import { getPool } from "../../../db/client";
import { requireDeviceToken, type PosDeviceContext } from "../../../middleware/deviceToken";
import { requireActiveStore } from "../../../middleware/storeStatusGate";
import { log } from "../../../lib/logger";
import { asError } from "../../../lib/errorUtils";

export const posDailyClosingRouter = Router();

interface PosRequest extends Request {
  posDevice: PosDeviceContext;
}

/**
 * Compute daily sales summary for a store and date.
 * Reused by both GET /summary and POST /close.
 */
async function computeDailySummary(pool: any, storeId: string, date: string) {
  // Sales breakdown by payment mode
  // STG-156: Use IST timezone for date comparison
  // STG-161: Standardize status filter to match daily-summary endpoint
  const salesResult = await pool.query(
    `SELECT
      COALESCE(SUM(total_minor), 0)::bigint AS total_sales_minor,
      COUNT(*)::int AS sales_count,
      COALESCE(SUM(CASE WHEN status = 'PAID_CASH' THEN total_minor ELSE 0 END), 0)::bigint AS cash_minor,
      COALESCE(SUM(CASE WHEN status = 'PAID_UPI' THEN total_minor ELSE 0 END), 0)::bigint AS upi_minor,
      COALESCE(SUM(CASE WHEN status = 'DUE' THEN total_minor ELSE 0 END), 0)::bigint AS due_minor
    FROM public.sales
    WHERE store_id = $1
      AND DATE(created_at AT TIME ZONE 'Asia/Kolkata') = $2
      AND status IN ('completed', 'PAID_CASH', 'PAID_UPI', 'DUE', 'SPLIT')`,
    [storeId, date]
  );

  // Refunds for the day — STG-156: IST timezone
  const refundsResult = await pool.query(
    `SELECT COALESCE(SUM(refund_amount_minor), 0)::bigint AS refunds_minor
     FROM orders.refunds
     WHERE store_id = $1
       AND DATE(created_at AT TIME ZONE 'Asia/Kolkata') = $2
       AND status IN ('approved', 'processed')`,
    [storeId, date]
  );

  // Opening cash: from last daily closing before this date, or 0
  const lastClosingResult = await pool.query(
    `SELECT actual_cash_minor
     FROM orders.daily_closings
     WHERE store_id = $1 AND closing_date < $2
     ORDER BY closing_date DESC
     LIMIT 1`,
    [storeId, date]
  );

  const sales = salesResult.rows[0];
  const refundsMinor = BigInt(refundsResult.rows[0].refunds_minor);
  const openingCashMinor = lastClosingResult.rows.length > 0 && lastClosingResult.rows[0].actual_cash_minor != null
    ? BigInt(lastClosingResult.rows[0].actual_cash_minor)
    : BigInt(0);
  const cashMinor = BigInt(sales.cash_minor);
  // Expected cash = opening + cash sales - cash refunds
  const expectedCashMinor = openingCashMinor + cashMinor - refundsMinor;

  return {
    date,
    openingCashMinor: Number(openingCashMinor),
    totalSalesMinor: Number(sales.total_sales_minor),
    transactionCount: sales.sales_count,
    salesByPaymentType: {
      cashMinor: Number(sales.cash_minor),
      upiMinor: Number(sales.upi_minor),
      dueMinor: Number(sales.due_minor),
    },
    refundsMinor: Number(refundsMinor),
    expectedCashMinor: Number(expectedCashMinor),
  };
}

/**
 * GET /api/v1/pos/daily-closing/summary
 * Compute end-of-day summary for a given date (default: today).
 * Query params: ?date=YYYY-MM-DD
 */
posDailyClosingRouter.get("/daily-closing/summary", requireDeviceToken, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId } = (req as PosRequest).posDevice;
  const date = (req.query.date as string) || new Date().toISOString().split("T")[0];

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD." });
  }

  try {
    const summary = await computeDailySummary(pool, storeId!, date);
    return res.json({ summary });
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[DailyClosingAPI] Summary error:", error.message);
    return res.status(500).json({ error: "Failed to compute daily summary" });
  }
});

/**
 * POST /api/v1/pos/daily-closing/close
 * Record end-of-day closing. Computes summary and stores in daily_closings.
 * Body: { date: string, actualCashMinor: number, notes?: string }
 */
posDailyClosingRouter.post("/daily-closing/close", requireDeviceToken, requireActiveStore, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId } = (req as PosRequest).posDevice;
  const { date, actualCashMinor, notes } = req.body;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: "date is required in YYYY-MM-DD format" });
  }
  if (actualCashMinor === undefined || typeof actualCashMinor !== "number" || actualCashMinor < 0) {
    return res.status(400).json({ error: "actualCashMinor must be a non-negative number" });
  }

  try {
    // Compute summary
    const summary = await computeDailySummary(pool, storeId!, date);

    const expectedCash = BigInt(summary.expectedCashMinor);
    const actualCash = BigInt(actualCashMinor);
    const difference = actualCash - expectedCash;

    // Insert daily closing record
    const result = await pool.query(
      `INSERT INTO orders.daily_closings
        (store_id, closing_date, opening_cash_minor, expected_cash_minor, actual_cash_minor,
         difference_minor, total_sales_minor, total_cash_minor, total_upi_minor, total_due_minor,
         sales_count, closed_by, closed_at, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), $13)
      ON CONFLICT (store_id, closing_date) DO UPDATE SET
        opening_cash_minor = EXCLUDED.opening_cash_minor,
        expected_cash_minor = EXCLUDED.expected_cash_minor,
        actual_cash_minor = EXCLUDED.actual_cash_minor,
        difference_minor = EXCLUDED.difference_minor,
        total_sales_minor = EXCLUDED.total_sales_minor,
        total_cash_minor = EXCLUDED.total_cash_minor,
        total_upi_minor = EXCLUDED.total_upi_minor,
        total_due_minor = EXCLUDED.total_due_minor,
        sales_count = EXCLUDED.sales_count,
        closed_by = EXCLUDED.closed_by,
        closed_at = NOW(),
        notes = EXCLUDED.notes
      RETURNING
        id,
        closing_date AS "date",
        opening_cash_minor AS "openingCashMinor",
        total_sales_minor AS "totalSalesMinor",
        expected_cash_minor AS "expectedCashMinor",
        actual_cash_minor AS "actualCashMinor",
        difference_minor AS "varianceMinor",
        closed_by AS "closedByStaffId",
        notes,
        closed_at AS "closedAt"`,
      [
        storeId,
        date,
        summary.openingCashMinor,
        summary.expectedCashMinor,
        actualCashMinor,
        difference.toString(),
        summary.totalSalesMinor,
        summary.salesByPaymentType.cashMinor,
        summary.salesByPaymentType.upiMinor,
        summary.salesByPaymentType.dueMinor,
        summary.transactionCount,
        (req as PosRequest).posDevice.deviceId,
        notes || null,
      ]
    );

    // Coerce BIGINT monetary columns to numbers for JSON serialization
    const record = {
      ...result.rows[0],
      openingCashMinor: Number(result.rows[0].openingCashMinor ?? 0),
      totalSalesMinor: Number(result.rows[0].totalSalesMinor ?? 0),
      expectedCashMinor: Number(result.rows[0].expectedCashMinor ?? 0),
      actualCashMinor: Number(result.rows[0].actualCashMinor ?? 0),
      varianceMinor: Number(result.rows[0].varianceMinor ?? 0),
    };
    return res.status(201).json({ record });
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[DailyClosingAPI] Close error:", error.message);
    return res.status(500).json({ error: "Failed to record daily closing" });
  }
});

/**
 * GET /api/v1/pos/daily-closing/history
 * List past daily closings for this store.
 * Query params: ?limit=30
 */
posDailyClosingRouter.get("/daily-closing/history", requireDeviceToken, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId } = (req as PosRequest).posDevice;
  const limit = Math.min(Math.max(1, Number(req.query.limit) || 30), 200);

  try {
    const result = await pool.query(
      `SELECT
        id,
        closing_date AS "date",
        opening_cash_minor AS "openingCashMinor",
        total_sales_minor AS "totalSalesMinor",
        expected_cash_minor AS "expectedCashMinor",
        actual_cash_minor AS "actualCashMinor",
        difference_minor AS "varianceMinor",
        closed_by AS "closedByStaffId",
        notes,
        closed_at AS "closedAt"
      FROM orders.daily_closings
      WHERE store_id = $1
      ORDER BY closing_date DESC
      LIMIT $2`,
      [storeId, limit]
    );

    // Coerce BIGINT monetary columns to numbers for JSON serialization
    const records = result.rows.map((row: any) => ({
      ...row,
      openingCashMinor: Number(row.openingCashMinor ?? 0),
      totalSalesMinor: Number(row.totalSalesMinor ?? 0),
      expectedCashMinor: Number(row.expectedCashMinor ?? 0),
      actualCashMinor: Number(row.actualCashMinor ?? 0),
      varianceMinor: Number(row.varianceMinor ?? 0),
    }));
    return res.json({ records });
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[DailyClosingAPI] History error:", error.message);
    return res.status(500).json({ error: "Failed to get daily closing history" });
  }
});
