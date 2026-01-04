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
    };

export async function resolveScan(input: {
  scanValue: string;
  mode: ScanMode;
}): Promise<ScanResolveResponse> {
  if (await isOnline()) {
    return apiClient.post<ScanResolveResponse>("/api/v1/pos/scan/resolve", input);
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
    }
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
