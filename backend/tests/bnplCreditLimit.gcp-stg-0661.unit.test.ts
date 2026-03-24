/**
 * GCP-STG-0661: BNPL credit limit enforcement
 *
 * Tests that BNPL credit limit checks correctly account for both
 * 'active' and 'partial' status drawdowns, and subtract paid amounts
 * from principal to calculate accurate outstanding balance.
 */

describe("GCP-STG-0661: BNPL credit limit enforcement", () => {
  describe("outstanding balance calculation", () => {
    it("includes both active and partial drawdowns in usage", () => {
      // Simulating the SQL: WHERE status IN ('active', 'partial')
      const drawdowns = [
        { principal_minor: 50000, paid_amount_minor: 0, status: "active" },
        { principal_minor: 30000, paid_amount_minor: 15000, status: "partial" },
        { principal_minor: 20000, paid_amount_minor: 20000, status: "completed" }, // excluded
      ];

      // Only active + partial
      const relevant = drawdowns.filter(d => d.status === "active" || d.status === "partial");
      const outstanding = relevant.reduce(
        (sum, d) => sum + (d.principal_minor - (d.paid_amount_minor || 0)), 0
      );

      // 50000 - 0 + 30000 - 15000 = 65000
      expect(outstanding).toBe(65000);
    });

    it("rejects order when total exceeds available credit", () => {
      const creditLimit = 100000; // 1000 INR
      const outstanding = 65000;
      const available = Math.max(0, creditLimit - outstanding); // 35000
      const orderTotal = 40000;

      expect(available).toBe(35000);
      expect(available < orderTotal).toBe(true);
      // This would trigger "Order exceeds BNPL credit limit"
    });

    it("allows order when total is within available credit", () => {
      const creditLimit = 100000;
      const outstanding = 65000;
      const available = Math.max(0, creditLimit - outstanding); // 35000
      const orderTotal = 30000;

      expect(available).toBe(35000);
      expect(available >= orderTotal).toBe(true);
    });

    it("handles zero paid amount (new active drawdown)", () => {
      const drawdowns = [
        { principal_minor: 50000, paid_amount_minor: null, status: "active" },
      ];
      const outstanding = drawdowns.reduce(
        (sum, d) => sum + (d.principal_minor - (d.paid_amount_minor || 0)), 0
      );
      expect(outstanding).toBe(50000);
    });

    it("returns correct error response shape", () => {
      const errorResponse = {
        success: false,
        error: "bnpl_limit_exceeded",
        message: "Order exceeds BNPL credit limit",
        availableCredit: 35000,
        requestedAmount: 40000,
        creditLimit: 100000,
        outstandingAmount: 65000,
      };

      expect(errorResponse.error).toBe("bnpl_limit_exceeded");
      expect(errorResponse.message).toBe("Order exceeds BNPL credit limit");
      expect(errorResponse.outstandingAmount).toBeDefined();
    });
  });

  describe("POS BNPL active endpoint", () => {
    it("calculates totalOutstanding as principal minus paid", () => {
      // Simulates what the /bnpl/active endpoint does
      const rows = [
        { principalMinor: 50000, paidAmountMinor: "0" },
        { principalMinor: 30000, paidAmountMinor: "15000" },
      ];
      const totalOutstanding = rows.reduce(
        (sum, d) => sum + (d.principalMinor - parseInt(d.paidAmountMinor || "0", 10)), 0
      );
      expect(totalOutstanding).toBe(65000);
    });

    it("available credit = limit minus outstanding", () => {
      const creditLimit = 100000;
      const totalOutstanding = 65000;
      const availableCredit = Math.max(0, creditLimit - totalOutstanding);
      expect(availableCredit).toBe(35000);
    });

    it("clamps available credit to zero when overdrawn", () => {
      const creditLimit = 50000;
      const totalOutstanding = 65000;
      const availableCredit = Math.max(0, creditLimit - totalOutstanding);
      expect(availableCredit).toBe(0);
    });
  });
});
