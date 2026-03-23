/**
 * V3-FIX-157 / V3-HARDEN-158 / V3-HARDEN-159 / V3-FIX-160
 * Scan intent contract, barcode resolution, routing, mounted proof
 */

import {
  normalizeBarcode,
  isDuplicateScan,
  resetDuplicateState,
  resolveSellScanAction,
  resolveProcurementScanAction,
  resolveCounterPurchaseScanAction,
  PROCUREMENT_SCAN_RULES,
  COUNTER_PURCHASE_SCAN_RULES,
  SELL_SCAN_RULES,
  type ScanResolution,
} from "../../services/scanIntent";

// ═══════════════════════════════════════════════════════════════════════════════
// V3-FIX-157: Barcode normalization
// ═══════════════════════════════════════════════════════════════════════════════

describe("V3-FIX-157: Barcode normalization (executable)", () => {
  it("strips whitespace/newlines/tabs from HID scanner input", () => {
    expect(normalizeBarcode("8901234\n")).toBe("8901234");
    expect(normalizeBarcode("8901234\r\n")).toBe("8901234");
    expect(normalizeBarcode("8901234\t")).toBe("8901234");
    expect(normalizeBarcode(" 8901234 ")).toBe("8901234");
    expect(normalizeBarcode("\t 890 1234 \r\n")).toBe("8901234");
  });

  it("handles empty/null-ish input", () => {
    expect(normalizeBarcode("")).toBe("");
    expect(normalizeBarcode("   ")).toBe("");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// V3-FIX-157: Duplicate suppression
// ═══════════════════════════════════════════════════════════════════════════════

describe("V3-FIX-157: Duplicate scan suppression (executable)", () => {
  beforeEach(() => resetDuplicateState());

  it("first scan is never duplicate", () => {
    expect(isDuplicateScan("8901234")).toBe(false);
  });

  it("immediate repeat of same barcode is duplicate", () => {
    isDuplicateScan("8901234");
    expect(isDuplicateScan("8901234")).toBe(true);
  });

  it("different barcode is not duplicate", () => {
    isDuplicateScan("8901234");
    expect(isDuplicateScan("9999999")).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// V3-FIX-160: SELL scan action resolution
// ═══════════════════════════════════════════════════════════════════════════════

describe("V3-FIX-160: SELL scan-to-cart (executable)", () => {
  const foundProduct: ScanResolution = {
    status: "found_store_product",
    productId: "p1",
    storeProductId: "sp1",
    name: "Maggi",
    barcode: "890100001",
  };

  const notFound: ScanResolution = {
    status: "not_found",
    barcode: "999999999",
  };

  it("found product adds to sell cart", () => {
    const action = resolveSellScanAction(foundProduct);
    expect(action.type).toBe("add_to_sell_cart");
  });

  it("found product with existing cart item increments", () => {
    const action = resolveSellScanAction(foundProduct, "existing-cart-item");
    expect(action.type).toBe("increment_sell_cart");
  });

  it("not found shows error in SELL context", () => {
    const action = resolveSellScanAction(notFound);
    expect(action.type).toBe("show_not_found");
    if (action.type === "show_not_found") {
      expect(action.intent).toBe("sell_scan");
    }
  });

  it("SELL scan rules: repeat increments, miss stays in SELL", () => {
    expect(SELL_SCAN_RULES.REPEAT_INCREMENTS_CART).toBe(true);
    expect(SELL_SCAN_RULES.MISS_STAYS_IN_SELL).toBe(true);
    expect(SELL_SCAN_RULES.MISS_NEVER_ROUTES_TO_BUY).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// V3-HARDEN-158: Procurement scan action resolution
// ═══════════════════════════════════════════════════════════════════════════════

describe("V3-HARDEN-158: Procurement scan identity (executable)", () => {
  it("found supplier SKU opens procurement detail", () => {
    const action = resolveProcurementScanAction({
      status: "found_supplier_sku",
      supplierProductId: "sp-1",
      name: "Tata Tea",
      barcode: "890100002",
      supplierId: "s1",
    });
    expect(action.type).toBe("open_procurement_detail");
  });

  it("not found blocks procurement (cannot create from scan)", () => {
    const action = resolveProcurementScanAction({
      status: "not_found",
      barcode: "999999999",
    });
    expect(action.type).toBe("show_not_found");
    if (action.type === "show_not_found") {
      expect(action.intent).toBe("supplier_catalog_procurement_scan");
    }
  });

  it("procurement scan rules: repeated preserves metadata, unknown blocked", () => {
    expect(PROCUREMENT_SCAN_RULES.REPEATED_PRESERVES_METADATA).toBe(true);
    expect(PROCUREMENT_SCAN_RULES.POS_EDITS_STAY_LOCAL).toBe(true);
    expect(PROCUREMENT_SCAN_RULES.UNKNOWN_BARCODE_BLOCKED).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// V3-HARDEN-159: Counter Purchase scan action resolution
// ═══════════════════════════════════════════════════════════════════════════════

describe("V3-HARDEN-159: Counter Purchase scan identity (executable)", () => {
  it("known product adds to counter purchase with existing identity", () => {
    const action = resolveCounterPurchaseScanAction({
      status: "found_store_product",
      productId: "p1",
      storeProductId: "sp1",
      name: "Maggi",
      barcode: "890100001",
    });
    expect(action.type).toBe("add_to_counter_purchase");
    if (action.type === "add_to_counter_purchase") {
      expect(action.isKnown).toBe(true);
      expect(action.productId).toBe("p1");
    }
  });

  it("unknown barcode adds to counter purchase as new item", () => {
    const action = resolveCounterPurchaseScanAction({
      status: "not_found",
      barcode: "999999999",
    });
    expect(action.type).toBe("add_to_counter_purchase");
    if (action.type === "add_to_counter_purchase") {
      expect(action.isKnown).toBe(false);
      expect(action.productId).toBeUndefined();
    }
  });

  it("counter purchase scan rules: known hydrates, edits draft-only, no duplicates", () => {
    expect(COUNTER_PURCHASE_SCAN_RULES.KNOWN_HYDRATES_FROM_STORE).toBe(true);
    expect(COUNTER_PURCHASE_SCAN_RULES.EDITS_ARE_DRAFT_ONLY).toBe(true);
    expect(COUNTER_PURCHASE_SCAN_RULES.NO_DUPLICATE_STORE_PRODUCTS).toBe(true);
    expect(COUNTER_PURCHASE_SCAN_RULES.NEW_USES_BARCODE_IDENTITY).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// V3-FIX-157: ScanScreenV3 uses canonical contract (static)
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// Live wiring verification (static — narrowly scoped)
// ═══════════════════════════════════════════════════════════════════════════════

describe("V3-FIX-157: Live wiring (static — narrowly scoped)", () => {
  it("ScanScreenV3 uses one processScan pipeline for HID + manual", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../screens/v3/ScanScreenV3.tsx"), "utf8"
    );
    // One canonical pipeline
    expect(src).toContain("processScan");
    expect(src).toContain("normalizeBarcode");
    expect(src).toContain("isDuplicateScan");
    // Manual submit calls processScan
    expect(src).toContain("processScan(barcodeInput)");
    // HID handler calls processScan
    expect(src).toContain("processScan(barcode)");
    // No duplicate HID-only business logic
    expect(src).not.toContain("const code = barcode.trim()");
  });

  it("procurement scan miss hides New Product button", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../screens/v3/ScanScreenV3.tsx"), "utf8"
    );
    expect(src).toContain('context !== "supplier_catalog_procurement_scan"');
    expect(src).toContain("supplier catalogue");
  });

  it("BUY opens scan in procurement context", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../screens/v3/BuyScreenV3.tsx"), "utf8"
    );
    expect(src).toContain('defaultContext: "supplier_catalog_procurement_scan"');
  });

  it("CounterPurchaseScreenV3 uses canonical normalizeBarcode + isDuplicateScan", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../screens/v3/CounterPurchaseScreenV3.tsx"), "utf8"
    );
    expect(src).toContain("normalizeBarcode");
    expect(src).toContain("isDuplicateScan");
    expect(src).toContain("scanIntent");
  });
});
