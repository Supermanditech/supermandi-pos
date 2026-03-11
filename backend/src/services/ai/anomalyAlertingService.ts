/**
 * SA-P1-010: Anomaly Detection & Alerting Service
 * Runs periodically (hourly via Cloud Scheduler) to detect anomalies
 * across all active stores using 7-day rolling averages.
 *
 * 4 detection rules:
 * 1. Revenue drop >50% from 7-day average (severity: critical)
 * 2. Discount rate >2x the 7-day average (severity: warning)
 * 3. >5 order cancellations per day (severity: warning)
 * 4. 0 sales for >4 hours during business hours 8am-10pm (severity: warning)
 *
 * Inserts into ai.anomaly_events and ai.alerts with 24h deduplication.
 */

import { getPool } from "../../db/client";
import { log } from "../../lib/logger";

// ─── Types ──────────────────────────────────────────────────────────────────

export type AlertSeverity = "critical" | "warning" | "info";

export interface AnomalyAlertResult {
  storesProcessed: number;
  anomaliesCreated: number;
  alertsCreated: number;
  errors: number;
}

export interface AnomalyAlertRow {
  id: string;
  storeId: string;
  storeName: string | null;
  alertType: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  metadata: Record<string, unknown>;
  isRead: boolean;
  isDismissed: boolean;
  createdAt: string;
}

export interface AnomalyAlertSummary {
  critical: number;
  warning: number;
  info: number;
  total: number;
}

// ─── Detection Logic ────────────────────────────────────────────────────────

/**
 * Main entry point: detect anomalies across ALL active stores.
 * Called by Cloud Scheduler hourly.
 */
export async function detectAnomalies(): Promise<AnomalyAlertResult> {
  const pool = getPool();
  if (!pool) {
    log.warn("[AnomalyAlerting] Database pool not available");
    return { storesProcessed: 0, anomaliesCreated: 0, alertsCreated: 0, errors: 0 };
  }

  const storesResult = await pool.query(
    `SELECT id FROM platform.stores WHERE status = 'active' LIMIT 1000`
  );

  let anomaliesCreated = 0;
  let alertsCreated = 0;
  let errors = 0;

  for (const store of storesResult.rows) {
    try {
      const result = await detectStoreAnomaliesV2(pool, store.id);
      anomaliesCreated += result.anomalies;
      alertsCreated += result.alerts;
    } catch (err) {
      errors++;
      log.error(`[AnomalyAlerting] Error processing store ${store.id}:`, err);
    }
  }

  log.info(`[AnomalyAlerting] Completed: ${storesResult.rows.length} stores, ${anomaliesCreated} anomalies, ${alertsCreated} alerts, ${errors} errors`);

  return {
    storesProcessed: storesResult.rows.length,
    anomaliesCreated,
    alertsCreated,
    errors,
  };
}

async function detectStoreAnomaliesV2(
  pool: any,
  storeId: string
): Promise<{ anomalies: number; alerts: number }> {
  let anomalies = 0;
  let alerts = 0;

  // Rule 1: Revenue drop >50% from 7-day rolling average
  const r1 = await checkRevenueDrop(pool, storeId);
  anomalies += r1.anomaly ? 1 : 0;
  alerts += r1.alert ? 1 : 0;

  // Rule 2: Discount rate >2x the 7-day average
  const r2 = await checkDiscountRate(pool, storeId);
  anomalies += r2.anomaly ? 1 : 0;
  alerts += r2.alert ? 1 : 0;

  // Rule 3: >5 order cancellations per day
  const r3 = await checkCancellations(pool, storeId);
  anomalies += r3.anomaly ? 1 : 0;
  alerts += r3.alert ? 1 : 0;

  // Rule 4: 0 sales for >4 hours during 8am-10pm
  const r4 = await checkSalesGap(pool, storeId);
  anomalies += r4.anomaly ? 1 : 0;
  alerts += r4.alert ? 1 : 0;

  return { anomalies, alerts };
}

// ─── Rule 1: Revenue Drop ───────────────────────────────────────────────────

async function checkRevenueDrop(
  pool: any, storeId: string
): Promise<{ anomaly: boolean; alert: boolean }> {
  const result = await pool.query(
    `WITH daily_revenue AS (
       SELECT DATE(created_at) AS sale_date,
              COALESCE(SUM(total_minor), 0)::bigint AS revenue
       FROM public.sales
       WHERE store_id = $1 AND status = 'completed'
         AND created_at >= NOW() - INTERVAL '8 days'
       GROUP BY DATE(created_at)
     ),
     avg_revenue AS (
       SELECT AVG(revenue::numeric) AS avg_rev
       FROM daily_revenue
       WHERE sale_date < CURRENT_DATE
         AND sale_date >= CURRENT_DATE - INTERVAL '7 days'
     ),
     today_revenue AS (
       SELECT COALESCE(revenue, 0) AS today_rev
       FROM daily_revenue
       WHERE sale_date = CURRENT_DATE
       UNION ALL
       SELECT 0 WHERE NOT EXISTS (
         SELECT 1 FROM daily_revenue WHERE sale_date = CURRENT_DATE
       )
     )
     SELECT t.today_rev, a.avg_rev
     FROM today_revenue t, avg_revenue a
     LIMIT 1`,
    [storeId]
  );

  if (result.rows.length === 0) return { anomaly: false, alert: false };
  const { today_rev, avg_rev } = result.rows[0];
  const avgRev = parseFloat(avg_rev) || 0;
  const todayRev = parseFloat(today_rev) || 0;

  // Skip if no meaningful history
  if (avgRev <= 0) return { anomaly: false, alert: false };

  const dropPct = ((avgRev - todayRev) / avgRev) * 100;

  if (dropPct > 50) {
    const metadataKey = `revenue_drop_${new Date().toISOString().split("T")[0]}`;
    const title = "Revenue Drop Alert";
    const message = `Today's revenue dropped ${Math.round(dropPct)}% below the 7-day average.`;
    const metadata = {
      key: metadataKey,
      todayRevenue: todayRev,
      avgRevenue: Math.round(avgRev),
      dropPercent: Math.round(dropPct),
    };

    const anomaly = await insertDedupedAnomaly(pool, storeId, "revenue_drop", "critical", message, metadata);
    const alert = await insertDedupedAlert(pool, storeId, "revenue_drop", "critical", title, message, metadata);
    return { anomaly, alert };
  }

  return { anomaly: false, alert: false };
}

// ─── Rule 2: Discount Rate ─────────────────────────────────────────────────

async function checkDiscountRate(
  pool: any, storeId: string
): Promise<{ anomaly: boolean; alert: boolean }> {
  const result = await pool.query(
    `WITH daily_discount AS (
       SELECT DATE(created_at) AS sale_date,
              CASE WHEN SUM(total_minor) > 0
                THEN SUM(COALESCE(discount_minor, 0))::numeric / SUM(total_minor)::numeric
                ELSE 0
              END AS discount_rate
       FROM public.sales
       WHERE store_id = $1 AND status = 'completed'
         AND created_at >= NOW() - INTERVAL '8 days'
       GROUP BY DATE(created_at)
     ),
     avg_discount AS (
       SELECT AVG(discount_rate) AS avg_rate
       FROM daily_discount
       WHERE sale_date < CURRENT_DATE
         AND sale_date >= CURRENT_DATE - INTERVAL '7 days'
     ),
     today_discount AS (
       SELECT COALESCE(discount_rate, 0) AS today_rate
       FROM daily_discount
       WHERE sale_date = CURRENT_DATE
       UNION ALL
       SELECT 0 WHERE NOT EXISTS (
         SELECT 1 FROM daily_discount WHERE sale_date = CURRENT_DATE
       )
     )
     SELECT t.today_rate, a.avg_rate
     FROM today_discount t, avg_discount a
     LIMIT 1`,
    [storeId]
  );

  if (result.rows.length === 0) return { anomaly: false, alert: false };
  const { today_rate, avg_rate } = result.rows[0];
  const avgRate = parseFloat(avg_rate) || 0;
  const todayRate = parseFloat(today_rate) || 0;

  if (avgRate <= 0) return { anomaly: false, alert: false };

  if (todayRate > avgRate * 2) {
    const metadataKey = `discount_spike_${new Date().toISOString().split("T")[0]}`;
    const title = "Excessive Discount Alert";
    const message = `Today's discount rate (${(todayRate * 100).toFixed(1)}%) is more than 2x the 7-day average (${(avgRate * 100).toFixed(1)}%).`;
    const metadata = {
      key: metadataKey,
      todayRate: Math.round(todayRate * 10000) / 100,
      avgRate: Math.round(avgRate * 10000) / 100,
      multiplier: Math.round((todayRate / avgRate) * 100) / 100,
    };

    const anomaly = await insertDedupedAnomaly(pool, storeId, "excessive_discount", "warning", message, metadata);
    const alert = await insertDedupedAlert(pool, storeId, "excessive_discount", "warning", title, message, metadata);
    return { anomaly, alert };
  }

  return { anomaly: false, alert: false };
}

// ─── Rule 3: Cancellations ─────────────────────────────────────────────────

async function checkCancellations(
  pool: any, storeId: string
): Promise<{ anomaly: boolean; alert: boolean }> {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS cancel_count
     FROM public.sales
     WHERE store_id = $1
       AND status IN ('cancelled', 'voided')
       AND DATE(created_at) = CURRENT_DATE`,
    [storeId]
  );

  const cancelCount = result.rows[0]?.cancel_count || 0;

  if (cancelCount > 5) {
    const metadataKey = `cancellations_${new Date().toISOString().split("T")[0]}`;
    const title = "High Cancellation Alert";
    const message = `${cancelCount} order cancellations today (threshold: 5).`;
    const metadata = { key: metadataKey, cancelCount };

    const anomaly = await insertDedupedAnomaly(pool, storeId, "high_cancellations", "warning", message, metadata);
    const alert = await insertDedupedAlert(pool, storeId, "high_cancellations", "warning", title, message, metadata);
    return { anomaly, alert };
  }

  return { anomaly: false, alert: false };
}

// ─── Rule 4: Sales Gap ─────────────────────────────────────────────────────

async function checkSalesGap(
  pool: any, storeId: string
): Promise<{ anomaly: boolean; alert: boolean }> {
  // Check if current time is within business hours (8am-10pm IST)
  const nowResult = await pool.query(
    `SELECT EXTRACT(HOUR FROM NOW() AT TIME ZONE 'Asia/Kolkata')::int AS current_hour`
  );
  const currentHour = nowResult.rows[0]?.current_hour ?? 0;

  if (currentHour < 8 || currentHour >= 22) {
    return { anomaly: false, alert: false };
  }

  // Find most recent sale within business hours today
  const result = await pool.query(
    `SELECT MAX(created_at) AS last_sale_at
     FROM public.sales
     WHERE store_id = $1 AND status = 'completed'
       AND DATE(created_at AT TIME ZONE 'Asia/Kolkata') = (NOW() AT TIME ZONE 'Asia/Kolkata')::date
       AND EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Kolkata') >= 8
       AND EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Kolkata') < 22`,
    [storeId]
  );

  const lastSaleAt = result.rows[0]?.last_sale_at;

  // If no sales today during business hours, check if 4+ hours have passed since 8am
  if (!lastSaleAt) {
    // Hours since business start today
    const hoursSince8am = currentHour - 8;
    if (hoursSince8am >= 4) {
      const metadataKey = `sales_gap_${new Date().toISOString().split("T")[0]}`;
      const title = "No Sales Alert";
      const message = `Zero sales for ${hoursSince8am} hours during business hours (8am-10pm).`;
      const metadata = { key: metadataKey, hoursSilent: hoursSince8am, since: "08:00" };

      const anomaly = await insertDedupedAnomaly(pool, storeId, "sales_gap", "warning", message, metadata);
      const alert = await insertDedupedAlert(pool, storeId, "sales_gap", "warning", title, message, metadata);
      return { anomaly, alert };
    }
    return { anomaly: false, alert: false };
  }

  // Check gap between last sale and now
  const gapResult = await pool.query(
    `SELECT EXTRACT(EPOCH FROM (NOW() - $1::timestamptz)) / 3600.0 AS gap_hours`,
    [lastSaleAt]
  );
  const gapHours = parseFloat(gapResult.rows[0]?.gap_hours) || 0;

  if (gapHours > 4) {
    const metadataKey = `sales_gap_${new Date().toISOString().split("T")[0]}`;
    const title = "Sales Gap Alert";
    const message = `No sales for ${Math.round(gapHours)} hours during business hours (8am-10pm).`;
    const metadata = {
      key: metadataKey,
      gapHours: Math.round(gapHours * 10) / 10,
      lastSaleAt: lastSaleAt,
    };

    const anomaly = await insertDedupedAnomaly(pool, storeId, "sales_gap", "warning", message, metadata);
    const alert = await insertDedupedAlert(pool, storeId, "sales_gap", "warning", title, message, metadata);
    return { anomaly, alert };
  }

  return { anomaly: false, alert: false };
}

// ─── Deduplication & Insert Helpers ─────────────────────────────────────────

async function insertDedupedAnomaly(
  pool: any,
  storeId: string,
  anomalyType: string,
  severity: string,
  description: string,
  metadata: Record<string, unknown>
): Promise<boolean> {
  // Deduplicate within 24h using metadata key
  const existing = await pool.query(
    `SELECT id FROM ai.anomaly_events
     WHERE store_id = $1 AND anomaly_type = $2
       AND detected_at > NOW() - INTERVAL '24 hours'
       AND metadata->>'key' = $3 LIMIT 1`,
    [storeId, anomalyType, metadata.key || ""]
  );
  if (existing.rows.length > 0) return false;

  await pool.query(
    `INSERT INTO ai.anomaly_events (store_id, anomaly_type, severity, description, metadata)
     VALUES ($1, $2, $3, $4, $5)`,
    [storeId, anomalyType, severity, description, JSON.stringify(metadata)]
  );
  return true;
}

async function insertDedupedAlert(
  pool: any,
  storeId: string,
  alertType: string,
  severity: string,
  title: string,
  message: string,
  metadata: Record<string, unknown>
): Promise<boolean> {
  // Deduplicate within 24h using metadata key
  const existing = await pool.query(
    `SELECT id FROM ai.alerts
     WHERE store_id = $1 AND alert_type = $2
       AND created_at > NOW() - INTERVAL '24 hours'
       AND metadata->>'key' = $3 LIMIT 1`,
    [storeId, alertType, metadata.key || ""]
  );
  if (existing.rows.length > 0) return false;

  await pool.query(
    `INSERT INTO ai.alerts (store_id, alert_type, severity, title, message, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [storeId, alertType, severity, title, message, JSON.stringify(metadata)]
  );
  return true;
}

// ─── Query Helpers (for admin API) ──────────────────────────────────────────

export interface AnomalyAlertFilters {
  severity?: string;
  storeId?: string;
  reviewed?: boolean;
  limit?: number;
  offset?: number;
}

export async function getAnomalyAlerts(
  filters: AnomalyAlertFilters = {}
): Promise<{ alerts: AnomalyAlertRow[]; total: number }> {
  const pool = getPool();
  if (!pool) return { alerts: [], total: 0 };

  const { severity, storeId, reviewed, limit = 50, offset = 0 } = filters;
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (severity) {
    conditions.push(`a.severity = $${idx++}`);
    params.push(severity);
  }
  if (storeId) {
    conditions.push(`a.store_id = $${idx++}::uuid`);
    params.push(storeId);
  }
  if (reviewed !== undefined) {
    conditions.push(`a.is_read = $${idx++}`);
    params.push(reviewed);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM ai.alerts a ${whereClause}`,
    params
  );

  const dataResult = await pool.query(
    `SELECT a.id, a.store_id, s.name AS store_name, a.alert_type, a.severity,
            a.title, a.message, a.metadata, a.is_read, a.is_dismissed, a.created_at
     FROM ai.alerts a
     LEFT JOIN platform.stores s ON s.id = a.store_id
     ${whereClause}
     ORDER BY a.created_at DESC
     LIMIT $${idx++} OFFSET $${idx++}`,
    [...params, limit, offset]
  );

  const alerts: AnomalyAlertRow[] = dataResult.rows.map((r: any) => ({
    id: r.id,
    storeId: r.store_id,
    storeName: r.store_name,
    alertType: r.alert_type,
    severity: r.severity,
    title: r.title,
    message: r.message,
    metadata: r.metadata || {},
    isRead: r.is_read,
    isDismissed: r.is_dismissed,
    createdAt: r.created_at,
  }));

  return { alerts, total: countResult.rows[0].total };
}

export async function getAlertSummary(): Promise<AnomalyAlertSummary> {
  const pool = getPool();
  if (!pool) return { critical: 0, warning: 0, info: 0, total: 0 };

  const result = await pool.query(
    `SELECT severity, COUNT(*)::int AS count
     FROM ai.alerts
     WHERE is_read = false AND is_dismissed = false
     GROUP BY severity`
  );

  const summary: AnomalyAlertSummary = { critical: 0, warning: 0, info: 0, total: 0 };
  for (const row of result.rows) {
    const sev = row.severity as keyof Omit<AnomalyAlertSummary, "total">;
    if (sev in summary) {
      summary[sev] = row.count;
    }
    summary.total += row.count;
  }

  return summary;
}

export async function acknowledgeAlert(alertId: string): Promise<boolean> {
  const pool = getPool();
  if (!pool) return false;

  const result = await pool.query(
    `UPDATE ai.alerts SET is_read = true WHERE id = $1`,
    [alertId]
  );
  return (result.rowCount ?? 0) > 0;
}

// ─── Exported for testing ───────────────────────────────────────────────────

export const _testOnly = {
  checkRevenueDrop,
  checkDiscountRate,
  checkCancellations,
  checkSalesGap,
  insertDedupedAnomaly,
  insertDedupedAlert,
};
