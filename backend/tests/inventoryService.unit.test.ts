// Unit tests for backend/src/services/inventoryService.ts (pure functions)
import {
  normalizeUnit,
  isSupermandiBarcode,
  computeBaseQuantity,
  isBulkQuantity,
} from "../src/services/inventoryService";

describe("normalizeUnit", () => {
  it("normalizes 'g' to base unit g with multiplier 1", () => {
    expect(normalizeUnit("g")).toEqual({ baseUnit: "g", multiplier: 1 });
  });

  it("normalizes 'kg' to base unit g with multiplier 1000", () => {
    expect(normalizeUnit("kg")).toEqual({ baseUnit: "g", multiplier: 1000 });
  });

  it("normalizes 'ml' to base unit ml with multiplier 1", () => {
    expect(normalizeUnit("ml")).toEqual({ baseUnit: "ml", multiplier: 1 });
  });

  it("normalizes 'l' to base unit ml with multiplier 1000", () => {
    expect(normalizeUnit("l")).toEqual({ baseUnit: "ml", multiplier: 1000 });
  });

  it("is case-insensitive", () => {
    expect(normalizeUnit("KG")).toEqual({ baseUnit: "g", multiplier: 1000 });
    expect(normalizeUnit("ML")).toEqual({ baseUnit: "ml", multiplier: 1 });
    expect(normalizeUnit("L")).toEqual({ baseUnit: "ml", multiplier: 1000 });
  });

  it("trims whitespace", () => {
    expect(normalizeUnit("  kg  ")).toEqual({ baseUnit: "g", multiplier: 1000 });
  });

  it("returns null for unsupported units", () => {
    expect(normalizeUnit("oz")).toBeNull();
    expect(normalizeUnit("lb")).toBeNull();
    expect(normalizeUnit("pcs")).toBeNull();
  });

  it("returns null for null/undefined/empty", () => {
    expect(normalizeUnit(null)).toBeNull();
    expect(normalizeUnit(undefined)).toBeNull();
    expect(normalizeUnit("")).toBeNull();
  });
});

describe("isSupermandiBarcode", () => {
  it("returns true for valid SuperMandi barcodes", () => {
    expect(isSupermandiBarcode("SM1234ABCDEF12")).toBe(true);
    expect(isSupermandiBarcode("SM0000000000FF")).toBe(true);
    expect(isSupermandiBarcode("SMABCDEF123456")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isSupermandiBarcode("sm1234abcdef12")).toBe(true);
    expect(isSupermandiBarcode("Sm1234AbCdEf12")).toBe(true);
  });

  it("rejects invalid SuperMandi barcodes", () => {
    expect(isSupermandiBarcode("SM1234")).toBe(false); // too short
    expect(isSupermandiBarcode("SM1234ABCDEFG123")).toBe(false); // too long
    expect(isSupermandiBarcode("XX1234ABCDEF12")).toBe(false); // wrong prefix
    expect(isSupermandiBarcode("SMGHIJKLMNOP12")).toBe(false); // G not in hex
  });

  it("trims whitespace", () => {
    expect(isSupermandiBarcode("  SM1234ABCDEF12  ")).toBe(true);
  });
});

describe("computeBaseQuantity", () => {
  it("computes base quantity for kg", () => {
    const result = computeBaseQuantity(1.5, "kg");
    expect(result).not.toBeNull();
    expect(result!.baseUnit).toBe("g");
    expect(result!.quantityBase).toBe(1500);
  });

  it("computes base quantity for g", () => {
    const result = computeBaseQuantity(500, "g");
    expect(result).not.toBeNull();
    expect(result!.baseUnit).toBe("g");
    expect(result!.quantityBase).toBe(500);
  });

  it("computes base quantity for l", () => {
    const result = computeBaseQuantity(2, "l");
    expect(result).not.toBeNull();
    expect(result!.baseUnit).toBe("ml");
    expect(result!.quantityBase).toBe(2000);
  });

  it("computes base quantity for ml", () => {
    const result = computeBaseQuantity(250, "ml");
    expect(result).not.toBeNull();
    expect(result!.baseUnit).toBe("ml");
    expect(result!.quantityBase).toBe(250);
  });

  it("returns null for zero quantity", () => {
    expect(computeBaseQuantity(0, "kg")).toBeNull();
  });

  it("returns null for negative quantity", () => {
    expect(computeBaseQuantity(-1, "kg")).toBeNull();
  });

  it("returns null for unsupported unit", () => {
    expect(computeBaseQuantity(1, "oz")).toBeNull();
  });

  it("returns null for null/undefined unit", () => {
    expect(computeBaseQuantity(1, null)).toBeNull();
    expect(computeBaseQuantity(1, undefined)).toBeNull();
  });

  it("returns null for NaN quantity", () => {
    expect(computeBaseQuantity(NaN, "kg")).toBeNull();
  });

  it("returns null for Infinity quantity", () => {
    expect(computeBaseQuantity(Infinity, "kg")).toBeNull();
  });

  it("rounds to nearest integer", () => {
    const result = computeBaseQuantity(1.5, "g");
    expect(result).not.toBeNull();
    expect(result!.quantityBase).toBe(2);
  });
});

describe("isBulkQuantity", () => {
  it("returns true for quantities >= 1000 base units", () => {
    expect(isBulkQuantity(1000)).toBe(true);
    expect(isBulkQuantity(5000)).toBe(true);
  });

  it("returns false for quantities < 1000 base units", () => {
    expect(isBulkQuantity(999)).toBe(false);
    expect(isBulkQuantity(500)).toBe(false);
    expect(isBulkQuantity(0)).toBe(false);
  });
});
