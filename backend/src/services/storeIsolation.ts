/**
 * V3-HARDEN-130: Store isolation enforcement
 *
 * Canonical store-scoping rules for all data access:
 * 1. storeId MUST come from JWT/device token, never from client input
 * 2. Every data query MUST include store_id in WHERE clause
 * 3. Store-owned data (products, sales, ledger, settings) is never cross-store visible
 * 4. Supplier/global catalog data is only exposed through procurement surfaces
 *
 * V3-FIX-131: Search context isolation
 * - SELL search: only store-owned products (catalog.store_products WHERE store_id = $1)
 * - BUY search: only verified suppliers linked to the store (supplier_store_links WHERE store_id = $1)
 * - These two result sets MUST NOT be mixed
 */

/**
 * Search context enum — enforces separation between SELL (store inventory)
 * and BUY (supplier catalog) search paths.
 */
export type SearchContext = "SELL" | "BUY";

/**
 * Assert that a storeId is present and non-empty.
 * Used at the entry point of every store-scoped operation.
 * Throws if storeId is missing — fail-closed.
 */
export function assertStoreId(storeId: string | null | undefined, operation: string): asserts storeId is string {
  if (!storeId || typeof storeId !== "string" || storeId.trim().length === 0) {
    throw new Error(`STORE_ISOLATION_VIOLATION: ${operation} requires a valid storeId from JWT, got: ${String(storeId)}`);
  }
}

/**
 * Validate that a search context is one of the allowed values.
 * Prevents accidental blending of SELL and BUY results.
 */
export function assertSearchContext(context: string): asserts context is SearchContext {
  if (context !== "SELL" && context !== "BUY") {
    throw new Error(`SEARCH_CONTEXT_VIOLATION: Expected SELL or BUY, got: ${context}`);
  }
}

/**
 * Store isolation rules — these are the canonical rules enforced across the system.
 * Every query MUST follow these rules. Breaking them is a security violation.
 */
export const STORE_ISOLATION_RULES = {
  /** storeId comes from JWT/device token only */
  SOURCE: "JWT_DERIVED",
  /** Every query includes WHERE store_id = $token.storeId */
  QUERY_SCOPE: "WHERE_STORE_ID",
  /** Store search returns only store-owned products */
  SELL_SEARCH: "catalog.store_products WHERE store_id = $1",
  /** Supplier search returns only verified suppliers linked to the store */
  BUY_SEARCH: "supplier_store_links WHERE store_id = $1 AND status = 'active'",
  /** Sales and ledger entries are always store-scoped */
  SALES_LEDGER: "WHERE store_id = $1 for all reads and writes",
  /** Settings (UPI, payment methods) are store-scoped */
  SETTINGS: "platform.stores WHERE id = $1",
} as const;

/**
 * V3-FIX-131: Search contract boundary markers.
 * Each search response MUST include a context field to prevent mixing.
 */
export const SEARCH_CONTRACTS = {
  SELL: {
    context: "SELL" as const,
    source: "catalog.store_products",
    scope: "Store-owned sellable products only",
    storeScoped: true,
  },
  BUY: {
    context: "BUY" as const,
    source: "supplier_store_links + supplier.products",
    scope: "Verified suppliers and their catalog, linked to store",
    storeScoped: true,
  },
} as const;
