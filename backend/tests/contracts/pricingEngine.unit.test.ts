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

describe("V3-FIX-098: Edge cases", () => {
  it("rounds percentage margin to nearest paisa", () => {
    const result = calculateRetailerPrice({
      supplierPriceMinor: 9999,
      productMargin: { type: "percentage", value: 7 },
    });
    // 9999 * 1.07 = 10698.93 → rounds to 10699
    expect(result.retailerPriceMinor).toBe(10699);
  });

  it("falls back to global when margins are null", () => {
    const result = calculateRetailerPrice({
      supplierPriceMinor: 10000,
      productMargin: null,
      supplierMargin: null,
    });
    expect(result.retailerPriceMinor).toBe(10800);
    expect(result.marginSource).toBe("global");
  });

  it("falls back to global when margins have value=0", () => {
    const result = calculateRetailerPrice({
      supplierPriceMinor: 10000,
      productMargin: { type: "percentage", value: 0 },
      supplierMargin: { type: "percentage", value: 0 },
    });
    expect(result.retailerPriceMinor).toBe(10800);
    expect(result.marginSource).toBe("global");
  });

  it("no MRP cap when mrpMinor is undefined", () => {
    const result = calculateRetailerPrice({
      supplierPriceMinor: 10000,
      productMargin: { type: "percentage", value: 50 },
    });
    expect(result.retailerPriceMinor).toBe(15000);
  });

  it("same input produces deterministic output (idempotent)", () => {
    const input = {
      supplierPriceMinor: 7500,
      mrpMinor: 9900,
      productMargin: { type: "percentage" as const, value: 20 },
      supplierMargin: { type: "fixed" as const, value: 500 },
    };
    const r1 = calculateRetailerPrice(input);
    const r2 = calculateRetailerPrice(input);
    expect(r1).toEqual(r2);
    expect(r1.retailerPriceMinor).toBe(9000); // 7500 * 1.20 = 9000
    expect(r1.marginSource).toBe("product");
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
