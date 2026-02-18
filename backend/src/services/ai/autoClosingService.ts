// T-310: Auto Daily Closing Service
// Automatically generates Z-report at configured time for each store
// Runs as scheduled job via Cloud Scheduler

import { getPool } from "../../db/client";
import { log } from "../../lib/logger";

/**
 * Get or create auto-closing config for a store
 */
export async function getAutoClosingConfig(storeId: string): Promise<{
  enabled: boolean; closeTime: string; lastAutoCloseDate: string | null;
}> {
  const pool = getPool();
  if (!pool) return { enabled: false, closeTime: '23:00', lastAutoCloseDate: null };

  const result = await pool.query(
    `SELECT enabled, close_time AS "closeTime", last_auto_close_date AS "lastAutoCloseDate"
     FROM ai.auto_closing_config WHERE store_id = $1`,
    [storeId]
  );

  if (result.rows.length === 0) {
    return { enabled: false, closeTime: '23:00', lastAutoCloseDate: null };
  }
  return result.rows[0];
}

/**
 * Update auto-closing config
 */
export async function updateAutoClosingConfig(storeId: string, config: {
  enabled?: boolean; closeTime?: string;
}): Promise<void> {
  const pool = getPool();
  if (!pool) return;

  await pool.query(
    `INSERT INTO ai.auto_closing_config (store_id, enabled, close_time, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (store_id)
     DO UPDATE SET enabled = COALESCE($2, ai.auto_closing_config.enabled),
                   close_time = COALESCE($3, ai.auto_closing_config.close_time),
                   updated_at = NOW()`,
    [storeId, config.enabled ?? false, config.closeTime ?? '23:00']
  );
}

/**
 * Process auto-closing for a single store (compute summary + insert closing record)
 * Wrapped in a transaction — financial data must be atomically consistent
 */
async function autoCloseStore(pool: any, storeId: string, date: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check if already closed today
    const existingResult = await client.query(
      `SELECT id FROM orders.daily_closings WHERE store_id = $1 AND closing_date = $2`,
      [storeId, date]
    );
    if (existingResult.rows.length > 0) {
      await client.query('ROLLBACK');
      return false;
    }

    // Compute daily summary (same logic as dailyClosing.ts)
    const salesResult = await client.query(
      `SELECT
        COALESCE(SUM(total_minor), 0)::bigint AS total_sales_minor,
        COUNT(*)::int AS sales_count,
        COALESCE(SUM(CASE WHEN payment_mode = 'CASH' THEN total_minor ELSE 0 END), 0)::bigint AS cash_minor,
        COALESCE(SUM(CASE WHEN payment_mode = 'UPI' THEN total_minor ELSE 0 END), 0)::bigint AS upi_minor,
        COALESCE(SUM(CASE WHEN payment_mode = 'DUE' THEN total_minor ELSE 0 END), 0)::bigint AS due_minor,
        COALESCE(SUM(CASE WHEN payment_mode = 'CARD' THEN total_minor ELSE 0 END), 0)::bigint AS card_minor
      FROM public.sales
      WHERE store_id = $1 AND DATE(created_at) = $2 AND status = 'completed'`,
      [storeId, date]
    );

    const refundsResult = await client.query(
      `SELECT COALESCE(SUM(refund_amount_minor), 0)::bigint AS refunds_minor
       FROM orders.refunds
       WHERE store_id = $1 AND DATE(created_at) = $2 AND status IN ('approved', 'processed')`,
      [storeId, date]
    );

    const lastClosingResult = await client.query(
      `SELECT actual_cash_minor FROM orders.daily_closings
       WHERE store_id = $1 AND closing_date < $2 ORDER BY closing_date DESC LIMIT 1`,
      [storeId, date]
    );

    const sales = salesResult.rows[0];
    const refundsMinor = BigInt(refundsResult.rows[0].refunds_minor);
    const openingCashMinor = lastClosingResult.rows.length > 0 && lastClosingResult.rows[0].actual_cash_minor != null
      ? BigInt(lastClosingResult.rows[0].actual_cash_minor) : BigInt(0);
    const cashMinor = BigInt(sales.cash_minor);
    const expectedCashMinor = openingCashMinor + cashMinor - refundsMinor;

    // Auto-close: actual_cash = expected_cash (no physical count in auto mode)
    await client.query(
      `INSERT INTO orders.daily_closings
       (store_id, closing_date, opening_cash_minor, expected_cash_minor, actual_cash_minor,
        difference_minor, total_sales_minor, total_cash_minor, total_upi_minor, total_due_minor,
        sales_count, notes, closed_at)
       VALUES ($1, $2, $3, $4, $4, 0, $5, $6, $7, $8, $9, 'Auto-closed by system', NOW())
       ON CONFLICT (store_id, closing_date) DO NOTHING`,
      [storeId, date, openingCashMinor.toString(), expectedCashMinor.toString(),
       sales.total_sales_minor.toString(), sales.cash_minor.toString(),
       sales.upi_minor.toString(), sales.due_minor.toString(), sales.sales_count]
    );

    // Update last_auto_close_date
    await client.query(
      `UPDATE ai.auto_closing_config SET last_auto_close_date = $2 WHERE store_id = $1`,
      [storeId, date]
    );

    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Process auto-closing for ALL stores with auto-close enabled (scheduled job)
 */
export async function processAutoClosing(): Promise<{ storesProcessed: number; storesClosed: number; errors: number }> {
  const pool = getPool();
  if (!pool) return { storesProcessed: 0, storesClosed: 0, errors: 0 };

  // Use IST date (UTC+5:30) — at 11:30 PM IST, UTC is already next day
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(now.getTime() + istOffset);
  const today = istDate.toISOString().split('T')[0];

  const storesResult = await pool.query(
    `SELECT acc.store_id FROM ai.auto_closing_config acc
     JOIN platform.stores s ON s.id = acc.store_id AND s.status = 'active'
     WHERE acc.enabled = true
       AND (acc.last_auto_close_date IS NULL OR acc.last_auto_close_date < $1)`,
    [today]
  );

  let closed = 0;
  let errors = 0;
  for (const row of storesResult.rows) {
    try {
      const didClose = await autoCloseStore(pool, row.store_id, today);
      if (didClose) closed++;
    } catch (err) {
      errors++;
      log.error(`[AutoClose] Failed for store ${row.store_id}:`, err);
    }
  }

  return { storesProcessed: storesResult.rows.length, storesClosed: closed, errors };
}
