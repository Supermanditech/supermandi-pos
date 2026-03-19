/**
 * V3-HARDEN-172: Contract test for bulk-procurement-to-retail-sale lifecycle
 * Validates that the conversion engine produces correct results for
 * real kirana scenarios end-to-end.
 */
import {
  procurementToStock,
  retailToStockDecrement,
  getUnitMultiplier,
  inferBaseStockUnit,
  suggestRetailVariants,
  validateConversionProfile,
  normalizeUnitString,
  areSameFamily,
} from "../src/services/conversionEngine";

describe("V3-HARDEN-172: Bulk-to-Retail Lifecycle Contract", () => {
  describe("Scenario: Buy 100 kg sugar, sell 1 kg / 500 g / 250 g", () => {
    const procurement = { unit: "BAG" as const, packQty: 50, baseUnit: "KG" as const };

    it("2 bags × 50 kg/bag = 100 KG stock", () => {
      const stock = procurementToStock(2, procurement.packQty);
      expect(stock).toBe(100);
    });

    it("sell 1 unit of '500 g' variant → 0.5 KG decrement", () => {
      const decrement = retailToStockDecrement(1, 500, "GM", "KG");
      expect(decrement).toBe(0.5);
    });

    it("sell 4 units of '250 g' variant → 1 KG decrement", () => {
      const decrement = retailToStockDecrement(4, 250, "GM", "KG");
      expect(decrement).toBe(1);
    });

    it("sell 1 unit of '1 kg' variant → 1 KG decrement", () => {
      const decrement = retailToStockDecrement(1, 1, "KG", "KG");
      expect(decrement).toBe(1);
    });

    it("remaining stock after selling 1kg + 500g + 4×250g = 97.5 KG", () => {
      const initial = procurementToStock(2, 50); // 100 KG
      const sold = [
        retailToStockDecrement(1, 1, "KG", "KG"),     // 1
        retailToStockDecrement(1, 500, "GM", "KG"),    // 0.5
        retailToStockDecrement(4, 250, "GM", "KG"),    // 1
      ];
      const remaining = initial - sold.reduce((a, b) => a + b, 0);
      expect(remaining).toBe(97.5);
    });
  });

  describe("Scenario: Buy 15 L oil tins, sell 1 L / 500 ml", () => {
    it("3 tins × 5 ltr/tin = 15 LTR stock", () => {
      expect(procurementToStock(3, 5)).toBe(15);
    });

    it("sell 1 unit of '500 ml' variant → 0.5 LTR decrement", () => {
      expect(retailToStockDecrement(1, 500, "ML", "LTR")).toBe(0.5);
    });

    it("sell 1 unit of '1 L' variant → 1 LTR decrement", () => {
      expect(retailToStockDecrement(1, 1, "LTR", "LTR")).toBe(1);
    });
  });

  describe("Scenario: Buy eggs by tray, sell by piece or dozen", () => {
    it("2 trays × 30 pcs/tray = 60 PCS stock", () => {
      expect(procurementToStock(2, 30)).toBe(60);
    });

    it("sell 1 unit of '1 dozen' variant → 12 PCS decrement", () => {
      expect(retailToStockDecrement(1, 1, "DOZEN", "PCS")).toBe(12);
    });

    it("sell 6 units of '1 pc' variant → 6 PCS decrement", () => {
      expect(retailToStockDecrement(6, 1, "PCS", "PCS")).toBe(6);
    });
  });

  describe("Scenario: Buy cartons of 24 bottles, sell per piece", () => {
    it("5 cartons × 24 pcs = 120 PCS stock", () => {
      expect(procurementToStock(5, 24)).toBe(120);
    });

    it("sell 1 bottle → 1 PCS decrement", () => {
      expect(retailToStockDecrement(1, 1, "PCS", "PCS")).toBe(1);
    });
  });

  describe("Validation: Cross-family conversions blocked", () => {
    it("KG → PCS returns 0 (no cross-family)", () => {
      expect(retailToStockDecrement(1, 1, "KG", "PCS")).toBe(0);
    });

    it("LTR → KG returns 0 (no cross-family)", () => {
      expect(retailToStockDecrement(1, 1, "LTR", "KG")).toBe(0);
    });

    it("validateConversionProfile rejects KG → LTR", () => {
      expect(validateConversionProfile({
        procurementUnit: "KG",
        baseStockUnit: "LTR",
      })).toMatch(/Cannot convert/);
    });
  });

  describe("Inference: Legacy products get correct defaults", () => {
    it("LOOSE_BULK with rateUnit=KG → baseStockUnit=KG", () => {
      expect(inferBaseStockUnit("LOOSE_BULK", "WEIGHT", "KG", null)).toBe("KG");
    });

    it("LOOSE_BULK with rateUnit=ML → baseStockUnit=LTR", () => {
      expect(inferBaseStockUnit("LOOSE_BULK", "WEIGHT", "ML", null)).toBe("LTR");
    });

    it("PACKAGED with no unit → baseStockUnit=PCS", () => {
      expect(inferBaseStockUnit("PACKAGED", null, null, null)).toBe("PCS");
    });

    it("unknown product with unit=kg → baseStockUnit=KG", () => {
      expect(inferBaseStockUnit(null, null, null, "kg")).toBe("KG");
    });
  });

  describe("Suggested retail variants match kirana reality", () => {
    it("KG stock gets 250g, 500g, 1kg, 5kg", () => {
      const variants = suggestRetailVariants("KG");
      expect(variants).toHaveLength(4);
      expect(variants.map(v => v.label)).toEqual(["250 g", "500 g", "1 kg", "5 kg"]);
    });

    it("LTR stock gets 250ml, 500ml, 1L", () => {
      const variants = suggestRetailVariants("LTR");
      expect(variants).toHaveLength(3);
    });

    it("PCS + COUNT gets 1pc, 6pcs, 12pcs, 1 dozen", () => {
      const variants = suggestRetailVariants("PCS", "COUNT");
      expect(variants).toHaveLength(4);
    });
  });

  describe("Unit normalization handles messy supplier input", () => {
    it("normalizes g → GM", () => expect(normalizeUnitString("g")).toBe("GM"));
    it("normalizes Kilogram → KG", () => expect(normalizeUnitString("Kilogram")).toBe("KG"));
    it("normalizes litre → LTR", () => expect(normalizeUnitString("litre")).toBe("LTR"));
    it("normalizes piece → PCS", () => expect(normalizeUnitString("piece")).toBe("PCS"));
    it("normalizes ctn → CARTON", () => expect(normalizeUnitString("ctn")).toBe("CARTON"));
    it("preserves KG → KG", () => expect(normalizeUnitString("KG")).toBe("KG"));
  });

  describe("Unit family checks", () => {
    it("KG and GM are same family", () => expect(areSameFamily("KG", "GM")).toBe(true));
    it("KG and LTR are different", () => expect(areSameFamily("KG", "LTR")).toBe(false));
    it("PCS and DOZEN are same family", () => expect(areSameFamily("PCS", "DOZEN")).toBe(true));
    it("CARTON and PCS are same family", () => expect(areSameFamily("CARTON", "PCS")).toBe(true));
  });
});
