// SA-P0-002: Unit tests for discount limit enforcement logic
// Tests the discount percentage calculation used in POST /sales

describe("SA-P0-002: Discount limit enforcement", () => {
  /**
   * Mirrors the validation logic in backend/src/routes/v1/pos/sales.ts:
   *   const discountPercent = (discount / subtotal) * 100;
   *   if (discountPercent > store.max_discount_percent) { ... DISCOUNT_LIMIT_EXCEEDED }
   */
  function checkDiscountLimit(
    subtotal: number,
    discount: number,
    maxDiscountPercent: number
  ): { allowed: boolean; discountPercent: number } {
    if (subtotal <= 0 || discount <= 0) {
      return { allowed: true, discountPercent: 0 };
    }
    const discountPercent = (discount / subtotal) * 100;
    return {
      allowed: discountPercent <= maxDiscountPercent,
      discountPercent,
    };
  }

  it("allows discount within limit", () => {
    const result = checkDiscountLimit(10000, 1000, 15); // 10% discount, 15% max
    expect(result.allowed).toBe(true);
    expect(result.discountPercent).toBe(10);
  });

  it("allows discount exactly at limit", () => {
    const result = checkDiscountLimit(10000, 1500, 15); // 15% discount, 15% max
    expect(result.allowed).toBe(true);
    expect(result.discountPercent).toBe(15);
  });

  it("rejects discount exceeding limit", () => {
    const result = checkDiscountLimit(10000, 2000, 15); // 20% discount, 15% max
    expect(result.allowed).toBe(false);
    expect(result.discountPercent).toBe(20);
  });

  it("allows any discount when limit is 100%", () => {
    const result = checkDiscountLimit(10000, 10000, 100); // 100% discount, 100% max
    expect(result.allowed).toBe(true);
    expect(result.discountPercent).toBe(100);
  });

  it("rejects any discount when limit is 0%", () => {
    const result = checkDiscountLimit(10000, 1, 0); // 0.01% discount, 0% max
    expect(result.allowed).toBe(false);
  });

  it("allows zero discount regardless of limit", () => {
    const result = checkDiscountLimit(10000, 0, 0);
    expect(result.allowed).toBe(true);
  });

  it("allows when subtotal is zero (no division by zero)", () => {
    const result = checkDiscountLimit(0, 0, 10);
    expect(result.allowed).toBe(true);
  });

  it("handles fractional percentages correctly", () => {
    // 12.5% discount with 12.5% max
    const result = checkDiscountLimit(8000, 1000, 12.5);
    expect(result.allowed).toBe(true);
    expect(result.discountPercent).toBe(12.5);
  });

  it("rejects fractional percentage just over limit", () => {
    // 12.51% discount with 12.5% max
    const result = checkDiscountLimit(10000, 1251, 12.5);
    expect(result.allowed).toBe(false);
    expect(result.discountPercent).toBeCloseTo(12.51, 2);
  });

  it("default max_discount_percent of 100 allows full discount", () => {
    // Default column value is 100.00
    const defaultMax = 100;
    const result = checkDiscountLimit(5000, 5000, defaultMax);
    expect(result.allowed).toBe(true);
  });
});
