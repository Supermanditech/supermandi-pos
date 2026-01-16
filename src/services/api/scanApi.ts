import { ApiError, apiClient } from "./apiClient";
import { isOnline } from "../networkStatus";
import { enqueueEvent } from "../offline/outbox";
import { fetchLocalProduct, resolveOfflineScan, setLocalPrice } from "../offline/scan";

export type ScanMode = "SELL" | "DIGITISE";

export type ScanProduct = {
  id: string;
  name: string;
  barcode: string;
  priceMinor: number | null;
  currency: string;
};

export type ScanResolveResponse =
  | { action: "IGNORED" }
  | {
      action: "ADD_TO_CART" | "PROMPT_PRICE" | "DIGITISED" | "ALREADY_DIGITISED";
      product: ScanProduct;
      product_not_found_for_store?: boolean;
      availableStock?: number | null; // SD-ONBOARD-002C: Stock for cart cap check
    };

// Backend response types (SD-ONBOARD-002 digitisation format)
type BackendStoreProduct = {
  storeProductId: string;
  name: string;
  barcode: string;
  sellPrice: number | null;
  mrp: number | null;
  purchasePrice: number | null;
  stock: { isKnown: boolean; qty: number };
  unit: string;
  brand: string;
  description: string;
  imageUrl: string;
  variant: string;
  packSize: string;
};

type BackendPrefill = {
  barcode: string;
  name: string;
  description: string;
  unit: string;
  imageUrl: string;
  brand: string;
  variant: string;
  packSize: string;
  source: string;
  confidence: string;
  productId: string | null;
};

type BackendScanResponse =
  | { status: "FOUND"; storeProduct: BackendStoreProduct }
  | { status: "NEEDS_CREATE"; barcode: string; prefill?: BackendPrefill };

export async function resolveScan(input: {
  scanValue: string;
  mode: ScanMode;
}): Promise<ScanResolveResponse> {
  if (await isOnline()) {
    // SD-ONBOARD-002C: Backend expects { barcode } not { scanValue }
    const backendResponse = await apiClient.post<BackendScanResponse>("/api/v1/pos/scan/resolve", {
      barcode: input.scanValue
    });

    // Transform new format to legacy format expected by handleScan.ts
    if (backendResponse.status === "FOUND") {
      const sp = backendResponse.storeProduct;
      const hasSellPrice = typeof sp.sellPrice === "number" && sp.sellPrice > 0;

      if (hasSellPrice) {
        // SD-ONBOARD-002C: Include stock for cart cap check
        const stockQty = sp.stock?.isKnown ? sp.stock.qty : null;
        return {
          action: "ADD_TO_CART",
          product: {
            id: sp.storeProductId,
            name: sp.name,
            barcode: sp.barcode,
            priceMinor: sp.sellPrice,
            currency: "INR"
          },
          product_not_found_for_store: false,
          availableStock: stockQty
        };
      } else {
        // Product exists but no sell price - prompt for price
        return {
          action: "PROMPT_PRICE",
          product: {
            id: sp.storeProductId,
            name: sp.name,
            barcode: sp.barcode,
            priceMinor: null,
            currency: "INR"
          },
          product_not_found_for_store: false
        };
      }
    } else {
      // status === "NEEDS_CREATE" - product not in store catalog
      const prefill = backendResponse.prefill;
      const name = prefill?.name || "";
      return {
        action: "PROMPT_PRICE",
        product: {
          id: backendResponse.barcode,
          name: name,
          barcode: backendResponse.barcode,
          priceMinor: null,
          currency: "INR"
        },
        product_not_found_for_store: true
      };
    }
  }

  const offline = await resolveOfflineScan(input.scanValue, input.mode);
  if (offline.action === "IGNORED") {
    return { action: "IGNORED" };
  }

  return {
    action: offline.action,
    product: {
      id: offline.product.barcode,
      name: offline.product.name,
      barcode: offline.product.barcode,
      priceMinor: offline.product.priceMinor,
      currency: offline.product.currency
    },
    product_not_found_for_store: offline.product_not_found_for_store
  };
}

export async function setProductPrice(input: {
  productId: string;
  priceMinor: number;
}): Promise<ScanProduct> {
  if (await isOnline()) {
    const res = await apiClient.post<{ product: ScanProduct }>("/api/v1/pos/products/price", input);
    return res.product;
  }

  const barcode = input.productId;
  const local = await fetchLocalProduct(barcode);
  if (!local) {
    throw new Error("product not found");
  }

  await setLocalPrice(barcode, Math.round(input.priceMinor));
  await enqueueEvent("PRODUCT_PRICE_SET", {
    barcode,
    priceMinor: Math.round(input.priceMinor)
  });

  return {
    id: barcode,
    name: local.name,
    barcode,
    priceMinor: Math.round(input.priceMinor),
    currency: local.currency
  };
}

export async function lookupProductByBarcode(barcode: string): Promise<ScanProduct | null> {
  const trimmed = barcode.trim();
  if (!trimmed) return null;

  if (await isOnline()) {
    try {
      const res = await apiClient.get<{ product: ScanProduct }>(
        `/api/v1/pos/products/lookup?barcode=${encodeURIComponent(trimmed)}`
      );
      return res.product;
    } catch (error) {
      if (error instanceof ApiError && error.message === "product_not_found") {
        return null;
      }
      throw error;
    }
  }

  const local = await fetchLocalProduct(trimmed);
  if (!local) return null;

  return {
    id: local.barcode,
    name: local.name,
    barcode: local.barcode,
    priceMinor: local.priceMinor,
    currency: local.currency
  };
}

// =============================================================================
// SD-ONBOARD-002: Two-Speed Product Capture + Internal Prefill
// =============================================================================

export type DigitisationMode = "FAST_SELL" | "DIGITISATION";

// SD-ONBOARD-002C: Added "other_store" for cross-store prefill
export type PrefillSource = "platform_catalog" | "external_lookup" | "other_store";
export type PrefillConfidence = "high" | "medium" | "low";

export interface StoreProductStock {
  isKnown: boolean;
  qty: number;
}

export interface StoreProductResponse {
  storeProductId: string;
  name: string;
  barcode: string;
  sellPrice: number | null;
  mrp: number | null;
  purchasePrice: number | null;
  stock: StoreProductStock;
  unit: string;
  brand: string;
  description: string;
  imageUrl: string;
  variant: string;
  packSize: string;
}

export interface ScanResolvePrefill {
  barcode: string;
  name: string;
  description: string;
  unit: string;
  imageUrl: string;
  brand: string;
  variant: string;
  packSize: string;
  source: PrefillSource;
  confidence: PrefillConfidence;
  productId: string | null;
}

// SD-ONBOARD-002: No more NOT_FOUND - unknown barcodes always get NEEDS_CREATE
export type DigitisationScanResolveResponse =
  | { status: "FOUND"; storeProduct: StoreProductResponse }
  | { status: "NEEDS_CREATE"; barcode: string; prefill?: ScanResolvePrefill };

/**
 * Resolve barcode using new digitisation contract (SD-ONBOARD-002)
 * Returns FOUND/NEEDS_CREATE status (no more NOT_FOUND)
 */
export async function resolveScanForDigitisation(barcode: string): Promise<DigitisationScanResolveResponse> {
  const trimmed = barcode.trim();
  if (!trimmed) {
    return { status: "NEEDS_CREATE", barcode: "" };
  }

  return apiClient.post<DigitisationScanResolveResponse>("/api/v1/pos/scan/resolve", {
    barcode: trimmed
  });
}

export interface CreateStoreProductInput {
  barcode: string;
  mode: DigitisationMode;
  name?: string;
  sellPrice: number; // Minor units (paise)
  mrp?: number;
  purchasePrice?: number;
  initialStockQty: number;
  unit?: string;
  variant?: string;
  packSize?: string;
  description?: string;
  brand?: string;
}

export interface CreateStoreProductResponse {
  storeProduct: StoreProductResponse;
}

export interface CreateStoreProductConflictResponse {
  error: "BARCODE_ALREADY_MAPPED";
  message: string;
  storeProduct: StoreProductResponse;
}

/**
 * Create store product during digitisation flow (SD-ONBOARD-001B)
 * Creates product + store-scoped barcode binding + initial INWARD ledger
 */
export async function createStoreProduct(
  input: CreateStoreProductInput
): Promise<{ success: true; storeProduct: StoreProductResponse } | { success: false; existingProduct: StoreProductResponse }> {
  try {
    const res = await apiClient.post<CreateStoreProductResponse>("/api/v1/pos/store-products", input);
    return { success: true, storeProduct: res.storeProduct };
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      // Conflict - barcode already mapped
      const conflictData = error.payload as CreateStoreProductConflictResponse;
      return { success: false, existingProduct: conflictData.storeProduct };
    }
    throw error;
  }
}
