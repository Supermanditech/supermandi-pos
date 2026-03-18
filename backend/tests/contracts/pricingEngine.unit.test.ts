/**
 * V3-FIX-098 + V3-HARDEN-101: Pricing engine + status normalization tests
 */
import { calculateRetailerPrice, type MarginConfig } from "../../src/services/pricingEngine";
import { isSupplierActive, isSupplierVerified, normalizeSupplierStatus } from "../../src/services/statusHelpers";

describe("V3-FIX-098: Pricing engine", () => {
  it("applies percentage margin correctly", () => {
    const result = calculateRetailerPrice({
      supplierPriceMinor: 10000, // ₹100
      productMargin: { type: "percentage", value: 10 },
    });
    expect(result.retailerPriceMinor).toBe(11000); // ₹110
    expect(result.appliedMargin.type).toBe("percentage");
    expect(result.marginSource).toBe("product");
  });

  it("applies fixed margin correctly", () => {
    const result = calculateRetailerPrice({
      supplierPriceMinor: 10000,
      productMargin: { type: "fixed", value: 500 }, // ₹5
    });
    expect(result.retailerPriceMinor).toBe(10500);
  });

  it("uses supplier margin when product margin absent", () => {
    const result = calculateRetailerPrice({
      supplierPriceMinor: 10000,
      supplierMargin: { type: "percentage", value: 5 },
    });
    expect(result.retailerPriceMinor).toBe(10500);
    expect(result.marginSource).toBe("supplier");
  });

  it("falls back to global default (8%) when no overrides", () => {
    const result = calculateRetailerPrice({
      supplierPriceMinor: 10000,
    });
    expect(result.retailerPriceMinor).toBe(10800);
    expect(result.marginSource).toBe("global");
  });

  it("caps at MRP when result exceeds MRP", () => {
    const result = calculateRetailerPrice({
      supplierPriceMinor: 10000,
      mrpMinor: 10500,
      productMargin: { type: "percentage", value: 20 },
    });
    expect(result.retailerPriceMinor).toBe(10500); // Capped at MRP
  });

  it("precedence: product > supplier > global", () => {
    const result = calculateRetailerPrice({
      supplierPriceMinor: 10000,
      productMargin: { type: "percentage", value: 15 },
      supplierMargin: { type: "percentage", value: 10 },
      globalMargin: { type: "percentage", value: 8 },
    });
    expect(result.retailerPriceMinor).toBe(11500); // 15% product margin wins
    expect(result.marginSource).toBe("product");
  });
});

describe("V3-HARDEN-101: Status normalization", () => {
  it("isSupplierActive handles mixed case", () => {
    expect(isSupplierActive("ACTIVE")).toBe(true);
    expect(isSupplierActive("active")).toBe(true);
    expect(isSupplierActive("Active")).toBe(true);
    expect(isSupplierActive("verified")).toBe(true);
    expect(isSupplierActive("VERIFIED")).toBe(true);
    expect(isSupplierActive("inactive")).toBe(false);
    expect(isSupplierActive("SUSPENDED")).toBe(false);
    expect(isSupplierActive(null)).toBe(false);
    expect(isSupplierActive(undefined)).toBe(false);
  });

  it("isSupplierVerified handles mixed case", () => {
    expect(isSupplierVerified("verified")).toBe(true);
    expect(isSupplierVerified("Verified")).toBe(true);
    expect(isSupplierVerified("VERIFIED")).toBe(true);
    expect(isSupplierVerified("pending")).toBe(false);
    expect(isSupplierVerified(null)).toBe(false);
  });

  it("normalizeSupplierStatus returns uppercase", () => {
    expect(normalizeSupplierStatus("active")).toBe("ACTIVE");
    expect(normalizeSupplierStatus("verified")).toBe("VERIFIED");
    expect(normalizeSupplierStatus(null)).toBe("UNKNOWN");
  });
});
