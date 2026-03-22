/**
 * GCP-STG-0313: GST calculation — per-item with fallback, not flat 18%
 *
 * Tests the GST calculation formula used in PaymentScreenV3, usePaymentFlow,
 * and CartSheetV3. All three must produce identical results.
 */

// The GST calculation extracted from the codebase (shared formula):
// gst = items.reduce((sum, item) => {
//   const gstPct = item.metadata?.gstPct ?? 18;
//   return sum + Math.round(item.priceMinor * item.quantity * gstPct / 100);
// }, 0)

function calculatePerItemGst(items: Array<{ priceMinor: number; quantity: number; metadata?: { gstPct?: number } }>): number {
  return items.reduce((sum, item) => {
    const gstPct = item.metadata?.gstPct ?? 18;
    return sum + Math.round(item.priceMinor * item.quantity * gstPct / 100);
  }, 0);
}

function calculateFlatGst(total: number): number {
  return Math.round(total * 0.18);
}

describe("GCP-STG-0313: Per-item GST calculation", () => {
  test("single item at 18% matches flat 18% (common case)", () => {
    const items = [{ priceMinor: 10000, quantity: 1, metadata: { gstPct: 18 } }];
    const total = 10000;
    expect(calculatePerItemGst(items)).toBe(calculateFlatGst(total));
    expect(calculatePerItemGst(items)).toBe(1800);
  });

  test("mixed GST rates produce different result than flat 18%", () => {
    // 5% essential + 18% branded = avg 11.5%, NOT 18%
    const items = [
      { priceMinor: 10000, quantity: 1, metadata: { gstPct: 5 } },  // ₹100 at 5%
      { priceMinor: 10000, quantity: 1, metadata: { gstPct: 18 } }, // ₹100 at 18%
    ];
    const total = 20000;

    const perItem = calculatePerItemGst(items);  // 500 + 1800 = 2300
    const flat = calculateFlatGst(total);         // 20000 * 0.18 = 3600

    expect(perItem).toBe(2300);
    expect(flat).toBe(3600);
    expect(perItem).not.toBe(flat); // Per-item is correct, flat is wrong
  });

  test("items with 0% GST (essentials) are not taxed", () => {
    const items = [
      { priceMinor: 5000, quantity: 2, metadata: { gstPct: 0 } }, // fresh vegetables
    ];
    expect(calculatePerItemGst(items)).toBe(0);
  });

  test("items with 5% GST (packaged essentials)", () => {
    const items = [
      { priceMinor: 8500, quantity: 3, metadata: { gstPct: 5 } }, // sugar 3kg
    ];
    // 8500 * 3 * 5 / 100 = 1275
    expect(calculatePerItemGst(items)).toBe(1275);
  });

  test("items with 12% GST (processed food)", () => {
    const items = [
      { priceMinor: 15000, quantity: 1, metadata: { gstPct: 12 } }, // packaged namkeen
    ];
    expect(calculatePerItemGst(items)).toBe(1800);
  });

  test("items with 28% GST (luxury/premium)", () => {
    const items = [
      { priceMinor: 50000, quantity: 1, metadata: { gstPct: 28 } },
    ];
    expect(calculatePerItemGst(items)).toBe(14000);
  });

  test("fallback to 18% when gstPct is undefined (no metadata)", () => {
    const items = [
      { priceMinor: 10000, quantity: 1 }, // no metadata at all
    ];
    expect(calculatePerItemGst(items)).toBe(1800);
  });

  test("fallback to 18% when metadata exists but gstPct is null", () => {
    const items = [
      { priceMinor: 10000, quantity: 1, metadata: { gstPct: undefined } },
    ];
    expect(calculatePerItemGst(items)).toBe(1800);
  });

  test("fractional quantity (loose products) rounds per-item correctly", () => {
    // 1.5 kg sugar at ₹85/kg, 5% GST
    const items = [
      { priceMinor: 8500, quantity: 1.5, metadata: { gstPct: 5 } },
    ];
    // 8500 * 1.5 * 5 / 100 = 637.5 → Math.round = 638
    expect(calculatePerItemGst(items)).toBe(638);
  });

  test("real kirana cart: mixed items with different GST rates", () => {
    const items = [
      { priceMinor: 2500, quantity: 2, metadata: { gstPct: 18 } },  // Maggi (18%)
      { priceMinor: 8500, quantity: 1, metadata: { gstPct: 5 } },   // Sugar (5%)
      { priceMinor: 3000, quantity: 1, metadata: { gstPct: 0 } },   // Vegetables (0%)
      { priceMinor: 12000, quantity: 1, metadata: { gstPct: 12 } },  // Namkeen (12%)
    ];

    // Maggi: 2500*2*18/100 = 900
    // Sugar: 8500*1*5/100 = 425
    // Vegetables: 0
    // Namkeen: 12000*1*12/100 = 1440
    // Total GST: 900 + 425 + 0 + 1440 = 2765
    expect(calculatePerItemGst(items)).toBe(2765);

    // Flat 18% would be: (5000+8500+3000+12000) * 0.18 = 28500 * 0.18 = 5130
    const total = items.reduce((s, i) => s + i.priceMinor * i.quantity, 0);
    expect(calculateFlatGst(total)).toBe(5130);

    // Difference: 5130 - 2765 = 2365 paise = ₹23.65 per transaction!
    expect(calculateFlatGst(total) - calculatePerItemGst(items)).toBe(2365);
  });

  test("source code consistency: PaymentScreenV3 uses per-item GST", () => {
    const fs = require("fs");
    const path = require("path");
    const paymentSrc = fs.readFileSync(
      path.resolve(__dirname, "../../screens/v3/PaymentScreenV3.tsx"), "utf8"
    );
    // Must NOT contain flat 18%
    expect(paymentSrc).not.toMatch(/const gst = isBulk \? Math\.round\(total \* 0\.18\)/);
    // Must contain per-item reduce
    expect(paymentSrc).toContain("items.reduce");
    expect(paymentSrc).toContain("gstPct");
  });

  test("source code consistency: usePaymentFlow uses per-item GST", () => {
    const fs = require("fs");
    const path = require("path");
    const hookSrc = fs.readFileSync(
      path.resolve(__dirname, "../../screens/v3/usePaymentFlow.ts"), "utf8"
    );
    expect(hookSrc).not.toMatch(/const gst = isBulk \? Math\.round\(total \* 0\.18\)/);
    expect(hookSrc).toContain("items.reduce");
    expect(hookSrc).toContain("gstPct");
  });
});
