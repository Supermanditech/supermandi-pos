/**
 * V3-HARDEN-130 / V3-FIX-131 / V3-FIX-132 / V3-HARDEN-133 / V3-HARDEN-134
 * Store isolation, search contracts, multilingual search, ledger events, metadata ownership
 */

// ═══════════════════════════════════════════════════════════════════════════════
// V3-HARDEN-130: Store isolation enforcement
// ═══════════════════════════════════════════════════════════════════════════════

import { assertStoreId, assertSearchContext, STORE_ISOLATION_RULES, SEARCH_CONTRACTS } from "../../src/services/storeIsolation";

describe("V3-HARDEN-130: Store isolation (executable)", () => {
  it("assertStoreId passes for valid UUIDs", () => {
    expect(() => assertStoreId("550e8400-e29b-41d4-a716-446655440000", "test")).not.toThrow();
  });

  it("assertStoreId throws for null/empty/undefined", () => {
    expect(() => assertStoreId(null, "test")).toThrow("STORE_ISOLATION_VIOLATION");
    expect(() => assertStoreId("", "test")).toThrow("STORE_ISOLATION_VIOLATION");
    expect(() => assertStoreId(undefined, "test")).toThrow("STORE_ISOLATION_VIOLATION");
    expect(() => assertStoreId("  ", "test")).toThrow("STORE_ISOLATION_VIOLATION");
  });

  it("assertSearchContext accepts SELL and BUY only", () => {
    expect(() => assertSearchContext("SELL")).not.toThrow();
    expect(() => assertSearchContext("BUY")).not.toThrow();
    expect(() => assertSearchContext("BOTH")).toThrow("SEARCH_CONTEXT_VIOLATION");
    expect(() => assertSearchContext("")).toThrow("SEARCH_CONTEXT_VIOLATION");
  });

  it("STORE_ISOLATION_RULES defines all canonical rules", () => {
    expect(STORE_ISOLATION_RULES.SOURCE).toBe("JWT_DERIVED");
    expect(STORE_ISOLATION_RULES.SELL_SEARCH).toContain("store_products");
    expect(STORE_ISOLATION_RULES.BUY_SEARCH).toContain("supplier_store_links");
  });

  it("backend search endpoints use assertStoreId (static — narrowly scoped)", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/routes/v1/pos/storeProducts.ts"), "utf8"
    );
    expect(src).toContain('assertStoreId(storeId, "store-products/search")');
    expect(src).toContain('assertStoreId(storeId, "store-products/lookup")');
  });

  it("ALL pos/suppliers routes use assertStoreId (static — narrowly scoped)", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/routes/v1/pos/suppliers.ts"), "utf8"
    );
    expect(src).toContain('assertStoreId(storeId, "pos/suppliers")');
    expect(src).toContain('assertStoreId(storeId, "pos/suppliers/:supplierId")');
    expect(src).toContain('assertStoreId(storeId, "pos/suppliers/:supplierId/products")');
    expect(src).toContain('assertStoreId(storeId, "pos/suppliers/browse/available")');
    expect(src).toContain('assertStoreId(storeId, "pos/suppliers/:supplierId/request-link")');
    const matches = src.match(/assertStoreId\(/g);
    expect(matches!.length).toBe(5);
  });

  it("catalog.ts getStoreIdFromDevice is fail-closed (static — narrowly scoped)", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/routes/v1/catalog.ts"), "utf8"
    );
    expect(src).toContain("STORE_ISOLATION_VIOLATION: catalog route requires valid storeId");
  });

  it("ALL pos/sales routes use fail-closed storeId extraction (static — narrowly scoped)", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/routes/v1/pos/sales.ts"), "utf8"
    );
    // Must define fail-closed helpers that call assertStoreId
    expect(src).toContain("function getStoreIdFromPosDevice(");
    expect(src).toContain("function getDeviceContextFromPosDevice(");
    expect(src).toContain('assertStoreId(storeId, operation)');
    expect(src).toContain('assertStoreId(posDevice?.storeId, operation)');
    // Must NOT have any raw posDevice.storeId extraction
    expect(src).not.toMatch(/const \{ storeId \} = \(req as any\)\.posDevice/);
    expect(src).not.toMatch(/const \{ storeId, deviceId \} = \(req as any\)\.posDevice/);
    // Must use the helpers for all routes
    const helperCalls = src.match(/getStoreIdFromPosDevice\(|getDeviceContextFromPosDevice\(/g);
    expect(helperCalls).not.toBeNull();
    // At least 15 routes use these helpers (18 extraction points total)
    expect(helperCalls!.length).toBeGreaterThanOrEqual(15);
  });

  it("pos/store payment-settings and status use assertStoreId (static — narrowly scoped)", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/routes/v1/pos/store.ts"), "utf8"
    );
    expect(src).toContain('assertStoreId(storeId, "pos/store/payment-settings")');
    expect(src).toContain('assertStoreId(storeId, "pos/stores/status")');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// V3-FIX-131: Search contract separation
// ═══════════════════════════════════════════════════════════════════════════════

describe("V3-FIX-131: Search contract separation (executable)", () => {
  it("SELL search contract is store-scoped", () => {
    expect(SEARCH_CONTRACTS.SELL.context).toBe("SELL");
    expect(SEARCH_CONTRACTS.SELL.source).toContain("store_products");
    expect(SEARCH_CONTRACTS.SELL.storeScoped).toBe(true);
  });

  it("BUY search contract is store-scoped via supplier links", () => {
    expect(SEARCH_CONTRACTS.BUY.context).toBe("BUY");
    expect(SEARCH_CONTRACTS.BUY.source).toContain("supplier_store_links");
    expect(SEARCH_CONTRACTS.BUY.storeScoped).toBe(true);
  });

  it("search API response includes context: SELL (static — narrowly scoped)", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/routes/v1/pos/storeProducts.ts"), "utf8"
    );
    expect(src).toContain('context: "SELL"');
  });

  it("frontend UniversalSearchV3 separates SELL and BUY contexts (static — narrowly scoped)", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../..", "src/components/v3/UniversalSearchV3.tsx"), "utf8"
    );
    expect(src).toContain('"sell" | "buy"');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// V3-FIX-132: Multilingual multi-key search
// ═══════════════════════════════════════════════════════════════════════════════

import { expandHindiSearchTokens, normalizeQuantityTokens, HINDI_PRODUCT_ALIASES } from "../../src/services/searchLocalization";

describe("V3-FIX-132: Multilingual search (executable)", () => {
  it("expandHindiSearchTokens maps doodh to milk", () => {
    const result = expandHindiSearchTokens(["doodh"]);
    expect(result).toContain("doodh");
    expect(result).toContain("milk");
  });

  it("expandHindiSearchTokens maps chai to tea", () => {
    const result = expandHindiSearchTokens(["chai"]);
    expect(result).toContain("chai");
    expect(result).toContain("tea");
  });

  it("expandHindiSearchTokens maps atta to flour", () => {
    const result = expandHindiSearchTokens(["atta"]);
    expect(result).toContain("atta");
    expect(result).toContain("flour");
    expect(result).toContain("wheat flour");
  });

  it("expandHindiSearchTokens passes through English terms unchanged", () => {
    const result = expandHindiSearchTokens(["milk", "sugar"]);
    expect(result).toEqual(["milk", "sugar"]);
  });

  it("expandHindiSearchTokens handles mixed Hindi/English", () => {
    const result = expandHindiSearchTokens(["ghee", "coke"]);
    expect(result).toContain("ghee");
    expect(result).toContain("coke");
  });

  it("normalizeQuantityTokens splits 1kg into 1 + kg", () => {
    const result = normalizeQuantityTokens("1kg");
    expect(result).toContain("1");
    expect(result).toContain("kg");
  });

  it("normalizeQuantityTokens splits 500gm into 500 + gm", () => {
    const result = normalizeQuantityTokens("500gm rice");
    expect(result).toContain("500");
    expect(result).toContain("gm");
    expect(result).toContain("rice");
  });

  it("normalizeQuantityTokens handles plain text without units", () => {
    const result = normalizeQuantityTokens("maggi noodles");
    expect(result).toEqual(["maggi", "noodles"]);
  });

  it("HINDI_PRODUCT_ALIASES covers key kirana categories", () => {
    // Dairy
    expect(HINDI_PRODUCT_ALIASES["doodh"]).toBeDefined();
    expect(HINDI_PRODUCT_ALIASES["dahi"]).toBeDefined();
    expect(HINDI_PRODUCT_ALIASES["paneer"]).toBeDefined();
    // Staples
    expect(HINDI_PRODUCT_ALIASES["chawal"]).toBeDefined();
    expect(HINDI_PRODUCT_ALIASES["atta"]).toBeDefined();
    expect(HINDI_PRODUCT_ALIASES["dal"]).toBeDefined();
    // Spices
    expect(HINDI_PRODUCT_ALIASES["namak"]).toBeDefined();
    expect(HINDI_PRODUCT_ALIASES["haldi"]).toBeDefined();
    // At least 30 mappings
    expect(Object.keys(HINDI_PRODUCT_ALIASES).length).toBeGreaterThanOrEqual(30);
  });

  it("SELL search endpoint uses Hindi expansion (static — narrowly scoped)", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/routes/v1/pos/storeProducts.ts"), "utf8"
    );
    expect(src).toContain("expandHindiSearchTokens");
    expect(src).toContain("normalizeQuantityTokens");
  });

  it("BUY catalog search supports multilingual + brand + supplier name + numeric pack (static — narrowly scoped)", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/routes/v1/catalog.ts"), "utf8"
    );
    // Must import Hindi expansion
    expect(src).toContain("expandHindiSearchTokens");
    expect(src).toContain("normalizeQuantityTokens");
    // BUY search must match brand and supplier name
    expect(src).toContain("sp.brand");
    expect(src).toContain("s.business_name");
    expect(src).toContain("s.trade_name");
    // BUY search must match numeric pack/content fields
    expect(src).toContain("sp.pack_size");
    expect(src).toContain("sp.moq");
    // Numeric and text tokens handled separately
    expect(src).toContain("numericTokens");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// V3-HARDEN-133: Inventory ledger event matrix
// ═══════════════════════════════════════════════════════════════════════════════

import { LEDGER_EVENT_MATRIX, getLedgerEventRule, validateLedgerConsistency } from "../../src/services/ledgerEventMatrix";

describe("V3-HARDEN-133: Ledger event matrix (executable)", () => {
  it("OPENING_STOCK credits via RECEIVE", () => {
    const rule = getLedgerEventRule("OPENING_STOCK");
    expect(rule.stockEffect).toBe("CREDIT");
    expect(rule.movementType).toBe("RECEIVE");
  });

  it("GRN_RECEIVED credits via RECEIVE", () => {
    const rule = getLedgerEventRule("GRN_RECEIVED");
    expect(rule.stockEffect).toBe("CREDIT");
    expect(rule.movementType).toBe("RECEIVE");
  });

  it("SALE_COMPLETED debits via SELL", () => {
    const rule = getLedgerEventRule("SALE_COMPLETED");
    expect(rule.stockEffect).toBe("DEBIT");
    expect(rule.movementType).toBe("SELL");
  });

  it("SALE_RETURN credits via ADJUSTMENT", () => {
    const rule = getLedgerEventRule("SALE_RETURN");
    expect(rule.stockEffect).toBe("CREDIT");
    expect(rule.movementType).toBe("ADJUSTMENT");
  });

  it("SALE_CREATED has NO stock effect (draft only)", () => {
    const rule = getLedgerEventRule("SALE_CREATED");
    expect(rule.stockEffect).toBe("NONE");
    expect(rule.movementType).toBeNull();
  });

  it("SALE_CANCELLED has NO stock effect (nothing to reverse)", () => {
    const rule = getLedgerEventRule("SALE_CANCELLED");
    expect(rule.stockEffect).toBe("NONE");
    expect(rule.movementType).toBeNull();
  });

  it("CART_EVENT has NO stock effect (draft state)", () => {
    const rule = getLedgerEventRule("CART_EVENT");
    expect(rule.stockEffect).toBe("NONE");
    expect(rule.movementType).toBeNull();
  });

  it("validateLedgerConsistency passes for correct combinations", () => {
    expect(() => validateLedgerConsistency("OPENING_STOCK", "RECEIVE")).not.toThrow();
    expect(() => validateLedgerConsistency("SALE_COMPLETED", "SELL")).not.toThrow();
    expect(() => validateLedgerConsistency("SALE_RETURN", "ADJUSTMENT")).not.toThrow();
  });

  it("validateLedgerConsistency rejects mismatched combinations", () => {
    expect(() => validateLedgerConsistency("OPENING_STOCK", "SELL")).toThrow("LEDGER_VIOLATION");
    expect(() => validateLedgerConsistency("SALE_COMPLETED", "RECEIVE")).toThrow("LEDGER_VIOLATION");
  });

  it("validateLedgerConsistency rejects neutral events with movement", () => {
    expect(() => validateLedgerConsistency("SALE_CREATED", "SELL")).toThrow("LEDGER_VIOLATION");
    expect(() => validateLedgerConsistency("CART_EVENT", "RECEIVE")).toThrow("LEDGER_VIOLATION");
  });

  it("matrix covers all 9 event types", () => {
    expect(LEDGER_EVENT_MATRIX.length).toBe(9);
    const events = LEDGER_EVENT_MATRIX.map((r) => r.event);
    expect(events).toContain("OPENING_STOCK");
    expect(events).toContain("GRN_RECEIVED");
    expect(events).toContain("SALE_COMPLETED");
    expect(events).toContain("SALE_RETURN");
    expect(events).toContain("ADJUSTMENT_POSITIVE");
    expect(events).toContain("ADJUSTMENT_NEGATIVE");
    expect(events).toContain("SALE_CREATED");
    expect(events).toContain("SALE_CANCELLED");
    expect(events).toContain("CART_EVENT");
  });

  it("payment mode does not affect stock timing (comment proof)", () => {
    // The SALE_COMPLETED rule applies regardless of payment mode
    const rule = getLedgerEventRule("SALE_COMPLETED");
    expect(rule.description).toContain("regardless of payment mode");
  });

  it("applyInventoryMovement accepts ledgerEvent param (static — narrowly scoped)", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/services/inventoryLedgerService.ts"), "utf8"
    );
    // InventoryMovementInput has ledgerEvent field
    expect(src).toContain("ledgerEvent?: LedgerEventType");
    // applyInventoryMovement enforces the matrix
    expect(src).toContain("validateLedgerConsistency(input.ledgerEvent, input.movementType)");
  });

  it("recordSaleInventoryMovements passes SALE_COMPLETED event (static — narrowly scoped)", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/services/inventoryLedgerService.ts"), "utf8"
    );
    expect(src).toContain('ledgerEvent: "SALE_COMPLETED"');
  });

  it("purchaseService passes GRN_RECEIVED event (static — narrowly scoped)", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/services/purchaseService.ts"), "utf8"
    );
    expect(src).toContain('ledgerEvent: "GRN_RECEIVED"');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// V3-HARDEN-134: Product metadata ownership
// ═══════════════════════════════════════════════════════════════════════════════

import { canModifyField, getModifiableFields, FIELD_OWNERSHIP, SYNC_PRECEDENCE } from "../../src/services/metadataOwnership";

describe("V3-HARDEN-134: Metadata ownership (executable)", () => {
  it("supplier owns global product name", () => {
    expect(canModifyField("name", "SUPPLIER_PUBLISH")).toBe(true);
    expect(canModifyField("name", "POS_APP")).toBe(false);
    expect(canModifyField("name", "RETAILER_WEB")).toBe(false);
  });

  it("retailer owns display_name and sell_price", () => {
    expect(canModifyField("display_name", "RETAILER_WEB")).toBe(true);
    expect(canModifyField("display_name", "POS_APP")).toBe(true);
    expect(canModifyField("sell_price", "RETAILER_WEB")).toBe(true);
    expect(canModifyField("sell_price", "POS_APP")).toBe(true);
  });

  it("superAdmin can override global fields", () => {
    expect(canModifyField("name", "SUPERADMIN_EDIT")).toBe(true);
    expect(canModifyField("brand", "SUPERADMIN_EDIT")).toBe(true);
    expect(canModifyField("category", "SUPERADMIN_EDIT")).toBe(true);
  });

  it("CSV can seed initial values but not overwrite", () => {
    expect(canModifyField("primary_barcode", "CSV_IMPORT")).toBe(true); // SEED
    expect(canModifyField("sell_price", "CSV_IMPORT")).toBe(true); // SEED
    expect(canModifyField("name", "CSV_IMPORT")).toBe(false); // READ
    expect(canModifyField("image_url", "CSV_IMPORT")).toBe(false); // READ
  });

  it("global brand (catalog.products) is supplier-owned", () => {
    expect(canModifyField("brand", "SUPPLIER_PUBLISH", "catalog.products")).toBe(true);
    expect(canModifyField("brand", "SUPERADMIN_EDIT", "catalog.products")).toBe(true);
    expect(canModifyField("brand", "RETAILER_WEB", "catalog.products")).toBe(false);
    expect(canModifyField("brand", "POS_APP", "catalog.products")).toBe(false);
  });

  it("store-level brand (catalog.store_products) is retailer/POS editable", () => {
    // store_products.brand is the retailer's local override column
    expect(canModifyField("brand", "RETAILER_WEB", "catalog.store_products")).toBe(true);
    expect(canModifyField("brand", "POS_APP", "catalog.store_products")).toBe(true);
    expect(canModifyField("brand", "SUPPLIER_PUBLISH", "catalog.store_products")).toBe(false);
  });

  it("POS and retailer can both edit store-level fields", () => {
    const posFields = getModifiableFields("POS_APP");
    const retailerFields = getModifiableFields("RETAILER_WEB");
    expect(posFields).toContain("display_name");
    expect(posFields).toContain("sell_price");
    expect(posFields).toContain("mrp");
    // POS can modify store-level brand (store_products table)
    const posStoreFields = getModifiableFields("POS_APP", "catalog.store_products");
    expect(posStoreFields).toContain("brand");
    // POS cannot modify global brand (products table)
    const posGlobalFields = getModifiableFields("POS_APP", "catalog.products");
    expect(posGlobalFields).not.toContain("brand");
    expect(retailerFields).toContain("display_name");
    expect(retailerFields).toContain("sell_price");
  });

  it("supplier cannot modify store-level fields", () => {
    expect(canModifyField("display_name", "SUPPLIER_PUBLISH")).toBe(false);
    expect(canModifyField("sell_price", "SUPPLIER_PUBLISH")).toBe(false);
    expect(canModifyField("current_stock", "SUPPLIER_PUBLISH")).toBe(false);
    expect(canModifyField("brand", "SUPPLIER_PUBLISH", "catalog.store_products")).toBe(false);
  });

  it("FIELD_OWNERSHIP covers both global and store tables", () => {
    const globalFields = FIELD_OWNERSHIP.filter((f) => f.table === "catalog.products");
    const storeFields = FIELD_OWNERSHIP.filter((f) => f.table === "catalog.store_products");
    expect(globalFields.length).toBeGreaterThanOrEqual(10);
    expect(storeFields.length).toBeGreaterThanOrEqual(7); // includes brand_override
  });

  it("sync precedence uses LWW with metadata_updated_at", () => {
    expect(SYNC_PRECEDENCE.strategy).toBe("LAST_WRITE_WINS");
    expect(SYNC_PRECEDENCE.timestampField).toBe("metadata_updated_at");
    expect(SYNC_PRECEDENCE.sourceField).toBe("metadata_updated_by");
  });
});
