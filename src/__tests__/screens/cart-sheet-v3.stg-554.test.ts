/**
 * STG-554: Cart strip + cart sheet v3
 */
import * as fs from "fs";
import * as path from "path";

describe("STG-554: CartSheetV3 + CartItemRowV3", () => {
  test("CartSheetV3 has items list, summary with GST, pay button", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../components/v3/CartSheetV3.tsx"), "utf8");
    expect(src).toContain("CartItemRowV3");
    expect(src).toContain("CGST");
    expect(src).toContain("SGST");
    expect(src).toContain("grandTotal");
    expect(src).toContain("PAY");
    expect(src).toContain("clearCart");
    expect(src).toContain("Park");
  });

  test("CartItemRowV3 has qty stepper, case conversion, HSN", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../components/v3/CartItemRowV3.tsx"), "utf8");
    expect(src).toContain("onIncrement");
    expect(src).toContain("onDecrement");
    expect(src).toContain("caseSize");
    expect(src).toContain("hsnCode");
    expect(src).toContain("qtyBtn");
  });

  test("SellScreenV3 integrates CartSheetV3 with visibility toggle", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../screens/v3/SellScreenV3.tsx"), "utf8");
    expect(src).toContain("CartSheetV3");
    expect(src).toContain("cartSheetVisible");
    expect(src).toContain("setCartSheetVisible");
    expect(src).toContain("onClose");
    expect(src).toContain("onCheckout");
  });

  test("CartSheetV3 supports retail and bulk modes with GST split", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../components/v3/CartSheetV3.tsx"), "utf8");
    expect(src).toContain('sellMode');
    expect(src).toContain('"bulk"');
    expect(src).toContain("gstAmount");
    expect(src).toContain("incl. GST");
  });
});
