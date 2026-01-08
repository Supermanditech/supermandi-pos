import { Alert } from "react-native";
import { ApiError } from "../api/apiClient";
import {
  createStoreProductFromScan,
  lookupStoreProductByScan,
  type StoreLookupProduct
} from "../api/productsApi";
import { lookupProductByBarcode, resolveScan, type ScanProduct } from "../api/scanApi";
import { isOnline } from "../networkStatus";
import { resolveOfflineScan, setLocalPrice, upsertLocalProduct } from "../offline/scan";
import { getLastPosMode } from "../posMode";
import { useCartStore } from "../../stores/cartStore";
import { usePurchaseDraftStore } from "../../stores/purchaseDraftStore";
import { POS_MESSAGES } from "../../utils/uiStatus";

type ScanIntent = "SELL" | "PURCHASE";
type ScanMode = "SELL" | "DIGITISE";

export type ScanNotice = {
  tone: "info" | "warning" | "error";
  message: string;
};

type ScanRuntime = {
  intent: ScanIntent;
  mode: ScanMode;
  storeActive?: boolean | null;
  scanLookupV2Enabled?: boolean;
  onNotice?: (notice: ScanNotice | null) => void;
  onDeviceAuthError?: (error: ApiError) => Promise<boolean> | boolean;
  onStoreInactive?: () => void;
};

const DUPLICATE_WINDOW_MS = 500;
const STORM_WINDOW_MS = 2000;
const STORM_MAX_SCANS = 12;
const STORM_COOLDOWN_MS = 1500;
let runtime: ScanRuntime = { intent: "SELL", mode: "SELL" };
let lastScan: { key: string; ts: number } | null = null;
let recentScans: number[] = [];
let stormUntil = 0;
let lastStormNotice = 0;
const warnedNewItems = new Set<string>();
let purchaseConfirmActive = false;

type CartScanProduct = ScanProduct & { metadata?: Record<string, any> };

export function setScanRuntime(next: Partial<ScanRuntime>): void {
  runtime = { ...runtime, ...next };
}

function notify(notice: ScanNotice | null): void {
  runtime.onNotice?.(notice);
}

function isDuplicate(barcode: string, intent: ScanIntent, mode: ScanMode): boolean {
  const key = `${intent}:${mode}:${barcode}`;
  const now = Date.now();
  if (lastScan && lastScan.key === key && now - lastScan.ts < DUPLICATE_WINDOW_MS) {
    return true;
  }
  lastScan = { key, ts: now };
  return false;
}

function isScanStorm(): boolean {
  const now = Date.now();
  recentScans = recentScans.filter((ts) => now - ts < STORM_WINDOW_MS);
  recentScans.push(now);

  if (now < stormUntil) {
    return true;
  }

  if (recentScans.length > STORM_MAX_SCANS) {
    stormUntil = now + STORM_COOLDOWN_MS;
    if (now - lastStormNotice > STORM_COOLDOWN_MS) {
      lastStormNotice = now;
      notify({ tone: "warning", message: POS_MESSAGES.scanStorm });
    }
    return true;
  }

  return false;
}

function addToSellCart(product: CartScanProduct, priceMinor: number, flags?: string[]): void {
  const cartState = useCartStore.getState();
  const match =
    product.barcode
      ? cartState.items.find((item) => item.barcode === product.barcode)
      : undefined;
  const resolvedId = match?.id ?? product.id;

  cartState.addItem({
    id: resolvedId,
    name: product.name,
    priceMinor,
    currency: product.currency,
    barcode: product.barcode,
    flags,
    metadata: product.metadata
  });
}

async function cacheLocalProduct(product: {
  barcode: string;
  name: string;
  currency?: string;
  priceMinor?: number | null;
}): Promise<void> {
  try {
    await upsertLocalProduct(product.barcode, product.name, product.currency ?? "INR", null);
    if (product.priceMinor !== null && product.priceMinor !== undefined) {
      await setLocalPrice(product.barcode, product.priceMinor);
    }
  } catch {
    // Local cache updates should not block scans.
  }
}

function buildFallbackName(barcode: string): string {
  const suffix = barcode.slice(-4);
  return `Item ${suffix || barcode}`;
}

function resolveDisplayName(product: StoreLookupProduct): string {
  const trimmed = product.store_display_name?.trim();
  if (trimmed) return trimmed;
  return product.global_name?.trim() || "";
}

function confirmPurchaseAdd(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      "Add to Purchase",
      "Add scanned item to purchase list?",
      [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        { text: "Add", onPress: () => resolve(true) }
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}

export async function handleIncomingScan(rawText: string, format?: string): Promise<void> {
  const trimmed = rawText.trim();
  if (!trimmed) return;

  const lastMode = await getLastPosMode();
  if (lastMode === "PURCHASE") {
    if (purchaseConfirmActive) return;
    purchaseConfirmActive = true;
    try {
      const confirmed = await confirmPurchaseAdd();
      if (!confirmed) return;
      await handleScan(trimmed, format, "PURCHASE");
    } finally {
      purchaseConfirmActive = false;
    }
    return;
  }

  await handleScan(trimmed, format, "SELL");
}

export async function handleScan(
  barcode: string,
  format?: string,
  intentOverride?: ScanIntent
): Promise<void> {
  const trimmed = barcode.trim();
  if (!trimmed) return;

  const intent = intentOverride ?? runtime.intent;
  const mode = runtime.mode;

  if (isDuplicate(trimmed, intent, mode)) return;

  if (runtime.storeActive === false) {
    notify({ tone: "error", message: POS_MESSAGES.storeInactive });
    return;
  }

  if (isScanStorm()) {
    return;
  }

  notify(null);
  const useScanLookupV2 = runtime.scanLookupV2Enabled === true;

  try {
    if (intent === "SELL" && mode === "SELL" && useScanLookupV2) {
      if (await isOnline()) {
        let storeProduct = await lookupStoreProductByScan({ scanned: trimmed, format });
        if (!storeProduct) {
          const fallbackName = buildFallbackName(trimmed);
          storeProduct = await createStoreProductFromScan({
            scanned: trimmed,
            format,
            globalName: fallbackName,
            storeDisplayName: fallbackName
          });
        }

        const displayName = resolveDisplayName(storeProduct) || trimmed;
        const priceMinor = storeProduct.sell_price ?? 0;
        addToSellCart(
          {
            id: storeProduct.global_product_id,
            name: displayName,
            barcode: trimmed,
            priceMinor,
            currency: "INR",
            metadata: {
              globalProductId: storeProduct.global_product_id,
              globalName: storeProduct.global_name,
              storeDisplayName: storeProduct.store_display_name,
              scanFormat: format ?? null
            }
          },
          priceMinor
        );

        await cacheLocalProduct({
          barcode: trimmed,
          name: displayName,
          currency: "INR",
          priceMinor:
            typeof storeProduct.sell_price === "number" && storeProduct.sell_price > 0
              ? storeProduct.sell_price
              : null
        });

        const warningKey = trimmed.toUpperCase();
        if (storeProduct.is_first_time_in_store && !warnedNewItems.has(warningKey)) {
          warnedNewItems.add(warningKey);
          notify({ tone: "warning", message: POS_MESSAGES.newItemWarning });
        }
        return;
      }

      const offline = await resolveOfflineScan(trimmed, "SELL");
      if (offline.action === "IGNORED") {
        return;
      }

      if (offline.action === "ADD_TO_CART" || offline.action === "PROMPT_PRICE") {
        const priceMinor = offline.product.priceMinor ?? 0;
        const autoCreated = offline.action === "PROMPT_PRICE" || offline.product.priceMinor === null;
        addToSellCart(
          {
            id: offline.product.barcode,
            name: offline.product.name || offline.product.barcode,
            barcode: offline.product.barcode,
            priceMinor: offline.product.priceMinor,
            currency: offline.product.currency ?? "INR"
          },
          priceMinor,
          autoCreated ? ["SELL_AUTO_CREATE"] : undefined
        );

        const warningKey = trimmed.toUpperCase();
        if (offline.product_not_found_for_store === true && !warnedNewItems.has(warningKey)) {
          warnedNewItems.add(warningKey);
          notify({ tone: "warning", message: POS_MESSAGES.newItemWarning });
        }
        return;
      }
    }

    if (intent === "PURCHASE" && useScanLookupV2) {
      if (await isOnline()) {
        let storeProduct = await lookupStoreProductByScan({ scanned: trimmed, format });
        if (!storeProduct) {
          const fallbackName = buildFallbackName(trimmed);
          storeProduct = await createStoreProductFromScan({
            scanned: trimmed,
            format,
            globalName: fallbackName,
            storeDisplayName: fallbackName
          });
        }

        const displayName = resolveDisplayName(storeProduct) || trimmed;
        await cacheLocalProduct({
          barcode: trimmed,
          name: displayName,
          currency: "INR",
          priceMinor:
            typeof storeProduct.sell_price === "number" && storeProduct.sell_price > 0
              ? storeProduct.sell_price
              : null
        });

        usePurchaseDraftStore.getState().addOrUpdate({
          id: storeProduct.global_product_id,
          barcode: trimmed,
          globalProductId: storeProduct.global_product_id,
          scanFormat: format ?? null,
          name: displayName,
          currency: "INR",
          sellingPriceMinor: storeProduct.sell_price ?? null,
          purchasePriceMinor: storeProduct.purchase_price ?? null,
          isNew: storeProduct.is_first_time_in_store
        });
        return;
      }

      const product = await lookupProductByBarcode(trimmed);
      if (product) {
        await cacheLocalProduct(product);
      }
      usePurchaseDraftStore.getState().addOrUpdate({
        id: product?.id ?? trimmed,
        barcode: trimmed,
        globalProductId: null,
        scanFormat: format ?? null,
        name: product?.name ?? "",
        currency: product?.currency ?? "INR",
        sellingPriceMinor: product?.priceMinor ?? null,
        purchasePriceMinor: null,
        isNew: !product
      });
      return;
    }

    if (intent === "PURCHASE") {
      const product = await lookupProductByBarcode(trimmed);
      if (product) {
        await cacheLocalProduct(product);
      }
      usePurchaseDraftStore.getState().addOrUpdate({
        id: product?.id ?? trimmed,
        barcode: trimmed,
        globalProductId: null,
        scanFormat: format ?? null,
        name: product?.name ?? "",
        currency: product?.currency ?? "INR",
        sellingPriceMinor: product?.priceMinor ?? null,
        purchasePriceMinor: null,
        isNew: !product
      });
      return;
    }

    const result = await resolveScan({ scanValue: trimmed, mode });

    if (result.action === "IGNORED") {
      return;
    }

    if (mode === "DIGITISE") {
      if (result.action === "ALREADY_DIGITISED" || result.action === "DIGITISED") {
        await cacheLocalProduct(result.product);
      }
      if (result.action === "ALREADY_DIGITISED") {
        notify({ tone: "info", message: "Already digitised / known." });
        return;
      }
      notify({ tone: "info", message: POS_MESSAGES.digitiseSaved });
      return;
    }

    if (result.action === "ADD_TO_CART" || result.action === "PROMPT_PRICE") {
      await cacheLocalProduct(result.product);
      const priceMinor = result.product.priceMinor ?? 0;
      const autoCreated = result.action === "PROMPT_PRICE" || result.product.priceMinor === null;
      addToSellCart(result.product, priceMinor, autoCreated ? ["SELL_AUTO_CREATE"] : undefined);

      const warningKey = trimmed.toUpperCase();
      if (result.product_not_found_for_store === true && !warnedNewItems.has(warningKey)) {
        warnedNewItems.add(warningKey);
        notify({ tone: "warning", message: POS_MESSAGES.newItemWarning });
      }
      return;
    }

    notify({ tone: "error", message: "Unable to add item from scan." });
  } catch (error) {
    if (error instanceof ApiError) {
      if (runtime.onDeviceAuthError) {
        const handled = await runtime.onDeviceAuthError(error);
        if (handled) return;
      }
      if (error.message === "store_inactive") {
        runtime.onStoreInactive?.();
        notify({ tone: "error", message: POS_MESSAGES.storeInactive });
        return;
      }
      if (error.message === "store_not_found" || error.message === "store not found") {
        notify({ tone: "error", message: "Store not found. Check Superadmin setup." });
        return;
      }
    }
    notify({ tone: "error", message: "Could not resolve scan. Check connection." });
  }
}
