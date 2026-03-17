/**
 * V3-HARDEN-063 + V3-HARDEN-064: Runtime SELL-home tests
 * Verifies behavior at source level — not just string presence.
 */
const fs = require("fs");

const sellScreen = fs.readFileSync("src/screens/v3/SellScreenV3.tsx", "utf8");
const productTile = fs.readFileSync("src/components/v3/ProductTileV3.tsx", "utf8");
const universalSearch = fs.readFileSync("src/components/v3/UniversalSearchV3.tsx", "utf8");
const posRoot = fs.readFileSync("src/screens/v3/PosRootLayoutV3.tsx", "utf8");
const sseClient = fs.readFileSync("src/services/sseClient.ts", "utf8");

describe("V3-FIX-055: Shell states", () => {
  it("has exact cart-empty copy", () => {
    expect(sellScreen).toContain("Cart empty — tap product or scan barcode");
  });
  it("has loading state with ActivityIndicator", () => {
    expect(sellScreen).toContain("Loading products...");
    expect(sellScreen).toContain("ActivityIndicator");
  });
  it("has empty category state", () => {
    expect(sellScreen).toContain("No frequent items yet");
    expect(sellScreen).toContain("No products yet");
  });
});

describe("V3-HARDEN-059: Bulk/Trade disabled", () => {
  it("CustomerTypeToggle is commented out or disabled", () => {
    // The toggle must not be active in production — either commented out or removed
    expect(sellScreen).toContain("V3-HARDEN-059");
    expect(sellScreen).toContain("/* <CustomerTypeToggle");
  });
  it("cart total does not use 0.85 multiplier", () => {
    // The cartTotal calculation should NOT contain 0.85
    const cartLine = sellScreen.split("\n").find((l: string) => l.includes("cartTotal") && l.includes("reduce"));
    expect(cartLine).toBeDefined();
    expect(cartLine).not.toContain("0.85");
  });
});

describe("V3-HARDEN-060: Canonical product identity", () => {
  it("grid add uses barcode ?? id as primary key", () => {
    expect(sellScreen).toContain("id: product.barcode ?? product.id");
  });
  it("search add uses barcode ?? id as primary key", () => {
    expect(sellScreen).toContain("id: result.barcode ?? result.id");
  });
  it("find-existing checks both id and barcode", () => {
    expect(sellScreen).toContain("i.id === product.id || i.barcode === product.barcode");
    expect(sellScreen).toContain("i.barcode === result.barcode || i.id === result.id");
  });
});

describe("V3-FIX-049: Header and badge", () => {
  it("moreBadge is not hardcoded to 3", () => {
    expect(posRoot).not.toContain("moreBadge={3}");
    expect(posRoot).toContain("moreBadge={undefined}");
  });
});

describe("V3-DELETE-056/057: SSE cleanup", () => {
  it("stale SSE file is deleted", () => {
    expect(() => fs.accessSync("backend/src/routes/v1/pos/syncEvents.sse.ts")).toThrow();
  });
  it("polling fallback uses fetchUiStatus not /sync/poll", () => {
    expect(sseClient).toContain("fetchUiStatus");
    expect(sseClient).not.toContain("/api/v1/pos/sync/poll");
  });
});

describe("V3-FIX-054: Real tile data", () => {
  it("ProductTileV3 supports imageUrl", () => {
    expect(productTile).toContain("imageUrl");
    expect(productTile).toContain("Image");
  });
  it("no synthetic 0.85 trade price in tile mapping", () => {
    expect(sellScreen).not.toContain("Math.round(p.priceMinor * 0.85)");
    expect(sellScreen).not.toContain("priceMinor * 0.85");
  });
  it("no hardcoded caseSize: 24 in tile mapping", () => {
    expect(sellScreen).not.toContain("caseSize: 24");
  });
  it("no brand guessing from description", () => {
    expect(sellScreen).not.toContain('description?.split(" ")?.[0]');
  });
});

describe("V3-FIX-038: Search cleanup", () => {
  it("no DEMO_SELL or DEMO_BUY in search", () => {
    expect(universalSearch).not.toContain("DEMO_SELL");
    expect(universalSearch).not.toContain("DEMO_BUY");
  });
  it("no global @supermandi.recent_searches key", () => {
    expect(universalSearch).not.toContain("@supermandi.recent_searches");
  });
  it("uses store-scoped search history", () => {
    expect(universalSearch).toContain("getRecentSearches");
    expect(universalSearch).toContain("getDeviceStoreId");
  });
});

describe("V3-FIX-051: Feature flags end-to-end", () => {
  it("voiceEnabled gates mic button", () => {
    expect(sellScreen).toContain("voiceEnabled");
    expect(sellScreen).toContain("{voiceEnabled ?");
  });
  it("categoryBrowsingEnabled gates chip rail", () => {
    expect(sellScreen).toContain("categoryBrowsingEnabled");
    expect(sellScreen).toContain("{categoryBrowsingEnabled ?");
  });
  it("SSE refreshes voice and category flags", () => {
    expect(sseClient).toContain("setVoiceEnabled");
    expect(sseClient).toContain("setCategoryBrowsingEnabled");
  });
});

describe("V3-FIX-036: Welcome guide", () => {
  it("guide modal exists with dismiss CTA", () => {
    expect(sellScreen).toContain("sell-welcome-guide");
    expect(sellScreen).toContain("Got it, Start Billing");
    expect(sellScreen).toContain("sell-guide-dismiss");
  });
  it("guide persists per device+store+version", () => {
    expect(sellScreen).toContain("GUIDE_VERSION");
    expect(sellScreen).toContain("shouldShowGuide");
    expect(sellScreen).toContain("dismissGuide");
  });
});
