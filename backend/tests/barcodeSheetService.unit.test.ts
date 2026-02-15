// Unit tests for backend/src/services/barcodeSheetService.ts
// Tests the pure functions (no DB or PDF rendering)

// Mock pdfkit and bwip-js (not used in pure function tests)
jest.mock("pdfkit", () => jest.fn());
jest.mock("bwip-js", () => ({ toBuffer: jest.fn() }));

import { resolveBarcodeSheetTier } from "../src/services/barcodeSheetService";

describe("resolveBarcodeSheetTier", () => {
  it("returns tier1 for '1'", () => {
    expect(resolveBarcodeSheetTier("1")).toBe("tier1");
  });

  it("returns tier1 for 'tier1'", () => {
    expect(resolveBarcodeSheetTier("tier1")).toBe("tier1");
  });

  it("returns tier1 for 'tier-1'", () => {
    expect(resolveBarcodeSheetTier("tier-1")).toBe("tier1");
  });

  it("returns tier1 for 'tier_1'", () => {
    expect(resolveBarcodeSheetTier("tier_1")).toBe("tier1");
  });

  it("returns tier2 for '2'", () => {
    expect(resolveBarcodeSheetTier("2")).toBe("tier2");
  });

  it("returns tier2 for 'tier2'", () => {
    expect(resolveBarcodeSheetTier("tier2")).toBe("tier2");
  });

  it("returns tier2 for 'tier-2'", () => {
    expect(resolveBarcodeSheetTier("tier-2")).toBe("tier2");
  });

  it("returns tier2 for 'tier_2'", () => {
    expect(resolveBarcodeSheetTier("tier_2")).toBe("tier2");
  });

  it("returns null for undefined", () => {
    expect(resolveBarcodeSheetTier(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(resolveBarcodeSheetTier("")).toBeNull();
  });

  it("returns null for whitespace", () => {
    expect(resolveBarcodeSheetTier("   ")).toBeNull();
  });

  it("returns null for invalid input", () => {
    expect(resolveBarcodeSheetTier("3")).toBeNull();
    expect(resolveBarcodeSheetTier("tier3")).toBeNull();
    expect(resolveBarcodeSheetTier("abc")).toBeNull();
  });

  it("handles case insensitivity", () => {
    expect(resolveBarcodeSheetTier("TIER1")).toBe("tier1");
    expect(resolveBarcodeSheetTier("Tier2")).toBe("tier2");
  });

  it("trims whitespace", () => {
    expect(resolveBarcodeSheetTier("  tier1  ")).toBe("tier1");
  });
});
