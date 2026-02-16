// T-312: Customer Purchase Insights Service
// RFM analysis (Recency, Frequency, Monetary) + basket analysis
// Runs as scheduled job, caches results in ai.customer_insights

import { getPool } from "../../db/client";

export type RFMSegment = 'champion' | 'loyal' | 'potential' | 'at_risk' | 'lost' | 'new' | 'casual';

export interface CustomerInsight {
  customerPhone: string;
  rfmRecency: number;
  rfmFrequency: number;
  rfmMonetary: number;
  rfmSegment: RFMSegment;
  topProducts: Array<{ productId: string; name: string; count: number }>;
  avgBasketSize: number;
  avgBasketValue: number;
  lastVisit: string;
}

function classifySegment(recencyDays: number, frequency: number, monetary: number): RFMSegment {
  // Simple RFM segmentation
  if (recencyDays <= 7 && frequency >= 10) return 'champion';
  if (recencyDays <= 14 && frequency >= 5) return 'loyal';
  if (recencyDays <= 7 && frequency < 5) return 'new';
  if (recencyDays <= 30 && frequency >= 3) return 'potential';
  if (recencyDays <= 30 && frequency < 3) return 'casual';
  if (recencyDays <= 90) return 'at_risk';
  return 'lost';
}

/**
 * Compute customer insights for a store
 */
export async function computeStoreInsights(storeId: string): Promise<number> {
  const pool = getPool();
  if (!pool) return 0;

  // Get customer-level aggregates from last 90 days
  const result = await pool.query(
    `SELECT s.customer_phone,
            (CURRENT_DATE - MAX(DATE(s.created_at))) AS recency_days,
            COUNT(DISTINCT s.id) AS frequency,
            COALESCE(SUM(s.total_minor), 0)::int AS monetary,
            MAX(DATE(s.created_at)) AS last_visit,
            ROUND(AVG(item_counts.item_count))::int AS avg_basket_size,
            ROUND(AVG(s.total_minor))::int AS avg_basket_value
     FROM public.sales s
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS item_count FROM public.sale_items si WHERE si.sale_id = s.id
     ) item_counts ON true
     WHERE s.store_id = $1 AND s.status = 'completed'
       AND s.customer_phone IS NOT NULL AND s.customer_phone != ''
       AND s.created_at >= NOW() - INTERVAL '90 days'
     GROUP BY s.customer_phone
     HAVING COUNT(DISTINCT s.id) >= 1
     ORDER BY SUM(s.total_minor) DESC
     LIMIT 500`,
    [storeId]
  );

  let count = 0;
  for (const row of result.rows) {
    const recency = parseInt(row.recency_days) || 999;
    const frequency = parseInt(row.frequency) || 0;
    const monetary = parseInt(row.monetary) || 0;
    const segment = classifySegment(recency, frequency, monetary);

    // Get top 5 products for this customer
    const topResult = await pool.query(
      `SELECT si.product_id, sp.display_name AS name, SUM(si.quantity)::int AS count
       FROM public.sale_items si
       JOIN public.sales s ON s.id = si.sale_id
       LEFT JOIN catalog.store_products sp ON sp.product_id = si.product_id AND sp.store_id = $1
       WHERE s.store_id = $1 AND s.customer_phone = $2 AND s.status = 'completed'
         AND s.created_at >= NOW() - INTERVAL '90 days'
       GROUP BY si.product_id, sp.display_name
       ORDER BY count DESC LIMIT 5`,
      [storeId, row.customer_phone]
    );

    const topProducts = topResult.rows.map((r: any) => ({
      productId: r.product_id, name: r.name || 'Unknown', count: r.count
    }));

    await pool.query(
      `INSERT INTO ai.customer_insights
       (store_id, customer_phone, rfm_recency, rfm_frequency, rfm_monetary, rfm_segment,
        top_products, avg_basket_size, avg_basket_value, last_visit, computed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
       ON CONFLICT (store_id, customer_phone)
       DO UPDATE SET rfm_recency = $3, rfm_frequency = $4, rfm_monetary = $5, rfm_segment = $6,
                     top_products = $7, avg_basket_size = $8, avg_basket_value = $9,
                     last_visit = $10, computed_at = NOW()`,
      [storeId, row.customer_phone, recency, frequency, monetary, segment,
       JSON.stringify(topProducts), parseInt(row.avg_basket_size) || 0,
       parseInt(row.avg_basket_value) || 0, row.last_visit]
    );
    count++;
  }

  return count;
}

/**
 * Get customer insights for a store
 */
export async function getStoreCustomerInsights(storeId: string, opts: {
  segment?: RFMSegment; limit?: number; offset?: number;
} = {}): Promise<{ insights: CustomerInsight[]; total: number }> {
  const pool = getPool();
  if (!pool) return { insights: [], total: 0 };

  const { segment, limit = 50, offset = 0 } = opts;
  const conditions = ['store_id = $1'];
  const params: unknown[] = [storeId];

  if (segment) {
    conditions.push(`rfm_segment = $${params.length + 1}`);
    params.push(segment);
  }

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM ai.customer_insights WHERE ${conditions.join(' AND ')}`, params
  );

  const result = await pool.query(
    `SELECT customer_phone AS "customerPhone", rfm_recency AS "rfmRecency",
            rfm_frequency AS "rfmFrequency", rfm_monetary AS "rfmMonetary",
            rfm_segment AS "rfmSegment", top_products AS "topProducts",
            avg_basket_size AS "avgBasketSize", avg_basket_value AS "avgBasketValue",
            last_visit AS "lastVisit"
     FROM ai.customer_insights WHERE ${conditions.join(' AND ')}
     ORDER BY rfm_monetary DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  return { insights: result.rows, total: countResult.rows[0].total };
}

/**
 * Compute insights for ALL stores (scheduled job)
 */
export async function computeAllInsights(): Promise<{ storesProcessed: number; totalCustomers: number }> {
  const pool = getPool();
  if (!pool) return { storesProcessed: 0, totalCustomers: 0 };

  const storesResult = await pool.query(
    `SELECT id FROM platform.stores WHERE status = 'active' LIMIT 1000`
  );

  let total = 0;
  for (const row of storesResult.rows) {
    total += await computeStoreInsights(row.id);
  }
  return { storesProcessed: storesResult.rows.length, totalCustomers: total };
}
