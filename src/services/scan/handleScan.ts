import { ApiError } from "../api/apiClient";
import { lookupProductByBarcode, resolveScan, type ScanProduct } from "../api/scanApi";
import { setLocalPrice, upsertLocalProduct } from "../offline/scan";
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

export function setScanRuntime(next: Partial<ScanRuntime>): void {
  runtime = { ...runtime, ...next };
}

function notify(notice: ScanNotice | null): void {
  runtime.onNotice?.(notice);
}

function isDuplicate(barcode: string): boolean {
  const key = `${runtime.intent}:${runtime.mode}:${barcode}`;
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

function addToSellCart(product: ScanProduct, priceMinor: number, flags?: string[]): void {
  useCartStore.getState().addItem({
    id: product.id,
    name: product.name,
    priceMinor,
    currency: product.currency,
    barcode: product.barcode,
    flags
  });
}

async function cacheLocalProduct(product: ScanProduct): Promise<void> {
  try {
    await upsertLocalProduct(product.barcode, product.name, product.currency, null);
    if (product.priceMinor !== null) {
      await setLocalPrice(product.barcode, product.priceMinor);
    }
  } catch {
    // Local cache updates should not block scans.
  }
}

export async function handleScan(barcode: string): Promise<void> {
  const trimmed = barcode.trim();
  if (!trimmed) return;

  if (isDuplicate(trimmed)) return;

  if (runtime.storeActive === false) {
    notify({ tone: "error", message: POS_MESSAGES.storeInactive });
    return;
  }

  if (isScanStorm()) {
    return;
  }

  notify(null);

  try {
    if (runtime.intent === "PURCHASE") {
      const product = await lookupProductByBarcode(trimmed);
      if (product) {
        await cacheLocalProduct(product);
      }
      usePurchaseDraftStore.getState().addOrUpdate({
        id: product?.id ?? trimmed,
        barcode: trimmed,
        name: product?.name ?? "",
        currency: product?.currency ?? "INR",
        sellingPriceMinor: product?.priceMinor ?? null,
        purchasePriceMinor: null,
        isNew: !product
      });
      return;
    }

    const result = await resolveScan({ scanValue: trimmed, mode: runtime.mode });

    if (result.action === "IGNORED") {
      return;
    }

    if (runtime.mode === "DIGITISE") {
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

      if (autoCreated) {
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
