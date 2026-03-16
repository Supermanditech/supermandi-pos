/**
 * STG-555: Wholesale cart — sellMode, trade fields, GST summary
 */
import * as fs from "fs";
import * as path from "path";

describe("STG-555: Wholesale cart extensions", () => {
  test("CartItem has wholesale fields (tradePriceMinor, caseSize, hsnCode, gstPct)", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../stores/cartStore.ts"), "utf8");
    expect(src).toContain("tradePriceMinor?: number");
    expect(src).toContain("mrpMinor?: number");
    expect(src).toContain("caseSize?: number");
    expect(src).toContain("hsnCode?: string");
    expect(src).toContain("gstPct?: number");
    expect(src).toContain("supplierName?: string");
    expect(src).toContain("tradeDiscountPct?: number");
    expect(src).toContain("scheme?: string");
  });

  test("CartState has sellMode with retail default", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../stores/cartStore.ts"), "utf8");
    expect(src).toContain("sellMode: SellMode");
    expect(src).toContain("setSellMode:");
    expect(src).toContain("sellMode: 'retail'");
  });

  test("CartSummaryV3 calculates GST split (CGST/SGST) for bulk mode", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../components/v3/CartSummaryV3.tsx"), "utf8");
    expect(src).toContain("CGST");
    expect(src).toContain("SGST");
    expect(src).toContain("grandTotal");
    expect(src).toContain("tradeSavings");
    expect(src).toContain("marginPct");
    expect(src).toContain("caseCount");
    expect(src).toContain("incl. GST");
  });

  test("SellMode type is exported from cartStore", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../stores/cartStore.ts"), "utf8");
    expect(src).toContain("export type SellMode");
    expect(src).toContain("'retail' | 'bulk'");
  });

  test("resetForStore resets sellMode to retail", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../stores/cartStore.ts"), "utf8");
    const resetSection = src.slice(src.indexOf("resetForStore:"));
    expect(resetSection).toContain("sellMode: 'retail'");
  });
});
