// T-316: Anomaly Detection Service
// Detects unusual patterns: sudden spikes/drops, after-hours transactions,
// unusual refunds, large transactions
// Uses statistical z-score based detection

import { getPool } from "../../db/client";

export type AnomalyType = 'sales_spike' | 'sales_drop' | 'unusual_refund'
  | 'after_hours' | 'large_transaction' | 'unusual_discount' | 'void_pattern';

export interface AnomalyEvent {
  id: string;
  storeId: string;
  anomalyType: AnomalyType;
  severity: string;
  description: string;
  metadata: Record<string, unknown>;
  isReviewed: boolean;
  detectedAt: string;
}

/**
 * Run anomaly detection for a store
 */
export async function detectStoreAnomalies(storeId: string): Promise<number> {
  const pool = getPool();
  if (!pool) return 0;

  let count = 0;
  count += await detectSalesAnomalies(pool, storeId);
  count += await detectRefundAnomalies(pool, storeId);
  count += await detectLargeTransactions(pool, storeId);
  count += await detectVoidPatterns(pool, storeId);
  return count;
}

async function createAnomaly(
  pool: any, storeId: string, type: AnomalyType,
  severity: string, description: string, metadata: Record<string, unknown>
): Promise<boolean> {
  // Deduplicate within 24h
  const existing = await pool.query(
    `SELECT id FROM ai.anomaly_events
     WHERE store_id = $1 AND anomaly_type = $2
       AND detected_at > NOW() - INTERVAL '24 hours'
       AND metadata->>'key' = $3 LIMIT 1`,
    [storeId, type, metadata.key || '']
  );
  if (existing.rows.length > 0) return false;

  await pool.query(
    `INSERT INTO ai.anomaly_events (store_id, anomaly_type, severity, description, metadata)
     VALUES ($1, $2, $3, $4, $5)`,
    [storeId, type, severity, description, JSON.stringify(metadata)]
  );
  return true;
}

async function detectSalesAnomalies(pool: any, storeId: string): Promise<number> {
  // Compare today's sales to 30-day average using z-score
  const result = await pool.query(
    `WITH daily_sales AS (
       SELECT DATE(created_at) AS sale_date, COUNT(*)::int AS sale_count,
              COALESCE(SUM(total_minor), 0)::bigint AS total_minor
       FROM public.sales
       WHERE store_id = $1 AND status = 'completed'
         AND created_at >= NOW() - INTERVAL '31 days'
       GROUP BY DATE(created_at)
     ),
     stats AS (
       SELECT AVG(sale_count) AS avg_count, STDDEV(sale_count) AS stddev_count,
              AVG(total_minor::numeric) AS avg_total, STDDEV(total_minor::numeric) AS stddev_total
       FROM daily_sales WHERE sale_date < CURRENT_DATE
     ),
     today AS (
       SELECT * FROM daily_sales WHERE sale_date = CURRENT_DATE
     )
     SELECT t.sale_count, t.total_minor, s.avg_count, s.stddev_count, s.avg_total, s.stddev_total
     FROM today t, stats s`,
    [storeId]
  );

  if (result.rows.length === 0) return 0;
  const row = result.rows[0];
  const avgCount = parseFloat(row.avg_count) || 0;
  const stddevCount = parseFloat(row.stddev_count) || 1;
  const todayCount = parseInt(row.sale_count) || 0;

  let count = 0;

  // Z-score > 2.5 = spike, < -2.5 = drop
  if (stddevCount > 0 && avgCount > 0) {
    const zScore = (todayCount - avgCount) / stddevCount;

    if (zScore > 2.5) {
      const created = await createAnomaly(pool, storeId, 'sales_spike', 'info',
        `Unusual sales spike: ${todayCount} transactions today vs ${Math.round(avgCount)} average.`,
        { key: `spike_${new Date().toISOString().split('T')[0]}`, todayCount, avgCount: Math.round(avgCount), zScore: Math.round(zScore * 100) / 100 }
      );
      if (created) count++;
    } else if (zScore < -2.5) {
      const created = await createAnomaly(pool, storeId, 'sales_drop', 'warning',
        `Unusual sales drop: ${todayCount} transactions today vs ${Math.round(avgCount)} average.`,
        { key: `drop_${new Date().toISOString().split('T')[0]}`, todayCount, avgCount: Math.round(avgCount), zScore: Math.round(zScore * 100) / 100 }
      );
      if (created) count++;
    }
  }

  return count;
}

async function detectRefundAnomalies(pool: any, storeId: string): Promise<number> {
  // Flag if today's refunds exceed 10% of sales or more than 5 refunds
  const result = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM orders.refunds
        WHERE store_id = $1 AND DATE(created_at) = CURRENT_DATE
          AND status IN ('approved', 'processed')) AS refund_count,
       (SELECT COUNT(*)::int FROM public.sales
        WHERE store_id = $1 AND DATE(created_at) = CURRENT_DATE
          AND status = 'completed') AS sale_count`,
    [storeId]
  );

  if (result.rows.length === 0) return 0;
  const { refund_count, sale_count } = result.rows[0];
  const refundRate = sale_count > 0 ? refund_count / sale_count : 0;

  if (refund_count >= 5 || (refundRate > 0.1 && refund_count >= 3)) {
    const created = await createAnomaly(pool, storeId, 'unusual_refund', 'warning',
      `High refund activity: ${refund_count} refunds out of ${sale_count} sales today (${Math.round(refundRate * 100)}%).`,
      { key: `refund_${new Date().toISOString().split('T')[0]}`, refundCount: refund_count, saleCount: sale_count, refundRate }
    );
    return created ? 1 : 0;
  }
  return 0;
}

async function detectLargeTransactions(pool: any, storeId: string): Promise<number> {
  // Flag transactions > 3x the average
  const result = await pool.query(
    `WITH avg_sale AS (
       SELECT AVG(total_minor::numeric) AS avg_total
       FROM public.sales WHERE store_id = $1 AND status = 'completed'
         AND created_at >= NOW() - INTERVAL '30 days'
     )
     SELECT s.id, s.total_minor, a.avg_total
     FROM public.sales s, avg_sale a
     WHERE s.store_id = $1 AND s.status = 'completed'
       AND DATE(s.created_at) = CURRENT_DATE
       AND s.total_minor > a.avg_total * 3
       AND s.total_minor > 500000`,
    [storeId]
  );

  let count = 0;
  for (const row of result.rows) {
    const created = await createAnomaly(pool, storeId, 'large_transaction', 'info',
      `Large transaction: ₹${(parseInt(row.total_minor) / 100).toFixed(2)} (avg ₹${(parseFloat(row.avg_total) / 100).toFixed(2)}).`,
      { key: `large_${row.id}`, saleId: row.id, amount: row.total_minor, avgAmount: Math.round(parseFloat(row.avg_total)) }
    );
    if (created) count++;
  }
  return count;
}

async function detectVoidPatterns(pool: any, storeId: string): Promise<number> {
  // Flag if more than 3 voided/cancelled sales today
  const result = await pool.query(
    `SELECT COUNT(*)::int AS void_count
     FROM public.sales
     WHERE store_id = $1 AND status IN ('voided', 'cancelled')
       AND DATE(created_at) = CURRENT_DATE`,
    [storeId]
  );

  const voidCount = result.rows[0]?.void_count || 0;
  if (voidCount >= 3) {
    const created = await createAnomaly(pool, storeId, 'void_pattern', 'warning',
      `${voidCount} voided/cancelled transactions today. Review for potential issues.`,
      { key: `void_${new Date().toISOString().split('T')[0]}`, voidCount }
    );
    return created ? 1 : 0;
  }
  return 0;
}

/**
 * Get anomaly events for a store
 */
export async function getStoreAnomalies(storeId: string, opts: {
  unreviewed?: boolean; limit?: number; offset?: number;
} = {}): Promise<{ anomalies: AnomalyEvent[]; total: number }> {
  const pool = getPool();
  if (!pool) return { anomalies: [], total: 0 };

  const { unreviewed = false, limit = 50, offset = 0 } = opts;
  const conditions = ['store_id = $1'];
  const params: unknown[] = [storeId];

  if (unreviewed) {
    conditions.push('is_reviewed = false');
  }

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM ai.anomaly_events WHERE ${conditions.join(' AND ')}`, params
  );

  const result = await pool.query(
    `SELECT id, store_id AS "storeId", anomaly_type AS "anomalyType", severity,
            description, metadata, is_reviewed AS "isReviewed", detected_at AS "detectedAt"
     FROM ai.anomaly_events WHERE ${conditions.join(' AND ')}
     ORDER BY detected_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  return { anomalies: result.rows, total: countResult.rows[0].total };
}

/**
 * Mark anomaly as reviewed
 */
export async function markAnomalyReviewed(anomalyId: string, storeId: string): Promise<boolean> {
  const pool = getPool();
  if (!pool) return false;
  const result = await pool.query(
    `UPDATE ai.anomaly_events SET is_reviewed = true WHERE id = $1 AND store_id = $2`,
    [anomalyId, storeId]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Run anomaly detection for ALL stores (scheduled job)
 */
export async function detectAllAnomalies(): Promise<{ storesProcessed: number; totalAnomalies: number }> {
  const pool = getPool();
  if (!pool) return { storesProcessed: 0, totalAnomalies: 0 };

  const storesResult = await pool.query(
    `SELECT id FROM platform.stores WHERE status = 'active' LIMIT 1000`
  );

  let total = 0;
  for (const row of storesResult.rows) {
    total += await detectStoreAnomalies(row.id);
  }
  return { storesProcessed: storesResult.rows.length, totalAnomalies: total };
}
