// SEARCH-SELL-001: SELL Search API Client
// Searches store products only (NOT BUY/purchase catalog)

import { apiClient } from "./apiClient";

// =============================================================================
// TYPES
// =============================================================================

/**
 * SKU match within a product group
 */
export interface StoreSkuMatch {
  productId: string;
  storeProductId: string;
  sku?: string;
  barcode?: string;
  sellPrice?: number | null;
  currentStock: number;
  displayName?: string;
  updatedAt?: string | null;
  metadataUpdatedAt?: string | null;  // SYNC-PRD-001
  // SCALE-B1: Enhanced tile fields
  mrp?: number | null;
  gst_rate?: number | null;
  net_content_value?: number | null;
  net_content_unit?: string | null;
  image_url?: string | null;
  expiry_date?: string | null;
  mode?: "PACKAGED" | "LOOSE";
  rate_unit?: string | null;
}

/**
 * Product group for 2-step SELL add UX
 * First tap shows groups, second tap picks specific SKU
 *
 * TR-PEND-006: displayNameHi/brandHi available when locale=hi
 */
export interface StoreSearchGroup {
  groupId: string;
  displayName: string;
  displayNameHi?: string;
  brand?: string;
  brandHi?: string;
  category?: string;
  matches: StoreSkuMatch[];
}

export interface StoreSearchResponse {
  success: boolean;
  data: StoreSearchGroup[];
  total: number;
  context: "SELL";
}

export interface StoreLookupResponse {
  success: boolean;
  data: {
    productId: string;
    storeProductId: string;
    name: string;
    brand?: string;
    barcode?: string;
    sellPrice?: number | null;
    currentStock: number;
    displayName?: string;           // SYNC-PRD-001: store override name
    metadataUpdatedAt?: string | null;  // SYNC-PRD-001
  };
  context: "SELL";
}

export interface StoreLookupNotFoundResponse {
  success: false;
  error: "PRODUCT_NOT_IN_STORE_CATALOG";
  message: string;
  barcode: string;
}

// =============================================================================
// SEARCH-SELL-001: Store Product Search
// =============================================================================

/**
 * Search store products for SELL context.
 *
 * CRITICAL BOUNDARY: This only searches products the store has
 * onboarded/received (catalog.store_products). It does NOT search
 * the BUY/purchase catalog (catalog.products + product_map tables).
 *
 * Returns grouped results for 2-step add UX:
 * - First tap: Show group (product family)
 * - Second tap: Pick specific SKU from group
 *
 * @param storeId - Store ID
 * @param query - Search term (min 2 chars)
 * @param options - Search options
 */
export async function searchStoreProducts(
  _storeId: string, // Deprecated: storeId derived from device token on server
  query: string,
  options: {
    limit?: number;
    includeZeroStock?: boolean;
  } = {}
): Promise<StoreSearchGroup[]> {
  const { limit = 30, includeZeroStock = true } = options;

  const params = new URLSearchParams({
    q: query,
    limit: String(limit),
    includeZeroStock: String(includeZeroStock),
  });

  // SD-ONBOARD-002C: Use POS endpoint (device token → storeId)
  const response = await apiClient.get<StoreSearchResponse>(
    `/api/v1/pos/store-products/search?${params}`
  );

  return response.data;
}

// =============================================================================
// SD-ONBOARD-002C: Store Product List (Tap-and-Add)
// =============================================================================

/**
 * Store product item from list endpoint
 */
export interface StoreProductListItem {
  storeProductId: string;
  productId: string;
  name: string;
  barcode: string | null;
  sellPrice: number | null;
  currentStock: number;
  brand: string | null;
  unit: string;
  updatedAt?: string | null;
  metadataUpdatedAt?: string | null;  // SYNC-PRD-001
  // SCALE-B1: Enhanced tile fields
  mrp?: number | null;
  gst_rate?: number | null;
  net_content_value?: number | null;
  net_content_unit?: string | null;
  image_url?: string | null;
  expiry_date?: string | null;
  mode?: "PACKAGED" | "LOOSE";
  rate_unit?: string | null;
}

export interface StoreProductListResponse {
  success: boolean;
  data: StoreProductListItem[];
  total: number;
  limit: number;
  offset: number;
  context: "SELL";
}

/**
 * List store products for tap-and-add SELL grid.
 * Does NOT require a search query - returns recent products.
 *
 * @param options - List options (limit, offset)
 */
export async function listStoreProducts(
  options: {
    limit?: number;
    offset?: number;
  } = {}
): Promise<StoreProductListItem[]> {
  const { limit = 50, offset = 0 } = options;

  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });

  const response = await apiClient.get<StoreProductListResponse>(
    `/api/v1/pos/store-products/list?${params}`
  );

  return response.data;
}

/**
 * Direct barcode lookup for SELL context.
 *
 * Used when scanner returns a specific barcode.
 * Returns null if product not in store catalog
 * (triggers sell-first onboarding flow).
 *
 * @param _storeId - Deprecated: storeId derived from device token on server
 * @param barcode - Barcode to look up
 */
export async function lookupStoreProductByBarcode(
  _storeId: string, // Deprecated: storeId derived from device token on server
  barcode: string
): Promise<StoreLookupResponse["data"] | null> {
  try {
    // SD-ONBOARD-002C: Use POS endpoint (device token → storeId)
    const response = await apiClient.get<StoreLookupResponse>(
      `/api/v1/pos/store-products/lookup?barcode=${encodeURIComponent(barcode)}`
    );
    return response.data;
  } catch (error: unknown) {
    // 404 means product not in store catalog
    const err = error as { status?: number; response?: { status?: number } };
    if (err?.status === 404 || err?.response?.status === 404) {
      return null;
    }
    throw error;
  }
}

// =============================================================================
// R5: Catalog Freshness Check (Cross-sync after dashboard edits)
// =============================================================================

export interface FreshnessResponse {
  success: boolean;
  stale: boolean;
  latestUpdatedAt: string | null;
  storeId: string;
}

/**
 * Check if the store catalog has been updated since the given timestamp.
 * Used to detect dashboard edits and trigger a POS catalog refresh.
 *
 * @param since - ISO timestamp of last known sync
 * @returns { stale, latestUpdatedAt }
 */
export async function checkCatalogFreshness(
  since: string | null
): Promise<FreshnessResponse> {
  const params = new URLSearchParams();
  if (since) params.set("since", since);

  const response = await apiClient.get<FreshnessResponse>(
    `/api/v1/pos/store-products/freshness?${params}`
  );

  return response;
}

// =============================================================================
// HELPER: Flatten groups for simple list display
// =============================================================================

/**
 * Flatten grouped results into a simple list.
 * Use this if you want to display all SKUs in a flat list
 * instead of grouped view.
 */
export function flattenSearchGroups(
  groups: StoreSearchGroup[]
): Array<StoreSkuMatch & { groupDisplayName: string; brand?: string }> {
  const results: Array<StoreSkuMatch & { groupDisplayName: string; brand?: string }> = [];

  for (const group of groups) {
    for (const match of group.matches) {
      results.push({
        ...match,
        groupDisplayName: group.displayName,
        brand: group.brand,
      });
    }
  }

  return results;
}

// =============================================================================
// TR-PEND-006: Localized Display Names
// =============================================================================

import i18n from "../../i18n";

/**
 * Get localized display name for a search group.
 * Returns Hindi name when locale=hi and available, otherwise English.
 */
export function getLocalizedGroupName(group: StoreSearchGroup): string {
  if (i18n.language === "hi" && group.displayNameHi) {
    return group.displayNameHi;
  }
  return group.displayName;
}

/**
 * Get localized brand name for a search group.
 * Returns Hindi brand when locale=hi and available, otherwise English.
 */
export function getLocalizedBrand(group: StoreSearchGroup): string | undefined {
  if (i18n.language === "hi" && group.brandHi) {
    return group.brandHi;
  }
  return group.brand;
}
