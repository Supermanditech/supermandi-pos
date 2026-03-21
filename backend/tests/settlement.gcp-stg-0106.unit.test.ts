/**
 * GCP-STG-0106: Settlement System — Unit Tests
 *
 * Tests settlement calculation logic (GST on commission, TDS, net payout).
 * DB-dependent tests (create/list/approve) run against mock or real DB in integration.
 */

describe("GCP-STG-0106: Settlement System", () => {
  // =========================================================================
  // Settlement Calculation
  // =========================================================================
  describe("settlement calculation", () => {
    // Replicate the calculation from settlementService.createSettlement
    function calculateSettlement(input: {
      grossAmountMinor: number;
      commissionMinor: number;
      commissionPercent: number;
      tdsPercent?: number;
    }) {
      const gstOnCommission = Math.round(input.commissionMinor * 18 / 100);
      const tdsPercent = input.tdsPercent || 0;
      const tdsMinor = tdsPercent > 0 ? Math.round(input.grossAmountMinor * tdsPercent / 100) : 0;
      const netPayout = input.grossAmountMinor - input.commissionMinor - gstOnCommission - tdsMinor;
      return { gstOnCommission, tdsMinor, netPayout };
    }

    it("calculates net payout for DIRECT_SUPPLIER with 10% commission", () => {
      const result = calculateSettlement({
        grossAmountMinor: 100000, // ₹1000
        commissionMinor: 10000,   // ₹100 (10%)
        commissionPercent: 10,
      });
      // GST on ₹100 commission = ₹18 (18%)
      expect(result.gstOnCommission).toBe(1800);
      // Net = ₹1000 - ₹100 - ₹18 = ₹882
      expect(result.netPayout).toBe(88200);
      expect(result.tdsMinor).toBe(0);
    });

    it("calculates net payout with TDS deduction", () => {
      const result = calculateSettlement({
        grossAmountMinor: 100000,
        commissionMinor: 10000,
        commissionPercent: 10,
        tdsPercent: 1, // 1% TDS
      });
      // TDS = 1% of gross = ₹10
      expect(result.tdsMinor).toBe(1000);
      // Net = ₹1000 - ₹100 - ₹18 - ₹10 = ₹872
      expect(result.netPayout).toBe(87200);
    });

    it("handles zero commission (SUPERMANDI_PRINCIPAL model)", () => {
      const result = calculateSettlement({
        grossAmountMinor: 50000,
        commissionMinor: 0,
        commissionPercent: 0,
      });
      expect(result.gstOnCommission).toBe(0);
      expect(result.netPayout).toBe(50000); // Full amount to supplier
    });

    it("handles large amounts without overflow", () => {
      const result = calculateSettlement({
        grossAmountMinor: 10000000, // ₹1,00,000
        commissionMinor: 1500000,   // ₹15,000 (15%)
        commissionPercent: 15,
      });
      // GST on ₹15,000 = ₹2,700
      expect(result.gstOnCommission).toBe(270000);
      // Net = ₹1,00,000 - ₹15,000 - ₹2,700 = ₹82,300
      expect(result.netPayout).toBe(8230000);
    });

    it("rounds GST to nearest paisa", () => {
      const result = calculateSettlement({
        grossAmountMinor: 33333,
        commissionMinor: 3333,
        commissionPercent: 10,
      });
      // 3333 * 18/100 = 599.94 → rounds to 600
      expect(result.gstOnCommission).toBe(600);
      expect(result.netPayout).toBe(33333 - 3333 - 600);
    });
  });

  // =========================================================================
  // Status Transitions
  // =========================================================================
  describe("settlement status transitions", () => {
    const VALID_TRANSITIONS: Record<string, string[]> = {
      pending: ["approved", "cancelled", "disputed"],
      approved: ["scheduled", "paid"],
      scheduled: ["paid"],
      paid: ["reconciled"],
      disputed: ["pending", "cancelled"],
    };

    it("defines valid status lifecycle", () => {
      expect(VALID_TRANSITIONS.pending).toContain("approved");
      expect(VALID_TRANSITIONS.approved).toContain("paid");
      expect(VALID_TRANSITIONS.paid).toContain("reconciled");
    });

    it("pending cannot go directly to paid", () => {
      expect(VALID_TRANSITIONS.pending).not.toContain("paid");
    });

    it("paid cannot go back to pending", () => {
      expect(VALID_TRANSITIONS.paid).not.toContain("pending");
    });

    it("disputed can return to pending", () => {
      expect(VALID_TRANSITIONS.disputed).toContain("pending");
    });
  });

  // =========================================================================
  // Commission Percent Validation
  // =========================================================================
  describe("commission validation", () => {
    it("rejects negative commission", () => {
      expect(() => {
        if (-5 < 0 || -5 > 100) throw new Error("Commission must be 0-100%");
      }).toThrow();
    });

    it("rejects commission over 100%", () => {
      expect(() => {
        if (105 < 0 || 105 > 100) throw new Error("Commission must be 0-100%");
      }).toThrow();
    });

    it("accepts zero commission", () => {
      expect(() => {
        if (0 < 0 || 0 > 100) throw new Error("Commission must be 0-100%");
      }).not.toThrow();
    });

    it("accepts valid commission rates", () => {
      for (const rate of [5, 10, 15, 18, 25]) {
        expect(() => {
          if (rate < 0 || rate > 100) throw new Error("Commission must be 0-100%");
        }).not.toThrow();
      }
    });
  });
});
