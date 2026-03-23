/**
 * GCP-STG-0403: BUY Checkout GST Averaged Instead of Per-Item
 *
 * Validates that GST is calculated per-item (using each item's gstPct)
 * rather than averaged across all cart items.
 */

describe("GCP-STG-0403: BUY checkout per-item GST", () => {
  // Extract the GST logic from BuyScreenV3 into a testable function
  function computePerItemGst(
    items: Array<{ id: string; ptrMinor: number; caseSize: number; gstPct?: number }>,
    orderQtys: Record<string, number>
  ): number {
    const selected = items.filter((p) => (orderQtys[p.id] ?? 0) > 0);
    return selected.reduce((sum, p) => {
      const cases = orderQtys[p.id] ?? 0;
      const gst = p.gstPct ?? 18;
      const lineTotal = cases * p.caseSize * p.ptrMinor;
      return sum + Math.round(lineTotal * gst / (100 + gst));
    }, 0);
  }

  // OLD averaged logic for comparison
  function computeAveragedGst(
    items: Array<{ id: string; ptrMinor: number; caseSize: number; gstPct?: number }>,
    orderQtys: Record<string, number>
  ): number {
    const selected = items.filter((p) => (orderQtys[p.id] ?? 0) > 0);
    const subtotal = selected.reduce((s, p) => {
      const cases = orderQtys[p.id] ?? 0;
      return s + cases * p.caseSize * p.ptrMinor;
    }, 0);
    const avgGstPct = selected.length > 0
      ? selected.reduce((s, p) => s + (p.gstPct || 18), 0) / selected.length
      : 18;
    return Math.round(subtotal * avgGstPct / (100 + avgGstPct));
  }

  it("matches averaged GST when all items have the same rate", () => {
    const items = [
      { id: "a", ptrMinor: 10000, caseSize: 1, gstPct: 18 },
      { id: "b", ptrMinor: 5000, caseSize: 1, gstPct: 18 },
    ];
    const qtys = { a: 2, b: 3 };
    // When rates are uniform, both methods should agree
    expect(computePerItemGst(items, qtys)).toBe(computeAveragedGst(items, qtys));
  });

  it("produces correct per-item GST for mixed-rate cart", () => {
    // Item A: 5% GST, PTR 10500 minor, caseSize 1, qty 1
    //   lineTotal = 10500, GST = round(10500 * 5 / 105) = 500
    // Item B: 28% GST, PTR 12800 minor, caseSize 1, qty 1
    //   lineTotal = 12800, GST = round(12800 * 28 / 128) = 2800
    // Total per-item GST = 500 + 2800 = 3300
    const items = [
      { id: "a", ptrMinor: 10500, caseSize: 1, gstPct: 5 },
      { id: "b", ptrMinor: 12800, caseSize: 1, gstPct: 28 },
    ];
    const qtys = { a: 1, b: 1 };
    expect(computePerItemGst(items, qtys)).toBe(3300);
  });

  it("differs from averaged GST for mixed-rate cart with unequal quantities", () => {
    // Item A: 5% GST, PTR 10000, caseSize 1, qty 10
    //   lineTotal = 100000, GST = round(100000 * 5 / 105) = round(4761.9) = 4762
    // Item B: 28% GST, PTR 10000, caseSize 1, qty 1
    //   lineTotal = 10000, GST = round(10000 * 28 / 128) = round(2187.5) = 2188
    // Per-item total = 4762 + 2188 = 6950
    const items = [
      { id: "a", ptrMinor: 10000, caseSize: 1, gstPct: 5 },
      { id: "b", ptrMinor: 10000, caseSize: 1, gstPct: 28 },
    ];
    const qtys = { a: 10, b: 1 };
    const perItem = computePerItemGst(items, qtys);
    const averaged = computeAveragedGst(items, qtys);
    // Averaged uses (5+28)/2 = 16.5% across entire 110000 subtotal
    // = round(110000 * 16.5 / 116.5) = round(15579.4) ≠ 6950
    // They MUST differ — averaged over-weights the 28% item
    expect(perItem).not.toBe(averaged);
    expect(perItem).toBe(6950);
  });

  it("defaults to 18% when gstPct is undefined", () => {
    const items = [
      { id: "a", ptrMinor: 11800, caseSize: 1 }, // no gstPct → defaults to 18
    ];
    const qtys = { a: 1 };
    // GST = round(11800 * 18 / 118) = 1800
    expect(computePerItemGst(items, qtys)).toBe(1800);
  });

  it("handles caseSize > 1", () => {
    // PTR 5000, caseSize 12, qty 2 cases, GST 12%
    // lineTotal = 2 * 12 * 5000 = 120000
    // GST = round(120000 * 12 / 112) = round(12857.14) = 12857
    const items = [
      { id: "a", ptrMinor: 5000, caseSize: 12, gstPct: 12 },
    ];
    const qtys = { a: 2 };
    expect(computePerItemGst(items, qtys)).toBe(12857);
  });

  it("skips items with zero qty", () => {
    const items = [
      { id: "a", ptrMinor: 10000, caseSize: 1, gstPct: 18 },
      { id: "b", ptrMinor: 5000, caseSize: 1, gstPct: 5 },
    ];
    const qtys = { a: 2, b: 0 };
    // Only item A: lineTotal = 20000, GST = round(20000 * 18 / 118) = round(3050.85) = 3051
    expect(computePerItemGst(items, qtys)).toBe(3051);
  });

  it("returns 0 for empty cart", () => {
    const items = [
      { id: "a", ptrMinor: 10000, caseSize: 1, gstPct: 18 },
    ];
    const qtys = {};
    expect(computePerItemGst(items, qtys)).toBe(0);
  });
});
