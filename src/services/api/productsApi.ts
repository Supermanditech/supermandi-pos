import { ApiError, apiClient } from "./apiClient";
import { API_BASE_URL } from "../../config/api";
import { getDeviceToken } from "../deviceSession";

const STORE_PRODUCTS_BASE = "/api/v1/pos/store-products";

type ApiProductInventory = {
  selling_price?: number | null;
};

type ApiProductVariant = {
  selling_price?: number | null;
  mrp?: number | null;
};

export type ApiProduct = {
  id: string;
  name: string;
  barcode: string | null;
  sku: string | null;
  price?: number | null; // minor units (legacy)
  currency: string;
  stock: number;
  inventory?: ApiProductInventory | null;
  variant?: ApiProductVariant | null;
};

type StoreProductsListItem = {
  productId: string;
  name: string;
  barcode?: string | null;
  sellPrice?: number | null;
  currentStock?: number | null;
  brand?: string | null;
  unit?: string | null;
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

const mapStoreProductToApiProduct = (item: StoreProductsListItem): ApiProduct => {
  const price = typeof item.sellPrice === "number" ? item.sellPrice : null;
  return {
    id: item.productId,
    name: item.name,
    barcode: item.barcode ?? null,
    sku: null,
    price,
    currency: "INR",
    stock: typeof item.currentStock === "number" ? item.currentStock : 0,
    inventory: price !== null ? { selling_price: price } : null
  };
};

export async function listProducts(params?: { barcode?: string; q?: string; storeId?: string }): Promise<ApiProduct[]> {
  try {
    const token = await getDeviceToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["X-Device-Token"] = token;

    const trimmedQuery = params?.q?.trim();
    if (params?.barcode) {
      const lookup = new URLSearchParams({ barcode: params.barcode });
      const response = await fetch(`${API_BASE_URL}${STORE_PRODUCTS_BASE}/lookup?${lookup.toString()}`, { headers });
      if (!response.ok) return [];
      const res = await response.json();
      if (!res?.data) return [];
      return [mapStoreProductToApiProduct({
        productId: res.data.productId,
        name: res.data.name,
        barcode: res.data.barcode ?? null,
        sellPrice: res.data.sellPrice ?? null,
        currentStock: res.data.currentStock ?? null
      })];
    }

    if (trimmedQuery && trimmedQuery.length >= 2) {
      const searchParams = new URLSearchParams({ q: trimmedQuery, limit: "100", includeZeroStock: "true" });
      const response = await fetch(`${API_BASE_URL}${STORE_PRODUCTS_BASE}/search?${searchParams.toString()}`, { headers });
      if (!response.ok) return [];
      const res = await response.json();
      const groups = Array.isArray(res?.data) ? res.data : [];
      const byProductId = new Map<string, ApiProduct>();
      for (const group of groups) {
        const matches = Array.isArray(group?.matches) ? group.matches : [];
        for (const match of matches) {
          const productId = match?.productId;
          if (!productId || byProductId.has(productId)) continue;
          byProductId.set(productId, mapStoreProductToApiProduct({
            productId,
            name: match?.displayName || group?.displayName || "",
            barcode: match?.barcode ?? null,
            sellPrice: match?.sellPrice ?? null,
            currentStock: match?.currentStock ?? null
          }));
        }
      }
      return Array.from(byProductId.values());
    }

    const limit = 100;
    let offset = 0;
    const items: StoreProductsListItem[] = [];
    for (;;) {
      const listParams = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      const response = await fetch(`${API_BASE_URL}${STORE_PRODUCTS_BASE}/list?${listParams.toString()}`, { headers });
      if (!response.ok) break;
      const res = await response.json();
      const page = Array.isArray(res?.data) ? res.data : [];
      items.push(...page);

      if (page.length < limit) break;
      const total = typeof res?.total === "number" ? res.total : null;
      if (total !== null && items.length >= total) break;
      offset += limit;
    }
    return items.map(mapStoreProductToApiProduct);
  } catch {
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
      is_first_time_in_store: false
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
      is_first_time_in_store: false
    };
  } catch (error) {
    console.log(`[scan_debug] error:`, error instanceof ApiError ? `ApiError(${error.status}): ${error.message}` : String(error));
    if (error instanceof ApiError && (error.status === 404 || error.message === "product_not_found")) {
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
    global_product_id: sp.storeProductId,
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
    global_product_id: sp.storeProductId,
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

export async function updateStoreProductPrice(input: {
  globalProductId?: string;
  scanned?: string;
  format?: string;
  sellPriceMinor: number | null;
}): Promise<void> {
  if (input.sellPriceMinor === null || input.sellPriceMinor <= 0) return;

  const payload: Record<string, unknown> = {
    sellPrice: input.sellPriceMinor
  };
  if (input.globalProductId) payload.productId = input.globalProductId;
  if (input.scanned) payload.barcode = input.scanned;

  await apiClient.patch<{ success: boolean }>(
    `${STORE_PRODUCTS_BASE}/price`,
    payload
  );
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

/**
 * SYNC-PRD-001: Update product metadata (display name) from POS
 * Last-write-wins: server sets metadata_updated_at = NOW()
 */
export async function updateStoreProductMetadata(input: {
  storeProductId: string;
  displayName: string;
}): Promise<void> {
  await apiClient.patch<{ success: boolean }>(
    `${STORE_PRODUCTS_BASE}/${input.storeProductId}/metadata`,
    { displayName: input.displayName }
  );
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
