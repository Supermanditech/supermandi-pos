/**
 * V3-FIX-157: Canonical scan-intent contract
 *
 * One unified scan pipeline for all scan entry points:
 * - HID barcode scanner
 * - Mobile camera scan
 * - Manual barcode text entry
 *
 * Three approved scan intents:
 * 1. sell_scan — Add scanned product to SELL cart
 * 2. procurement_scan — Identify product for supplier-catalog purchase
 * 3. counter_purchase_scan — Identify product for direct local inward
 *
 * V3-HARDEN-158: Procurement scan identity rules
 * V3-HARDEN-159: Counter Purchase scan identity rules
 * V3-FIX-160: SELL scan-to-cart rules
 */

/**
 * Scan intent — determines what happens after a barcode is resolved.
 */
export type ScanIntent =
  | "sell_scan"
  | "supplier_catalog_procurement_scan"
  | "counter_purchase_scan"
  | "stock_in";

/**
 * Scan input source — all three resolve through the same pipeline.
 */
export type ScanSource = "hid_scanner" | "camera" | "manual_entry";

/**
 * Product resolution result after scanning.
 */
export type ScanResolution =
  | { status: "found_store_product"; productId: string; storeProductId: string; name: string; barcode: string }
  | { status: "found_catalog_product"; productId: string; name: string; barcode: string }
  | { status: "found_supplier_sku"; supplierProductId: string; name: string; barcode: string; supplierId: string }
  | { status: "not_found"; barcode: string };

/**
 * Scan result — combines resolution with intent-specific next action.
 */
export interface ScanResult {
  intent: ScanIntent;
  source: ScanSource;
  barcode: string;
  normalizedBarcode: string;
  resolution: ScanResolution;
  action: ScanAction;
  timestamp: number;
}

/**
 * Next action after scan resolution, per intent.
 */
export type ScanAction =
  | { type: "add_to_sell_cart"; productId: string; storeProductId: string }
  | { type: "increment_sell_cart"; productId: string; storeProductId: string }
  | { type: "open_sell_detail"; productId: string; storeProductId: string }
  | { type: "open_procurement_detail"; supplierProductId: string }
  | { type: "add_to_counter_purchase"; barcode: string; isKnown: boolean; productId?: string }
  | { type: "open_new_product"; barcode: string }
  | { type: "show_not_found"; barcode: string; intent: ScanIntent };

// ═══════════════════════════════════════════════════════════════════════════════
// BARCODE NORMALIZATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Normalize a barcode from any scan source.
 * Strips whitespace, newlines, tabs, trailing CR/LF (HID scanner terminators).
 */
export function normalizeBarcode(raw: string): string {
  return raw.replace(/[\r\n\t\s]/g, "").trim();
}

// ═══════════════════════════════════════════════════════════════════════════════
// DUPLICATE SUPPRESSION
// ═══════════════════════════════════════════════════════════════════════════════

const DEBOUNCE_MS = 300;
let lastScan: { barcode: string; timestamp: number } | null = null;

/**
 * Check if a scan is a duplicate burst (same barcode within debounce window).
 * Returns true if this scan should be suppressed.
 */
export function isDuplicateScan(barcode: string): boolean {
  const now = Date.now();
  if (lastScan && lastScan.barcode === barcode && now - lastScan.timestamp < DEBOUNCE_MS) {
    return true;
  }
  lastScan = { barcode, timestamp: now };
  return false;
}

/**
 * Reset duplicate suppression state (for testing).
 */
export function resetDuplicateState(): void {
  lastScan = null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTENT-SPECIFIC ACTION RESOLUTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * V3-FIX-160: Determine SELL scan action based on resolution.
 * - Found store product → add/increment cart line
 * - Not found → show not-found with option to create
 */
export function resolveSellScanAction(
  resolution: ScanResolution,
  existingCartItemId?: string
): ScanAction {
  if (resolution.status === "found_store_product") {
    if (existingCartItemId) {
      return { type: "increment_sell_cart", productId: resolution.productId, storeProductId: resolution.storeProductId };
    }
    return { type: "add_to_sell_cart", productId: resolution.productId, storeProductId: resolution.storeProductId };
  }
  return { type: "show_not_found", barcode: resolution.barcode, intent: "sell_scan" };
}

/**
 * V3-HARDEN-158: Determine procurement scan action based on resolution.
 * - Found supplier SKU → open procurement detail
 * - Not found → show not-found (cannot create from procurement scan)
 */
export function resolveProcurementScanAction(resolution: ScanResolution): ScanAction {
  if (resolution.status === "found_supplier_sku") {
    return { type: "open_procurement_detail", supplierProductId: resolution.supplierProductId };
  }
  return { type: "show_not_found", barcode: resolution.barcode, intent: "supplier_catalog_procurement_scan" };
}

/**
 * V3-HARDEN-159: Determine Counter Purchase scan action based on resolution.
 * - Found known product → add to inward with existing metadata
 * - Not found → add to inward as new item (operator fills details)
 */
export function resolveCounterPurchaseScanAction(resolution: ScanResolution): ScanAction {
  if (resolution.status === "found_store_product" || resolution.status === "found_catalog_product") {
    return {
      type: "add_to_counter_purchase",
      barcode: resolution.barcode,
      isKnown: true,
      productId: resolution.productId,
    };
  }
  return {
    type: "add_to_counter_purchase",
    barcode: resolution.barcode,
    isKnown: false,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// V3-HARDEN-158: PROCUREMENT SCAN IDENTITY RULES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Procurement scan identity rules:
 * - Repeated mapped item: preserve existing store product identity + metadata
 * - New-to-store catalog SKU: link via supplier_product_map, assign taxonomy
 * - Unknown SKU: not actionable from procurement scan (must use Counter Purchase)
 */
export const PROCUREMENT_SCAN_RULES = {
  /** Repeated item preserves store-local metadata */
  REPEATED_PRESERVES_METADATA: true,
  /** POS edits do NOT propagate back to catalog truth */
  POS_EDITS_STAY_LOCAL: true,
  /** Unknown barcodes cannot create products from procurement scan */
  UNKNOWN_BARCODE_BLOCKED: true,
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// V3-HARDEN-159: COUNTER PURCHASE SCAN IDENTITY RULES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Counter Purchase scan identity rules:
 * - Known product: hydrate with existing store metadata, allow operator edits
 * - New product: create with operator-provided details, mark as new
 * - Edits before confirm: purchase-only snapshot, does NOT update store master
 * - Store master update: only after explicit store-product save action
 */
export const COUNTER_PURCHASE_SCAN_RULES = {
  /** Known products hydrate from store master */
  KNOWN_HYDRATES_FROM_STORE: true,
  /** Edits are purchase-snapshot only until explicit save */
  EDITS_ARE_DRAFT_ONLY: true,
  /** Repeated barcode does NOT create duplicate store products */
  NO_DUPLICATE_STORE_PRODUCTS: true,
  /** New products get provisional identity with barcode */
  NEW_USES_BARCODE_IDENTITY: true,
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// V3-FIX-160: SELL SCAN-TO-CART RULES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * SELL scan-to-cart barcode precedence:
 * 1. Store override barcode (store_product_barcodes)
 * 2. Manufacturer barcode (products.primary_barcode)
 * 3. Generated SuperMandi/store label barcode
 *
 * Repeat scan behavior:
 * - Same barcode within session → increment existing cart line
 * - NOT create duplicate cart items
 *
 * Scan miss behavior:
 * - Show "not found" with option to create new product
 * - MUST NOT drift into procurement or counter purchase flow
 */
export const SELL_SCAN_RULES = {
  /** Barcode lookup precedence */
  BARCODE_PRECEDENCE: ["store_override", "manufacturer", "generated_label"] as const,
  /** Repeat scan increments cart, not duplicates */
  REPEAT_INCREMENTS_CART: true,
  /** Scan miss stays in SELL context */
  MISS_STAYS_IN_SELL: true,
  /** Scan miss does NOT auto-route to procurement */
  MISS_NEVER_ROUTES_TO_BUY: true,
} as const;
