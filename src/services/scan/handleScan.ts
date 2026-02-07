import { Alert, ToastAndroid, Platform } from "react-native";
import { ApiError } from "../api/apiClient";
import {
  createStoreProductFromScan,
  lookupStoreProductByScan,
  lookupStoreProductPreviewByScan,
  type StoreLookupProduct
} from "../api/productsApi";
import { lookupProductByBarcode, resolveScan, type ScanProduct, type StoreProductResponse } from "../api/scanApi";
import { isOnline } from "../networkStatus";
import { resolveOfflineScan, setLocalPrice, upsertLocalProduct } from "../offline/scan";
import { useCartStore } from "../../stores/cartStore";
import { usePurchaseDraftStore } from "../../stores/purchaseDraftStore";
import { POS_MESSAGES } from "../../utils/uiStatus";
import { upsertStockEntries } from "../stockService";

type ScanIntent = "SELL" | "PURCHASE";
type ScanMode = "SELL" | "DIGITISE";

export type ScanNotice = {
  tone: "info" | "warning" | "error";
  message: string;
};

export type SellFirstOnboardingRequest = {
  barcode: string;
  format?: string;
  product: StoreLookupProduct;
};

export type AddStoreProductRequest = {
  barcode: string;
  format?: string;
  product: StoreLookupProduct;
  priceMinor: number;
};

export type ScanRuntime = {
  intent: ScanIntent;
  mode: ScanMode;
  storeActive?: boolean | null;
  scanLookupV2Enabled?: boolean;
  digitisationFlowEnabled?: boolean;
  onNotice?: (notice: ScanNotice | null) => void;
  onSellFirstOnboarding?: (request: SellFirstOnboardingRequest) => void;
  onAddStoreProduct?: (request: AddStoreProductRequest) => void;
  sellFirstOnboardingActive?: boolean;
  addStoreProductActive?: boolean;
  onDeviceAuthError?: (error: ApiError) => Promise<boolean> | boolean;
  onStoreInactive?: () => void;
};

// GL-CRIT-0045: Unified duplicate detection window (consolidated from two overlapping windows)
// ISSUE-MICRO-073: Increased from 1000ms to 2000ms for low-end phones with slow processing.
// On budget Android devices (Redmi etc.), barcode scanner callbacks can fire twice within 1000ms
// due to slow JS thread processing, causing duplicate cart additions.
const DUPLICATE_WINDOW_MS = 2000;
// GL-CRIT-0024: Per-barcode storm detection to allow rapid scanning of different items
// ISSUE-MICRO-074: Tuned thresholds — raised max from 5→8 to reduce false positives on
// budget phones where scanner callbacks fire multiple times per physical scan.
// Reduced cooldown from 1500→1000ms for faster recovery.
const STORM_WINDOW_MS = 2000;
const STORM_MAX_SCANS_PER_BARCODE = 8;
const STORM_COOLDOWN_MS = 1000;
let runtime: ScanRuntime = { intent: "SELL", mode: "SELL" };
let lastScan: { key: string; ts: number } | null = null;
// GL-CRIT-0024: Track scans per barcode instead of globally
const recentScansByBarcode = new Map<string, number[]>();
const stormUntilByBarcode = new Map<string, number>();
let lastStormNotice = 0;
const warnedNewItems = new Set<string>();
let purchaseConfirmActive = false;

type CartScanProduct = ScanProduct & { metadata?: Record<string, any> };

export function needsSellFirstOnboarding(product: StoreLookupProduct | null): boolean {
  if (!product) return true;

  // Only require onboarding if sell price is missing
  // If product has a valid sell price, add directly to cart
  const sellPrice = typeof product.sell_price === "number" ? product.sell_price : 0;
  const hasSellPrice = Number.isFinite(sellPrice) && sellPrice > 0;

  return !hasSellPrice;
}

export function setScanRuntime(next: Partial<ScanRuntime>): void {
  runtime = { ...runtime, ...next };
}

// GL-CRIT-0045: Deprecated - duplicate guard consolidated into isDuplicate()
// Kept for backwards compatibility but does nothing
export function setScanDuplicateGuardWindowMs(_windowMs: number): void {
  // No-op: duplicate detection now uses single DUPLICATE_WINDOW_MS
}

function notify(notice: ScanNotice | null): void {
  runtime.onNotice?.(notice);
}

// GL-CRIT-0045: Unified duplicate detection - checks barcode+intent+mode
function isDuplicate(barcode: string, intent: ScanIntent, mode: ScanMode): boolean {
  const key = `${intent}:${mode}:${barcode}`;
  const now = Date.now();
  if (lastScan && lastScan.key === key && now - lastScan.ts < DUPLICATE_WINDOW_MS) {
    return true;
  }
  lastScan = { key, ts: now };
  return false;
}

// GL-CRIT-0024: Per-barcode storm detection
// Only blocks if the SAME barcode is scanned too rapidly
function isScanStorm(barcode: string): boolean {
  const now = Date.now();
  const key = barcode.toUpperCase();

  // Check if this specific barcode is in cooldown
  const cooldownUntil = stormUntilByBarcode.get(key) ?? 0;
  if (now < cooldownUntil) {
    return true;
  }

  // Get or create scan history for this barcode
  let scans = recentScansByBarcode.get(key) ?? [];
  scans = scans.filter((ts) => now - ts < STORM_WINDOW_MS);
  scans.push(now);
  recentScansByBarcode.set(key, scans);

  // Check if this barcode has been scanned too many times
  if (scans.length > STORM_MAX_SCANS_PER_BARCODE) {
    stormUntilByBarcode.set(key, now + STORM_COOLDOWN_MS);
    if (now - lastStormNotice > STORM_COOLDOWN_MS) {
      lastStormNotice = now;
      notify({ tone: "warning", message: POS_MESSAGES.scanStorm });
    }
    return true;
  }

  // Cleanup old entries periodically (every 100 scans)
  if (recentScansByBarcode.size > 100) {
    for (const [k, timestamps] of recentScansByBarcode.entries()) {
      const filtered = timestamps.filter((ts) => now - ts < STORM_WINDOW_MS);
      if (filtered.length === 0) {
        recentScansByBarcode.delete(k);
        stormUntilByBarcode.delete(k);
      }
    }
  }

  return false;
}

function addToSellCart(product: CartScanProduct, priceMinor: number, flags?: string[]): boolean {
  try {
    // Validate product data
    if (!product) {
      console.error("addToSellCart: product is null/undefined");
      return false;
    }

    const cartState = useCartStore.getState();
    const cartItems = cartState.items || [];
    const productBarcode = product.barcode;
    const productId = product.id;

    // Validate we have at least an id
    if (!productId) {
      console.error("addToSellCart: product.id is missing");
      if (Platform.OS === "android") {
        ToastAndroid.show("Cannot add item: missing product ID", ToastAndroid.SHORT);
      }
      return false;
    }

    // GL-CRIT-0046: Block items with invalid or zero price
    const safePriceMinor = typeof priceMinor === "number" && Number.isFinite(priceMinor) ? priceMinor : 0;

    // POS-SELL-001: Check by productId first (stable identifier), then barcode as fallback.
    // This ensures the same product with multiple barcodes (EAN + internal) merges
    // into a single cart line instead of creating duplicates.
    let existingItem = null;
    if (productId) {
      existingItem = cartItems.find((item) => item.id === productId);
    }
    if (!existingItem && productBarcode && typeof productBarcode === "string" && productBarcode.trim()) {
      existingItem = cartItems.find((item) => item.barcode === productBarcode);
    }

    if (existingItem) {
      // POS-SELL-001: Item already in cart — increment quantity via addItem (respects stock caps)
      console.log(`scan_increment_in_cart:${productBarcode || productId}`);
      cartState.addItem({
        id: existingItem.id,
        name: product.name || existingItem.name,
        priceMinor: safePriceMinor > 0 ? safePriceMinor : existingItem.priceMinor,
        currency: product.currency || existingItem.currency || "INR",
        barcode: existingItem.barcode || productBarcode,
        flags,
        metadata: product.metadata,
      });
      return true;
    }

    if (safePriceMinor <= 0) {
      console.warn(`scan_invalid_price:${productBarcode || productId},price=${priceMinor}`);
      if (Platform.OS === "android") {
        ToastAndroid.show("Price not set for this item. Cannot add to cart.", ToastAndroid.LONG);
      } else {
        // For iOS, the caller should handle showing an alert
        console.warn("[Scan] GL-CRIT-0046: Item blocked due to invalid price");
      }
      return false;
    }

    console.log(`scan_add_to_cart:${productBarcode || productId},price=${safePriceMinor}`);
    cartState.addItem({
      id: productId,
      name: product.name || productBarcode || productId,
      priceMinor: safePriceMinor,
      currency: product.currency || "INR",
      barcode: productBarcode,
      flags,
      metadata: product.metadata
    });

    // ISSUE-MICRO-075: Soft stock warning at scan time
    // Show a toast when available stock is low (≤5 units) so the cashier knows
    const availableQty = typeof product.metadata?.availableQty === "number" ? product.metadata.availableQty : null;
    if (availableQty !== null && availableQty <= 5 && availableQty > 0 && Platform.OS === "android") {
      ToastAndroid.show(`Low stock: only ${availableQty} left`, ToastAndroid.SHORT);
    }

    return true;
  } catch (err) {
    console.error("addToSellCart error:", err);
    if (Platform.OS === "android") {
      ToastAndroid.show("Error adding item to cart", ToastAndroid.SHORT);
    }
    return false;
  }
}

export function addStoreProductToCart(product: StoreLookupProduct | StoreProductResponse): boolean {
  // Handle StoreProductResponse type
  if ('storeProductId' in product) {
    const priceMinor = product.sellPrice ?? 0;
    return addToSellCart(
      {
        id: product.storeProductId,
        name: product.name,
        barcode: product.barcode,
        priceMinor,
        currency: "INR",
        metadata: {
          storeProductId: product.storeProductId,
          brand: product.brand,
          variant: product.variant,
          availableQty: product.stock?.qty ?? 0
        }
      },
      priceMinor
    );
  }

  // Handle StoreLookupProduct type
  const displayName = resolveDisplayName(product) || product.global_product_id;
  const priceMinor = product.sell_price ?? 0;

  return addToSellCart(
    {
      id: product.global_product_id,
      name: displayName,
      barcode: product.global_product_id,
      priceMinor,
      currency: "INR",
      metadata: {
        globalProductId: product.global_product_id,
        globalName: product.global_name,
        storeDisplayName: product.store_display_name,
        availableQty: product.available_qty
      }
    },
    priceMinor
  );
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

export type ScanSource = "scanner" | "keyboard";

export async function onBarcodeScanned(rawText: string, format?: string, source: ScanSource = "scanner"): Promise<void> {
  try {
    // POS-SCAN-001: Normalize barcode case at entry point
    const trimmed = (rawText?.trim?.() ?? "").toUpperCase();
    if (!trimmed) return;

    console.log(`scan_barcode_received:${trimmed}`);

    // GL-CRIT-0045: Duplicate detection is now done in handleScan() using unified window
    // Previously had a separate "duplicate guard" here that caused confusion

    const intent = runtime.intent;
    console.log(`scan_routed:${intent}`);

    if (intent === "PURCHASE") {
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

    await handleScan(trimmed, format, "SELL", source);
  } catch (err) {
    console.error("onBarcodeScanned error:", err);
    notify({ tone: "error", message: "Scan failed. Please try again." });
  }
}

async function handleScan(
  barcode: string,
  format?: string,
  intentOverride?: ScanIntent,
  source: ScanSource = "scanner"
): Promise<void> {
  // POS-SCAN-001: Normalize barcode case so "abc123" and "ABC123" resolve to same product
  const trimmed = barcode.trim().toUpperCase();
  if (!trimmed) return;
  if (runtime.sellFirstOnboardingActive) return;

  const intent = intentOverride ?? runtime.intent;
  const mode = runtime.mode;

  if (isDuplicate(trimmed, intent, mode)) return;

  if (runtime.storeActive === false) {
    notify({ tone: "error", message: POS_MESSAGES.storeInactive });
    return;
  }

  // GL-CRIT-0024: Per-barcode storm detection
  if (isScanStorm(trimmed)) {
    return;
  }

  notify(null);
  const useScanLookupV2 = runtime.scanLookupV2Enabled === true;

  try {
    if (intent === "SELL" && mode === "SELL" && useScanLookupV2) {
      if (await isOnline()) {
        let storeProduct = await lookupStoreProductPreviewByScan({ scanned: trimmed, format });
        if (!storeProduct) {
          // R3: Pass empty name so the onboarding modal uses search query or shows blank
          // (do NOT use "Item XXXX" placeholder - per go-live requirements)
          storeProduct = {
            global_product_id: trimmed,
            global_name: "",
            store_display_name: "",
            sell_price: null,
            purchase_price: null,
            unit: null,
            variant: null,
            available_qty: 0,
            is_first_time_in_store: true
          };
        }

        if (needsSellFirstOnboarding(storeProduct)) {
          if (storeProduct.is_first_time_in_store) {
            // POS-SCAN-002: Relaxed barcode heuristic — HID scanners report as "keyboard"
            // so we no longer discriminate by source. Accept any input ≥3 chars or containing
            // a digit. Duplicate guard and storm detection handle spurious inputs.
            const looksLikeBarcode = /\d/.test(trimmed) || trimmed.length >= 3;
            if (!looksLikeBarcode) {
              notify({ tone: "info", message: "Product not found" });
              return;
            }
          }
          console.log(`scan_needs_onboarding:${trimmed},sellPrice=${storeProduct.sell_price},isNew=${storeProduct.is_first_time_in_store}`);
          runtime.onSellFirstOnboarding?.({ barcode: trimmed, format, product: storeProduct });
          return;
        }

        const displayName = resolveDisplayName(storeProduct) || trimmed;
        const priceMinor = storeProduct.sell_price ?? 0;
        upsertStockEntries([
          { key: storeProduct.global_product_id, stock: storeProduct.available_qty },
          { key: trimmed, stock: storeProduct.available_qty }
        ]);
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
              scanFormat: format ?? null,
              availableQty: storeProduct.available_qty
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

      if (offline.action === "PROMPT_PRICE") {
        if (offline.product_not_found_for_store === true) {
          // Product not found — only open modal for genuine barcode scans
          const looksLikeBarcode = /\d/.test(trimmed) || trimmed.length >= 8;
          if (source === "keyboard" || !looksLikeBarcode) {
            notify({ tone: "info", message: "Product not found" });
            return;
          }
        }
        const offlineProduct: StoreLookupProduct = {
          global_product_id: trimmed,
          global_name: offline.product.name,
          store_display_name: offline.product.name,
          sell_price: offline.product.priceMinor ?? null,
          purchase_price: null,
          unit: null,
          variant: null,
          available_qty: 0,
          is_first_time_in_store: offline.product_not_found_for_store === true
        };
        runtime.onSellFirstOnboarding?.({ barcode: trimmed, format, product: offlineProduct });
        return;
      }

      if (offline.action === "ADD_TO_CART") {
        const priceMinor = offline.product.priceMinor ?? 0;
        addToSellCart(
          {
            id: offline.product.barcode,
            name: offline.product.name || offline.product.barcode,
            barcode: offline.product.barcode,
            priceMinor: offline.product.priceMinor,
            currency: offline.product.currency ?? "INR",
            metadata: {
              storeProductId: offline.product.storeProductId || undefined,
              productId: offline.product.productId || undefined,
            },
          },
          priceMinor
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
          storeProduct = await createStoreProductFromScan({
            scanned: trimmed,
            format,
            globalName: null,
            storeDisplayName: null
          });
        }

        const displayName = resolveDisplayName(storeProduct) || trimmed;
        upsertStockEntries([
          { key: storeProduct.global_product_id, stock: storeProduct.available_qty },
          { key: trimmed, stock: storeProduct.available_qty }
        ]);
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

    if (result.action === "PROMPT_PRICE") {
      if (source === "keyboard" && result.product_not_found_for_store === true) {
        notify({ tone: "info", message: "Product not found" });
        return;
      }
      const productName = result.product.name?.trim() || "";
      runtime.onSellFirstOnboarding?.({
        barcode: trimmed,
        format,
        product: {
          global_product_id: trimmed,
          global_name: productName,
          store_display_name: productName,
          sell_price: result.product.priceMinor ?? null,
          purchase_price: null,
          unit: null,
          variant: null,
          available_qty: 0,
          is_first_time_in_store: result.product_not_found_for_store === true
        }
      });
      return;
    }

    if (result.action === "ADD_TO_CART") {
      await cacheLocalProduct(result.product);
      const priceMinor = result.product.priceMinor ?? 0;

      // SD-ONBOARD-002C: Upsert stock for cart cap check
      if (result.availableStock !== undefined && result.availableStock !== null) {
        upsertStockEntries([
          { key: result.product.id, stock: result.availableStock },
          { key: result.product.barcode, stock: result.availableStock }
        ]);
      }

      addToSellCart(result.product, priceMinor);

      const warningKey = trimmed.toUpperCase();
      if (result.product_not_found_for_store === true && !warnedNewItems.has(warningKey)) {
        warnedNewItems.add(warningKey);
        notify({ tone: "warning", message: POS_MESSAGES.newItemWarning });
      }
      return;
    }

    notify({ tone: "error", message: "Unable to add item from scan." });
  } catch (error) {
    console.error("handleScan error:", error);
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
    // Log non-API errors for debugging
    if (!(error instanceof ApiError)) {
      console.error("handleScan non-API error:", String(error));
    }
    notify({ tone: "error", message: "Could not resolve scan. Check connection." });
  }
}
