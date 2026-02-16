// T-313: Slow Mover Detection Service
// Identifies products with declining or zero sales
// Suggests markdowns or discontinuation

import { getPool } from "../../db/client";

export interface SlowMover {
  productId: string;
  productName: string;
  currentStock: number;
  sellPrice: number;
  lastSoldDate: string | null;
  daysSinceLastSale: number | null;
  salesLast30Days: number;
  salesLast60Days: number;
  trend: 'dead_stock' | 'declining' | 'stagnant';
  recommendation: string;
}

/**
 * Detect slow-moving products for a store
 */
export async function detectSlowMovers(storeId: string, opts: {
  limit?: number; offset?: number;
} = {}): Promise<{ slowMovers: SlowMover[]; total: number }> {
  const pool = getPool();
  if (!pool) return { slowMovers: [], total: 0 };

  const { limit = 50, offset = 0 } = opts;

  const result = await pool.query(
    `WITH sales_30d AS (
       SELECT si.product_id, SUM(si.quantity)::int AS qty
       FROM public.sale_items si
       JOIN public.sales s ON s.id = si.sale_id
       WHERE s.store_id = $1 AND s.status = 'completed'
         AND s.created_at >= NOW() - INTERVAL '30 days'
       GROUP BY si.product_id
     ),
     sales_60d AS (
       SELECT si.product_id, SUM(si.quantity)::int AS qty
       FROM public.sale_items si
       JOIN public.sales s ON s.id = si.sale_id
       WHERE s.store_id = $1 AND s.status = 'completed'
         AND s.created_at >= NOW() - INTERVAL '60 days'
         AND s.created_at < NOW() - INTERVAL '30 days'
       GROUP BY si.product_id
     ),
     last_sale AS (
       SELECT si.product_id, MAX(s.created_at) AS last_sold_at
       FROM public.sale_items si
       JOIN public.sales s ON s.id = si.sale_id
       WHERE s.store_id = $1 AND s.status = 'completed'
       GROUP BY si.product_id
     )
     SELECT sp.product_id, sp.display_name, sp.sell_price,
            COALESCE(sb.current_qty, sp.current_stock, 0) AS current_stock,
            ls.last_sold_at,
            COALESCE(s30.qty, 0) AS sales_last_30d,
            COALESCE(s60.qty, 0) AS sales_last_60d,
            EXTRACT(DAY FROM NOW() - ls.last_sold_at)::int AS days_since_last_sale
     FROM catalog.store_products sp
     LEFT JOIN inventory.stock_balances sb ON sb.store_id = sp.store_id AND sb.product_id = sp.product_id
     LEFT JOIN sales_30d s30 ON s30.product_id = sp.product_id
     LEFT JOIN sales_60d s60 ON s60.product_id = sp.product_id
     LEFT JOIN last_sale ls ON ls.product_id = sp.product_id
     WHERE sp.store_id = $1 AND sp.is_active = true
       AND COALESCE(sb.current_qty, sp.current_stock, 0) > 0
       AND (COALESCE(s30.qty, 0) <= 2 OR (COALESCE(s30.qty, 0) < COALESCE(s60.qty, 0) * 0.5))
     ORDER BY COALESCE(s30.qty, 0) ASC, current_stock DESC`,
    [storeId]
  );

  const slowMovers: SlowMover[] = result.rows.map((row: any) => {
    const sales30 = parseInt(row.sales_last_30d);
    const sales60 = parseInt(row.sales_last_60d);
    const daysSinceLastSale = row.days_since_last_sale != null ? parseInt(row.days_since_last_sale) : null;

    let trend: SlowMover['trend'];
    let recommendation: string;

    if (sales30 === 0 && (daysSinceLastSale == null || daysSinceLastSale > 60)) {
      trend = 'dead_stock';
      recommendation = 'Consider discontinuing or deep discount clearance.';
    } else if (sales30 < sales60 * 0.5) {
      trend = 'declining';
      recommendation = 'Sales declining. Consider promotional pricing or bundle offer.';
    } else {
      trend = 'stagnant';
      recommendation = 'Low movement. Review shelf placement and visibility.';
    }

    return {
      productId: row.product_id,
      productName: row.display_name,
      currentStock: parseInt(row.current_stock),
      sellPrice: parseInt(row.sell_price) || 0,
      lastSoldDate: row.last_sold_at ? new Date(row.last_sold_at).toISOString().split('T')[0] : null,
      daysSinceLastSale,
      salesLast30Days: sales30,
      salesLast60Days: sales60,
      trend,
      recommendation,
    };
  });

  return { slowMovers: slowMovers.slice(offset, offset + limit), total: slowMovers.length };
}
