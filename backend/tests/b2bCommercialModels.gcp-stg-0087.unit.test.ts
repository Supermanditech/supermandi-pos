/**
 * GCP-STG-0087: B2B Commercial Models — Unit Tests
 *
 * Tests:
 * 1. Cart split by billing model + supplier
 * 2. BillingModel type validation
 * 3. Commercialization config validation with DIRECT_SUPPLIER
 * 4. Retail price calculation
 */

import { splitCartByBillingModel } from "../src/services/orderInvoiceService";
import {
  validateCommercialization,
  calculateRetailPrice,
  DEFAULT_COMMERCIALIZATION,
  type CommercializationConfig,
} from "../src/services/catalogCommercialization";

describe("GCP-STG-0087: B2B Commercial Models", () => {
  // =========================================================================
  // Cart Split
  // =========================================================================
  describe("splitCartByBillingModel", () => {
    it("groups items by supplier + billing model", () => {
      const items = [
        { supplierProductId: "sp1", supplierId: "s1", billingModel: "SUPERMANDI_PRINCIPAL" as const, qty: 10 },
        { supplierProductId: "sp2", supplierId: "s1", billingModel: "SUPERMANDI_PRINCIPAL" as const, qty: 5 },
        { supplierProductId: "sp3", supplierId: "s1", billingModel: "DIRECT_SUPPLIER" as const, qty: 3 },
        { supplierProductId: "sp4", supplierId: "s2", billingModel: "SUPERMANDI_PRINCIPAL" as const, qty: 7 },
      ];

      const groups = splitCartByBillingModel(items);
      expect(groups.size).toBe(3);

      // s1 + SUPERMANDI_PRINCIPAL
      const g1 = groups.get("s1::SUPERMANDI_PRINCIPAL");
      expect(g1).toHaveLength(2);
      expect(g1![0].supplierProductId).toBe("sp1");
      expect(g1![1].supplierProductId).toBe("sp2");

      // s1 + DIRECT_SUPPLIER
      const g2 = groups.get("s1::DIRECT_SUPPLIER");
      expect(g2).toHaveLength(1);
      expect(g2![0].supplierProductId).toBe("sp3");

      // s2 + SUPERMANDI_PRINCIPAL
      const g3 = groups.get("s2::SUPERMANDI_PRINCIPAL");
      expect(g3).toHaveLength(1);
      expect(g3![0].supplierProductId).toBe("sp4");
    });

    it("returns single group for uniform billing model", () => {
      const items = [
        { supplierProductId: "sp1", supplierId: "s1", billingModel: "SUPERMANDI_PRINCIPAL" as const },
        { supplierProductId: "sp2", supplierId: "s1", billingModel: "SUPERMANDI_PRINCIPAL" as const },
      ];

      const groups = splitCartByBillingModel(items);
      expect(groups.size).toBe(1);
      expect(groups.get("s1::SUPERMANDI_PRINCIPAL")).toHaveLength(2);
    });

    it("handles empty cart", () => {
      const groups = splitCartByBillingModel([]);
      expect(groups.size).toBe(0);
    });

    it("separates by supplier even with same billing model", () => {
      const items = [
        { supplierProductId: "sp1", supplierId: "s1", billingModel: "DIRECT_SUPPLIER" as const },
        { supplierProductId: "sp2", supplierId: "s2", billingModel: "DIRECT_SUPPLIER" as const },
      ];

      const groups = splitCartByBillingModel(items);
      expect(groups.size).toBe(2);
    });
  });

  // =========================================================================
  // Commercialization Validation
  // =========================================================================
  describe("validateCommercialization", () => {
    it("accepts SUPERMANDI_PRINCIPAL", () => {
      const result = validateCommercialization({ billingModel: "SUPERMANDI_PRINCIPAL" });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("accepts DIRECT_SUPPLIER", () => {
      const result = validateCommercialization({ billingModel: "DIRECT_SUPPLIER" });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("rejects unknown billing model", () => {
      const result = validateCommercialization({ billingModel: "UNKNOWN" as any });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("validates margin range", () => {
      const result = validateCommercialization({ marginPct: 150 });
      expect(result.valid).toBe(false);

      const result2 = validateCommercialization({ marginPct: -5 });
      expect(result2.valid).toBe(false);
    });

    it("validates specific_stores requires store IDs", () => {
      const result = validateCommercialization({
        publishTarget: "specific_stores",
        publishStoreIds: [],
      });
      expect(result.valid).toBe(false);
    });

    it("passes with valid complete config", () => {
      const result = validateCommercialization({
        billingModel: "DIRECT_SUPPLIER",
        marginPct: 10,
        publishTarget: "all_stores",
      });
      expect(result.valid).toBe(true);
    });
  });

  // =========================================================================
  // Retail Price Calculation
  // =========================================================================
  describe("calculateRetailPrice", () => {
    it("calculates percentage margin", () => {
      const config: CommercializationConfig = {
        ...DEFAULT_COMMERCIALIZATION,
        marginMode: "percentage",
        marginPct: 15,
      };
      // 10000 paise (₹100) + 15% = 11500 paise (₹115)
      expect(calculateRetailPrice(10000, config)).toBe(11500);
    });

    it("calculates fixed margin", () => {
      const config: CommercializationConfig = {
        ...DEFAULT_COMMERCIALIZATION,
        marginMode: "fixed",
        marginFixedMinor: 500,
      };
      // 10000 + 500 = 10500
      expect(calculateRetailPrice(10000, config)).toBe(10500);
    });

    it("calculates combined margin", () => {
      const config: CommercializationConfig = {
        ...DEFAULT_COMMERCIALIZATION,
        marginMode: "both",
        marginPct: 10,
        marginFixedMinor: 200,
      };
      // 10000 * 1.10 = 11000, + 200 = 11200
      expect(calculateRetailPrice(10000, config)).toBe(11200);
    });

    it("falls back to 15% default", () => {
      const config: CommercializationConfig = {
        ...DEFAULT_COMMERCIALIZATION,
        marginMode: "percentage",
        marginPct: undefined,
      };
      // 10000 * 1.15 = 11500
      expect(calculateRetailPrice(10000, config)).toBe(11500);
    });
  });
});
