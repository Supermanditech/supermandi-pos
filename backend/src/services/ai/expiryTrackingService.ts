// T-314: Expiry Tracking & Alerts Service
// Tracks products approaching expiry and generates alerts
// Uses expiry_date column added to catalog.store_products

import { getPool } from "../../db/client";

export interface ExpiryItem {
  productId: string;
  productName: string;
  expiryDate: string;
  daysUntilExpiry: number;
  currentStock: number;
  sellPrice: number;
  urgency: 'expired' | 'critical' | 'warning' | 'upcoming';
  suggestedAction: string;
}

/**
 * Get products approaching expiry for a store
 */
export async function getExpiringProducts(storeId: string, opts: {
  daysAhead?: number; includeExpired?: boolean; limit?: number; offset?: number;
} = {}): Promise<{ items: ExpiryItem[]; total: number }> {
  const pool = getPool();
  if (!pool) return { items: [], total: 0 };

  const { daysAhead = 30, includeExpired = true, limit = 50, offset = 0 } = opts;

  const conditions = [
    'sp.store_id = $1',
    'sp.is_active = true',
    'sp.expiry_date IS NOT NULL',
    `sp.expiry_date <= CURRENT_DATE + INTERVAL '${daysAhead} days'`,
    'COALESCE(sb.current_qty, sp.current_stock, 0) > 0',
  ];

  if (!includeExpired) {
    conditions.push('sp.expiry_date >= CURRENT_DATE');
  }

  const result = await pool.query(
    `SELECT sp.product_id, sp.display_name, sp.expiry_date, sp.sell_price,
            COALESCE(sb.current_qty, sp.current_stock, 0) AS current_stock,
            (sp.expiry_date - CURRENT_DATE) AS days_until_expiry
     FROM catalog.store_products sp
     LEFT JOIN inventory.stock_balances sb ON sb.store_id = sp.store_id AND sb.product_id = sp.product_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY sp.expiry_date ASC`,
    [storeId]
  );

  const items: ExpiryItem[] = result.rows.map((row: any) => {
    const days = parseInt(row.days_until_expiry);
    let urgency: ExpiryItem['urgency'];
    let suggestedAction: string;

    if (days < 0) {
      urgency = 'expired';
      suggestedAction = 'Remove from shelf immediately. Consider returning to supplier.';
    } else if (days <= 7) {
      urgency = 'critical';
      suggestedAction = 'Apply clearance discount (50%+ off) or donate.';
    } else if (days <= 15) {
      urgency = 'warning';
      suggestedAction = 'Apply promotional discount (20-30% off) to accelerate sales.';
    } else {
      urgency = 'upcoming';
      suggestedAction = 'Monitor and plan promotion if sales are slow.';
    }

    return {
      productId: row.product_id,
      productName: row.display_name,
      expiryDate: row.expiry_date,
      daysUntilExpiry: days,
      currentStock: parseInt(row.current_stock),
      sellPrice: parseInt(row.sell_price) || 0,
      urgency,
      suggestedAction,
    };
  });

  return { items: items.slice(offset, offset + limit), total: items.length };
}

/**
 * Update expiry date for a product
 */
export async function updateProductExpiry(storeId: string, productId: string, expiryDate: string | null): Promise<boolean> {
  const pool = getPool();
  if (!pool) return false;

  const result = await pool.query(
    `UPDATE catalog.store_products SET expiry_date = $3 WHERE store_id = $1 AND product_id = $2`,
    [storeId, productId, expiryDate]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Bulk update expiry dates (from barcode scan or CSV import)
 */
export async function bulkUpdateExpiry(storeId: string, items: Array<{
  productId: string; expiryDate: string;
}>): Promise<number> {
  const pool = getPool();
  if (!pool) return 0;

  let updated = 0;
  for (const item of items) {
    const result = await pool.query(
      `UPDATE catalog.store_products SET expiry_date = $3 WHERE store_id = $1 AND product_id = $2`,
      [storeId, item.productId, item.expiryDate]
    );
    if ((result.rowCount ?? 0) > 0) updated++;
  }
  return updated;
}
