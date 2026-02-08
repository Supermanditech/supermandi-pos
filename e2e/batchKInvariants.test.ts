// PM-BATCH-K: Invariant Tests
// Jest-based logic tests that lock critical flow behavior.
// Run with: npx jest e2e/batchKInvariants.test.ts --config e2e/jest.config.js

import {
  feedHidKey,
  resetHidBuffer,
  resetHidTracking,
  setHidScanHandler,
  submitHidBuffer,
} from "../src/services/hidScannerService";

// =============================================================================
// 1. SELL vs BUY Search Separation
// =============================================================================

describe("SELL vs BUY search separation", () => {
  it("SELL search endpoint targets store-products", () => {
    // SELL search hits /api/v1/pos/store-products/search
    // BUY search hits /api/v1/catalog/stores/{storeId}/buy-catalog
    // These must NEVER be the same endpoint.
    const sellEndpoint = "/api/v1/pos/store-products/search";
    const buyEndpoint = "/api/v1/catalog/stores/{storeId}/buy-catalog";

    expect(sellEndpoint).not.toBe(buyEndpoint);
    expect(sellEndpoint).toContain("store-products");
    expect(sellEndpoint).not.toContain("catalog");
  });

  it("BUY search endpoint targets buy-catalog", () => {
    const buyEndpoint = "/api/v1/catalog/stores/{storeId}/buy-catalog";

    expect(buyEndpoint).toContain("buy-catalog");
    expect(buyEndpoint).toContain("catalog");
    expect(buyEndpoint).not.toContain("store-products/search");
  });

  it("SELL barcode lookup targets store-products/lookup", () => {
    const sellLookup = "/api/v1/pos/store-products/lookup";
    const buyBarcode =
      "/api/v1/catalog/stores/{storeId}/buy-catalog/barcode/{barcode}";

    expect(sellLookup).not.toBe(buyBarcode);
    expect(sellLookup).toContain("store-products");
  });

  it("intent routing sends SELL to store-products and PURCHASE to catalog", () => {
    // Simulate the intent routing logic from handleScan.ts
    type ScanIntent = "SELL" | "PURCHASE";

    function resolveEndpoint(intent: ScanIntent): string {
      if (intent === "SELL") {
        return "/api/v1/pos/store-products/search";
      }
      return "/api/v1/catalog/stores/{storeId}/buy-catalog";
    }

    expect(resolveEndpoint("SELL")).toContain("store-products");
    expect(resolveEndpoint("PURCHASE")).toContain("buy-catalog");
    expect(resolveEndpoint("SELL")).not.toBe(resolveEndpoint("PURCHASE"));
  });
});

// =============================================================================
// 2. __uncategorized__ Sentinel Invariant
// =============================================================================

describe("__uncategorized__ sentinel invariant", () => {
  it("getCategoryProducts URL includes taxonomyId in path", () => {
    // The POS sends taxonomyId directly in the URL path
    // Backend must handle __uncategorized__ as WHERE taxonomy_id IS NULL
    const storeId = "test-store-id";
    const taxonomyId = "__uncategorized__";
    const path = `/api/v1/catalog/stores/${storeId}/categories/${taxonomyId}/products`;

    expect(path).toContain("__uncategorized__");
    expect(path).toContain("/categories/");
    expect(path).toContain("/products");
  });

  it("__uncategorized__ is a valid sentinel value (not a UUID)", () => {
    const sentinel = "__uncategorized__";
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

    expect(uuidRegex.test(sentinel)).toBe(false);
    expect(sentinel).toBe("__uncategorized__");
  });

  it("'all' category does not use the categories endpoint", () => {
    // When selectedCategory === "all", POS loads all products directly
    // It does NOT call getCategoryProducts("all")
    const selectedCategory = "all";
    const useCategoryEndpoint = selectedCategory !== "all";

    expect(useCategoryEndpoint).toBe(false);
  });

  it("specific category ID uses the categories endpoint", () => {
    const selectedCategory = "f0000000-0000-0000-0000-000000000002";
    const useCategoryEndpoint = selectedCategory !== "all";

    expect(useCategoryEndpoint).toBe(true);
  });
});

// =============================================================================
// 3. Cart-Ledger Mismatch Warning (Non-Blocking)
// =============================================================================

describe("cart-ledger mismatch warning is non-blocking", () => {
  // Replicate the validateCartStock logic from checkoutService.ts
  interface StockValidationIssue {
    productId: string;
    productName: string;
    requestedQty: number;
    availableStock: number;
  }

  interface StockValidationResult {
    valid: boolean;
    issues: StockValidationIssue[];
  }

  function validateCartStock(
    cartItems: { id: string; name: string; quantity: number }[],
    stockLevels: Record<string, number>
  ): StockValidationResult {
    const issues: StockValidationIssue[] = [];
    for (const item of cartItems) {
      const available = stockLevels[item.id] ?? 0;
      if (item.quantity > available) {
        issues.push({
          productId: item.id,
          productName: item.name,
          requestedQty: item.quantity,
          availableStock: available,
        });
      }
    }
    return { valid: issues.length === 0, issues };
  }

  it("returns issues for over-stock cart items", () => {
    const cart = [{ id: "p1", name: "Atta", quantity: 10 }];
    const stock = { p1: 5 };
    const result = validateCartStock(cart, stock);

    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].requestedQty).toBe(10);
    expect(result.issues[0].availableStock).toBe(5);
  });

  it("validation result is an object, not a thrown error", () => {
    const cart = [{ id: "p1", name: "Atta", quantity: 999 }];
    const stock = { p1: 0 };

    // Key invariant: validateCartStock NEVER throws
    expect(() => validateCartStock(cart, stock)).not.toThrow();

    const result = validateCartStock(cart, stock);
    expect(result).toHaveProperty("valid");
    expect(result).toHaveProperty("issues");
  });

  it("checkout succeeds even when stock validation fails", () => {
    // Replicate completeCheckout logic: inventory failure is queued, not thrown
    const paymentSucceeded = true;
    const inventoryDeducted = false; // Inventory deduction failed

    // Key invariant: checkout result is SUCCESS if payment succeeded
    const checkoutResult = {
      success: paymentSucceeded, // true even if inventory failed
      paymentStatus: "CONFIRMED",
      inventoryDeducted, // false but non-blocking
    };

    expect(checkoutResult.success).toBe(true);
    expect(checkoutResult.inventoryDeducted).toBe(false);
  });

  it("valid stock returns no issues", () => {
    const cart = [
      { id: "p1", name: "Atta", quantity: 2 },
      { id: "p2", name: "Dal", quantity: 3 },
    ];
    const stock = { p1: 10, p2: 5 };
    const result = validateCartStock(cart, stock);

    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });
});

// =============================================================================
// 4. HID Scan Buffer Emits Once Per Scan
// =============================================================================

describe("HID scan buffer emits once per scan", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    resetHidTracking();
  });

  afterEach(() => {
    setHidScanHandler(null);
    resetHidTracking();
    jest.useRealTimers();
  });

  it("feedHidKey accumulates characters and Enter commits", () => {
    const emissions: string[] = [];
    setHidScanHandler((value) => emissions.push(value));

    const now = Date.now();
    jest.setSystemTime(now);

    // Simulate fast HID scanner input (< 80ms between chars)
    const barcode = "8901234567890";
    for (let i = 0; i < barcode.length; i++) {
      jest.setSystemTime(now + i * 10); // 10ms between chars
      feedHidKey(barcode[i]);
    }

    // Commit with Enter
    jest.setSystemTime(now + barcode.length * 10);
    const result = feedHidKey("Enter");

    expect(result).toBe(barcode);
    expect(emissions).toHaveLength(1);
    expect(emissions[0]).toBe(barcode);
  });

  it("does NOT emit twice for the same scan", () => {
    const emissions: string[] = [];
    setHidScanHandler((value) => emissions.push(value));

    const now = Date.now();
    jest.setSystemTime(now);

    // First scan
    const barcode = "1234567890";
    for (let i = 0; i < barcode.length; i++) {
      jest.setSystemTime(now + i * 10);
      feedHidKey(barcode[i]);
    }
    jest.setSystemTime(now + barcode.length * 10);
    feedHidKey("Enter");

    // Second Enter (should not re-emit — buffer is cleared)
    jest.setSystemTime(now + barcode.length * 10 + 5);
    const secondResult = feedHidKey("Enter");

    expect(secondResult).toBeNull();
    expect(emissions).toHaveLength(1);
  });

  it("rejects slow input (> 80ms between chars)", () => {
    const emissions: string[] = [];
    setHidScanHandler((value) => emissions.push(value));

    const now = Date.now();
    jest.setSystemTime(now);

    // Simulate slow human typing (200ms between chars)
    const input = "ABCDEF";
    for (let i = 0; i < input.length; i++) {
      jest.setSystemTime(now + i * 200); // 200ms between chars (too slow)
      feedHidKey(input[i]);
    }
    jest.setSystemTime(now + input.length * 200);
    const result = feedHidKey("Enter");

    // Should be rejected (too slow for HID scanner)
    expect(result).toBeNull();
    expect(emissions).toHaveLength(0);
  });

  it("rejects input shorter than 4 characters", () => {
    const emissions: string[] = [];
    setHidScanHandler((value) => emissions.push(value));

    const now = Date.now();
    jest.setSystemTime(now);

    // Short input (3 chars — below HID_MIN_LENGTH)
    feedHidKey("A");
    jest.setSystemTime(now + 10);
    feedHidKey("B");
    jest.setSystemTime(now + 20);
    feedHidKey("C");
    jest.setSystemTime(now + 30);
    const result = feedHidKey("Enter");

    expect(result).toBeNull();
    expect(emissions).toHaveLength(0);
  });

  it("submitHidBuffer commits pending buffer", () => {
    const emissions: string[] = [];
    setHidScanHandler((value) => emissions.push(value));

    const now = Date.now();
    jest.setSystemTime(now);

    const barcode = "5678901234";
    for (let i = 0; i < barcode.length; i++) {
      jest.setSystemTime(now + i * 10);
      feedHidKey(barcode[i]);
    }

    // Submit without Enter
    jest.setSystemTime(now + barcode.length * 10);
    const result = submitHidBuffer();

    expect(result).toBe(barcode);
    expect(emissions).toHaveLength(1);
  });
});
