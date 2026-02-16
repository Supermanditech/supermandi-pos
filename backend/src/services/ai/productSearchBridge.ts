// T-306: Product Search Bridge
// Wires the voiceOrderService.registerProductSearch() to actual catalog queries
// This bridges the disconnected product search in voice processing

import { getPool } from "../../db/client";
import { registerProductSearch, type ProductCandidate } from "./voiceOrderService";

/**
 * Search products by name/query for a store using pg_trgm similarity
 */
async function searchStoreProducts(query: string, storeId: string): Promise<ProductCandidate[]> {
  const pool = getPool();
  if (!pool) return [];

  try {
    const result = await pool.query(
      `SELECT sp.product_id AS id, sp.display_name AS name,
              p.primary_barcode AS barcode, sp.sell_price AS price,
              COALESCE(sb.current_qty, sp.current_stock, 0) AS stock,
              similarity(LOWER(sp.display_name), LOWER($2)) AS sim_score
       FROM catalog.store_products sp
       LEFT JOIN catalog.products p ON p.id = sp.product_id
       LEFT JOIN inventory.stock_balances sb ON sb.store_id = sp.store_id AND sb.product_id = sp.product_id
       WHERE sp.store_id = $1 AND sp.is_active = true
         AND (
           LOWER(sp.display_name) LIKE '%' || LOWER($2) || '%'
           OR similarity(LOWER(sp.display_name), LOWER($2)) > 0.3
         )
       ORDER BY sim_score DESC, sp.display_name ASC
       LIMIT 5`,
      [storeId, query]
    );

    return result.rows.map((row: any) => ({
      productId: row.id,
      name: row.name,
      barcode: row.barcode || undefined,
      price: parseInt(row.price) || undefined,
      stock: parseInt(row.stock),
      matchScore: parseFloat(row.sim_score) || 0.5,
    }));
  } catch (error) {
    console.error("[ProductSearchBridge] Search failed:", error);
    return [];
  }
}

/**
 * Initialize the product search bridge
 * Call this once during server startup
 */
export function initProductSearchBridge(): void {
  registerProductSearch(searchStoreProducts);
  console.log("[ProductSearchBridge] Product search registered for voice orders");
}
