// SA-P1-010: Anomaly Detection & Alerting Service
// Runs periodically to detect unusual store activity patterns:
// 1. Revenue drop >50% from 7-day rolling average
// 2. Discount rate >2x the 7-day average
// 3. >5 order cancellations per day
// 4. 0 sales for >4 hours during business hours (8am-10pm IST)
// Inserts findings into ai.anomaly_events + ai.alerts

import { getPool } from "../../db/client";
import { log } from "../../lib/logger";

const BUSINESS_HOUR_START = 8;  // 8 AM IST
const BUSINESS_HOUR_END = 22;   // 10 PM IST
const IDLE_THRESHOLD_HOURS = 4;
const REVENUE_DROP_THRESHOLD = 0.5;     // >50% drop
const DISCOUNT_RATE_MULTIPLIER = 2;     // >2x average discount rate
const CANCELLATION_THRESHOLD = 5;       // >5 cancellations/day
const ROLLING_WINDOW_DAYS = 7;

export interface AnomalyDetectionResult {
  storesProcessed: number;
  totalAnomalies: number;
  totalAlerts: number;
  errors: number;
  details: StoreDetectionResult[];
}

export interface StoreDetectionResult {
  storeId: string;
  anomalies: number;
  alerts: number;
}

/**
 * Create an anomaly event, deduplicating within 24h by store+type+key.
 */
async function insertAnomaly(
  pool: ReturnType<typeof getPool>,
  storeId: string,
  anomalyType: string,
  severity: string,
  description: string,
  metadata: Record<string, unknown>,
): Promise<boolean> {
  if (!pool) return false;
  const existing = await pool.query(
    `SELECT id FROM ai.anomaly_events
     WHERE store_id = $1 AND anomaly_type = $2
       AND detected_at > NOW() - INTERVAL '24 hours'
       AND metadata->>'key' = $3
     LIMIT 1`,
    [storeId, anomalyType, metadata.key || ""],
  );
  if (existing.rows.length > 0) return false;

  await pool.query(
    `INSERT INTO ai.anomaly_events (store_id, anomaly_type, severity, description, metadata)
     VALUES ($1, $2, $3, $4, $5)`,
    [storeId, anomalyType, severity, description, JSON.stringify(metadata)],
  );
  return true;
}

/**
 * Create an alert, deduplicating within 24h by store+type+key.
 */
async function insertAlert(
  pool: ReturnType<typeof getPool>,
  storeId: string,
  alertType: string,
  severity: string,
  title: string,
  message: string,
  metadata: Record<string, unknown>,
): Promise<boolean> {
  if (!pool) return false;
  const existing = await pool.query(
    `SELECT id FROM ai.alerts
     WHERE store_id = $1 AND alert_type = $2
       AND created_at > NOW() - INTERVAL '24 hours'
       AND metadata->>'key' = $3
     LIMIT 1`,
    [storeId, alertType, metadata.key || ""],
  );
  if (existing.rows.length > 0) return false;

  await pool.query(
    `INSERT INTO ai.alerts (store_id, alert_type, severity, title, message, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [storeId, alertType, severity, title, message, JSON.stringify(metadata)],
  );
  return true;
}

/**
 * Rule 1: Revenue drop >50% from 7-day rolling average
 */
export async function detectRevenueDrop(pool: ReturnType<typeof getPool>, storeId: string): Promise<{ anomalies: number; alerts: number }> {
  if (!pool) return { anomalies: 0, alerts: 0 };

  const result = await pool.query(
    `WITH daily_revenue AS (
       SELECT DATE(created_at) AS sale_date,
              COALESCE(SUM(total_minor), 0)::bigint AS revenue
       FROM public.sales
       WHERE store_id = $1 AND status = 'completed'
         AND created_at >= NOW() - INTERVAL '${ROLLING_WINDOW_DAYS + 1} days'
       GROUP BY DATE(created_at)
     ),
     avg_revenue AS (
       SELECT AVG(revenue)::bigint AS avg_rev
       FROM daily_revenue
       WHERE sale_date < CURRENT_DATE
         AND sale_date >= CURRENT_DATE - INTERVAL '${ROLLING_WINDOW_DAYS} days'
     ),
     today_revenue AS (
       SELECT COALESCE(SUM(total_minor), 0)::bigint AS today_rev
       FROM public.sales
       WHERE store_id = $1 AND status = 'completed'
         AND DATE(created_at) = CURRENT_DATE
     )
     SELECT t.today_rev, a.avg_rev
     FROM today_revenue t, avg_revenue a`,
    [storeId],
  );

  if (result.rows.length === 0) return { anomalies: 0, alerts: 0 };

  const { today_rev, avg_rev } = result.rows[0];
  const todayRev = parseInt(today_rev) || 0;
  const avgRev = parseInt(avg_rev) || 0;

  if (avgRev <= 0) return { anomalies: 0, alerts: 0 };

  const dropPct = ((avgRev - todayRev) / avgRev) * 100;
  if (dropPct <= REVENUE_DROP_THRESHOLD * 100) return { anomalies: 0, alerts: 0 };

  const dateKey = new Date().toISOString().split("T")[0];
  const meta = {
    key: `revenue_drop_${dateKey}`,
    todayRevenue: todayRev,
    avgRevenue: avgRev,
    dropPercentage: Math.round(dropPct),
  };
  const desc = `Revenue dropped ${Math.round(dropPct)}% today (₹${(todayRev / 100).toFixed(0)}) vs 7-day avg (₹${(avgRev / 100).toFixed(0)}).`;

  let anomalies = 0;
  let alerts = 0;

  if (await insertAnomaly(pool, storeId, "revenue_drop", "critical", desc, meta)) anomalies++;
  if (await insertAlert(pool, storeId, "anomaly", "critical", "Revenue Drop Alert", desc, meta)) alerts++;

  return { anomalies, alerts };
}

/**
 * Rule 2: Discount rate >2x the 7-day average
 */
export async function detectHighDiscountRate(pool: ReturnType<typeof getPool>, storeId: string): Promise<{ anomalies: number; alerts: number }> {
  if (!pool) return { anomalies: 0, alerts: 0 };

  const result = await pool.query(
    `WITH daily_discounts AS (
       SELECT DATE(created_at) AS sale_date,
              CASE WHEN SUM(total_minor) > 0
                THEN SUM(discount_minor)::numeric / SUM(total_minor)::numeric
                ELSE 0 END AS discount_rate
       FROM public.sales
       WHERE store_id = $1 AND status = 'completed'
         AND created_at >= NOW() - INTERVAL '${ROLLING_WINDOW_DAYS + 1} days'
       GROUP BY DATE(created_at)
     ),
     avg_discount AS (
       SELECT AVG(discount_rate) AS avg_rate
       FROM daily_discounts
       WHERE sale_date < CURRENT_DATE
         AND sale_date >= CURRENT_DATE - INTERVAL '${ROLLING_WINDOW_DAYS} days'
     ),
     today_discount AS (
       SELECT CASE WHEN SUM(total_minor) > 0
                THEN SUM(discount_minor)::numeric / SUM(total_minor)::numeric
                ELSE 0 END AS today_rate
       FROM public.sales
       WHERE store_id = $1 AND status = 'completed'
         AND DATE(created_at) = CURRENT_DATE
     )
     SELECT t.today_rate, a.avg_rate
     FROM today_discount t, avg_discount a`,
    [storeId],
  );

  if (result.rows.length === 0) return { anomalies: 0, alerts: 0 };

  const todayRate = parseFloat(result.rows[0].today_rate) || 0;
  const avgRate = parseFloat(result.rows[0].avg_rate) || 0;

  if (avgRate <= 0 || todayRate <= avgRate * DISCOUNT_RATE_MULTIPLIER) {
    return { anomalies: 0, alerts: 0 };
  }

  const dateKey = new Date().toISOString().split("T")[0];
  const meta = {
    key: `high_discount_${dateKey}`,
    todayRate: Math.round(todayRate * 10000) / 100,
    avgRate: Math.round(avgRate * 10000) / 100,
    multiplier: Math.round((todayRate / avgRate) * 10) / 10,
  };
  const desc = `Discount rate ${meta.todayRate}% today is ${meta.multiplier}x the 7-day avg (${meta.avgRate}%).`;

  let anomalies = 0;
  let alerts = 0;

  if (await insertAnomaly(pool, storeId, "unusual_discount", "warning", desc, meta)) anomalies++;
  if (await insertAlert(pool, storeId, "anomaly", "warning", "High Discount Rate", desc, meta)) alerts++;

  return { anomalies, alerts };
}

/**
 * Rule 3: >5 order cancellations per day
 */
export async function detectHighCancellations(pool: ReturnType<typeof getPool>, storeId: string): Promise<{ anomalies: number; alerts: number }> {
  if (!pool) return { anomalies: 0, alerts: 0 };

  const result = await pool.query(
    `SELECT COUNT(*)::int AS cancel_count
     FROM public.sales
     WHERE store_id = $1
       AND status IN ('cancelled', 'voided')
       AND DATE(created_at) = CURRENT_DATE`,
    [storeId],
  );

  const cancelCount = result.rows[0]?.cancel_count || 0;
  if (cancelCount <= CANCELLATION_THRESHOLD) return { anomalies: 0, alerts: 0 };

  const dateKey = new Date().toISOString().split("T")[0];
  const meta = {
    key: `high_cancellations_${dateKey}`,
    cancellationCount: cancelCount,
    threshold: CANCELLATION_THRESHOLD,
  };
  const desc = `${cancelCount} cancellations today (threshold: ${CANCELLATION_THRESHOLD}). Review for potential issues.`;

  let anomalies = 0;
  let alerts = 0;

  if (await insertAnomaly(pool, storeId, "void_pattern", "warning", desc, meta)) anomalies++;
  if (await insertAlert(pool, storeId, "anomaly", "warning", "High Cancellation Rate", desc, meta)) alerts++;

  return { anomalies, alerts };
}

/**
 * Rule 4: 0 sales for >4 hours during business hours (8am-10pm IST)
 */
export async function detectSalesInactivity(pool: ReturnType<typeof getPool>, storeId: string): Promise<{ anomalies: number; alerts: number }> {
  if (!pool) return { anomalies: 0, alerts: 0 };

  // Get current IST hour
  const nowIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const currentHour = nowIST.getUTCHours();

  // Only check during business hours
  if (currentHour < BUSINESS_HOUR_START || currentHour >= BUSINESS_HOUR_END) {
    return { anomalies: 0, alerts: 0 };
  }

  const result = await pool.query(
    `SELECT MAX(created_at) AS last_sale_at
     FROM public.sales
     WHERE store_id = $1 AND status = 'completed'
       AND DATE(created_at AT TIME ZONE 'Asia/Kolkata') = (NOW() AT TIME ZONE 'Asia/Kolkata')::date`,
    [storeId],
  );

  const lastSaleAt = result.rows[0]?.last_sale_at;

  let idleHours: number;
  if (!lastSaleAt) {
    // No sales today — idle since business start
    const businessStartToday = new Date(nowIST);
    businessStartToday.setUTCHours(BUSINESS_HOUR_START, 0, 0, 0);
    idleHours = (nowIST.getTime() - businessStartToday.getTime()) / (1000 * 60 * 60);
  } else {
    const lastSaleTime = new Date(lastSaleAt);
    idleHours = (Date.now() - lastSaleTime.getTime()) / (1000 * 60 * 60);
  }

  if (idleHours < IDLE_THRESHOLD_HOURS) return { anomalies: 0, alerts: 0 };

  const dateKey = new Date().toISOString().split("T")[0];
  const meta = {
    key: `sales_inactivity_${dateKey}`,
    idleHours: Math.round(idleHours * 10) / 10,
    lastSaleAt: lastSaleAt || null,
    threshold: IDLE_THRESHOLD_HOURS,
  };
  const desc = `No sales for ${meta.idleHours} hours during business hours. Last sale: ${lastSaleAt ? new Date(lastSaleAt).toISOString() : "none today"}.`;

  let anomalies = 0;
  let alerts = 0;

  if (await insertAnomaly(pool, storeId, "sales_drop", "warning", desc, meta)) anomalies++;
  if (await insertAlert(pool, storeId, "anomaly", "warning", "Sales Inactivity", desc, meta)) alerts++;

  return { anomalies, alerts };
}

/**
 * Run all 4 anomaly detection rules for a single store.
 */
export async function detectStoreAnomaliesV2(storeId: string): Promise<StoreDetectionResult> {
  const pool = getPool();
  if (!pool) return { storeId, anomalies: 0, alerts: 0 };

  let anomalies = 0;
  let alerts = 0;

  const results = await Promise.allSettled([
    detectRevenueDrop(pool, storeId),
    detectHighDiscountRate(pool, storeId),
    detectHighCancellations(pool, storeId),
    detectSalesInactivity(pool, storeId),
  ]);

  for (const r of results) {
    if (r.status === "fulfilled") {
      anomalies += r.value.anomalies;
      alerts += r.value.alerts;
    } else {
      log.error(`[AnomalyAlerting] Rule failed for store ${storeId}:`, r.reason);
    }
  }

  return { storeId, anomalies, alerts };
}

/**
 * Run anomaly detection for ALL active stores (scheduled job entry point).
 * Called hourly by Cloud Scheduler.
 */
export async function detectAnomalies(): Promise<AnomalyDetectionResult> {
  const pool = getPool();
  if (!pool) return { storesProcessed: 0, totalAnomalies: 0, totalAlerts: 0, errors: 0, details: [] };

  const storesResult = await pool.query(
    `SELECT id FROM platform.stores WHERE status = 'active' LIMIT 1000`,
  );

  let totalAnomalies = 0;
  let totalAlerts = 0;
  let errors = 0;
  const details: StoreDetectionResult[] = [];

  for (const row of storesResult.rows) {
    try {
      const result = await detectStoreAnomaliesV2(row.id);
      totalAnomalies += result.anomalies;
      totalAlerts += result.alerts;
      if (result.anomalies > 0 || result.alerts > 0) {
        details.push(result);
      }
    } catch (err) {
      errors++;
      log.error(`[AnomalyAlerting] Failed for store ${row.id}:`, err);
    }
  }

  log.info(`[AnomalyAlerting] Detection complete: ${storesResult.rows.length} stores, ${totalAnomalies} anomalies, ${totalAlerts} alerts, ${errors} errors`);

  return {
    storesProcessed: storesResult.rows.length,
    totalAnomalies,
    totalAlerts,
    errors,
    details,
  };
}
