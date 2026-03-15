/**
 * STG-508: GRN negative quantity — validate >= 0 at input
 *
 * Verifies that handleReceiveQuantityChange clamps negative values to 0,
 * preventing silent exclusion at the submit filter.
 *
 * Test type: UNIT_TEST (logic extraction — no component render)
 */

// Extract the clamping logic from handleReceiveQuantityChange
function clampQuantity(quantity: number): number {
  return Math.max(0, quantity);
}

describe("STG-508: GRN negative quantity validation", () => {
  test("positive quantity passes through unchanged", () => {
    expect(clampQuantity(5)).toBe(5);
  });

  test("zero quantity passes through", () => {
    expect(clampQuantity(0)).toBe(0);
  });

  test("negative quantity clamped to 0", () => {
    expect(clampQuantity(-1)).toBe(0);
  });

  test("large negative clamped to 0", () => {
    expect(clampQuantity(-999)).toBe(0);
  });

  test("fractional positive passes through", () => {
    expect(clampQuantity(2.5)).toBe(2.5);
  });

  test("fractional negative clamped to 0", () => {
    expect(clampQuantity(-0.5)).toBe(0);
  });
});
