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
}

/**
 * TR-PEND-006: Added displayNameHi/brandHi for Hindi localization
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
  packSize?: number;
  primaryBarcode?: string;
  hsnCode?: string;
  defaultGstRate?: number;
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
 * Returns the suppliers array from the product detail.
 */
export async function getProductSuppliers(
  storeId: string,
  productId: string
): Promise<CatalogSupplier[]> {
  const product = await getProduct(storeId, productId);
  return product.suppliers;
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
