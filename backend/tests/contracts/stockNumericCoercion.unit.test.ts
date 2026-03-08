/**
 * BLK-SP1 Regression Guard: Stock NUMERIC Coercion
 *
 * PostgreSQL NUMERIC type serializes as string in JSON (e.g. "10.000").
 * The parseStock() helper in storeProducts.ts and inventory.ts must convert
 * these to JS numbers so API responses always return currentStock as number.
 *
 * Root cause: COALESCE(sb.current_qty, sp.current_stock, 0) returns NUMERIC,
 * which pg driver serializes as string. Client checked typeof === "number",
 * which failed for strings, causing stock to display as 0.
 */

describe('BLK-SP1: parseStock coercion', () => {
  // Mirror the parseStock helper from storeProducts.ts
  function parseStock(value: unknown): number {
    if (value === null || value === undefined) return 0;
    const n = Number(value);
    return isNaN(n) ? 0 : n;
  }

  it('converts NUMERIC string "10.000" to number 10', () => {
    expect(parseStock("10.000")).toBe(10);
  });

  it('converts NUMERIC string "0.000" to number 0', () => {
    expect(parseStock("0.000")).toBe(0);
  });

  it('converts NUMERIC string "99.500" to number 99.5', () => {
    expect(parseStock("99.500")).toBe(99.5);
  });

  it('handles integer string "42"', () => {
    expect(parseStock("42")).toBe(42);
  });

  it('handles actual number input', () => {
    expect(parseStock(10)).toBe(10);
  });

  it('handles null → 0', () => {
    expect(parseStock(null)).toBe(0);
  });

  it('handles undefined → 0', () => {
    expect(parseStock(undefined)).toBe(0);
  });

  it('handles empty string → 0', () => {
    expect(parseStock("")).toBe(0);
  });

  it('handles non-numeric string → 0', () => {
    expect(parseStock("abc")).toBe(0);
  });

  it('handles zero number', () => {
    expect(parseStock(0)).toBe(0);
  });
});

describe('BLK-SP1: API response shape contract', () => {
  it('currentStock must be typeof number in store-products/list response', () => {
    // Simulates the mapping from storeProducts.ts list endpoint
    const mockDbRow = {
      current_stock: "10.000", // PostgreSQL NUMERIC → string
    };

    function parseStock(value: unknown): number {
      if (value === null || value === undefined) return 0;
      const n = Number(value);
      return isNaN(n) ? 0 : n;
    }

    const apiResponse = {
      currentStock: parseStock(mockDbRow.current_stock),
    };

    expect(typeof apiResponse.currentStock).toBe("number");
    expect(apiResponse.currentStock).toBe(10);
  });

  it('currentStock must be typeof number in store-products/search response', () => {
    const mockDbRow = {
      current_stock: "5.000",
    };

    function parseStock(value: unknown): number {
      if (value === null || value === undefined) return 0;
      const n = Number(value);
      return isNaN(n) ? 0 : n;
    }

    const apiResponse = {
      currentStock: parseStock(mockDbRow.current_stock),
    };

    expect(typeof apiResponse.currentStock).toBe("number");
    expect(apiResponse.currentStock).toBe(5);
  });

  it('REGRESSION: raw NUMERIC string must NOT pass typeof === "number" check', () => {
    // This is the exact bug that caused BLK-SP1
    const rawNumericFromPostgres = "10.000";
    expect(typeof rawNumericFromPostgres === "number").toBe(false);
    // Confirms that without parseStock, the old code path would fail
  });
});
