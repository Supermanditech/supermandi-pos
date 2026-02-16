// T-309: Smart Reorder Suggestions
// Uses demand forecasts (T-308) + current stock + lead times to auto-create pending reorders
// Runs as scheduled job

import { getPool } from "../../db/client";

export interface SmartReorderSuggestion {
  productId: string;
  productName: string;
  currentStock: number;
  predictedDailyDemand: number;
  leadDays: number;
  suggestedQty: number;
  suggestedSupplierId: string | null;
  suggestedPrice: number | null;
  urgency: 'critical' | 'high' | 'normal';
  reason: string;
}

/**
 * Generate smart reorder suggestions for a store
 * Creates pending_reorders based on forecasted demand and stock levels
 */
export async function generateSmartReorders(storeId: string): Promise<number> {
  const pool = getPool();
  if (!pool) return 0;

  // Get store reorder settings
  const settingsResult = await pool.query(
    `SELECT default_lead_days, require_approval, auto_approve_threshold
     FROM reorder.store_reorder_settings WHERE store_id = $1`,
    [storeId]
  );
  const leadDays = settingsResult.rows[0]?.default_lead_days ?? 3;

  // Get products with forecasts and current stock
  const result = await pool.query(
    `WITH avg_forecast AS (
       SELECT product_id, AVG(predicted_qty) AS avg_daily_demand
       FROM ai.demand_forecasts
       WHERE store_id = $1 AND forecast_date > CURRENT_DATE AND forecast_date <= CURRENT_DATE + INTERVAL '7 days'
       GROUP BY product_id
     ),
     product_info AS (
       SELECT sp.product_id, sp.display_name,
              COALESCE(sb.current_qty, sp.current_stock, 0) AS current_stock,
              rp.min_stock, rp.target_stock, rp.preferred_supplier_id, rp.is_enabled
       FROM catalog.store_products sp
       LEFT JOIN inventory.stock_balances sb ON sb.store_id = sp.store_id AND sb.product_id = sp.product_id
       LEFT JOIN reorder.reorder_policies rp ON rp.store_id = sp.store_id AND rp.product_id = sp.product_id
       WHERE sp.store_id = $1 AND sp.is_active = true
     )
     SELECT pi.product_id, pi.display_name, pi.current_stock,
            COALESCE(af.avg_daily_demand, 0) AS avg_daily_demand,
            COALESCE(pi.min_stock, 5) AS min_stock,
            COALESCE(pi.target_stock, 20) AS target_stock,
            pi.preferred_supplier_id, pi.is_enabled
     FROM product_info pi
     LEFT JOIN avg_forecast af ON af.product_id = pi.product_id
     WHERE (pi.is_enabled IS NULL OR pi.is_enabled = true)
       AND pi.current_stock < COALESCE(pi.min_stock, 5) + (COALESCE(af.avg_daily_demand, 1) * $2)
     ORDER BY pi.current_stock ASC`,
    [storeId, leadDays]
  );

  let created = 0;

  for (const row of result.rows) {
    const dailyDemand = parseFloat(row.avg_daily_demand) || 1;
    const currentStock = parseInt(row.current_stock);
    const targetStock = parseInt(row.target_stock);

    // Calculate suggested quantity: enough for target_stock + lead_days buffer
    const suggestedQty = Math.max(1, Math.ceil(targetStock - currentStock + dailyDemand * leadDays));

    // Check for existing pending reorder
    const existing = await pool.query(
      `SELECT id FROM reorder.pending_reorders
       WHERE store_id = $1 AND product_id = $2 AND status = 'pending'
       LIMIT 1`,
      [storeId, row.product_id]
    );
    if (existing.rows.length > 0) continue;

    // Find best supplier price
    const supplierResult = await pool.query(
      `SELECT spm.supplier_product_id, sp.supplier_id, sp.price
       FROM catalog.supplier_product_map spm
       JOIN catalog.supplier_products sp ON sp.id = spm.supplier_product_id
       WHERE spm.product_id = $1 AND sp.is_active = true
       ORDER BY sp.price ASC LIMIT 1`,
      [row.product_id]
    );

    const supplierId = row.preferred_supplier_id || supplierResult.rows[0]?.supplier_id || null;
    const unitPrice = supplierResult.rows[0]?.price || null;

    await pool.query(
      `INSERT INTO reorder.pending_reorders
       (store_id, product_id, current_stock, min_threshold, target_stock,
        suggested_quantity, suggested_supplier_id, suggested_unit_price, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')`,
      [storeId, row.product_id, currentStock, parseInt(row.min_stock),
       targetStock, suggestedQty, supplierId, unitPrice]
    );
    created++;
  }

  return created;
}

/**
 * Generate smart reorders for ALL active stores (scheduled job)
 */
export async function generateAllSmartReorders(): Promise<{ storesProcessed: number; totalSuggestions: number }> {
  const pool = getPool();
  if (!pool) return { storesProcessed: 0, totalSuggestions: 0 };

  const storesResult = await pool.query(
    `SELECT s.id FROM platform.stores s
     JOIN reorder.store_reorder_settings srs ON srs.store_id = s.id AND srs.reorder_enabled = true
     WHERE s.status = 'active' LIMIT 1000`
  );

  let totalSuggestions = 0;
  for (const row of storesResult.rows) {
    totalSuggestions += await generateSmartReorders(row.id);
  }
  return { storesProcessed: storesResult.rows.length, totalSuggestions };
}
