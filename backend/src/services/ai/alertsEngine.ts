// T-307: Proactive AI Alerts Engine
// Analyzes inventory, sales, and payments to generate actionable alerts
// Runs as a scheduled job via Cloud Scheduler

import { getPool } from "../../db/client";

export type AlertType = 'low_stock' | 'price_spike' | 'slow_mover' | 'expiry_warning'
  | 'anomaly' | 'payment_overdue' | 'reorder_needed' | 'high_demand';
export type AlertSeverity = 'critical' | 'warning' | 'info';

export interface Alert {
  id: string;
  storeId: string;
  alertType: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  metadata: Record<string, unknown>;
  isRead: boolean;
  isDismissed: boolean;
  createdAt: string;
}

/**
 * Run all alert checks for a specific store
 */
export async function runStoreAlerts(storeId: string): Promise<number> {
  const pool = getPool();
  if (!pool) return 0;

  let alertCount = 0;
  alertCount += await checkLowStock(pool, storeId);
  alertCount += await checkExpiringProducts(pool, storeId);
  alertCount += await checkOverduePayments(pool, storeId);
  alertCount += await checkHighDemandProducts(pool, storeId);
  return alertCount;
}

/**
 * Run alerts for ALL active stores (scheduled job)
 */
export async function runAllStoreAlerts(): Promise<{ storesProcessed: number; totalAlerts: number }> {
  const pool = getPool();
  if (!pool) return { storesProcessed: 0, totalAlerts: 0 };

  const storesResult = await pool.query(
    `SELECT id FROM platform.stores WHERE status = 'active' LIMIT 1000`
  );

  let totalAlerts = 0;
  let errors = 0;
  for (const row of storesResult.rows) {
    try {
      totalAlerts += await runStoreAlerts(row.id);
    } catch (err) {
      errors++;
      console.error(`[AlertsEngine] Failed for store ${row.id}:`, err);
    }
  }
  return { storesProcessed: storesResult.rows.length, totalAlerts, errors };
}

async function createAlert(
  pool: any, storeId: string, alertType: AlertType,
  severity: AlertSeverity, title: string, message: string,
  metadata: Record<string, unknown> = {}
): Promise<boolean> {
  // Deduplicate: don't create same alert type for same store within 24h
  const existing = await pool.query(
    `SELECT id FROM ai.alerts
     WHERE store_id = $1 AND alert_type = $2
       AND created_at > NOW() - INTERVAL '24 hours'
       AND metadata->>'key' = $3
     LIMIT 1`,
    [storeId, alertType, metadata.key || '']
  );
  if (existing.rows.length > 0) return false;

  await pool.query(
    `INSERT INTO ai.alerts (store_id, alert_type, severity, title, message, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [storeId, alertType, severity, title, message, JSON.stringify(metadata)]
  );
  return true;
}

async function checkLowStock(pool: any, storeId: string): Promise<number> {
  const result = await pool.query(
    `SELECT sp.id, sp.display_name, COALESCE(sb.current_qty, sp.current_stock, 0) AS qty
     FROM catalog.store_products sp
     LEFT JOIN inventory.stock_balances sb ON sb.store_id = sp.store_id AND sb.product_id = sp.product_id
     WHERE sp.store_id = $1 AND sp.is_active = true
       AND COALESCE(sb.current_qty, sp.current_stock, 0) <= 5
       AND COALESCE(sb.current_qty, sp.current_stock, 0) >= 0
     ORDER BY COALESCE(sb.current_qty, sp.current_stock, 0) ASC
     LIMIT 20`,
    [storeId]
  );

  let count = 0;
  for (const row of result.rows) {
    const severity: AlertSeverity = row.qty <= 0 ? 'critical' : 'warning';
    const created = await createAlert(pool, storeId, 'low_stock', severity,
      row.qty <= 0 ? `Out of stock: ${row.display_name}` : `Low stock: ${row.display_name} (${row.qty} left)`,
      `${row.display_name} has ${row.qty} units remaining. Consider reordering.`,
      { key: `low_stock_${row.id}`, productId: row.id, currentQty: row.qty }
    );
    if (created) count++;
  }
  return count;
}

async function checkExpiringProducts(pool: any, storeId: string): Promise<number> {
  const result = await pool.query(
    `SELECT sp.id, sp.display_name, sp.expiry_date,
            (sp.expiry_date - CURRENT_DATE) AS days_until_expiry
     FROM catalog.store_products sp
     WHERE sp.store_id = $1 AND sp.is_active = true
       AND sp.expiry_date IS NOT NULL
       AND sp.expiry_date <= CURRENT_DATE + INTERVAL '30 days'
       AND sp.expiry_date >= CURRENT_DATE
     ORDER BY sp.expiry_date ASC
     LIMIT 20`,
    [storeId]
  );

  let count = 0;
  for (const row of result.rows) {
    const days = parseInt(row.days_until_expiry);
    const severity: AlertSeverity = days <= 7 ? 'critical' : days <= 15 ? 'warning' : 'info';
    const created = await createAlert(pool, storeId, 'expiry_warning', severity,
      `Expiring soon: ${row.display_name} (${days} days)`,
      `${row.display_name} expires on ${row.expiry_date}. ${days <= 7 ? 'Urgent: Consider markdown pricing.' : 'Plan clearance.'}`,
      { key: `expiry_${row.id}`, productId: row.id, expiryDate: row.expiry_date, daysLeft: days }
    );
    if (created) count++;
  }
  return count;
}

async function checkOverduePayments(pool: any, storeId: string): Promise<number> {
  const result = await pool.query(
    `SELECT customer_phone, COUNT(*) AS overdue_count,
            SUM(amount - COALESCE(paid_amount, 0)) AS total_due
     FROM payments.sell_payments
     WHERE store_id = $1 AND status = 'due'
       AND due_date < CURRENT_DATE
     GROUP BY customer_phone
     ORDER BY total_due DESC
     LIMIT 10`,
    [storeId]
  );

  let count = 0;
  for (const row of result.rows) {
    const created = await createAlert(pool, storeId, 'payment_overdue', 'warning',
      `Overdue payment: ${row.customer_phone} (${row.overdue_count} bills)`,
      `Customer ${row.customer_phone} has ${row.overdue_count} overdue bills totaling ₹${(parseInt(row.total_due) / 100).toFixed(2)}.`,
      { key: `overdue_${row.customer_phone}`, customerPhone: row.customer_phone, overdueCount: row.overdue_count, totalDue: row.total_due }
    );
    if (created) count++;
  }
  return count;
}

async function checkHighDemandProducts(pool: any, storeId: string): Promise<number> {
  // Products with >50% more sales this week vs last week
  const result = await pool.query(
    `WITH this_week AS (
       SELECT si.product_id, SUM(si.quantity) AS qty
       FROM public.sale_items si
       JOIN public.sales s ON s.id = si.sale_id
       WHERE s.store_id = $1 AND s.status = 'completed'
         AND s.created_at >= NOW() - INTERVAL '7 days'
       GROUP BY si.product_id
     ), last_week AS (
       SELECT si.product_id, SUM(si.quantity) AS qty
       FROM public.sale_items si
       JOIN public.sales s ON s.id = si.sale_id
       WHERE s.store_id = $1 AND s.status = 'completed'
         AND s.created_at >= NOW() - INTERVAL '14 days'
         AND s.created_at < NOW() - INTERVAL '7 days'
       GROUP BY si.product_id
     )
     SELECT tw.product_id, sp.display_name, tw.qty AS this_week, COALESCE(lw.qty, 0) AS last_week
     FROM this_week tw
     LEFT JOIN last_week lw ON lw.product_id = tw.product_id
     JOIN catalog.store_products sp ON sp.product_id = tw.product_id AND sp.store_id = $1
     WHERE tw.qty > COALESCE(lw.qty, 0) * 1.5 AND tw.qty >= 10
     ORDER BY tw.qty DESC
     LIMIT 5`,
    [storeId]
  );

  let count = 0;
  for (const row of result.rows) {
    const created = await createAlert(pool, storeId, 'high_demand', 'info',
      `Trending: ${row.display_name} (${row.this_week} sold this week)`,
      `${row.display_name} sales increased from ${row.last_week} to ${row.this_week} units this week. Consider stocking up.`,
      { key: `demand_${row.product_id}`, productId: row.product_id, thisWeek: row.this_week, lastWeek: row.last_week }
    );
    if (created) count++;
  }
  return count;
}

/**
 * Get alerts for a store (for POS/portal display)
 */
export async function getStoreAlerts(storeId: string, opts: {
  unreadOnly?: boolean; limit?: number; offset?: number;
} = {}): Promise<{ alerts: Alert[]; total: number }> {
  const pool = getPool();
  if (!pool) return { alerts: [], total: 0 };

  const { unreadOnly = false, limit = 50, offset = 0 } = opts;
  const conditions = ['store_id = $1'];
  const params: unknown[] = [storeId];

  if (unreadOnly) {
    conditions.push('is_read = false AND is_dismissed = false');
  }

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM ai.alerts WHERE ${conditions.join(' AND ')}`, params
  );

  const result = await pool.query(
    `SELECT id, store_id AS "storeId", alert_type AS "alertType", severity, title, message,
            metadata, is_read AS "isRead", is_dismissed AS "isDismissed", created_at AS "createdAt"
     FROM ai.alerts WHERE ${conditions.join(' AND ')}
     ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  return { alerts: result.rows, total: countResult.rows[0].total };
}

/**
 * Mark alert as read
 */
export async function markAlertRead(alertId: string, storeId: string): Promise<boolean> {
  const pool = getPool();
  if (!pool) return false;
  const result = await pool.query(
    `UPDATE ai.alerts SET is_read = true WHERE id = $1 AND store_id = $2`, [alertId, storeId]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Dismiss alert
 */
export async function dismissAlert(alertId: string, storeId: string): Promise<boolean> {
  const pool = getPool();
  if (!pool) return false;
  const result = await pool.query(
    `UPDATE ai.alerts SET is_dismissed = true WHERE id = $1 AND store_id = $2`, [alertId, storeId]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Get unread alert count for badge
 */
export async function getUnreadAlertCount(storeId: string): Promise<number> {
  const pool = getPool();
  if (!pool) return 0;
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count FROM ai.alerts
     WHERE store_id = $1 AND is_read = false AND is_dismissed = false`,
    [storeId]
  );
  return result.rows[0].count;
}
