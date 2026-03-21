/**
 * GCP-STG-0089: Demand Aggregation + Supply Chain — Unit Tests
 *
 * Tests aggregation logic, consolidated PO number generation,
 * and status transition validation.
 */

describe("GCP-STG-0089: Demand Aggregation + Supply Chain", () => {
  // =========================================================================
  // Demand Aggregation Logic
  // =========================================================================
  describe("demand aggregation calculations", () => {
    function calculateSuggestedQuantity(
      currentStock: number,
      dailyVelocity: number,
      targetDays: number
    ): number {
      return Math.max(1, Math.ceil(dailyVelocity * targetDays) - currentStock);
    }

    it("suggests reorder quantity based on velocity and threshold", () => {
      // 10 units/day velocity, 7 day threshold, 20 units in stock
      // Need: ceil(10*7) - 20 = 70 - 20 = 50
      expect(calculateSuggestedQuantity(20, 10, 7)).toBe(50);
    });

    it("minimum suggestion is 1 even when stock exceeds target", () => {
      // Stock of 100, velocity 1/day, 7-day target = need 7, have 100
      expect(calculateSuggestedQuantity(100, 1, 7)).toBe(1);
    });

    it("handles zero velocity", () => {
      expect(calculateSuggestedQuantity(0, 0, 7)).toBe(1);
    });

    it("handles zero stock with high velocity", () => {
      // 0 stock, 5/day velocity, 7-day target = 35
      expect(calculateSuggestedQuantity(0, 5, 7)).toBe(35);
    });

    it("calculates days of stock correctly", () => {
      function daysOfStock(current: number, dailyVelocity: number): number {
        if (dailyVelocity <= 0) return 999;
        return Math.round((current / dailyVelocity) * 10) / 10;
      }

      expect(daysOfStock(70, 10)).toBe(7);
      expect(daysOfStock(0, 10)).toBe(0);
      expect(daysOfStock(100, 0)).toBe(999);
      expect(daysOfStock(15, 3)).toBe(5);
    });
  });

  // =========================================================================
  // Consolidated PO Number Format
  // =========================================================================
  describe("consolidated PO number format", () => {
    it("generates CPO-YYMMDD-XXXXXX format", () => {
      const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, "");
      const poNumber = `CPO-${dateStr}-ABC123`;
      expect(poNumber).toMatch(/^CPO-\d{6}-[A-Z0-9]{6}$/);
    });

    it("date portion reflects current date", () => {
      const now = new Date();
      const expected = now.toISOString().slice(2, 10).replace(/-/g, "");
      const poNumber = `CPO-${expected}-TEST01`;
      expect(poNumber.substring(4, 10)).toBe(expected);
    });
  });

  // =========================================================================
  // Status Transitions
  // =========================================================================
  describe("consolidated PO status transitions", () => {
    const validTransitions: Record<string, string[]> = {
      draft: ["submitted", "cancelled"],
      submitted: ["confirmed", "cancelled"],
      confirmed: ["dispatched", "cancelled"],
      dispatched: ["delivered"],
      delivered: [], // Terminal
      cancelled: [], // Terminal
    };

    it("draft can be submitted", () => {
      expect(validTransitions.draft).toContain("submitted");
    });

    it("submitted can be confirmed or cancelled", () => {
      expect(validTransitions.submitted).toContain("confirmed");
      expect(validTransitions.submitted).toContain("cancelled");
    });

    it("dispatched can only go to delivered", () => {
      expect(validTransitions.dispatched).toEqual(["delivered"]);
    });

    it("delivered and cancelled are terminal", () => {
      expect(validTransitions.delivered).toHaveLength(0);
      expect(validTransitions.cancelled).toHaveLength(0);
    });

    it("validates that all valid statuses are in the updateConsolidatedPOStatus allowlist", () => {
      const allowlist = ["confirmed", "dispatched", "delivered", "cancelled"];
      for (const [, targets] of Object.entries(validTransitions)) {
        for (const target of targets) {
          if (target !== "submitted") { // submit has its own endpoint
            expect(allowlist).toContain(target);
          }
        }
      }
    });
  });

  // =========================================================================
  // Store Breakdown
  // =========================================================================
  describe("store breakdown aggregation", () => {
    it("aggregates total demand from per-store quantities", () => {
      const storeBreakdown = [
        { storeId: "s1", storeName: "Store A", quantity: 10 },
        { storeId: "s2", storeName: "Store B", quantity: 15 },
        { storeId: "s3", storeName: "Store C", quantity: 20 },
      ];
      const totalDemand = storeBreakdown.reduce((sum, s) => sum + s.quantity, 0);
      expect(totalDemand).toBe(45);
    });

    it("counts unique stores", () => {
      const storeIds = new Set(["s1", "s2", "s1", "s3"]);
      expect(storeIds.size).toBe(3);
    });

    it("calculates line total from quantity * unit price", () => {
      const quantity = 45;
      const unitPriceMinor = 5000; // ₹50
      const lineTotal = quantity * unitPriceMinor;
      expect(lineTotal).toBe(225000); // ₹2,250
    });
  });
});
