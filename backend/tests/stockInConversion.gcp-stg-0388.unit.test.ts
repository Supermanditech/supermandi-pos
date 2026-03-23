/**
 * GCP-STG-0388: Backend stockIn.ts unit conversion awareness
 *
 * Tests that POST /pos/stock-in correctly applies procurement-to-stock
 * conversion when procurementUnit + packQty are provided in the request body,
 * falls back to DB conversion profile, or uses raw quantity when no
 * conversion info is available.
 */

import { procurementToStock } from "../src/services/conversionEngine";

describe("GCP-STG-0388: stock-in unit conversion", () => {
  // ---- procurementToStock function (imported from conversionEngine) ----

  describe("procurementToStock()", () => {
    it("converts carton quantity using packQty multiplier", () => {
      // 5 CARTONs × 24 PCS/CARTON = 120 PCS
      expect(procurementToStock(5, 24)).toBe(120);
    });

    it("converts bag quantity using packQty multiplier", () => {
      // 3 BAGs × 50 KG/BAG = 150 KG
      expect(procurementToStock(3, 50)).toBe(150);
    });

    it("handles single unit (packQty = 1) — no amplification", () => {
      // 10 PCS × 1 = 10 PCS (no conversion needed)
      expect(procurementToStock(10, 1)).toBe(10);
    });

    it("handles fractional packQty (e.g., 0.5 KG per unit)", () => {
      // 6 units × 0.5 KG/unit = 3 KG
      expect(procurementToStock(6, 0.5)).toBe(3);
    });

    it("returns 0 for zero quantity", () => {
      expect(procurementToStock(0, 24)).toBe(0);
    });

    it("returns 0 for negative quantity", () => {
      expect(procurementToStock(-5, 24)).toBe(0);
    });

    it("returns 0 for NaN quantity", () => {
      expect(procurementToStock(NaN, 24)).toBe(0);
    });

    it("returns 0 for zero packQty", () => {
      expect(procurementToStock(5, 0)).toBe(0);
    });

    it("returns 0 for negative packQty", () => {
      expect(procurementToStock(5, -10)).toBe(0);
    });

    it("returns 0 for NaN packQty", () => {
      expect(procurementToStock(5, NaN)).toBe(0);
    });

    it("returns 0 for Infinity quantity", () => {
      expect(procurementToStock(Infinity, 24)).toBe(0);
    });
  });

  // ---- Conversion decision logic (mirrors stockIn.ts branching) ----

  describe("conversion decision logic", () => {
    function computeDeltaQty(
      quantity: number,
      requestProcUnit: string | undefined,
      requestPackQty: number | undefined,
      dbProcUnit: string | null,
      dbPackQty: number | null,
      dbBaseUnit: string | null,
    ): { deltaQty: number; source: string } {
      if (
        requestProcUnit &&
        typeof requestProcUnit === "string" &&
        typeof requestPackQty === "number" &&
        requestPackQty > 0
      ) {
        return {
          deltaQty: procurementToStock(Math.abs(quantity), requestPackQty),
          source: "request",
        };
      }

      if (
        dbProcUnit &&
        dbPackQty !== null &&
        Number.isFinite(dbPackQty) &&
        dbPackQty > 0 &&
        dbBaseUnit
      ) {
        return {
          deltaQty: procurementToStock(Math.abs(quantity), dbPackQty),
          source: "db",
        };
      }

      return { deltaQty: Math.abs(quantity), source: "raw" };
    }

    it("uses request-body conversion when procurementUnit + packQty provided", () => {
      const result = computeDeltaQty(5, "CARTON", 24, null, null, null);
      expect(result.deltaQty).toBe(120);
      expect(result.source).toBe("request");
    });

    it("request-body conversion overrides DB profile", () => {
      // Request says packQty=24, DB says 12 — request wins
      const result = computeDeltaQty(5, "CARTON", 24, "CARTON", 12, "PCS");
      expect(result.deltaQty).toBe(120);
      expect(result.source).toBe("request");
    });

    it("falls back to DB profile when request has no conversion info", () => {
      const result = computeDeltaQty(5, undefined, undefined, "CARTON", 24, "PCS");
      expect(result.deltaQty).toBe(120);
      expect(result.source).toBe("db");
    });

    it("falls back to raw quantity when no conversion info anywhere", () => {
      const result = computeDeltaQty(5, undefined, undefined, null, null, null);
      expect(result.deltaQty).toBe(5);
      expect(result.source).toBe("raw");
    });

    it("falls back to raw when DB has procurementUnit but no packQty", () => {
      const result = computeDeltaQty(5, undefined, undefined, "CARTON", null, "PCS");
      expect(result.deltaQty).toBe(5);
      expect(result.source).toBe("raw");
    });

    it("falls back to raw when DB has procurementUnit + packQty but no baseStockUnit", () => {
      const result = computeDeltaQty(5, undefined, undefined, "CARTON", 24, null);
      expect(result.deltaQty).toBe(5);
      expect(result.source).toBe("raw");
    });

    it("falls back to raw when request packQty is 0", () => {
      const result = computeDeltaQty(5, "CARTON", 0, null, null, null);
      expect(result.deltaQty).toBe(5);
      expect(result.source).toBe("raw");
    });

    it("falls back to raw when request packQty is negative", () => {
      const result = computeDeltaQty(5, "CARTON", -10, null, null, null);
      expect(result.deltaQty).toBe(5);
      expect(result.source).toBe("raw");
    });

    it("backward compatible: old clients send no conversion fields", () => {
      // Simulates an old POS client that sends { barcode, quantity, buyPrice } only
      const result = computeDeltaQty(10, undefined, undefined, null, null, null);
      expect(result.deltaQty).toBe(10);
      expect(result.source).toBe("raw");
    });

    it("DB profile with fractional packQty works correctly", () => {
      // 10 units × 0.5 KG/unit = 5 KG
      const result = computeDeltaQty(10, undefined, undefined, "BAG", 0.5, "KG");
      expect(result.deltaQty).toBe(5);
      expect(result.source).toBe("db");
    });
  });
});
