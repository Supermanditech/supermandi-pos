/**
 * STG-553: SellScreenV3 — product grid with Retail/Bulk toggle
 */
import * as fs from "fs";
import * as path from "path";

describe("STG-553: SellScreenV3", () => {
  test("SellScreenV3 has branded header, search, categories, grid, cart strip", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../screens/v3/SellScreenV3.tsx"), "utf8");
    expect(src).toContain("BrandedHeader");
    expect(src).toContain("CustomerTypeToggle");
    expect(src).toContain("ProductTileV3");
    expect(src).toContain("cartStrip");
    expect(src).toContain("searchBar");
    expect(src).toContain("CATEGORIES");
    expect(src).toContain("numColumns={3}");
  });

  test("SellScreenV3 supports retail and bulk sell modes", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../screens/v3/SellScreenV3.tsx"), "utf8");
    expect(src).toContain('sellMode');
    expect(src).toContain('"retail"');
    expect(src).toContain('"bulk"');
    expect(src).toContain("priceTradeMinor");
  });

  test("ProductTileV3 shows stock dot, cart badge, case info", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../components/v3/ProductTileV3.tsx"), "utf8");
    expect(src).toContain("stockDot");
    expect(src).toContain("cartBadge");
    expect(src).toContain("caseSize");
    expect(src).toContain("priceMrpMinor");
    expect(src).toContain("priceTradeMinor");
    expect(src).toContain("accessibilityLabel");
  });

  test("CustomerTypeToggle has Retail and Bulk options", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../components/v3/CustomerTypeToggle.tsx"), "utf8");
    expect(src).toContain('"retail"');
    expect(src).toContain('"bulk"');
    expect(src).toContain("accessibilityState");
  });

  test("BrandedHeader has SuperMandi logo SVG", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../components/v3/BrandedHeader.tsx"), "utf8");
    expect(src).toContain("SuperMandi");
    expect(src).toContain("Svg");
    expect(src).toContain("statusDot");
    expect(src).toContain("storeName");
  });

  test("PosRootLayoutV3 imports SellScreenV3", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../screens/v3/PosRootLayoutV3.tsx"), "utf8");
    expect(src).toContain("SellScreenV3");
    expect(src).not.toContain('PlaceholderScreen name="SELL"');
  });
});
