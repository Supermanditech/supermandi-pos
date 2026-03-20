/**
 * SYS-002: Stock Balance Reconciliation Service
 *
 * Compares inventory.stock_balances.current_qty (source of truth with optimistic locking)
 * against catalog.store_products.current_stock (read cache for POS).
 *
 * If diverged, corrects store_products.current_stock from stock_balances
 * and logs corrections to console for audit.
 *
 * Run as scheduled job (daily) or on-demand via admin API.
 */

import { getPool } from "../db/client.js";

export interface ReconciliationResult {
  checked: number;
  diverged: number;
  corrected: number;
  errors: string[];
}

/**
 * Find all store_products where current_stock != stock_balances.current_qty
 * and correct them.
 */
export async function reconcileStockBalances(
  storeId?: string
): Promise<ReconciliationResult> {
  const pool = getPool();
  if (!pool) {
    return { checked: 0, diverged: 0, corrected: 0, errors: ["DB_UNAVAILABLE"] };
  }

  const result: ReconciliationResult = { checked: 0, diverged: 0, corrected: 0, errors: [] };

  try {
    // Find divergences: stock_balances is source of truth
    const divergenceQuery = `
      SELECT
        sp.id AS store_product_id,
        sp.store_id,
        sp.product_id,
        sp.current_stock AS cache_stock,
        sb.current_qty AS ledger_stock,
        (sb.current_qty - sp.current_stock) AS delta
      FROM catalog.store_products sp
      INNER JOIN inventory.stock_balances sb
        ON sp.store_id = sb.store_id AND sp.product_id = sb.product_id
      WHERE sp.current_stock != sb.current_qty
        ${storeId ? "AND sp.store_id = $1" : ""}
      ORDER BY ABS(sb.current_qty - sp.current_stock) DESC
      LIMIT 1000
    `;

    const params = storeId ? [storeId] : [];
    const divergences = await pool.query(divergenceQuery, params);
    result.checked = divergences.rowCount ?? 0;
    result.diverged = divergences.rowCount ?? 0;

    if (result.diverged === 0) {
      return result;
    }

    // Correct each divergence
    for (const row of divergences.rows) {
      try {
        await pool.query(
          `UPDATE catalog.store_products
           SET current_stock = $1, updated_at = NOW()
           WHERE id = $2 AND current_stock != $1`,
          [row.ledger_stock, row.store_product_id]
        );
        result.corrected++;
        console.log(
          `[StockReconciliation] Corrected store_product ${row.store_product_id}: ` +
          `cache=${row.cache_stock} → ledger=${row.ledger_stock} (delta=${row.delta})`
        );
      } catch (err) {
        result.errors.push(`Failed to correct ${row.store_product_id}: ${String(err)}`);
      }
    }
  } catch (err) {
    result.errors.push(`Reconciliation query failed: ${String(err)}`);
  }

  console.log(
    `[StockReconciliation] Complete: checked=${result.checked}, ` +
    `diverged=${result.diverged}, corrected=${result.corrected}, errors=${result.errors.length}`
  );

  return result;
}

/**
 * Quick check — returns count of divergences without correcting.
 * Useful for monitoring/alerts.
 */
export async function checkStockDivergence(
  storeId?: string
): Promise<{ divergedCount: number; totalChecked: number }> {
  const pool = getPool();
  if (!pool) return { divergedCount: 0, totalChecked: 0 };

  const query = `
    SELECT
      COUNT(*)::int AS diverged_count,
      (SELECT COUNT(*)::int FROM catalog.store_products ${storeId ? "WHERE store_id = $1" : ""}) AS total_checked
    FROM catalog.store_products sp
    INNER JOIN inventory.stock_balances sb
      ON sp.store_id = sb.store_id AND sp.product_id = sb.product_id
    WHERE sp.current_stock != sb.current_qty
      ${storeId ? "AND sp.store_id = $1" : ""}
  `;

  const params = storeId ? [storeId] : [];
  const res = await pool.query(query, params);
  return {
    divergedCount: res.rows[0]?.diverged_count ?? 0,
    totalChecked: res.rows[0]?.total_checked ?? 0,
  };
}
