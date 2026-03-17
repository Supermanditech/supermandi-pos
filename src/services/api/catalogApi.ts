// Catalog API Service - V3.0.9 compliant
// Frontend API client for store catalog operations

import { apiClient } from "./apiClient";

// =============================================================================
// TYPES
// =============================================================================

export interface CatalogSupplier {
  supplierId: string;
  supplierName: string;
  supplierProductId: string;
  purchasePrice: number;
  mrp?: number;
  moq: number;
  maxQty?: number;
  stockQuantity: number;
  stockStatus: string;
  isPreferred: boolean;
  bnplEligible?: boolean;
  bnplMaxDays?: number;
  minOrderValue?: number; // POS-BUY-003: from supplier_store_links.min_order_value (minor units)
}

/**
 * TR-PEND-006: Added displayNameHi/brandHi for Hindi localization
 * SCALE-B2: Added netContentValue, netContentUnit, packSize, gstRate, hsnCode,
 *           imageUrl, supplierName, supplierCity, bnplEligible for buy tile design
 */
export interface CatalogProduct {
  id: string;
  name: string;
  displayNameHi?: string;
  description?: string;
  brand?: string;
  brandHi?: string;
  category?: string;
  unit?: string;
  packSize?: number | null;
  primaryBarcode?: string;
  hsnCode?: string | null;
  defaultGstRate?: number;
  /** SCALE-B2: GST rate from buy-catalog response (e.g. 18 = 18%) */
  gstRate?: number | null;
  /** SCALE-B2: Product image URL from catalog.products */
  imageUrl?: string | null;
  /** SCALE-B2: Net content value for pack config display (e.g. 70 for "70g") */
  netContentValue?: number | null;
  /** SCALE-B2: Net content unit for pack config display (e.g. "g") */
  netContentUnit?: string | null;
  /** SCALE-B2: Best/preferred supplier name for tile display */
  supplierName?: string | null;
  /** SCALE-B2: Best/preferred supplier city for tile display */
  supplierCity?: string | null;
  /** SCALE-B2: Whether best/preferred supplier offers BNPL */
  bnplEligible?: boolean;
  isActive: boolean;
  bestPrice: number;
  minMoq: number;
  supplierCount: number;
  stockStatus: "in_stock" | "low_stock" | "out_of_stock";
  suppliers: CatalogSupplier[];
}

export interface CatalogPagination {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

export interface CatalogFilters {
  search: string | null;
  category: string | null;
  inStockOnly: boolean;
}

export interface GetCatalogParams {
  q?: string;
  category?: string;
  inStockOnly?: boolean;
  // STG-346: Stock status filter for server-side pagination
  stockStatus?: "in_stock" | "low_stock" | "out_of_stock";
  // STG-343: Barcode lookup
  barcode?: string;
  page?: number;
  limit?: number;
}

export interface GetCatalogResponse {
  success: boolean;
  data: CatalogProduct[];
  pagination: CatalogPagination;
  filters: CatalogFilters;
}

export interface GetProductResponse {
  success: boolean;
  data: CatalogProduct;
}

export interface GetCategoriesResponse {
  success: boolean;
  data: string[];
  count: number;
}

// =============================================================================
// CAT-003: FMCG Taxonomy Types
// =============================================================================

export interface FmcgCategory {
  id: string;
  labelEn: string;
  labelHi: string | null;
  iconKey: string;
  sortOrder: number;
  productCount: number;
}

export interface GetFmcgCategoriesResponse {
  success: boolean;
  data: FmcgCategory[];
  count: number;
}

export interface CategoryProduct {
  id: string;
  productId: string;
  displayName: string;
  sellPrice: number;
  mrp: number;
  currentStock: number;
  taxonomyId: string | null;
  brand: string | null;
  barcode: string | null;
}

export interface GetCategoryProductsParams {
  limit?: number;
  cursor?: string;
  includeZeroStock?: boolean;
}

export interface GetCategoryProductsResponse {
  success: boolean;
  data: CategoryProduct[];
  pagination: {
    limit: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
  context: string;
}

// =============================================================================
// STG-435: In-memory cache for supplier data to avoid redundant API calls
// when switching between reorder items
// =============================================================================

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const SUPPLIER_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const SUPPLIER_CACHE_MAX_ENTRIES = 50;
const supplierCache = new Map<string, CacheEntry<CatalogSupplier[]>>();

function getSupplierCacheKey(storeId: string, productId: string): string {
  return `${storeId}:${productId}`;
}

function cleanupSupplierCache(): void {
  if (supplierCache.size <= SUPPLIER_CACHE_MAX_ENTRIES) return;
  const now = Date.now();
  // Remove expired entries first
  for (const [key, entry] of supplierCache.entries()) {
    if (now - entry.timestamp > SUPPLIER_CACHE_TTL_MS) {
      supplierCache.delete(key);
    }
  }
  // If still over limit, remove oldest
  if (supplierCache.size > SUPPLIER_CACHE_MAX_ENTRIES) {
    const sorted = [...supplierCache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toRemove = sorted.slice(0, supplierCache.size - SUPPLIER_CACHE_MAX_ENTRIES);
    for (const [key] of toRemove) {
      supplierCache.delete(key);
    }
  }
}

/** STG-435: Invalidate all cached supplier data (e.g., after policy changes) */
export function invalidateSupplierCache(storeId?: string, productId?: string): void {
  if (storeId && productId) {
    supplierCache.delete(getSupplierCacheKey(storeId, productId));
  } else if (storeId) {
    for (const key of supplierCache.keys()) {
      if (key.startsWith(`${storeId}:`)) {
        supplierCache.delete(key);
      }
    }
  } else {
    supplierCache.clear();
  }
}

// =============================================================================
// API FUNCTIONS
// =============================================================================

const CATALOG_BASE = "/api/v1/catalog";

/**
 * Get paginated catalog for a store.
 * Returns products mapped via supplier_product_map from linked suppliers.
 */
export async function getCatalog(
  storeId: string,
  params?: GetCatalogParams
): Promise<GetCatalogResponse> {
  const query = new URLSearchParams();

  if (params?.q && params.q.trim().length >= 2) {
    query.set("q", params.q.trim());
  }
  if (params?.category) {
    query.set("category", params.category);
  }
  if (params?.inStockOnly) {
    query.set("inStockOnly", "true");
  }
  if (params?.page && params.page > 0) {
    query.set("page", String(params.page));
  }
  if (params?.limit && params.limit > 0) {
    query.set("limit", String(params.limit));
  }

  const queryString = query.toString();
  const path = `${CATALOG_BASE}/stores/${storeId}/catalog${queryString ? `?${queryString}` : ""}`;

  return apiClient.get<GetCatalogResponse>(path);
}

/**
 * Search catalog products.
 * Convenience wrapper around getCatalog with search query.
 */
export async function searchCatalog(
  storeId: string,
  searchQuery: string,
  options?: {
    category?: string;
    inStockOnly?: boolean;
    page?: number;
    limit?: number;
  }
): Promise<GetCatalogResponse> {
  return getCatalog(storeId, {
    q: searchQuery,
    category: options?.category,
    inStockOnly: options?.inStockOnly,
    page: options?.page,
    limit: options?.limit,
  });
}

/**
 * Get a single product with all supplier details.
 */
export async function getProduct(
  storeId: string,
  productId: string
): Promise<CatalogProduct> {
  const path = `${CATALOG_BASE}/stores/${storeId}/catalog/${productId}`;
  const response = await apiClient.get<GetProductResponse>(path);
  return response.data;
}

/**
 * Get all suppliers for a product.
 * STG-435: Uses in-memory cache to avoid redundant API calls when
 * switching between reorder items.
 */
export async function getProductSuppliers(
  storeId: string,
  productId: string,
  options?: { skipCache?: boolean }
): Promise<CatalogSupplier[]> {
  const cacheKey = getSupplierCacheKey(storeId, productId);

  // Check cache first (unless explicitly skipped)
  if (!options?.skipCache) {
    const cached = supplierCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < SUPPLIER_CACHE_TTL_MS) {
      return cached.data;
    }
  }

  const product = await getProduct(storeId, productId);
  const suppliers = product.suppliers;

  // Store in cache
  cleanupSupplierCache();
  supplierCache.set(cacheKey, { data: suppliers, timestamp: Date.now() });

  return suppliers;
}

/**
 * Get all categories available in the store's catalog.
 * @deprecated Use getFmcgCategories for taxonomy-based categories
 */
export async function getCategories(storeId: string): Promise<string[]> {
  const path = `${CATALOG_BASE}/stores/${storeId}/catalog/categories`;
  const response = await apiClient.get<GetCategoriesResponse>(path);
  return response.data;
}

// =============================================================================
// SUP-POS-002: BUY CATALOG (Supplier Products for Purchase)
// =============================================================================

/**
 * Get paginated buy catalog for a store.
 * Returns supplier products grouped by master product with supplier offers.
 * Uses /buy-catalog endpoint (approved products from linked/verified suppliers).
 */
export async function getBuyCatalog(
  storeId: string,
  params?: GetCatalogParams
): Promise<GetCatalogResponse> {
  const query = new URLSearchParams();

  if (params?.q && params.q.trim().length >= 2) {
    query.set("q", params.q.trim());
  }
  if (params?.category) {
    query.set("category", params.category);
  }
  // STG-346: Pass stock status filter to server for correct pagination
  if (params?.stockStatus) {
    query.set("stockStatus", params.stockStatus);
  }
  // STG-343: Barcode lookup parameter
  if (params?.barcode) {
    query.set("barcode", params.barcode);
  }
  if (params?.page && params.page > 0) {
    query.set("page", String(params.page));
  }
  if (params?.limit && params.limit > 0) {
    query.set("limit", String(params.limit));
  }

  const queryString = query.toString();
  const path = `${CATALOG_BASE}/stores/${storeId}/buy-catalog${queryString ? `?${queryString}` : ""}`;

  return apiClient.get<GetCatalogResponse>(path);
}

/**
 * Get categories available in the buy catalog.
 * Returns distinct categories from approved supplier products.
 */
export async function getBuyCatalogCategories(storeId: string): Promise<string[]> {
  const path = `${CATALOG_BASE}/stores/${storeId}/buy-catalog/categories`;
  const response = await apiClient.get<GetCategoriesResponse>(path);
  return response.data;
}

/**
 * SUP-POS-004: Cross-supplier barcode lookup in buy catalog.
 * Returns a single grouped product with all supplier offers, or null if not found.
 */
export async function buyBarcodeSearch(
  storeId: string,
  barcode: string
): Promise<CatalogProduct | null> {
  const path = `${CATALOG_BASE}/stores/${storeId}/buy-catalog/barcode/${encodeURIComponent(barcode)}`;
  const response = await apiClient.get<{ success: boolean; data: CatalogProduct | null }>(path);
  return response.data;
}

// =============================================================================
// CAT-003: FMCG Taxonomy Category Endpoints
// =============================================================================

/**
 * Get FMCG taxonomy categories that have products in this store.
 * Returns categories with product counts, sorted by sort_order.
 */
export async function getFmcgCategories(storeId: string): Promise<FmcgCategory[]> {
  const path = `${CATALOG_BASE}/stores/${storeId}/categories`;
  const response = await apiClient.get<GetFmcgCategoriesResponse>(path);
  return response.data;
}

/**
 * Get products in a specific FMCG category for this store.
 * Supports cursor-based pagination.
 * Use taxonomyId = "all" or the Sab category ID for all products.
 */
export async function getCategoryProducts(
  storeId: string,
  taxonomyId: string,
  params?: GetCategoryProductsParams
): Promise<GetCategoryProductsResponse> {
  const query = new URLSearchParams();

  if (params?.limit && params.limit > 0) {
    query.set("limit", String(params.limit));
  }
  if (params?.cursor) {
    query.set("cursor", params.cursor);
  }
  if (params?.includeZeroStock === false) {
    query.set("includeZeroStock", "false");
  }

  const queryString = query.toString();
  const path = `${CATALOG_BASE}/stores/${storeId}/categories/${taxonomyId}/products${queryString ? `?${queryString}` : ""}`;

  return apiClient.get<GetCategoryProductsResponse>(path);
}

// =============================================================================
// HELPER TYPES FOR FRONTEND USE
// =============================================================================

export type StockStatus = CatalogProduct["stockStatus"];

export function getStockStatusLabel(status: StockStatus): string {
  switch (status) {
    case "in_stock":
      return "In Stock";
    case "low_stock":
      return "Low Stock";
    case "out_of_stock":
      return "Out of Stock";
    default:
      return "Unknown";
  }
}

export function getStockStatusColor(status: StockStatus): string {
  switch (status) {
    case "in_stock":
      return "#22c55e"; // green
    case "low_stock":
      return "#f59e0b"; // amber
    case "out_of_stock":
      return "#ef4444"; // red
    default:
      return "#6b7280"; // gray
  }
}

/**
 * Find the best supplier (lowest price) from a product's suppliers.
 */
export function getBestSupplier(product: CatalogProduct): CatalogSupplier | null {
  if (product.suppliers.length === 0) return null;

  // Prefer in-stock suppliers with lowest price
  const inStockSuppliers = product.suppliers.filter(
    (s) => s.stockStatus !== "out_of_stock"
  );

  if (inStockSuppliers.length > 0) {
    return inStockSuppliers.reduce((best, curr) =>
      curr.purchasePrice < best.purchasePrice ? curr : best
    );
  }

  // Fallback to any supplier with lowest price
  return product.suppliers.reduce((best, curr) =>
    curr.purchasePrice < best.purchasePrice ? curr : best
  );
}

/**
 * Find the preferred supplier if set, otherwise return best supplier.
 */
export function getPreferredOrBestSupplier(
  product: CatalogProduct
): CatalogSupplier | null {
  const preferred = product.suppliers.find((s) => s.isPreferred);
  if (preferred) return preferred;
  return getBestSupplier(product);
}

// =============================================================================
// TR-PEND-006: Localized Display Names
// =============================================================================

import i18n from "../../i18n";

/**
 * Get localized product name.
 * Returns Hindi name when locale=hi and available, otherwise English.
 */
export function getLocalizedProductName(product: CatalogProduct): string {
  if (i18n.language === "hi" && product.displayNameHi) {
    return product.displayNameHi;
  }
  return product.name;
}

/**
 * Get localized brand name.
 * Returns Hindi brand when locale=hi and available, otherwise English.
 */
export function getLocalizedProductBrand(product: CatalogProduct): string | undefined {
  if (i18n.language === "hi" && product.brandHi) {
    return product.brandHi;
  }
  return product.brand;
}

// V3-FIX-052: Dedicated SELL category-group contract
// Returns the exact V3 display groups instead of raw FMCG taxonomy
export type SellCategoryGroup = {
  id: string;
  label: string;
  count?: number;
};

const V3_SELL_GROUPS: SellCategoryGroup[] = [
  { id: "frequent", label: "Frequent" },
  { id: "beverages", label: "Beverages" },
  { id: "snacks", label: "Snacks" },
  { id: "dairy", label: "Dairy" },
  { id: "staples", label: "Staples" },
  { id: "home-care", label: "Home Care" },
];

export async function getSellCategoryGroups(storeId: string): Promise<SellCategoryGroup[]> {
  // Backend contract: returns V3 groups with product counts
  // For now, uses the canonical V3 group list. Backend can enrich counts later.
  try {
    const cats = await getFmcgCategories(storeId);
    // Map backend categories to V3 groups by best-match
    return V3_SELL_GROUPS.map((g) => {
      if (g.id === "frequent") return { ...g, count: undefined }; // Frequent loaded separately
      const matching = cats.filter((c) => {
        const label = c.labelEn.toLowerCase();
        return label.includes(g.id.replace("-", " ")) || g.label.toLowerCase().includes(label);
      });
      return { ...g, count: matching.reduce((s, c) => s + (c.productCount ?? 0), 0) };
    });
  } catch {
    return V3_SELL_GROUPS;
  }
}
