// T-308: Demand Forecasting Service
// Uses weighted moving average on sales history to predict future demand
// Runs as scheduled job, stores results for smart reorder (T-309)

import { getPool } from "../../db/client";

export interface DemandForecast {
  productId: string;
  productName: string;
  forecastDate: string;
  predictedQty: number;
  confidence: number;
  method: string;
  currentStock: number;
  daysUntilStockout: number | null;
}

/**
 * Compute demand forecasts for all active products in a store
 * Uses 30-day weighted moving average (recent days weighted more heavily)
 */
export async function computeStoreForecast(storeId: string, forecastDays: number = 7): Promise<number> {
  const pool = getPool();
  if (!pool) return 0;

  // Get daily sales per product for last 90 days
  const salesResult = await pool.query(
    `SELECT si.product_id, DATE(s.created_at) AS sale_date, SUM(si.quantity) AS daily_qty
     FROM public.sale_items si
     JOIN public.sales s ON s.id = si.sale_id
     WHERE s.store_id = $1 AND s.status = 'completed'
       AND s.created_at >= NOW() - INTERVAL '90 days'
     GROUP BY si.product_id, DATE(s.created_at)
     ORDER BY si.product_id, sale_date`,
    [storeId]
  );

  // Group by product
  const productSales = new Map<string, Array<{ date: string; qty: number }>>();
  for (const row of salesResult.rows) {
    const list = productSales.get(row.product_id) || [];
    list.push({ date: row.sale_date, qty: parseInt(row.daily_qty) });
    productSales.set(row.product_id, list);
  }

  let forecastCount = 0;

  for (const [productId, dailySales] of productSales.entries()) {
    if (dailySales.length < 7) continue; // Need at least 7 days of data

    // Weighted moving average: last 7 days get 3x, 8-30 days get 2x, 31-90 days get 1x
    let weightedSum = 0;
    let totalWeight = 0;
    const now = Date.now();

    for (const sale of dailySales) {
      const daysAgo = Math.floor((now - new Date(sale.date).getTime()) / (86400000));
      const weight = daysAgo <= 7 ? 3 : daysAgo <= 30 ? 2 : 1;
      weightedSum += sale.qty * weight;
      totalWeight += weight;
    }

    const avgDailyDemand = totalWeight > 0 ? weightedSum / totalWeight : 0;
    if (avgDailyDemand < 0.1) continue; // Skip negligible demand

    // Confidence based on data points and consistency
    const dataPoints = dailySales.length;
    const confidence = Math.min(0.95, 0.3 + (dataPoints / 90) * 0.5 + (dataPoints > 30 ? 0.15 : 0));

    // Generate forecasts for next N days
    for (let d = 1; d <= forecastDays; d++) {
      const forecastDate = new Date(now + d * 86400000).toISOString().split('T')[0];
      const predictedQty = Math.max(1, Math.round(avgDailyDemand));

      await pool.query(
        `INSERT INTO ai.demand_forecasts (store_id, product_id, forecast_date, predicted_qty, confidence, method)
         VALUES ($1, $2, $3, $4, $5, 'weighted_avg')
         ON CONFLICT (store_id, product_id, forecast_date)
         DO UPDATE SET predicted_qty = $4, confidence = $5, computed_at = NOW()`,
        [storeId, productId, forecastDate, predictedQty, confidence]
      );
      forecastCount++;
    }
  }

  return forecastCount;
}

/**
 * Compute forecasts for ALL active stores (scheduled job)
 */
export async function computeAllForecasts(): Promise<{ storesProcessed: number; totalForecasts: number }> {
  const pool = getPool();
  if (!pool) return { storesProcessed: 0, totalForecasts: 0 };

  const storesResult = await pool.query(
    `SELECT id FROM platform.stores WHERE status = 'active' LIMIT 1000`
  );

  let totalForecasts = 0;
  for (const row of storesResult.rows) {
    totalForecasts += await computeStoreForecast(row.id);
  }
  return { storesProcessed: storesResult.rows.length, totalForecasts };
}

/**
 * Get forecasts for a store's products (for display)
 */
export async function getStoreForecasts(storeId: string, opts: {
  productId?: string; days?: number; limit?: number;
} = {}): Promise<DemandForecast[]> {
  const pool = getPool();
  if (!pool) return [];

  const { productId, days = 7, limit = 50 } = opts;
  const safeDays = Math.max(1, Math.min(30, Math.floor(days)));
  const conditions = ['df.store_id = $1', 'df.forecast_date > CURRENT_DATE', `df.forecast_date <= CURRENT_DATE + ($2 || ' days')::interval`];
  const params: unknown[] = [storeId, String(safeDays)];

  if (productId) {
    conditions.push(`df.product_id = $${params.length + 1}`);
    params.push(productId);
  }

  const result = await pool.query(
    `SELECT df.product_id AS "productId", sp.display_name AS "productName",
            df.forecast_date AS "forecastDate", df.predicted_qty AS "predictedQty",
            df.confidence, df.method,
            COALESCE(sb.current_qty, sp.current_stock, 0) AS "currentStock",
            CASE WHEN df.predicted_qty > 0
              THEN FLOOR(COALESCE(sb.current_qty, sp.current_stock, 0)::numeric / df.predicted_qty)
              ELSE NULL
            END AS "daysUntilStockout"
     FROM ai.demand_forecasts df
     JOIN catalog.store_products sp ON sp.product_id = df.product_id AND sp.store_id = df.store_id
     LEFT JOIN inventory.stock_balances sb ON sb.store_id = df.store_id AND sb.product_id = df.product_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY df.forecast_date ASC, df.predicted_qty DESC
     LIMIT $${params.length + 1}`,
    [...params, limit]
  );

  return result.rows;
}
