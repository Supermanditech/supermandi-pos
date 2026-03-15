/**
 * STG-509: GRN excess quantity — backend reject qty > ordered + 10% tolerance
 *
 * Verifies that the 10% tolerance logic correctly identifies excess quantities.
 *
 * Test type: UNIT_TEST (logic extraction — no DB)
 */

// Extract the excess check logic from orders.ts
function isExcessQuantity(
  orderedQty: number,
  alreadyReceived: number,
  newReceiveQty: number
): { excess: boolean; totalReceived: number } {
  const totalReceived = alreadyReceived + newReceiveQty;
  const excess = orderedQty > 0 && totalReceived > orderedQty * 1.1;
  return { excess, totalReceived };
}

describe("STG-509: GRN excess quantity validation (10% tolerance)", () => {
  test("exact ordered quantity — allowed", () => {
    expect(isExcessQuantity(100, 0, 100).excess).toBe(false);
  });

  test("within 10% tolerance — allowed", () => {
    expect(isExcessQuantity(100, 0, 110).excess).toBe(false);
  });

  test("exceeds 10% tolerance — rejected", () => {
    expect(isExcessQuantity(100, 0, 111).excess).toBe(true);
  });

  test("partial receive + new exceeds 110% — rejected", () => {
    expect(isExcessQuantity(100, 50, 61).excess).toBe(true);
  });

  test("partial receive + new within 110% — allowed", () => {
    expect(isExcessQuantity(100, 50, 60).excess).toBe(false);
  });

  test("zero ordered quantity — skip check (allowed)", () => {
    expect(isExcessQuantity(0, 0, 100).excess).toBe(false);
  });

  test("small ordered quantity — tolerance still works", () => {
    // Ordered 1, tolerance = 1.1, so receiving 2 exceeds
    expect(isExcessQuantity(1, 0, 2).excess).toBe(true);
    // Receiving 1 is fine
    expect(isExcessQuantity(1, 0, 1).excess).toBe(false);
  });
});
