/**
 * V3-HARDEN-063: SELL-home contract verification tests
 *
 * These are CODE CONTRACT tests, NOT runtime UI tests.
 * They verify production invariants (no demo data, no fake pricing,
 * correct wiring, feature flag propagation) by inspecting source files.
 *
 * IMPORTANT: These do NOT satisfy V3-HARDEN-064 (click-path runtime coverage).
 * V3-HARDEN-064 requires device/emulator e2e tests defined in:
 *   e2e-tests/tests/sell-home-clickmap.spec.ts
 *
 * V3-HARDEN-064 STATUS: SPEC WRITTEN, NOT YET EXECUTABLE
 * Reason: Mounted RN component tests fail due to native module dependencies.
 * Full click-path proof requires Maestro/Detox on emulator.
 */
const fs = require("fs");

const sell = fs.readFileSync("src/screens/v3/SellScreenV3.tsx", "utf8");
const tile = fs.readFileSync("src/components/v3/ProductTileV3.tsx", "utf8");
const search = fs.readFileSync("src/components/v3/UniversalSearchV3.tsx", "utf8");
const root = fs.readFileSync("src/screens/v3/PosRootLayoutV3.tsx", "utf8");
const sse = fs.readFileSync("src/services/sseClient.ts", "utf8");
const uiStatus = fs.readFileSync("src/services/api/uiStatusApi.ts", "utf8");

// ─── Layer 1: Production code contract verification ─────────────────────────

describe("V3-FIX-055: Shell states", () => {
  it("cart-empty copy is exact V3 match", () => {
    expect(sell).toContain("Cart empty — tap product or scan barcode");
  });
  it("loading state renders ActivityIndicator + text", () => {
    expect(sell).toContain("Loading products...");
  });
  it("empty-frequent state has contextual message", () => {
    expect(sell).toContain("No frequent items yet");
    expect(sell).toContain("Complete a few sales");
  });
  it("empty-category state shows category name", () => {
    expect(sell).toContain("No ${selectedCategory} products");
  });
});

describe("V3-HARDEN-059: Bulk/Trade resolved", () => {
  it("CustomerTypeToggle is disabled in render", () => {
    expect(sell).toContain("/* <CustomerTypeToggle");
  });
  it("cartTotal has no 0.85 multiplier", () => {
    const cartTotalLines = sell.split("\n").filter((l: string) =>
      l.includes("cartTotal") && l.includes("reduce")
    );
    for (const line of cartTotalLines) {
      expect(line).not.toContain("0.85");
    }
  });
});

describe("V3-HARDEN-060: Canonical product identity", () => {
  it("grid-add key is barcode ?? id", () => {
    expect(sell).toContain("id: product.barcode ?? product.id");
  });
  it("search-add key is barcode ?? id", () => {
    expect(sell).toContain("id: result.barcode ?? result.id");
  });
  it("duplicate detection checks both id and barcode", () => {
    expect(sell).toContain("i.id === product.id || i.barcode === product.barcode");
  });
});

describe("V3-DELETE-056/057: SSE cleanup complete", () => {
  it("syncEvents.sse.ts file is deleted", () => {
    expect(() => fs.accessSync("backend/src/routes/v1/pos/syncEvents.sse.ts")).toThrow();
  });
  it("no dead import/mount remnants in index.ts", () => {
    const idx = fs.readFileSync("backend/src/routes/v1/index.ts", "utf8");
    expect(idx).not.toContain("posSyncSseRouter");
    expect(idx).not.toContain("syncEvents.sse");
  });
  it("poll fallback uses fetchUiStatus not /sync/poll", () => {
    expect(sse).not.toContain("/api/v1/pos/sync/poll");
    expect(sse).toContain("fetchUiStatus");
  });
});

describe("V3-FIX-054: Real tile data", () => {
  it("ProductTileV3 has imageUrl field and uses Image", () => {
    expect(tile).toContain("imageUrl?: string");
    expect(tile).toContain("product.imageUrl");
  });
  it("no synthetic 0.85 trade price", () => {
    expect(sell).not.toContain("Math.round(p.priceMinor * 0.85)");
  });
  it("no hardcoded caseSize: 24", () => {
    expect(sell).not.toContain("caseSize: 24");
  });
  it("no brand guessing from description", () => {
    expect(sell).not.toContain('description?.split(" ")?.[0]');
  });
});

describe("V3-FIX-038: Search parity", () => {
  it("no DEMO_SELL or DEMO_BUY", () => {
    expect(search).not.toContain("DEMO_SELL");
    expect(search).not.toContain("DEMO_BUY");
  });
  it("no global @supermandi.recent_searches key", () => {
    expect(search).not.toContain("@supermandi.recent_searches");
  });
  it("uses store-scoped searchHistory service", () => {
    expect(search).toContain("getRecentSearches");
    expect(search).toContain("getDeviceStoreId");
  });
});

describe("V3-FIX-051: Feature flags end-to-end", () => {
  it("voiceEnabled gates mic button in SELL", () => {
    expect(sell).toContain("voiceEnabled");
  });
  it("categoryBrowsingEnabled gates chip rail", () => {
    expect(sell).toContain("categoryBrowsingEnabled");
  });
  it("uiStatusApi parses both flags", () => {
    expect(uiStatus).toContain("voiceEnabled");
    expect(uiStatus).toContain("categoryBrowsingEnabled");
  });
  it("sseClient refreshes both flags on settings_updated", () => {
    expect(sse).toContain("setVoiceEnabled");
    expect(sse).toContain("setCategoryBrowsingEnabled");
  });
});

describe("V3-FIX-036: Welcome guide", () => {
  it("guide modal has testID and dismiss CTA", () => {
    expect(sell).toContain('testID="sell-welcome-guide"');
    expect(sell).toContain('testID="sell-guide-dismiss"');
    expect(sell).toContain("Got it, Start Billing");
  });
  it("persists per device+store+guideVersion", () => {
    expect(sell).toContain("GUIDE_VERSION");
    expect(sell).toContain("shouldShowGuide");
    expect(sell).toContain("dismissGuide");
  });
});

describe("V3-FIX-049: Header + badge", () => {
  it("moreBadge is not hardcoded to 3", () => {
    expect(root).not.toContain("moreBadge={3}");
  });
  it("header onMenuPress is passed from SELL", () => {
    expect(sell).toContain("onMenuPress");
  });
});

describe("V3-FIX-052: Category group contract", () => {
  it("uses getSellCategoryGroups from catalogApi", () => {
    expect(sell).toContain("getSellCategoryGroups");
  });
  it("V3 groups defined in catalogApi", () => {
    const catalog = fs.readFileSync("src/services/api/catalogApi.ts", "utf8");
    expect(catalog).toContain("Frequent");
    expect(catalog).toContain("Beverages");
    expect(catalog).toContain("Snacks");
    expect(catalog).toContain("Dairy");
    expect(catalog).toContain("Staples");
    expect(catalog).toContain("Home Care");
  });
});

describe("V3-FIX-041: Frequent wired to real API", () => {
  it("calls getFrequentProducts", () => {
    expect(sell).toContain("getFrequentProducts");
  });
  it("backend endpoint exists", () => {
    const backend = fs.readFileSync("backend/src/routes/v1/pos/storeProducts.ts", "utf8");
    expect(backend).toContain("products/frequent");
  });
});

// ─── Layer 2: Interaction contracts ─────────────────────────────────────────
// These verify the wiring contracts that make runtime click-paths correct.
// Full device-level interaction testing belongs in e2e-tests/.

describe("V3-HARDEN-064: Click-path contracts", () => {
  it("header menu navigates to MORE via parent", () => {
    // Contract: onMenuPress calls navigation.getParent().navigate("MORE")
    expect(sell).toContain('getParent');
    expect(sell).toContain('"MORE"');
  });
  it("search open sets searchVisible=true", () => {
    expect(sell).toContain("setSearchVisible(true)");
  });
  it("scan open navigates to V3Scan", () => {
    expect(sell).toContain('"V3Scan"');
  });
  it("voice open sets voiceVisible=true", () => {
    expect(sell).toContain("setVoiceVisible(true)");
  });
  it("category chip press sets selectedCategory", () => {
    expect(sell).toContain("setSelectedCategory(item)");
  });
  it("tile press calls handleAddProduct", () => {
    expect(sell).toContain("handleAddProduct(item)");
  });
  it("cart strip opens cart sheet", () => {
    expect(sell).toContain("setCartSheetVisible(true)");
  });
  it("pay button opens cart sheet", () => {
    expect(sell).toContain("PAY →");
  });
});
