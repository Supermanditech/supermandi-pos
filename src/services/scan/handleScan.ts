import { ApiError } from "../api/apiClient";
import { lookupProductByBarcode, resolveScan, type ScanProduct } from "../api/scanApi";
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
let runtime: ScanRuntime = { intent: "SELL", mode: "SELL" };
let lastScan: { key: string; ts: number } | null = null;

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

function addToSellCart(product: ScanProduct, priceMinor: number): void {
  useCartStore.getState().addItem({
    id: product.id,
    name: product.name,
    priceMinor,
    currency: product.currency,
    barcode: product.barcode
  });
}

export async function handleScan(barcode: string): Promise<void> {
  const trimmed = barcode.trim();
  if (!trimmed) return;

  if (isDuplicate(trimmed)) return;

  if (runtime.storeActive === false) {
    notify({ tone: "error", message: POS_MESSAGES.storeInactive });
    return;
  }

  notify(null);

  try {
    if (runtime.intent === "PURCHASE") {
      const product = await lookupProductByBarcode(trimmed);
      usePurchaseDraftStore.getState().addOrUpdate({
        id: product?.id ?? trimmed,
        barcode: trimmed,
        name: product?.name ?? "",
        currency: product?.currency ?? "INR",
        isNew: !product
      });
      return;
    }

    const result = await resolveScan({ scanValue: trimmed, mode: runtime.mode });

    if (result.action === "IGNORED") {
      return;
    }

    if (runtime.mode === "DIGITISE") {
      if (result.action === "ALREADY_DIGITISED") {
        notify({ tone: "info", message: "Already digitised / known." });
        return;
      }
      notify({ tone: "info", message: POS_MESSAGES.digitiseSaved });
      return;
    }

    if (result.action === "ADD_TO_CART" || result.action === "PROMPT_PRICE") {
      const priceMinor = result.product.priceMinor ?? 0;
      addToSellCart(result.product, priceMinor);

      if (result.product.priceMinor === null || result.action === "PROMPT_PRICE") {
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
