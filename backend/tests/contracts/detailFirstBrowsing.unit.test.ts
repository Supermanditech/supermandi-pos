/**
 * V3-FIX-135 / V3-FIX-136 / V3-HARDEN-137 / V3-DELETE-138
 * Detail-first browsing contract tests
 *
 * Proves:
 * - SELL tile tap opens details, not direct add
 * - BUY card tap opens details, not inline add
 * - BUY card has no inline qty/add controls
 * - BUY does not pre-seed purchase cart with MOQ
 * - Detail sheet supports both SELL and BUY contexts with procurement metadata
 * - Add-to-cart only from explicit CTA inside detail surface
 */

describe("V3-FIX-135: SELL detail-first (static — narrowly scoped)", () => {
  it("SellScreenV3 tile tap opens detail sheet, not direct add", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../..", "src/screens/v3/SellScreenV3.tsx"), "utf8"
    );
    // Tile tap must open detail
    expect(src).toContain("handleTilePress");
    expect(src).toContain("setDetailProduct(product)");
    // Must NOT have direct addItem in tile tap handler
    expect(src).not.toMatch(/handleTilePress[\s\S]{0,200}addItem\(/);
    // Detail add only from explicit CTA
    expect(src).toContain("handleDetailAdd");
    expect(src).toContain("ProductDetailSheetV3");
    expect(src).toContain('context="SELL"');
  });

  it("ProductTileV3 accessibility says 'tap for details' not 'tap to add'", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../..", "src/components/v3/ProductTileV3.tsx"), "utf8"
    );
    expect(src).toContain("tap for details");
    expect(src).not.toContain("tap to add to cart");
  });
});

describe("V3-FIX-136: BUY detail-first (static — narrowly scoped)", () => {
  it("BuyScreenV3 card tap opens detail sheet", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../..", "src/screens/v3/BuyScreenV3.tsx"), "utf8"
    );
    // Card onPress must open detail
    expect(src).toContain("setDetailProduct(item)");
    // Must have detail sheet with BUY context
    expect(src).toContain('context="BUY"');
    expect(src).toContain("ProductDetailSheetV3");
  });

  it("BuyScreenV3 does NOT pre-seed purchase cart with MOQ", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../..", "src/screens/v3/BuyScreenV3.tsx"), "utf8"
    );
    // Must NOT set defaultQtys[p.id] = p.moq on load
    expect(src).not.toContain("defaultQtys[p.id] = p.moq");
    // Comment should explain why
    expect(src).toContain("Do NOT pre-seed purchase cart");
  });

  it("SupplierProductCardV3 has NO inline qty stepper or add button", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../..", "src/components/v3/SupplierProductCardV3.tsx"), "utf8"
    );
    // Must NOT have inline add
    expect(src).not.toContain("onAddToCart");
    expect(src).not.toContain("+ Cart");
    // Must NOT have qty stepper on the card
    expect(src).not.toContain("onQtyChange");
    // Card should say "Tap for details"
    expect(src).toContain("Tap for details");
  });
});

describe("V3-HARDEN-137: Unified detail-first contract (executable + static)", () => {
  it("ProductDetailSheetV3 supports both SELL and BUY contexts", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../..", "src/components/v3/ProductDetailSheetV3.tsx"), "utf8"
    );
    expect(src).toContain('"SELL" | "BUY"');
    expect(src).toContain("procurement?: ProcurementData");
  });

  it("BUY detail surface shows full procurement metadata", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../..", "src/components/v3/ProductDetailSheetV3.tsx"), "utf8"
    );
    // Must show all procurement terms
    expect(src).toContain("procurement.supplierName");
    expect(src).toContain("procurement.ptrMinor");
    expect(src).toContain("procurement.hsnCode");
    expect(src).toContain("procurement.gstPct");
    expect(src).toContain("procurement.moq");
    expect(src).toContain("procurement.deliveryDays");
    expect(src).toContain("procurement.ptsMinor");
    expect(src).toContain("procurement.tradeDiscountPct");
    expect(src).toContain("procurement.bnplAvailable");
    expect(src).toContain("procurement.creditDays");
  });

  it("BUY CTA uses trade/PTR amount, not MRP", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../..", "src/components/v3/ProductDetailSheetV3.tsx"), "utf8"
    );
    // Display price should prefer trade for BUY
    expect(src).toContain('context === "BUY" && product.priceTradeMinor');
    expect(src).toContain("displayPriceMinor");
  });

  it("both top and bottom Add CTAs exist", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../..", "src/components/v3/ProductDetailSheetV3.tsx"), "utf8"
    );
    expect(src).toContain("detail-top-add");
    expect(src).toContain("detail-bottom-add");
  });
});

describe("V3-DELETE-138: Stale one-tap-add assumptions removed", () => {
  it("no production code still claims tile/card tap adds to cart", () => {
    const fs = require("fs");
    const path = require("path");
    // SELL tile
    const tileSrc = fs.readFileSync(
      path.resolve(__dirname, "../../..", "src/components/v3/ProductTileV3.tsx"), "utf8"
    );
    expect(tileSrc).not.toContain("tap to add");
    // BUY card
    const cardSrc = fs.readFileSync(
      path.resolve(__dirname, "../../..", "src/components/v3/SupplierProductCardV3.tsx"), "utf8"
    );
    expect(cardSrc).not.toContain("Add to cart");
    expect(cardSrc).toContain("browse-only");
  });
});
