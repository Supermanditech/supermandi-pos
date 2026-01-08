import { ApiError, apiClient } from "./apiClient";

const PRODUCTS_BASE = "/api/v2/products";

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

export async function listProducts(params?: { barcode?: string; q?: string }): Promise<ApiProduct[]> {
  const query = new URLSearchParams();
  if (params?.barcode) query.set("barcode", params.barcode);
  if (params?.q) query.set("q", params.q);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const res = await apiClient.get<{ products: ApiProduct[] }>(`${PRODUCTS_BASE}${suffix}`);
  return res.products;
}

export async function lookupStoreProductByScan(input: {
  scanned: string;
  format?: string;
}): Promise<StoreLookupProduct | null> {
  const scanned = input.scanned.trim();
  if (!scanned) return null;
  const query = new URLSearchParams({ scanned });
  if (input.format) {
    query.set("format", input.format);
  }
  try {
    const res = await apiClient.get<{ product: StoreLookupProduct }>(
      `${PRODUCTS_BASE}/lookup?${query.toString()}`
    );
    return res.product;
  } catch (error) {
    if (error instanceof ApiError && error.message === "product_not_found") {
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
  const payload: Record<string, unknown> = { scanned };
  if (input.format) payload.format = input.format;
  if (input.globalName) payload.global_name = input.globalName;
  if (input.storeDisplayName) payload.store_display_name = input.storeDisplayName;

  const res = await apiClient.post<{ product: StoreLookupProduct }>(
    `${PRODUCTS_BASE}/create-from-scan`,
    payload
  );
  return res.product;
}

export async function updateStoreProductPrice(input: {
  globalProductId?: string;
  scanned?: string;
  format?: string;
  sellPriceMinor: number | null;
}): Promise<StoreLookupProduct> {
  const payload: Record<string, unknown> = {
    sell_price_minor: input.sellPriceMinor
  };
  if (input.globalProductId) payload.global_product_id = input.globalProductId;
  if (input.scanned) payload.scanned = input.scanned;
  if (input.format) payload.format = input.format;

  const res = await apiClient.patch<{ product: StoreLookupProduct }>(
    `${PRODUCTS_BASE}/store-price`,
    payload
  );
  return res.product;
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

