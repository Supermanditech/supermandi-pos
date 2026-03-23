/**
 * GCP-STG-0398: Volume/Tier Discounts Applied to Cart Total
 *
 * Verifies that MOQ tier discounts are actually applied to the cart total,
 * not just displayed cosmetically. Also verifies the volume discount line
 * appears in the checkout modal.
 */
import * as fs from "fs";
import * as path from "path";

const SRC = fs.readFileSync(
  path.resolve(__dirname, "../../screens/v3/BuyScreenV3.tsx"), "utf8"
);

describe("GCP-STG-0398: Volume/tier discounts applied to cart total", () => {
  test("cartTotal is computed inside useMemo with tier discount logic", () => {
    // The old pattern was a simple reduce without tier discounts:
    //   products.reduce((s, p) => s + (orderQtys[p.id] ?? 0) * p.caseSize * p.ptrMinor, 0)
    // The new pattern uses useMemo and applies discountPct
    expect(SRC).toContain("volumeDiscountTotal");
    expect(SRC).toContain("applicableTier");
    expect(SRC).toMatch(/discPct.*applicableTier\?\.discountPct/);
  });

  test("does NOT use simple reduce for cartTotal (no-discount pattern)", () => {
    // Ensure the old cosmetic-only pattern is gone
    expect(SRC).not.toMatch(
      /const cartTotal\s*=\s*products\.reduce\(\(s,\s*p\)\s*=>\s*s\s*\+\s*\(orderQtys/
    );
  });

  test("looks up highest qualifying tier (sorted descending by minQty)", () => {
    expect(SRC).toMatch(/\.sort\(\(a.*b.*\).*=>.*b\.minQty.*-.*a\.minQty/);
    expect(SRC).toMatch(/\.find\(\(t.*\).*=>.*orderQty\s*>=.*t\.minQty/);
  });

  test("computes lineDiscount = Math.round(lineBase * discPct / 100)", () => {
    expect(SRC).toMatch(/lineDiscount\s*=\s*Math\.round\(lineBase\s*\*\s*discPct\s*\/\s*100\)/);
  });

  test("subtracts discount from total (total += lineBase - lineDiscount)", () => {
    expect(SRC).toMatch(/total\s*\+=\s*lineBase\s*-\s*lineDiscount/);
  });

  test("tracks volumeDiscountTotal separately for display", () => {
    expect(SRC).toMatch(/discount\s*\+=\s*lineDiscount/);
    expect(SRC).toContain("volumeDiscountTotal: discount");
  });

  test("shows volume discount line in checkout when discount > 0", () => {
    expect(SRC).toContain('testID="volume-discount-line"');
    expect(SRC).toContain("Volume discount");
    expect(SRC).toMatch(/volumeDiscountTotal\s*>\s*0/);
  });

  test("volume discount line shows negative amount with rupee symbol", () => {
    expect(SRC).toMatch(/-₹.*volumeDiscountTotal\s*\/\s*100/);
  });
});

describe("GCP-STG-0398: Pure tier discount calculation logic", () => {
  // Extract and test the discount logic in isolation
  function computeCartWithTierDiscount(
    products: Array<{
      id: string;
      caseSize: number;
      ptrMinor: number;
      moqTiers?: Array<{ minQty: number; discountPct: number }>;
    }>,
    orderQtys: Record<string, number>
  ) {
    let total = 0;
    let discount = 0;
    for (const p of products) {
      const cases = orderQtys[p.id] ?? 0;
      if (cases <= 0) continue;
      const orderQty = cases * p.caseSize;
      const lineBase = cases * p.caseSize * p.ptrMinor;
      const applicableTier = (p.moqTiers ?? [])
        .slice()
        .sort((a, b) => b.minQty - a.minQty)
        .find((t) => orderQty >= t.minQty);
      const discPct = applicableTier?.discountPct ?? 0;
      const lineDiscount = Math.round(lineBase * discPct / 100);
      total += lineBase - lineDiscount;
      discount += lineDiscount;
    }
    return { cartTotal: total, volumeDiscountTotal: discount };
  }

  test("no tiers → full price, zero discount", () => {
    const result = computeCartWithTierDiscount(
      [{ id: "A", caseSize: 10, ptrMinor: 1000 }],
      { A: 2 }
    );
    // 2 cases × 10 units × 1000 minor = 20000
    expect(result.cartTotal).toBe(20000);
    expect(result.volumeDiscountTotal).toBe(0);
  });

  test("qty below all tiers → no discount", () => {
    const result = computeCartWithTierDiscount(
      [{ id: "A", caseSize: 10, ptrMinor: 1000, moqTiers: [{ minQty: 50, discountPct: 5 }] }],
      { A: 2 } // 20 units < 50
    );
    expect(result.cartTotal).toBe(20000);
    expect(result.volumeDiscountTotal).toBe(0);
  });

  test("qty meets tier → discount applied", () => {
    const result = computeCartWithTierDiscount(
      [{ id: "A", caseSize: 10, ptrMinor: 1000, moqTiers: [{ minQty: 20, discountPct: 10 }] }],
      { A: 2 } // 20 units >= 20 → 10% off
    );
    // lineBase = 20000, discount = 2000, total = 18000
    expect(result.cartTotal).toBe(18000);
    expect(result.volumeDiscountTotal).toBe(2000);
  });

  test("highest qualifying tier wins (not lowest)", () => {
    const result = computeCartWithTierDiscount(
      [{
        id: "A", caseSize: 10, ptrMinor: 1000,
        moqTiers: [
          { minQty: 10, discountPct: 5 },
          { minQty: 50, discountPct: 10 },
          { minQty: 100, discountPct: 15 },
        ]
      }],
      { A: 6 } // 60 units → qualifies for 10 (5%) and 50 (10%), highest qualifying = 50 → 10%
    );
    // lineBase = 60000, discount = 6000
    expect(result.cartTotal).toBe(54000);
    expect(result.volumeDiscountTotal).toBe(6000);
  });

  test("multiple products each with own tiers", () => {
    const result = computeCartWithTierDiscount(
      [
        { id: "A", caseSize: 10, ptrMinor: 1000, moqTiers: [{ minQty: 20, discountPct: 10 }] },
        { id: "B", caseSize: 5, ptrMinor: 2000, moqTiers: [{ minQty: 100, discountPct: 20 }] },
      ],
      { A: 3, B: 4 } // A: 30 units ≥ 20 → 10%; B: 20 units < 100 → 0%
    );
    // A: lineBase=30000, disc=3000, net=27000
    // B: lineBase=40000, disc=0, net=40000
    expect(result.cartTotal).toBe(67000);
    expect(result.volumeDiscountTotal).toBe(3000);
  });

  test("zero-qty items are skipped", () => {
    const result = computeCartWithTierDiscount(
      [{ id: "A", caseSize: 10, ptrMinor: 1000, moqTiers: [{ minQty: 5, discountPct: 50 }] }],
      { A: 0 }
    );
    expect(result.cartTotal).toBe(0);
    expect(result.volumeDiscountTotal).toBe(0);
  });

  test("empty moqTiers array → no discount", () => {
    const result = computeCartWithTierDiscount(
      [{ id: "A", caseSize: 10, ptrMinor: 1000, moqTiers: [] }],
      { A: 5 }
    );
    expect(result.cartTotal).toBe(50000);
    expect(result.volumeDiscountTotal).toBe(0);
  });
});
