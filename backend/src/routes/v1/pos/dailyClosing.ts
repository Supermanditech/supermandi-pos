// POS-DAILY-001: Daily Closing (End-of-Day Reconciliation) API
// Endpoints: summary, close, history

import { Router, Request, Response } from "express";
import { getPool } from "../../../db/client";
import { requireDeviceToken, type PosDeviceContext } from "../../../middleware/deviceToken";
import { requireActiveStore } from "../../../middleware/storeStatusGate";

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
  const salesResult = await pool.query(
    `SELECT
      COALESCE(SUM(total_minor), 0)::bigint AS total_sales_minor,
      COUNT(*)::int AS sales_count,
      COALESCE(SUM(CASE WHEN payment_mode = 'CASH' THEN total_minor ELSE 0 END), 0)::bigint AS cash_minor,
      COALESCE(SUM(CASE WHEN payment_mode = 'UPI' THEN total_minor ELSE 0 END), 0)::bigint AS upi_minor,
      COALESCE(SUM(CASE WHEN payment_mode = 'DUE' THEN total_minor ELSE 0 END), 0)::bigint AS due_minor,
      COALESCE(SUM(CASE WHEN payment_mode = 'CARD' THEN total_minor ELSE 0 END), 0)::bigint AS card_minor
    FROM public.sales
    WHERE store_id = $1
      AND DATE(created_at) = $2
      AND status = 'completed'`,
    [storeId, date]
  );

  // Refunds for the day
  const refundsResult = await pool.query(
    `SELECT COALESCE(SUM(refund_amount_minor), 0)::bigint AS refunds_minor
     FROM orders.refunds
     WHERE store_id = $1
       AND DATE(created_at) = $2
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
    openingCashMinor: openingCashMinor.toString(),
    totalSalesMinor: sales.total_sales_minor.toString(),
    salesCount: sales.sales_count,
    salesByPaymentMode: {
      cashMinor: sales.cash_minor.toString(),
      upiMinor: sales.upi_minor.toString(),
      dueMinor: sales.due_minor.toString(),
      cardMinor: sales.card_minor.toString(),
    },
    refundsMinor: refundsMinor.toString(),
    expectedCashMinor: expectedCashMinor.toString(),
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
  } catch (error: any) {
    console.error("[DailyClosingAPI] Summary error:", error.message);
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
        store_id AS "storeId",
        closing_date AS "closingDate",
        opening_cash_minor AS "openingCashMinor",
        expected_cash_minor AS "expectedCashMinor",
        actual_cash_minor AS "actualCashMinor",
        difference_minor AS "differenceMinor",
        total_sales_minor AS "totalSalesMinor",
        total_cash_minor AS "totalCashMinor",
        total_upi_minor AS "totalUpiMinor",
        total_due_minor AS "totalDueMinor",
        sales_count AS "salesCount",
        closed_by AS "closedBy",
        closed_at AS "closedAt",
        notes,
        created_at AS "createdAt"`,
      [
        storeId,
        date,
        summary.openingCashMinor,
        summary.expectedCashMinor,
        actualCashMinor,
        difference.toString(),
        summary.totalSalesMinor,
        summary.salesByPaymentMode.cashMinor,
        summary.salesByPaymentMode.upiMinor,
        summary.salesByPaymentMode.dueMinor,
        summary.salesCount,
        (req as PosRequest).posDevice.deviceId,
        notes || null,
      ]
    );

    return res.status(201).json({ record: result.rows[0] });
  } catch (error: any) {
    console.error("[DailyClosingAPI] Close error:", error.message);
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
        store_id AS "storeId",
        closing_date AS "closingDate",
        opening_cash_minor AS "openingCashMinor",
        expected_cash_minor AS "expectedCashMinor",
        actual_cash_minor AS "actualCashMinor",
        difference_minor AS "differenceMinor",
        total_sales_minor AS "totalSalesMinor",
        total_cash_minor AS "totalCashMinor",
        total_upi_minor AS "totalUpiMinor",
        total_due_minor AS "totalDueMinor",
        sales_count AS "salesCount",
        closed_by AS "closedBy",
        closed_at AS "closedAt",
        notes,
        created_at AS "createdAt"
      FROM orders.daily_closings
      WHERE store_id = $1
      ORDER BY closing_date DESC
      LIMIT $2`,
      [storeId, limit]
    );

    return res.json({ records: result.rows });
  } catch (error: any) {
    console.error("[DailyClosingAPI] History error:", error.message);
    return res.status(500).json({ error: "Failed to get daily closing history" });
  }
});
