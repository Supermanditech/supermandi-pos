// T-303: AI Product Recommendation Service
// "Frequently bought together" + "Customers also bought" + "Trending"
// Computes recommendations from order history, caches in ai.product_recommendations

import { getPool } from "../../db/client";

export interface ProductRecommendation {
  productId: string;
  productName: string;
  recommendationType: string;
  score: number;
  currentStock: number;
  sellPrice: number;
}

/**
 * Compute "frequently bought together" recommendations for a store
 * Uses co-occurrence in the same sale (market basket analysis)
 */
export async function computeStoreRecommendations(storeId: string): Promise<number> {
  const pool = getPool();
  if (!pool) return 0;

  // Find product pairs that frequently appear in the same sale
  const result = await pool.query(
    `WITH recent_pairs AS (
       SELECT a.product_id AS product_a, b.product_id AS product_b,
              COUNT(DISTINCT a.sale_id) AS co_occurrences
       FROM public.sale_items a
       JOIN public.sale_items b ON a.sale_id = b.sale_id AND a.product_id < b.product_id
       JOIN public.sales s ON s.id = a.sale_id
       WHERE s.store_id = $1 AND s.status = 'completed'
         AND s.created_at >= NOW() - INTERVAL '60 days'
       GROUP BY a.product_id, b.product_id
       HAVING COUNT(DISTINCT a.sale_id) >= 3
       ORDER BY co_occurrences DESC
       LIMIT 200
     )
     SELECT product_a, product_b, co_occurrences FROM recent_pairs`,
    [storeId]
  );

  let count = 0;
  for (const row of result.rows) {
    const score = Math.min(99.99, parseFloat(row.co_occurrences));

    // Insert bidirectional recommendations
    for (const [from, to] of [[row.product_a, row.product_b], [row.product_b, row.product_a]]) {
      await pool.query(
        `INSERT INTO ai.product_recommendations
         (store_id, product_id, recommended_product_id, recommendation_type, score, computed_at)
         VALUES ($1, $2, $3, 'frequently_bought_together', $4, NOW())
         ON CONFLICT (store_id, product_id, recommended_product_id, recommendation_type)
         DO UPDATE SET score = $4, computed_at = NOW()`,
        [storeId, from, to, score]
      );
      count++;
    }
  }

  // Compute "trending" — products with highest sales growth this week vs last
  const trendingResult = await pool.query(
    `WITH this_week AS (
       SELECT si.product_id, SUM(si.quantity)::int AS qty
       FROM public.sale_items si
       JOIN public.sales s ON s.id = si.sale_id
       WHERE s.store_id = $1 AND s.status = 'completed' AND s.created_at >= NOW() - INTERVAL '7 days'
       GROUP BY si.product_id
     ),
     last_week AS (
       SELECT si.product_id, SUM(si.quantity)::int AS qty
       FROM public.sale_items si
       JOIN public.sales s ON s.id = si.sale_id
       WHERE s.store_id = $1 AND s.status = 'completed'
         AND s.created_at >= NOW() - INTERVAL '14 days' AND s.created_at < NOW() - INTERVAL '7 days'
       GROUP BY si.product_id
     )
     SELECT tw.product_id, tw.qty AS this_week, COALESCE(lw.qty, 0) AS last_week,
            (tw.qty - COALESCE(lw.qty, 0))::numeric AS growth
     FROM this_week tw
     LEFT JOIN last_week lw ON lw.product_id = tw.product_id
     WHERE tw.qty >= 5
     ORDER BY growth DESC
     LIMIT 20`,
    [storeId]
  );

  // Store trending products as self-referencing recommendations with type='trending'
  for (const row of trendingResult.rows) {
    await pool.query(
      `INSERT INTO ai.product_recommendations
       (store_id, product_id, recommended_product_id, recommendation_type, score, computed_at)
       VALUES ($1, $2, $2, 'trending', $3, NOW())
       ON CONFLICT (store_id, product_id, recommended_product_id, recommendation_type)
       DO UPDATE SET score = $3, computed_at = NOW()`,
      [storeId, row.product_id, parseFloat(row.growth)]
    );
    count++;
  }

  return count;
}

/**
 * Get recommendations for a specific product
 */
export async function getProductRecommendations(storeId: string, productId: string, opts: {
  type?: string; limit?: number;
} = {}): Promise<ProductRecommendation[]> {
  const pool = getPool();
  if (!pool) return [];

  const { type, limit = 10 } = opts;
  const conditions = ['pr.store_id = $1', 'pr.product_id = $2', 'pr.recommended_product_id != $2'];
  const params: unknown[] = [storeId, productId];

  if (type) {
    conditions.push(`pr.recommendation_type = $${params.length + 1}`);
    params.push(type);
  }

  const result = await pool.query(
    `SELECT pr.recommended_product_id AS "productId",
            sp.display_name AS "productName",
            pr.recommendation_type AS "recommendationType",
            pr.score,
            COALESCE(sb.current_qty, sp.current_stock, 0) AS "currentStock",
            sp.sell_price AS "sellPrice"
     FROM ai.product_recommendations pr
     JOIN catalog.store_products sp ON sp.product_id = pr.recommended_product_id AND sp.store_id = pr.store_id
     LEFT JOIN inventory.stock_balances sb ON sb.store_id = pr.store_id AND sb.product_id = pr.recommended_product_id
     WHERE ${conditions.join(' AND ')} AND sp.is_active = true
     ORDER BY pr.score DESC
     LIMIT $${params.length + 1}`,
    [...params, limit]
  );

  return result.rows;
}

/**
 * Get trending products for a store
 */
export async function getTrendingProducts(storeId: string, limit: number = 10): Promise<ProductRecommendation[]> {
  const pool = getPool();
  if (!pool) return [];

  const result = await pool.query(
    `SELECT pr.product_id AS "productId", sp.display_name AS "productName",
            'trending' AS "recommendationType", pr.score,
            COALESCE(sb.current_qty, sp.current_stock, 0) AS "currentStock",
            sp.sell_price AS "sellPrice"
     FROM ai.product_recommendations pr
     JOIN catalog.store_products sp ON sp.product_id = pr.product_id AND sp.store_id = pr.store_id
     LEFT JOIN inventory.stock_balances sb ON sb.store_id = pr.store_id AND sb.product_id = pr.product_id
     WHERE pr.store_id = $1 AND pr.recommendation_type = 'trending' AND sp.is_active = true
     ORDER BY pr.score DESC LIMIT $2`,
    [storeId, limit]
  );

  return result.rows;
}

/**
 * Compute recommendations for ALL stores (scheduled job)
 */
export async function computeAllRecommendations(): Promise<{ storesProcessed: number; totalRecs: number }> {
  const pool = getPool();
  if (!pool) return { storesProcessed: 0, totalRecs: 0 };

  const storesResult = await pool.query(
    `SELECT id FROM platform.stores WHERE status = 'active' LIMIT 1000`
  );

  let total = 0;
  for (const row of storesResult.rows) {
    total += await computeStoreRecommendations(row.id);
  }
  return { storesProcessed: storesResult.rows.length, totalRecs: total };
}
