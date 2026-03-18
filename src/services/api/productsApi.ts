import { ApiError, apiClient } from "./apiClient";
// GO-LIVE FIX: Removed direct fetch() usage - now using apiClient exclusively
// API_BASE_URL and getDeviceToken are handled internally by apiClient

const STORE_PRODUCTS_BASE = "/api/v1/pos/store-products";

type ApiProductInventory = {
  selling_price?: number | null;
};

type ApiProductVariant = {
  selling_price?: number | null;
  mrp?: number | null;
};

// V3-FIX-096: Authoritative API product type — matches backend store-products response
export type ApiProduct = {
  id: string;
  storeProductId?: string;
  name: string;
  barcode: string | null;
  sku: string | null;
  price?: number | null;
  currency: string;
  stock: number;
  inventory?: ApiProductInventory | null;
  variant?: ApiProductVariant | null;
  // Rich metadata from backend
  brand?: string | null;
  category?: string | null;
  categoryName?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  image_url?: string | null;
  unit?: string | null;
  hsnCode?: string | null;
  hsn_code?: string | null;
  gstRate?: number | null;
  gst_rate?: number | null;
  mrp?: number | null;
  mrpMinor?: number | null;
  mrp_minor?: number | null;
  purchasePriceMinor?: number | null;
  purchase_price_minor?: number | null;
  netContentValue?: number | null;
  net_content_value?: number | null;
  netContentUnit?: string | null;
  net_content_unit?: string | null;
  supplierId?: string | null;
  supplier_id?: string | null;
  supplierName?: string | null;
  supplier_name?: string | null;
  metadataUpdatedAt?: string | null;
  metadata_updated_at?: string | null;
};

// V3-FIX-096: Authoritative list item type matching backend response
type StoreProductsListItem = {
  productId: string;
  storeProductId?: string;
  name: string;
  barcode?: string | null;
  sellPrice?: number | null;
  currentStock?: number | null;
  brand?: string | null;
  category?: string | null;
  unit?: string | null;
  imageUrl?: string | null;
  image_url?: string | null;
  hsnCode?: string | null;
  hsn_code?: string | null;
  gstRate?: number | null;
  gst_rate?: number | null;
  mrp?: number | null;
  netContentValue?: number | null;
  net_content_value?: number | null;
  netContentUnit?: string | null;
  net_content_unit?: string | null;
  supplierId?: string | null;
  supplier_id?: string | null;
  supplierName?: string | null;
  supplier_name?: string | null;
  metadataUpdatedAt?: string | null;
  metadata_updated_at?: string | null;
};

export type StoreLookupProduct = {
  global_product_id: string;
  global_name: string;
  store_display_name: string;
  sell_price: number | null;
  purchase_price: number | null;
  unit: string | null;
  variant: string | null;
  available_qty: number;
  is_first_time_in_store: boolean;
  // T-059: Product mode and store product ID for variant picker
  product_mode?: string;
  store_product_id?: string;
  // AUD-002: SCALE-B1/E2 display fields from /lookup endpoint (camelCase from backend)
  imageUrl?: string | null;
  gstRate?: number | null;
  netContentValue?: number | null;
  netContentUnit?: string | null;
};

export type PriceSources = {
  inventoryPrice?: number | null;
  variantPrice?: number | null;
  variantMrp?: number | null;
};

export type PriceResolution = {
  priceMinor: number;
  inventoryPrice: number | null;
  variantPrice: number | null;
  mrp: number | null;
};

// V3-FIX-096: Preserve all metadata from backend through to productsStore
const mapStoreProductToApiProduct = (item: StoreProductsListItem): ApiProduct => {
  const price = typeof item.sellPrice === "number" ? item.sellPrice : null;
  return {
    id: item.productId,
    storeProductId: item.storeProductId,
    name: item.name,
    barcode: item.barcode ?? null,
    sku: null,
    price,
    currency: "INR",
    stock: (item.currentStock != null && !isNaN(Number(item.currentStock))) ? Number(item.currentStock) : 0,
    inventory: price !== null ? { selling_price: price } : null,
    brand: item.brand,
    category: item.category,
    imageUrl: item.imageUrl ?? item.image_url,
    unit: item.unit,
    hsnCode: item.hsnCode ?? item.hsn_code,
    gstRate: item.gstRate ?? item.gst_rate,
    mrp: item.mrp,
    netContentValue: item.netContentValue ?? item.net_content_value,
    netContentUnit: item.netContentUnit ?? item.net_content_unit,
    supplierId: item.supplierId ?? item.supplier_id,
    supplierName: item.supplierName ?? item.supplier_name,
    metadataUpdatedAt: item.metadataUpdatedAt ?? item.metadata_updated_at,
  };
};

/**
 * GO-LIVE FIX: Refactored to use apiClient instead of direct fetch() calls.
 * This ensures device token is ALWAYS attached via the centralized apiClient.
 * Previous implementation used direct fetch() which sometimes sent requests without token.
 */
export async function listProducts(params?: { barcode?: string; q?: string; storeId?: string }): Promise<ApiProduct[]> {
  try {
    const trimmedQuery = params?.q?.trim();

    // Barcode lookup
    if (params?.barcode) {
      const lookup = new URLSearchParams({ barcode: params.barcode });
      try {
        const res = await apiClient.get<{ success: boolean; data?: StoreProductsListItem }>(`${STORE_PRODUCTS_BASE}/lookup?${lookup.toString()}`);
        if (!res?.data) return [];
        // V3-FIX-096: Pass through all available metadata from lookup response
        return [mapStoreProductToApiProduct(res.data as StoreProductsListItem)];
      } catch (error) {
        // Return empty array on 404 or DEVICE_SESSION_MISSING
        if (error instanceof ApiError && (error.status === 404 || error.message === "DEVICE_SESSION_MISSING")) {
          console.log(`[listProducts] Lookup failed: ${error.message}`);
          return [];
        }
        throw error;
      }
    }

    // Search query
    if (trimmedQuery && trimmedQuery.length >= 2) {
      const searchParams = new URLSearchParams({ q: trimmedQuery, limit: "100", includeZeroStock: "true" });
      try {
        // V3-FIX-096: Typed search match with full metadata
        type SearchMatch = StoreProductsListItem & { displayName?: string; store_product_id?: string; image_url?: string; hsn_code?: string; gst_rate?: number; supplier_id?: string; supplier_name?: string };
        const res = await apiClient.get<{ success: boolean; data?: Array<{ displayName?: string; matches?: SearchMatch[] }> }>(`${STORE_PRODUCTS_BASE}/search?${searchParams.toString()}`);
        const groups = Array.isArray(res?.data) ? res.data : [];
        const byProductId = new Map<string, ApiProduct>();
        for (const group of groups) {
          const matches = Array.isArray(group?.matches) ? group.matches : [];
          for (const match of matches) {
            const productId = match?.productId;
            if (!productId || byProductId.has(productId)) continue;
            // V3-FIX-096: Map search match using typed contract
            const typed: StoreProductsListItem = {
              productId,
              storeProductId: match?.storeProductId ?? match?.store_product_id,
              name: match?.displayName || group?.displayName || "",
              barcode: match?.barcode ?? null,
              sellPrice: match?.sellPrice ?? null,
              currentStock: match?.currentStock ?? null,
              brand: match?.brand,
              category: match?.category,
              imageUrl: match?.imageUrl ?? match?.image_url,
              unit: match?.unit,
              hsnCode: match?.hsnCode ?? match?.hsn_code,
              gstRate: match?.gstRate ?? match?.gst_rate,
              mrp: match?.mrp,
              supplierId: match?.supplierId ?? match?.supplier_id,
              supplierName: match?.supplierName ?? match?.supplier_name,
            };
            byProductId.set(productId, mapStoreProductToApiProduct(typed));
          }
        }
        return Array.from(byProductId.values());
      } catch (error) {
        if (error instanceof ApiError && (error.status === 404 || error.message === "DEVICE_SESSION_MISSING")) {
          console.log(`[listProducts] Search failed: ${error.message}`);
          return [];
        }
        throw error;
      }
    }

    // List all products with pagination
    const limit = 100;
    let offset = 0;
    const items: StoreProductsListItem[] = [];
    for (;;) {
      const listParams = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      try {
        const res = await apiClient.get<{ success: boolean; data?: StoreProductsListItem[]; total?: number }>(`${STORE_PRODUCTS_BASE}/list?${listParams.toString()}`);
        const page = Array.isArray(res?.data) ? res.data : [];
        items.push(...page);

        if (page.length < limit) break;
        const total = typeof res?.total === "number" ? res.total : null;
        if (total !== null && items.length >= total) break;
        offset += limit;
      } catch (error) {
        // Break pagination loop on error, return what we have so far
        if (error instanceof ApiError) {
          console.log(`[listProducts] List page failed: ${error.message}`);
        }
        break;
      }
    }
    return items.map(mapStoreProductToApiProduct);
  } catch (error) {
    // GO-LIVE: Log the error for debugging but return empty array for graceful degradation
    console.error(`[listProducts] Unexpected error:`, error);
    return [];
  }
}

export async function lookupStoreProductByScan(input: {
  scanned: string;
  format?: string;
}): Promise<StoreLookupProduct | null> {
  const scanned = input.scanned.trim();
  if (!scanned) return null;
  const query = new URLSearchParams({ barcode: scanned });
  try {
    const res = await apiClient.get<{
      success: boolean;
      data: {
        productId: string;
        storeProductId: string;
        name: string;
        barcode?: string;
        sellPrice?: number | null;
        purchasePrice?: number | null;
        currentStock: number;
        displayName?: string;
        unit?: string;
      };
    }>(`${STORE_PRODUCTS_BASE}/lookup?${query.toString()}`);
    const d = res.data;
    return {
      global_product_id: d.productId,
      global_name: d.name,
      store_display_name: d.displayName || d.name,
      sell_price: d.sellPrice ?? null,
      purchase_price: d.purchasePrice ?? null,
      unit: d.unit || null,
      variant: null,
      available_qty: d.currentStock,
      is_first_time_in_store: false,
      product_mode: (d as any).mode || undefined,
      store_product_id: d.storeProductId || undefined,
    };
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.message === "product_not_found")) {
      return null;
    }
    throw error;
  }
}

export async function lookupStoreProductPreviewByScan(input: {
  scanned: string;
  format?: string;
}): Promise<StoreLookupProduct | null> {
  const scanned = input.scanned.trim();
  if (!scanned) return null;
  const query = new URLSearchParams({ barcode: scanned });
  const url = `${STORE_PRODUCTS_BASE}/lookup?${query.toString()}`;
  console.log(`[scan_debug] GET ${url}`);
  try {
    const res = await apiClient.get<{
      success: boolean;
      data: {
        productId: string;
        storeProductId: string;
        name: string;
        brand?: string;
        barcode?: string;
        sellPrice?: number | null;
        purchasePrice?: number | null;
        currentStock: number;
        displayName?: string;
        unit?: string;
        mode?: string;
        // AUD-002: SCALE-B1/E2 fields — backend returns camelCase from /lookup
        imageUrl?: string | null;
        gstRate?: number | null;
        netContentValue?: number | null;
        netContentUnit?: string | null;
      };
    }>(url);
    console.log(`[scan_debug] response:`, JSON.stringify(res).slice(0, 300));
    const d = res.data;
    return {
      global_product_id: d.productId,
      global_name: d.name,
      store_display_name: d.displayName || d.name,
      sell_price: d.sellPrice ?? null,
      purchase_price: d.purchasePrice ?? null,
      unit: d.unit || null,
      variant: null,
      available_qty: d.currentStock,
      is_first_time_in_store: false,
      product_mode: d.mode || undefined,
      store_product_id: d.storeProductId || undefined,
      // AUD-002: Preserve display fields for offline cache and SellTile
      imageUrl: d.imageUrl ?? null,
      gstRate: d.gstRate ?? null,
      netContentValue: d.netContentValue ?? null,
      netContentUnit: d.netContentUnit ?? null,
    };
  } catch (error) {
    console.log(`[scan_debug] error:`, error instanceof ApiError ? `ApiError(${error.status}): ${error.message}` : String(error));
    if (error instanceof ApiError && (error.status === 404 || error.message === "product_not_found")) {
      return null;
    }
    // RCAT-PROD-014: Handle barcode conflict — use canonical (most recently updated) product
    if (error instanceof ApiError && error.status === 409) {
      const conflict = error.payload as { canonical?: { productId?: string; name?: string; displayName?: string; sellPrice?: number | null; purchasePrice?: number | null; unit?: string; currentStock?: number }; productIds?: string[] } | undefined;
      console.warn(`[RCAT-PROD-014] Barcode conflict for ${input.scanned}, products=${JSON.stringify(conflict?.productIds)}`);
      if (conflict?.canonical) {
        const c = conflict.canonical;
        return {
          global_product_id: c.productId || input.scanned,
          global_name: c.name || "",
          store_display_name: c.displayName || c.name || "",
          sell_price: c.sellPrice ?? null,
          purchase_price: c.purchasePrice ?? null,
          unit: c.unit || null,
          variant: null,
          available_qty: c.currentStock ?? 0,
          is_first_time_in_store: false
        };
      }
      return null;
    }
    throw error;
  }
}

export async function createStoreProductFromScan(input: {
  scanned: string;
  format?: string;
  globalName?: string | null;
  storeDisplayName?: string | null;
}): Promise<StoreLookupProduct> {
  const scanned = input.scanned.trim();
  if (!scanned) {
    throw new Error("scanned is required");
  }

  const productName = input.storeDisplayName || input.globalName || "";

  const payload: Record<string, unknown> = {
    barcode: scanned,
    name: productName,
    initialStockQty: 0
  };

  type StoreProductPayload = {
    storeProductId: string;
    productId?: string; // ISSUE-068: catalog.products.id
    name: string;
    barcode: string;
    sellPrice: number | null;
    purchasePrice: number | null;
    mrp: number | null;
    stock: { isKnown: boolean; qty: number };
    unit: string;
    brand: string;
  };

  let sp: StoreProductPayload;
  try {
    const res = await apiClient.post<{ storeProduct: StoreProductPayload }>(
      `${STORE_PRODUCTS_BASE}`,
      payload
    );
    sp = res.storeProduct;
  } catch (error) {
    // 409 = barcode already mapped - return existing product
    if (error instanceof ApiError && error.status === 409) {
      const data = error.payload as { storeProduct?: StoreProductPayload } | undefined;
      if (data?.storeProduct) {
        sp = data.storeProduct;
      } else {
        throw error;
      }
    } else {
      throw error;
    }
  }

  return {
    global_product_id: sp.productId || sp.storeProductId, // ISSUE-068: prefer catalog productId
    store_product_id: sp.storeProductId, // ISSUE-068: pass storeProductId for catalog bridge
    global_name: sp.name,
    store_display_name: sp.name,
    sell_price: sp.sellPrice,
    purchase_price: sp.purchasePrice ?? null,
    unit: sp.unit || null,
    variant: null,
    available_qty: sp.stock?.qty ?? 0,
    is_first_time_in_store: true
  };
}

export async function receiveStoreProductFromScan(input: {
  scanned: string;
  format?: string;
  sellPriceMinor: number;
  initialStock: number;
  purchasePriceMinor?: number;
  globalName?: string | null;
  storeDisplayName?: string | null;
}): Promise<StoreLookupProduct> {
  const scanned = input.scanned.trim();
  if (!scanned) {
    throw new Error("scanned is required");
  }

  const productName = input.storeDisplayName || input.globalName || "";

  const payload: Record<string, unknown> = {
    barcode: scanned,
    name: productName,
    sellPrice: input.sellPriceMinor,
    initialStockQty: input.initialStock
  };
  if (typeof input.purchasePriceMinor === "number") {
    payload.purchasePrice = input.purchasePriceMinor;
  }

  type StoreProductPayload = {
    storeProductId: string;
    productId?: string; // ISSUE-068: catalog.products.id
    name: string;
    barcode: string;
    sellPrice: number | null;
    purchasePrice: number | null;
    mrp: number | null;
    stock: { isKnown: boolean; qty: number };
    unit: string;
    brand: string;
    description: string;
  };

  let sp: StoreProductPayload;
  try {
    const res = await apiClient.post<{ storeProduct: StoreProductPayload }>(
      `${STORE_PRODUCTS_BASE}`,
      payload
    );
    sp = res.storeProduct;
  } catch (error) {
    // 409 = barcode already mapped for this store - treat as success with existing product
    if (error instanceof ApiError && error.status === 409) {
      const data = error.payload as { storeProduct?: StoreProductPayload } | undefined;
      if (data?.storeProduct) {
        sp = data.storeProduct;
      } else {
        throw error;
      }
    } else {
      throw error;
    }
  }

  return {
    global_product_id: sp.productId || sp.storeProductId, // ISSUE-068: prefer catalog productId
    store_product_id: sp.storeProductId, // ISSUE-068: pass storeProductId for catalog bridge
    global_name: sp.name,
    store_display_name: sp.name,
    sell_price: sp.sellPrice,
    purchase_price: sp.purchasePrice ?? null,
    unit: sp.unit || null,
    variant: null,
    available_qty: sp.stock?.qty ?? input.initialStock,
    is_first_time_in_store: true
  };
}

/** RCAT-SYNC-001: Canonical product data returned after price update */
export type PriceUpdateResult = {
  storeProductId: string;
  productId: string;
  sellPrice: number;
  currentStock: number;
  name?: string;
  updatedAt: string;
};

export async function updateStoreProductPrice(input: {
  globalProductId?: string;
  scanned?: string;
  format?: string;
  sellPriceMinor: number | null;
}): Promise<PriceUpdateResult | null> {
  if (input.sellPriceMinor === null || input.sellPriceMinor <= 0) return null;

  const payload: Record<string, unknown> = {
    sellPrice: input.sellPriceMinor
  };
  if (input.globalProductId) payload.productId = input.globalProductId;
  if (input.scanned) payload.barcode = input.scanned;

  const res = await apiClient.patch<{ success: boolean; data?: PriceUpdateResult }>(
    `${STORE_PRODUCTS_BASE}/price`,
    payload
  );
  return res.data ?? null;
}

export async function updateStoreProductStock(input: {
  productId?: string;
  barcode?: string;
  stock: number;
}): Promise<{ productId: string; stock: number }> {
  const payload: Record<string, unknown> = {
    stock: input.stock
  };
  if (input.productId) payload.productId = input.productId;
  if (input.barcode) payload.barcode = input.barcode;

  const res = await apiClient.patch<{ success: boolean; data: { productId: string; stock: number } }>(
    `${STORE_PRODUCTS_BASE}/stock`,
    payload
  );
  return res.data;
}

/** RCAT-SYNC-001: Canonical product data returned after metadata update */
export type MetadataUpdateResult = {
  storeProductId: string;
  productId: string;
  displayName?: string;
  sellPrice?: number;
  purchasePrice?: number;
  metadataUpdatedAt: string;
  updatedAt: string;
};

/**
 * SYNC-PRD-001: Update product metadata (display name, purchase price, sell price) from POS.
 * Accepts storeProductId, productId, or barcode for identification (fallback order).
 * AUD-025-B: Last-write-wins - send metadataUpdatedAt for conflict resolution.
 * If server has newer data, returns 409 CONFLICT with serverTimestamp.
 */
export async function updateStoreProductMetadata(input: {
  storeProductId?: string;
  productId?: string;
  barcode?: string;
  displayName?: string;
  purchasePrice?: number;
  sellPrice?: number;
  metadataUpdatedAt?: string; // ISO timestamp for LWW - when this edit was made locally
}): Promise<MetadataUpdateResult | null> {
  const body: Record<string, unknown> = {};
  if (input.storeProductId) body.storeProductId = input.storeProductId;
  if (input.productId) body.productId = input.productId;
  if (input.barcode) body.barcode = input.barcode;
  if (input.displayName) body.displayName = input.displayName;
  if (typeof input.purchasePrice === "number") body.purchasePrice = input.purchasePrice;
  if (typeof input.sellPrice === "number") body.sellPrice = input.sellPrice;
  // AUD-025-B: Send timestamp for last-write-wins conflict resolution
  if (input.metadataUpdatedAt) body.metadataUpdatedAt = input.metadataUpdatedAt;
  const res = await apiClient.patch<{ success: boolean; data?: MetadataUpdateResult }>(
    `${STORE_PRODUCTS_BASE}/metadata`,
    body
  );
  return res.data ?? null;
}

const normalizePriceInput = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.round(value);
};

export function getProductPriceSources(product: ApiProduct): PriceSources {
  const inventoryPrice = product.inventory?.selling_price ?? null;
  const variantPrice = product.variant?.selling_price ?? null;
  const variantMrp = product.variant?.mrp ?? null;

  if (inventoryPrice == null && variantPrice == null && variantMrp == null) {
    return { inventoryPrice: product.price ?? null, variantPrice: null, variantMrp: null };
  }

  return { inventoryPrice, variantPrice, variantMrp };
}

export function resolvePriceMinorFromSources(sources: PriceSources): PriceResolution {
  const inventoryPrice = normalizePriceInput(sources.inventoryPrice);
  const variantPrice = normalizePriceInput(sources.variantPrice);
  const mrp = normalizePriceInput(sources.variantMrp);

  const rawPrice = inventoryPrice ?? variantPrice ?? mrp ?? 0;
  const priceMinor = Number.isFinite(rawPrice) ? Math.max(0, rawPrice) : 0;

  return { priceMinor, inventoryPrice, variantPrice, mrp };
}

export function resolveProductPriceMinor(product: ApiProduct): number {
  return resolvePriceMinorFromSources(getProductPriceSources(product)).priceMinor;
}

// =============================================================================
// T-059: Retail variant types and fetch function
// =============================================================================

export type RetailVariant = {
  id: string;
  storeProductId: string;
  variantLabel: string;
  variantQty: number;
  baseUnit: string;
  sellPriceMinor: number;
  barcode: string;
  sortOrder: number;
};

export async function fetchRetailVariants(storeProductId: string): Promise<RetailVariant[]> {
  try {
    const res = await apiClient.get<{
      success: boolean;
      data: RetailVariant[];
    }>(`${STORE_PRODUCTS_BASE}/${storeProductId}/variants`);
    return res.data || [];
  } catch (error) {
    console.warn(`[fetchRetailVariants] Failed for ${storeProductId}:`, error);
    return [];
  }
}

// T-136: Product substitution suggestions
export interface SubstituteProduct {
  productId: string;
  name: string;
  barcode?: string;
  sellPrice: number;
  currentStock: number;
}

export async function fetchProductSubstitutes(productId: string): Promise<SubstituteProduct[]> {
  try {
    const res = await apiClient.get<{
      success: boolean;
      data: SubstituteProduct[];
    }>(`/api/v1/pos/products/${productId}/substitutes`);
    return res.data || [];
  } catch (error) {
    console.warn(`[fetchProductSubstitutes] Failed for ${productId}:`, error);
    return [];
  }
}


// V3-FIX-041: Fetch frequently sold products for SELL home
export async function getFrequentProducts(): Promise<any[]> {
  try {
    const result = await apiClient.get<{ products: any[] }>("/api/v1/pos/products/frequent");
    return result.products ?? [];
  } catch {
    return [];
  }
}
