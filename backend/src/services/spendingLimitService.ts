// SA-P1-002: Spending limit enforcement for purchase orders
// Checks daily and monthly spend totals against store-configured limits.
// All amounts are in paise (integer).

import type { Pool } from "pg";
import { log } from "../lib/logger";

export interface SpendingLimitResult {
  allowed: boolean;
  /** Set when allowed=false */
  code?: "SPENDING_LIMIT_EXCEEDED";
  /** Which period was exceeded */
  period?: "daily" | "monthly";
  /** Current spend in paise for the exceeded period */
  current?: number;
  /** Configured limit in paise for the exceeded period */
  limit?: number;
}

/**
 * Check whether a new purchase order with the given amount would exceed
 * the store's daily or monthly spending limits.
 *
 * @param pool - DB pool
 * @param storeId - Store UUID (from JWT, never client-supplied)
 * @param orderAmountPaise - The total_amount of the new order in paise
 * @returns SpendingLimitResult indicating whether the order is allowed
 */
export async function checkSpendingLimits(
  pool: Pool,
  storeId: string,
  orderAmountPaise: number
): Promise<SpendingLimitResult> {
  // 1. Fetch store limits
  const storeResult = await pool.query(
    `SELECT daily_order_limit_paise, monthly_order_limit_paise
     FROM platform.stores
     WHERE id = $1`,
    [storeId]
  );

  if (storeResult.rowCount === 0) {
    // Store not found — let the caller handle this
    return { allowed: true };
  }

  const { daily_order_limit_paise, monthly_order_limit_paise } = storeResult.rows[0];

  // If both limits are NULL, no enforcement needed
  if (daily_order_limit_paise === null && monthly_order_limit_paise === null) {
    return { allowed: true };
  }

  // 2. Query current day/month spend totals
  // Only count non-cancelled orders (exclude 'cancelled' status)
  const spendResult = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN created_at >= DATE_TRUNC('day', NOW()) THEN total_amount ELSE 0 END), 0)::BIGINT AS daily_spend,
       COALESCE(SUM(CASE WHEN created_at >= DATE_TRUNC('month', NOW()) THEN total_amount ELSE 0 END), 0)::BIGINT AS monthly_spend
     FROM orders.purchase_orders
     WHERE store_id = $1
       AND status NOT IN ('cancelled')`,
    [storeId]
  );

  const dailySpend = Number(spendResult.rows[0].daily_spend);
  const monthlySpend = Number(spendResult.rows[0].monthly_spend);

  // 3. Check daily limit (check daily first — it's more restrictive)
  if (daily_order_limit_paise !== null) {
    const newDailyTotal = dailySpend + orderAmountPaise;
    if (newDailyTotal > Number(daily_order_limit_paise)) {
      log.warn(
        `[SA-P1-002] Daily spending limit exceeded for store ${storeId}: ` +
        `current=${dailySpend}, order=${orderAmountPaise}, limit=${daily_order_limit_paise}`
      );
      return {
        allowed: false,
        code: "SPENDING_LIMIT_EXCEEDED",
        period: "daily",
        current: dailySpend,
        limit: Number(daily_order_limit_paise),
      };
    }
  }

  // 4. Check monthly limit
  if (monthly_order_limit_paise !== null) {
    const newMonthlyTotal = monthlySpend + orderAmountPaise;
    if (newMonthlyTotal > Number(monthly_order_limit_paise)) {
      log.warn(
        `[SA-P1-002] Monthly spending limit exceeded for store ${storeId}: ` +
        `current=${monthlySpend}, order=${orderAmountPaise}, limit=${monthly_order_limit_paise}`
      );
      return {
        allowed: false,
        code: "SPENDING_LIMIT_EXCEEDED",
        period: "monthly",
        current: monthlySpend,
        limit: Number(monthly_order_limit_paise),
      };
    }
  }

  return { allowed: true };
}
