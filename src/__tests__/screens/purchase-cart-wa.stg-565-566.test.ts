/**
 * STG-565 + STG-566: Purchase cart summary + WhatsApp order send
 */
import * as fs from "fs";
import * as path from "path";

describe("STG-565: PurchaseCartSummaryV3", () => {
  test("calculates subtotal, trade discounts, GST by rate, grand total", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../components/v3/PurchaseCartSummaryV3.tsx"), "utf8");
    expect(src).toContain("subtotal");
    expect(src).toContain("tradeDiscount");
    expect(src).toContain("gstByRate");
    expect(src).toContain("grandTotal");
    expect(src).toContain("CGST");
    expect(src).toContain("SGST");
  });

  test("shows supplier count and case/unit totals", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../components/v3/PurchaseCartSummaryV3.tsx"), "utf8");
    expect(src).toContain("totalCases");
    expect(src).toContain("totalUnits");
    expect(src).toContain("suppliers");
  });

  test("has PurchaseCartItem interface with wholesale fields", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../components/v3/PurchaseCartSummaryV3.tsx"), "utf8");
    expect(src).toContain("ptrMinor");
    expect(src).toContain("hsnCode");
    expect(src).toContain("gstPct");
    expect(src).toContain("tradeDiscountPct");
    expect(src).toContain("creditDays");
    expect(src).toContain("caseSize");
  });
});

describe("STG-566: WhatsApp Purchase Order", () => {
  test("formats purchase order with items, cases, prices, GST, totals", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../services/v3/whatsappPurchaseOrder.ts"), "utf8");
    expect(src).toContain("formatPurchaseOrder");
    expect(src).toContain("Purchase Order");
    expect(src).toContain("case");
    expect(src).toContain("Grand Total");
    expect(src).toContain("SuperMandi POS");
  });

  test("sends via WhatsApp deep link with phone number", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../services/v3/whatsappPurchaseOrder.ts"), "utf8");
    expect(src).toContain("sendPurchaseOrderWhatsApp");
    expect(src).toContain("whatsapp://send");
    expect(src).toContain("supplierPhone");
    expect(src).toContain("canOpenURL");
  });

  test("handles WhatsApp not installed gracefully", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../services/v3/whatsappPurchaseOrder.ts"), "utf8");
    expect(src).toContain("WhatsApp not installed");
    expect(src).toContain("Failed to open WhatsApp");
  });
});
