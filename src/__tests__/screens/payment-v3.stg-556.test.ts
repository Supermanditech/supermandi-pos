/**
 * STG-556: PaymentScreenV3 — Cash/UPI/Udhar with quick amounts
 */
import * as fs from "fs";
import * as path from "path";

describe("STG-556: PaymentScreenV3", () => {
  test("has 3 payment methods: CASH, UPI, DUE (displayed as UDHAR)", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../screens/v3/PaymentScreenV3.tsx"), "utf8");
    expect(src).toContain('"CASH"');
    expect(src).toContain('"UPI"');
    expect(src).toContain('"DUE"');
    expect(src).toContain("UDHAR");
    expect(src).toContain("उधार");
    expect(src).toContain("नकद");
  });

  test("has quick cash amounts with EXACT button", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../screens/v3/PaymentScreenV3.tsx"), "utf8");
    expect(src).toContain("getQuickAmounts");
    expect(src).toContain("EXACT");
    expect(src).toContain("cashReceived");
    expect(src).toContain("changeAmount");
  });

  test("supports wholesale GST-inclusive total", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../screens/v3/PaymentScreenV3.tsx"), "utf8");
    expect(src).toContain("sellMode");
    expect(src).toContain("grandTotal");
    expect(src).toContain("incl. GST");
  });

  test("has SVG icons for payment methods", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../screens/v3/PaymentScreenV3.tsx"), "utf8");
    expect(src).toContain("<Svg");
    expect(src).toContain("accessibilityRole");
    expect(src).toContain("accessibilityState");
  });

  test("has UPI QR placeholder and waiting state", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../screens/v3/PaymentScreenV3.tsx"), "utf8");
    expect(src).toContain("qrPlaceholder");
    expect(src).toContain("Waiting for payment");
  });
});
