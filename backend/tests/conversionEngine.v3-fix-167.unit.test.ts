/**
 * V3-FIX-167: Canonical conversion engine unit tests
 * Tests procurement→stock, retail→stock, unit multipliers, inference, validation
 */
import {
  procurementToStock,
  retailToStockDecrement,
  getUnitMultiplier,
  areSameFamily,
  inferBaseStockUnit,
  suggestRetailVariants,
  validateConversionProfile,
  normalizeUnitString,
} from "../src/services/conversionEngine";

describe("conversionEngine", () => {
  describe("procurementToStock", () => {
    it("converts cartons to pieces (5 cartons × 24 pcs)", () => {
      expect(procurementToStock(5, 24)).toBe(120);
    });

    it("converts bags to kg (3 bags × 50 kg)", () => {
      expect(procurementToStock(3, 50)).toBe(150);
    });

    it("handles 1:1 procurement (10 pcs × 1)", () => {
      expect(procurementToStock(10, 1)).toBe(10);
    });

    it("handles fractional pack qty (2 tins × 15.5 ltr)", () => {
      expect(procurementToStock(2, 15.5)).toBe(31);
    });

    it("returns 0 for zero quantity", () => {
      expect(procurementToStock(0, 24)).toBe(0);
    });

    it("returns 0 for negative quantity", () => {
      expect(procurementToStock(-5, 24)).toBe(0);
    });

    it("returns 0 for zero pack qty", () => {
      expect(procurementToStock(5, 0)).toBe(0);
    });

    it("returns 0 for NaN input", () => {
      expect(procurementToStock(NaN, 24)).toBe(0);
      expect(procurementToStock(5, NaN)).toBe(0);
    });
  });

  describe("retailToStockDecrement", () => {
    it("converts 2 units of 500GM variant from KG stock", () => {
      // 2 × 500 GM × 0.001 (GM→KG) = 1.0 KG
      expect(retailToStockDecrement(2, 500, "GM", "KG")).toBe(1);
    });

    it("converts 1 unit of 1KG variant from KG stock", () => {
      expect(retailToStockDecrement(1, 1, "KG", "KG")).toBe(1);
    });

    it("converts 3 units of 250ML variant from LTR stock", () => {
      // 3 × 250 ML × 0.001 (ML→LTR) = 0.75 LTR
      expect(retailToStockDecrement(3, 250, "ML", "LTR")).toBe(0.75);
    });

    it("converts dozen to pieces", () => {
      // 1 × 1 DOZEN × 12 (DOZEN→PCS) = 12 PCS
      expect(retailToStockDecrement(1, 1, "DOZEN", "PCS")).toBe(12);
    });

    it("converts pieces to pieces", () => {
      expect(retailToStockDecrement(5, 1, "PCS", "PCS")).toBe(5);
    });

    it("returns 0 for cross-family conversion (KG → PCS)", () => {
      expect(retailToStockDecrement(1, 1, "KG", "PCS")).toBe(0);
    });

    it("returns 0 for zero retail qty", () => {
      expect(retailToStockDecrement(0, 500, "GM", "KG")).toBe(0);
    });

    it("handles precision correctly", () => {
      // 1 × 333 GM → KG with precision 3 = 0.333
      expect(retailToStockDecrement(1, 333, "GM", "KG", 3)).toBe(0.333);
    });
  });

  describe("getUnitMultiplier", () => {
    it("GM → KG = 0.001", () => {
      expect(getUnitMultiplier("GM", "KG")).toBe(0.001);
    });

    it("KG → GM = 1000", () => {
      expect(getUnitMultiplier("KG", "GM")).toBe(1000);
    });

    it("ML → LTR = 0.001", () => {
      expect(getUnitMultiplier("ML", "LTR")).toBe(0.001);
    });

    it("LTR → ML = 1000", () => {
      expect(getUnitMultiplier("LTR", "ML")).toBe(1000);
    });

    it("DOZEN → PCS = 12", () => {
      expect(getUnitMultiplier("DOZEN", "PCS")).toBe(12);
    });

    it("PCS → DOZEN = 1/12", () => {
      const result = getUnitMultiplier("PCS", "DOZEN");
      expect(result).toBeCloseTo(1 / 12, 10);
    });

    it("same unit = 1", () => {
      expect(getUnitMultiplier("KG", "KG")).toBe(1);
      expect(getUnitMultiplier("PCS", "PCS")).toBe(1);
    });

    it("cross-family returns null", () => {
      expect(getUnitMultiplier("KG", "PCS")).toBeNull();
      expect(getUnitMultiplier("LTR", "KG")).toBeNull();
      expect(getUnitMultiplier("ML", "DOZEN")).toBeNull();
    });

    it("handles case insensitivity", () => {
      expect(getUnitMultiplier("kg", "GM")).toBe(1000);
      expect(getUnitMultiplier("gm", "KG")).toBe(0.001);
    });
  });

  describe("areSameFamily", () => {
    it("KG and GM are same family", () => {
      expect(areSameFamily("KG", "GM")).toBe(true);
    });

    it("LTR and ML are same family", () => {
      expect(areSameFamily("LTR", "ML")).toBe(true);
    });

    it("PCS and DOZEN are same family", () => {
      expect(areSameFamily("PCS", "DOZEN")).toBe(true);
    });

    it("KG and LTR are different families", () => {
      expect(areSameFamily("KG", "LTR")).toBe(false);
    });

    it("PCS and KG are different families", () => {
      expect(areSameFamily("PCS", "KG")).toBe(false);
    });
  });

  describe("inferBaseStockUnit", () => {
    it("LOOSE_BULK weight → KG", () => {
      expect(inferBaseStockUnit("LOOSE_BULK", "WEIGHT", "KG", null)).toBe("KG");
      expect(inferBaseStockUnit("LOOSE_BULK", "WEIGHT", "GM", null)).toBe("KG");
    });

    it("LOOSE_BULK volume → LTR", () => {
      expect(inferBaseStockUnit("LOOSE_BULK", "WEIGHT", "LTR", null)).toBe("LTR");
      expect(inferBaseStockUnit("LOOSE_BULK", "WEIGHT", "ML", null)).toBe("LTR");
    });

    it("LOOSE_BULK count → PCS", () => {
      expect(inferBaseStockUnit("LOOSE_BULK", "COUNT", "PCS", null)).toBe("PCS");
      expect(inferBaseStockUnit("LOOSE_BULK", "COUNT", "DOZEN", null)).toBe("PCS");
    });

    it("PACKAGED → PCS", () => {
      expect(inferBaseStockUnit("PACKAGED", null, null, null)).toBe("PCS");
    });

    it("fallback from unit field", () => {
      expect(inferBaseStockUnit(null, null, null, "kg")).toBe("KG");
      expect(inferBaseStockUnit(null, null, null, "L")).toBe("LTR");
    });

    it("no info → PCS default", () => {
      expect(inferBaseStockUnit(null, null, null, null)).toBe("PCS");
    });
  });

  describe("suggestRetailVariants", () => {
    it("KG stock suggests weight variants", () => {
      const variants = suggestRetailVariants("KG");
      expect(variants.length).toBeGreaterThanOrEqual(3);
      expect(variants.some(v => v.label === "1 kg")).toBe(true);
      expect(variants.some(v => v.label === "500 g")).toBe(true);
    });

    it("LTR stock suggests volume variants", () => {
      const variants = suggestRetailVariants("LTR");
      expect(variants.some(v => v.label === "1 L")).toBe(true);
      expect(variants.some(v => v.label === "500 ml")).toBe(true);
    });

    it("PCS + COUNT suggests count variants", () => {
      const variants = suggestRetailVariants("PCS", "COUNT");
      expect(variants.some(v => v.label === "1 pc")).toBe(true);
      expect(variants.some(v => v.label === "1 dozen")).toBe(true);
    });
  });

  describe("validateConversionProfile", () => {
    it("valid profile passes", () => {
      expect(validateConversionProfile({
        procurementUnit: "CARTON",
        procurementPackQty: 24,
        baseStockUnit: "PCS",
      })).toBeNull();
    });

    it("invalid procurement unit fails", () => {
      expect(validateConversionProfile({
        procurementUnit: "INVALID" as any,
      })).toMatch(/Invalid procurement_unit/);
    });

    it("invalid base stock unit fails", () => {
      expect(validateConversionProfile({
        baseStockUnit: "CARTON" as any,
      })).toMatch(/Invalid base_stock_unit/);
    });

    it("negative pack qty fails", () => {
      expect(validateConversionProfile({
        procurementPackQty: -5,
      })).toMatch(/positive number/);
    });

    it("weight→volume cross-family fails", () => {
      expect(validateConversionProfile({
        procurementUnit: "KG",
        baseStockUnit: "LTR",
      })).toMatch(/Cannot convert/);
    });

    it("packaging type → any stock unit passes", () => {
      expect(validateConversionProfile({
        procurementUnit: "CARTON",
        baseStockUnit: "KG",
      })).toBeNull();
    });
  });

  describe("normalizeUnitString", () => {
    it("normalizes common aliases", () => {
      expect(normalizeUnitString("g")).toBe("GM");
      expect(normalizeUnitString("gram")).toBe("GM");
      expect(normalizeUnitString("kilogram")).toBe("KG");
      expect(normalizeUnitString("L")).toBe("LTR");
      expect(normalizeUnitString("litre")).toBe("LTR");
      expect(normalizeUnitString("piece")).toBe("PCS");
      expect(normalizeUnitString("doz")).toBe("DOZEN");
      expect(normalizeUnitString("ctn")).toBe("CARTON");
      expect(normalizeUnitString("pkt")).toBe("PACK");
    });

    it("preserves already-canonical units", () => {
      expect(normalizeUnitString("KG")).toBe("KG");
      expect(normalizeUnitString("PCS")).toBe("PCS");
      expect(normalizeUnitString("DOZEN")).toBe("DOZEN");
    });
  });
});
