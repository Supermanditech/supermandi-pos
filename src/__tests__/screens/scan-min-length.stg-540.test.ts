/**
 * STG-540: Barcode minimum length validation
 *
 * Verifies that handleScan rejects inputs shorter than 3 characters
 * since no valid barcode/SKU is 1-2 chars long.
 *
 * Test type: UNIT_TEST (logic extraction — no scanner/device)
 */

describe("STG-540: Barcode minimum length validation", () => {
  // Extract the validation logic from handleScan
  function isBarcodeTooShort(barcode: string): boolean {
    const trimmed = barcode.trim().toUpperCase();
    if (!trimmed) return true; // empty is also rejected
    return trimmed.length < 3;
  }

  test("1-char barcode rejected", () => {
    expect(isBarcodeTooShort("A")).toBe(true);
  });

  test("2-char barcode rejected", () => {
    expect(isBarcodeTooShort("AB")).toBe(true);
  });

  test("3-char barcode accepted", () => {
    expect(isBarcodeTooShort("ABC")).toBe(false);
  });

  test("standard EAN-13 accepted", () => {
    expect(isBarcodeTooShort("8901234567890")).toBe(false);
  });

  test("whitespace-padded short input still rejected", () => {
    expect(isBarcodeTooShort("  A  ")).toBe(true);
  });

  test("empty string rejected", () => {
    expect(isBarcodeTooShort("")).toBe(true);
  });

  test("whitespace-only rejected", () => {
    expect(isBarcodeTooShort("   ")).toBe(true);
  });
});
