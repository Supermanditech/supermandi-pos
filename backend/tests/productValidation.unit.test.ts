// Unit tests for backend/src/utils/productValidation.ts
import {
  validateProductName,
  validateBarcode,
  validatePrice,
  validateStock,
  PRODUCT_VALIDATION_CONSTANTS,
} from "../src/utils/productValidation";

describe("validateProductName", () => {
  it("accepts valid product names", () => {
    expect(validateProductName("Tata Salt 1kg")).toEqual({ valid: true });
    expect(validateProductName("AB")).toEqual({ valid: true });
  });

  it("rejects names shorter than min length", () => {
    const result = validateProductName("A");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("at least");
  });

  it("rejects empty string", () => {
    const result = validateProductName("");
    expect(result.valid).toBe(false);
  });

  it("rejects whitespace-only strings", () => {
    const result = validateProductName("   ");
    expect(result.valid).toBe(false);
  });

  it("rejects names exceeding max length", () => {
    const longName = "A".repeat(501);
    const result = validateProductName(longName);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("at most");
  });

  it("accepts names at exact max length", () => {
    const name = "A".repeat(500);
    expect(validateProductName(name).valid).toBe(true);
  });

  it("rejects names with only special characters (no letter/digit)", () => {
    const result = validateProductName("---");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("at least one letter or digit");
  });

  it("accepts Hindi/Devanagari product names", () => {
    expect(validateProductName("टाटा नमक")).toEqual({ valid: true });
  });

  it("trims whitespace for length check", () => {
    // "  AB  " trimmed is "AB" which is 2 chars = valid
    expect(validateProductName("  AB  ").valid).toBe(true);
  });

  it("rejects non-string input", () => {
    const result = validateProductName(123 as any);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("string");
  });
});

describe("validateBarcode", () => {
  it("accepts null/undefined/empty (optional field)", () => {
    expect(validateBarcode(null as any).valid).toBe(true);
    expect(validateBarcode(undefined as any).valid).toBe(true);
    expect(validateBarcode("").valid).toBe(true);
  });

  it("accepts whitespace-only (empty after trim)", () => {
    expect(validateBarcode("   ").valid).toBe(true);
  });

  it("accepts EAN-13", () => {
    expect(validateBarcode("8901030645457").valid).toBe(true);
  });

  it("accepts EAN-8", () => {
    expect(validateBarcode("12345678").valid).toBe(true);
  });

  it("accepts UPC-A (12 digits)", () => {
    expect(validateBarcode("012345678901").valid).toBe(true);
  });

  it("accepts internal SuperMandi barcodes", () => {
    expect(validateBarcode("SM-ABC123").valid).toBe(true);
    expect(validateBarcode("2123456").valid).toBe(true);
  });

  it("accepts custom alphanumeric barcodes", () => {
    expect(validateBarcode("MY-CUSTOM-001").valid).toBe(true);
  });

  it("rejects too short barcodes", () => {
    const result = validateBarcode("AB");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("at least");
  });

  it("rejects too long barcodes", () => {
    const result = validateBarcode("A".repeat(51));
    expect(result.valid).toBe(false);
    expect(result.error).toContain("at most");
  });

  it("rejects invalid format (special chars)", () => {
    const result = validateBarcode("abc@#$%");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Invalid barcode format");
  });

  it("rejects non-string input", () => {
    const result = validateBarcode(12345 as any);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("string");
  });
});

describe("validatePrice", () => {
  it("accepts valid prices in minor units", () => {
    expect(validatePrice(100).valid).toBe(true);
    expect(validatePrice(1).valid).toBe(true);
    expect(validatePrice(999999999).valid).toBe(true);
  });

  it("rejects null/undefined", () => {
    expect(validatePrice(null as any).valid).toBe(false);
    expect(validatePrice(undefined as any).valid).toBe(false);
  });

  it("rejects zero price", () => {
    const result = validatePrice(0);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("at least");
  });

  it("rejects negative price", () => {
    const result = validatePrice(-100);
    expect(result.valid).toBe(false);
  });

  it("rejects price exceeding maximum", () => {
    const result = validatePrice(1_000_000_001);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("maximum");
  });

  it("accepts price at exact maximum", () => {
    expect(validatePrice(1_000_000_000).valid).toBe(true);
  });

  it("rejects NaN", () => {
    const result = validatePrice(NaN);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("finite number");
  });

  it("rejects Infinity", () => {
    const result = validatePrice(Infinity);
    expect(result.valid).toBe(false);
  });

  it("accepts fractional price (valid but not integer)", () => {
    // The function notes "not an error per se" for non-integer
    expect(validatePrice(99.5).valid).toBe(true);
  });

  it("rejects non-number input", () => {
    const result = validatePrice("100" as any);
    expect(result.valid).toBe(false);
  });
});

describe("validateStock", () => {
  it("accepts valid stock quantities", () => {
    expect(validateStock(0).valid).toBe(true);
    expect(validateStock(1).valid).toBe(true);
    expect(validateStock(9999999).valid).toBe(true);
  });

  it("rejects null/undefined", () => {
    expect(validateStock(null as any).valid).toBe(false);
    expect(validateStock(undefined as any).valid).toBe(false);
  });

  it("rejects negative stock", () => {
    const result = validateStock(-1);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("negative");
  });

  it("rejects stock exceeding maximum", () => {
    const result = validateStock(10_000_001);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("maximum");
  });

  it("accepts stock at exact maximum", () => {
    expect(validateStock(10_000_000).valid).toBe(true);
  });

  it("accepts fractional stock (loose/bulk items)", () => {
    expect(validateStock(2.5).valid).toBe(true);
  });

  it("rejects NaN", () => {
    expect(validateStock(NaN).valid).toBe(false);
  });

  it("rejects Infinity", () => {
    expect(validateStock(Infinity).valid).toBe(false);
  });
});

describe("PRODUCT_VALIDATION_CONSTANTS", () => {
  it("exports expected constants", () => {
    expect(PRODUCT_VALIDATION_CONSTANTS.MIN_PRODUCT_NAME_LENGTH).toBe(2);
    expect(PRODUCT_VALIDATION_CONSTANTS.MAX_PRODUCT_NAME_LENGTH).toBe(500);
    expect(PRODUCT_VALIDATION_CONSTANTS.MIN_BARCODE_LENGTH).toBe(3);
    expect(PRODUCT_VALIDATION_CONSTANTS.MAX_BARCODE_LENGTH).toBe(50);
    expect(PRODUCT_VALIDATION_CONSTANTS.MIN_PRICE_MINOR).toBe(1);
    expect(PRODUCT_VALIDATION_CONSTANTS.MAX_PRICE_MINOR).toBe(1_000_000_000);
    expect(PRODUCT_VALIDATION_CONSTANTS.MAX_STOCK_QTY).toBe(10_000_000);
  });
});
