// T-311: Supplier Price Comparison Service
// Compares prices across suppliers for the same products
// Helps retailers find best deals

import { getPool } from "../../db/client";

export interface PriceComparison {
  productId: string;
  productName: string;
  currentPrice: number;
  suppliers: Array<{
    supplierId: string;
    supplierName: string;
    price: number;
    moq: number;
    savings: number;
    savingsPercent: number;
  }>;
  bestPrice: number;
  maxSavings: number;
  maxSavingsPercent: number;
}

/**
 * Get price comparisons for a store's products across suppliers
 */
export async function getStorePriceComparisons(storeId: string, opts: {
  productId?: string; onlyWithSavings?: boolean; limit?: number; offset?: number;
} = {}): Promise<{ comparisons: PriceComparison[]; total: number }> {
  const pool = getPool();
  if (!pool) return { comparisons: [], total: 0 };

  const { productId, onlyWithSavings = false, limit = 50, offset = 0 } = opts;

  // Get store products with supplier pricing
  const conditions = ['sp.store_id = $1', 'sp.is_active = true'];
  const params: unknown[] = [storeId];

  if (productId) {
    conditions.push(`sp.product_id = $${params.length + 1}`);
    params.push(productId);
  }

  const result = await pool.query(
    `SELECT sp.product_id, sp.display_name, sp.sell_price AS current_price,
            sup_p.id AS supplier_product_id, sup_p.supplier_id, sup_p.name AS supplier_product_name,
            sup_p.price AS supplier_price, sup_p.moq,
            s.company_name AS supplier_name
     FROM catalog.store_products sp
     JOIN catalog.supplier_product_map spm ON spm.product_id = sp.product_id
     JOIN catalog.supplier_products sup_p ON sup_p.id = spm.supplier_product_id AND sup_p.is_active = true
     JOIN platform.suppliers s ON s.id = sup_p.supplier_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY sp.display_name, sup_p.price ASC`,
    params
  );

  // Group by product
  const productMap = new Map<string, PriceComparison>();

  for (const row of result.rows) {
    let comparison = productMap.get(row.product_id);
    if (!comparison) {
      comparison = {
        productId: row.product_id,
        productName: row.display_name,
        currentPrice: parseInt(row.current_price) || 0,
        suppliers: [],
        bestPrice: Infinity,
        maxSavings: 0,
        maxSavingsPercent: 0,
      };
      productMap.set(row.product_id, comparison);
    }

    const supplierPrice = parseInt(row.supplier_price) || 0;
    const savings = comparison.currentPrice - supplierPrice;
    const savingsPercent = comparison.currentPrice > 0
      ? Math.round((savings / comparison.currentPrice) * 10000) / 100
      : 0;

    comparison.suppliers.push({
      supplierId: row.supplier_id,
      supplierName: row.supplier_name,
      price: supplierPrice,
      moq: parseInt(row.moq) || 1,
      savings,
      savingsPercent,
    });

    if (supplierPrice < comparison.bestPrice) {
      comparison.bestPrice = supplierPrice;
      comparison.maxSavings = savings;
      comparison.maxSavingsPercent = savingsPercent;
    }
  }

  let comparisons = Array.from(productMap.values());

  if (onlyWithSavings) {
    comparisons = comparisons.filter(c => c.maxSavings > 0);
  }

  // Sort by max savings descending
  comparisons.sort((a, b) => b.maxSavings - a.maxSavings);

  const total = comparisons.length;
  comparisons = comparisons.slice(offset, offset + limit);

  return { comparisons, total };
}
