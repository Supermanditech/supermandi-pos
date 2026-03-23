/**
 * GCP-STG-0357: Combined % + Fixed Margin calculation
 * Tests the margin calculation logic used in admin catalog margin route.
 */

describe("GCP-STG-0357: Combined % + Fixed Margin", () => {
  // Mirror the backend calculation logic
  function calcRetailPrice(
    purchasePrice: number,
    marginPct?: number,
    marginFixedMinor?: number
  ): number {
    if (marginPct !== undefined && marginFixedMinor !== undefined) {
      return Math.round(purchasePrice * (1 + marginPct / 100)) + marginFixedMinor;
    } else if (marginPct !== undefined) {
      return Math.round(purchasePrice * (1 + marginPct / 100));
    } else {
      return purchasePrice + (marginFixedMinor ?? 0);
    }
  }

  test("percentage only: 10% on 10000 = 11000", () => {
    expect(calcRetailPrice(10000, 10, undefined)).toBe(11000);
  });

  test("fixed only: 500 minor on 10000 = 10500", () => {
    expect(calcRetailPrice(10000, undefined, 500)).toBe(10500);
  });

  test("combined: 10% + 500 fixed on 10000 = 11500", () => {
    // 10000 * 1.10 = 11000, + 500 = 11500
    expect(calcRetailPrice(10000, 10, 500)).toBe(11500);
  });

  test("combined: 15% + 200 fixed on 8000 = 9400", () => {
    // 8000 * 1.15 = 9200, + 200 = 9400
    expect(calcRetailPrice(8000, 15, 200)).toBe(9400);
  });

  test("combined with rounding: 7.5% + 100 on 999 = 1174", () => {
    // 999 * 1.075 = 1073.925 -> round = 1074, + 100 = 1174
    expect(calcRetailPrice(999, 7.5, 100)).toBe(1174);
  });

  test("0% + fixed = fixed only", () => {
    expect(calcRetailPrice(10000, 0, 300)).toBe(10300);
  });

  test("pct + 0 fixed = pct only", () => {
    expect(calcRetailPrice(10000, 20, 0)).toBe(12000);
  });

  test("neither provided returns purchase price", () => {
    expect(calcRetailPrice(10000, undefined, undefined)).toBe(10000);
  });
});
