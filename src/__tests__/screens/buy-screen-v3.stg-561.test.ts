/**
 * STG-561: BuyScreenV3 — supplier catalogue with wholesale metadata
 */
import * as fs from "fs";
import * as path from "path";

describe("STG-561: BuyScreenV3 + SupplierProductCardV3", () => {
  test("BuyScreenV3 has supplier filter, category chips, product list", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../screens/v3/BuyScreenV3.tsx"), "utf8");
    expect(src).toContain("SUPPLIERS");
    expect(src).toContain("CATEGORIES");
    expect(src).toContain("SupplierProductCardV3");
    expect(src).toContain("selectedSupplier");
    expect(src).toContain("BUYING FROM");
  });

  test("SupplierProductCard shows full wholesale metadata", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../components/v3/SupplierProductCardV3.tsx"), "utf8");
    expect(src).toContain("ptrMinor");
    expect(src).toContain("ptsMinor");
    expect(src).toContain("mrpMinor");
    expect(src).toContain("hsnCode");
    expect(src).toContain("gstPct");
    expect(src).toContain("caseSize");
    expect(src).toContain("moq");
    expect(src).toContain("tradeDiscountPct");
    expect(src).toContain("scheme");
    expect(src).toContain("creditDays");
    expect(src).toContain("deliveryDays");
    expect(src).toContain("supplierName");
  });

  test("shows margin percentage and stock urgency", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../components/v3/SupplierProductCardV3.tsx"), "utf8");
    expect(src).toContain("marginPct");
    expect(src).toContain("getStockUrgency");
    expect(src).toContain("urgent");
    expect(src).toContain("runs out today");
  });

  test("has purchase cart strip with teal accent", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../screens/v3/BuyScreenV3.tsx"), "utf8");
    expect(src).toContain("cartStrip");
    expect(src).toContain("ORDER →");
    expect(src).toContain("colors.accent");
  });

  test("has Counter Purchase CTA", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../screens/v3/BuyScreenV3.tsx"), "utf8");
    expect(src).toContain("Counter Purchase");
    expect(src).toContain("counterCta");
  });

  test("PosRootLayoutV3 wires BuyScreenV3", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../screens/v3/PosRootLayoutV3.tsx"), "utf8");
    expect(src).toContain("BuyScreenV3");
    expect(src).not.toContain('PlaceholderScreen name="BUY"');
  });
});
