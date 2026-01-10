import { receiveStoreProductFromScan, type StoreLookupProduct } from "../api/productsApi";
import { useCartStore } from "../../stores/cartStore";
import { upsertStockEntries } from "../stockService";
import { setLocalPrice, upsertLocalProduct } from "../offline/scan";
import { enqueueEvent } from "../offline/outbox";
import { isOnline } from "../networkStatus";
import { uuidv4 } from "../../utils/uuid";

export type SellFirstOnboardingInput = {
  barcode: string;
  format?: string;
  sellPriceMinor: number;
  purchasePriceMinor?: number;
  initialStock: number;
  name?: string | null;
};

const resolveDisplayName = (product: StoreLookupProduct, fallback: string): string => {
  const display = product.store_display_name?.trim() || product.global_name?.trim();
  return display || fallback;
};

const resolveAvailableQty = (product: StoreLookupProduct, fallback: number): number => {
  if (Number.isFinite(product.available_qty)) {
    return Math.max(0, Math.floor(product.available_qty));
  }
  return Math.max(0, Math.floor(fallback));
};

async function cacheLocalProduct(params: {
  barcode: string;
  name: string;
  priceMinor?: number | null;
}): Promise<void> {
  try {
    await upsertLocalProduct(params.barcode, params.name, "INR", null);
    if (params.priceMinor !== null && params.priceMinor !== undefined) {
      await setLocalPrice(params.barcode, params.priceMinor);
    }
  } catch {
    // Local cache updates should not block onboarding.
  }
}

export async function submitSellFirstOnboarding(
  input: SellFirstOnboardingInput
): Promise<StoreLookupProduct> {
  const barcode = input.barcode.trim();
  if (!barcode) {
    throw new Error("barcode is required");
  }

  const sellPriceMinor = Math.round(input.sellPriceMinor);
  const initialStock = Math.max(1, Math.round(input.initialStock));
  if (!Number.isFinite(sellPriceMinor) || sellPriceMinor <= 0) {
    throw new Error("invalid_sell_price");
  }
  if (!Number.isFinite(initialStock) || initialStock <= 0) {
    throw new Error("invalid_initial_stock");
  }

  let purchasePriceMinor: number | null = null;
  if (typeof input.purchasePriceMinor === "number") {
    const rounded = Math.round(input.purchasePriceMinor);
    if (!Number.isFinite(rounded) || rounded <= 0) {
      throw new Error("invalid_purchase_price");
    }
    purchasePriceMinor = rounded;
  }
  const resolvedPurchasePrice = purchasePriceMinor ?? sellPriceMinor;
  const resolvedName = input.name?.trim() || barcode;

  if (await isOnline()) {
    const product = await receiveStoreProductFromScan({
      scanned: barcode,
      format: input.format,
      sellPriceMinor,
      initialStock,
      purchasePriceMinor: purchasePriceMinor ?? undefined,
      globalName: input.name ?? null,
      storeDisplayName: input.name ?? null
    });

    const displayName = resolveDisplayName(product, resolvedName);
    const priceMinor =
      typeof product.sell_price === "number" && product.sell_price > 0
        ? product.sell_price
        : sellPriceMinor;
    const availableQty = resolveAvailableQty(product, initialStock);

    upsertStockEntries([
      { key: product.global_product_id, stock: availableQty },
      { key: barcode, stock: availableQty }
    ]);

    useCartStore.getState().addItem({
      id: product.global_product_id,
      name: displayName,
      priceMinor,
      currency: "INR",
      barcode,
      metadata: {
        globalProductId: product.global_product_id,
        globalName: product.global_name,
        storeDisplayName: product.store_display_name,
        scanFormat: input.format ?? null,
        availableQty
      }
    });

    await cacheLocalProduct({ barcode, name: displayName, priceMinor });

    return product;
  }

  const purchaseId = uuidv4();
  const createdAt = new Date().toISOString();
  const totalMinor = resolvedPurchasePrice * initialStock;

  await enqueueEvent("PURCHASE_SUBMIT", {
    purchaseId,
    supplierName: null,
    items: [
      {
        barcode,
        globalProductId: null,
        scanFormat: input.format ?? null,
        name: resolvedName,
        quantity: initialStock,
        purchasePriceMinor: resolvedPurchasePrice,
        sellingPriceMinor: sellPriceMinor,
        currency: "INR"
      }
    ],
    totalMinor,
    createdAt
  });

  upsertStockEntries([{ key: barcode, stock: initialStock }]);

  useCartStore.getState().addItem({
    id: barcode,
    name: resolvedName,
    priceMinor: sellPriceMinor,
    currency: "INR",
    barcode,
    metadata: {
      globalProductId: null,
      globalName: resolvedName,
      storeDisplayName: resolvedName,
      scanFormat: input.format ?? null,
      availableQty: initialStock
    }
  });

  await cacheLocalProduct({ barcode, name: resolvedName, priceMinor: sellPriceMinor });

  return {
    global_product_id: barcode,
    global_name: resolvedName,
    store_display_name: resolvedName,
    sell_price: sellPriceMinor,
    purchase_price: resolvedPurchasePrice,
    unit: null,
    variant: null,
    available_qty: initialStock,
    is_first_time_in_store: true
  };
}
