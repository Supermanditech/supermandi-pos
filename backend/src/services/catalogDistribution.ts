/**
 * V3-HARDEN-151: Canonical catalog publication/distribution contract
 *
 * Scaling model:
 * - Up to 1,000 suppliers, each with up to 5,000 SKUs
 * - Aggregate: 1M+ SKU visibility across the platform
 * - Per-store: up to 10,000 published SKUs visible in BUY catalogue
 *
 * Distribution model:
 * - Supplier submits SKUs → SuperAdmin approves → published to target stores
 * - Retailer BUY catalogue is store-scoped (NOT a global mega-catalog)
 * - Each retailer sees only: published SKUs from suppliers linked to their store
 * - Publication is targetable: all_stores, region, specific_stores
 *
 * Query contract (no full-table scans):
 * - Store catalog: catalog.supplier_products JOIN supplier_store_links WHERE store_id = $1
 * - Supplier listing: catalog.supplier_products WHERE supplier_id = $1
 * - Admin review: catalog.supplier_products WHERE approval_status = $1 (indexed)
 * - Search: pg_trgm + ILIKE on indexed columns with LIMIT
 *
 * Pagination contract:
 * - All list endpoints MUST use LIMIT/OFFSET or cursor pagination
 * - Default page size: 50, max: 200
 * - No endpoint may return > 200 rows in a single response
 * - Client-side lists MUST use virtualized rendering (FlatList with windowSize)
 */

export const CATALOG_SCALE_LIMITS = {
  /** Maximum SKUs per supplier */
  MAX_SKUS_PER_SUPPLIER: 5_000,
  /** Maximum published SKUs visible per store in BUY catalogue */
  MAX_PUBLISHED_SKUS_PER_STORE: 10_000,
  /** Maximum suppliers on the platform */
  MAX_SUPPLIERS: 1_000,
  /** Maximum aggregate SKU visibility */
  MAX_AGGREGATE_SKUS: 1_000_000,
  /** Maximum store products (retailer's own digitized inventory) */
  MAX_STORE_PRODUCTS: 10_000,
} as const;

export const PAGINATION_CONTRACT = {
  /** Default page size for list endpoints */
  DEFAULT_PAGE_SIZE: 50,
  /** Maximum page size allowed */
  MAX_PAGE_SIZE: 200,
  /** Client-side FlatList windowSize for POS */
  POS_FLATLIST_WINDOW_SIZE: 5,
  /** Client-side maxToRenderPerBatch for POS */
  POS_MAX_RENDER_BATCH: 15,
  /** Client-side initialNumToRender for POS */
  POS_INITIAL_RENDER: 12,
} as const;

/**
 * Validate that a page size is within the allowed range.
 */
export function clampPageSize(requested: number): number {
  return Math.min(
    Math.max(1, Math.round(requested)),
    PAGINATION_CONTRACT.MAX_PAGE_SIZE
  );
}

/**
 * Publication target types for supplier-catalog distribution.
 */
export type PublicationTarget = "all_stores" | "region" | "specific_stores";

/**
 * Store-scoped catalog query contract.
 * Every BUY/catalog query MUST go through this contract.
 */
export const CATALOG_QUERY_CONTRACT = {
  /** BUY catalog: only published SKUs from linked suppliers */
  BUY_CATALOG: `
    catalog.supplier_products sp
    JOIN supplier.suppliers s ON s.id = sp.supplier_id
    JOIN supplier.supplier_store_links ssl ON ssl.supplier_id = s.id
    WHERE ssl.store_id = $1 AND ssl.status = 'active'
      AND sp.approval_status = 'approved' AND sp.is_active = true
      AND s.verification_status = 'verified'
  `,
  /** Store products: only this store's digitized inventory */
  STORE_PRODUCTS: `
    catalog.store_products sp
    WHERE sp.store_id = $1 AND sp.is_active = true
  `,
  /** Supplier SKUs: only this supplier's catalog */
  SUPPLIER_SKUS: `
    catalog.supplier_products sp
    WHERE sp.supplier_id = $1 AND sp.is_active = true
  `,
  /** Admin review queue: filterable by approval status */
  ADMIN_REVIEW: `
    catalog.supplier_products sp
    WHERE sp.approval_status = $1
  `,
} as const;

/**
 * Cache invalidation rules for catalog data.
 */
export const CACHE_RULES = {
  /** Store catalog page 1 cache TTL (seconds) */
  STORE_CATALOG_PAGE1_TTL: 300,
  /** Store product list cache TTL (seconds) */
  STORE_PRODUCT_LIST_TTL: 60,
  /** Supplier product list cache TTL (seconds) */
  SUPPLIER_PRODUCT_LIST_TTL: 120,
  /** Search result cache TTL (seconds) */
  SEARCH_RESULT_TTL: 30,
  /** Invalidation triggers */
  INVALIDATE_ON: [
    "product_created",
    "product_updated",
    "product_approved",
    "product_published",
    "stock_changed",
    "supplier_link_changed",
  ] as const,
} as const;
