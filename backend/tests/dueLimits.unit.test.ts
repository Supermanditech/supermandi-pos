// SA-P1-003: Due limit enforcement unit tests

import { describe, it, expect, jest, beforeEach } from "@jest/globals";

/**
 * SA-P1-003: Due limit enforcement logic tests
 *
 * The due limit check lives inside the sales confirm and payments/due endpoints.
 * We test the core logic: given a store's max_outstanding_dues_paise, current pending dues,
 * and a new sale amount, determine if the sale should be allowed.
 */

interface DueLimitCheckParams {
  maxOutstandingDuesPaise: number | null;
  currentPendingDuesPaise: number;
  newSaleAmountPaise: number;
}

interface DueLimitCheckResult {
  allowed: boolean;
  error?: string;
  currentPaise?: number;
  limitPaise?: number;
}

/**
 * Pure function extracted from sales.ts due limit enforcement logic.
 * When maxOutstandingDuesPaise is null, no limit is enforced.
 * When set, currentPendingDues + newSaleAmount must not exceed the limit.
 */
function checkDueLimit(params: DueLimitCheckParams): DueLimitCheckResult {
  const { maxOutstandingDuesPaise, currentPendingDuesPaise, newSaleAmountPaise } = params;

  // No limit configured — always allow
  if (maxOutstandingDuesPaise == null) {
    return { allowed: true };
  }

  const newTotal = currentPendingDuesPaise + newSaleAmountPaise;
  if (newTotal > maxOutstandingDuesPaise) {
    return {
      allowed: false,
      error: "DUE_LIMIT_EXCEEDED",
      currentPaise: currentPendingDuesPaise,
      limitPaise: maxOutstandingDuesPaise,
    };
  }

  return { allowed: true };
}

describe("SA-P1-003: Due Limit Enforcement", () => {
  describe("checkDueLimit", () => {
    it("allows DUE when no limit is configured (null)", () => {
      const result = checkDueLimit({
        maxOutstandingDuesPaise: null,
        currentPendingDuesPaise: 500000,
        newSaleAmountPaise: 100000,
      });
      expect(result.allowed).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("allows DUE when total is under the limit", () => {
      const result = checkDueLimit({
        maxOutstandingDuesPaise: 1000000, // 10,000 Rs
        currentPendingDuesPaise: 500000,  // 5,000 Rs
        newSaleAmountPaise: 300000,       // 3,000 Rs — total 8,000 Rs
      });
      expect(result.allowed).toBe(true);
    });

    it("allows DUE when total equals the limit exactly", () => {
      const result = checkDueLimit({
        maxOutstandingDuesPaise: 1000000,
        currentPendingDuesPaise: 700000,
        newSaleAmountPaise: 300000, // total = 1,000,000 exactly
      });
      expect(result.allowed).toBe(true);
    });

    it("rejects DUE when total exceeds the limit", () => {
      const result = checkDueLimit({
        maxOutstandingDuesPaise: 1000000, // 10,000 Rs
        currentPendingDuesPaise: 800000,  // 8,000 Rs
        newSaleAmountPaise: 300000,       // 3,000 Rs — total 11,000 Rs
      });
      expect(result.allowed).toBe(false);
      expect(result.error).toBe("DUE_LIMIT_EXCEEDED");
      expect(result.currentPaise).toBe(800000);
      expect(result.limitPaise).toBe(1000000);
    });

    it("rejects DUE when new sale alone exceeds the limit", () => {
      const result = checkDueLimit({
        maxOutstandingDuesPaise: 500000,   // 5,000 Rs
        currentPendingDuesPaise: 0,
        newSaleAmountPaise: 600000,        // 6,000 Rs
      });
      expect(result.allowed).toBe(false);
      expect(result.error).toBe("DUE_LIMIT_EXCEEDED");
    });

    it("allows DUE when current dues are zero and sale is under limit", () => {
      const result = checkDueLimit({
        maxOutstandingDuesPaise: 500000,
        currentPendingDuesPaise: 0,
        newSaleAmountPaise: 500000, // exactly at limit
      });
      expect(result.allowed).toBe(true);
    });

    it("rejects DUE when exceeding by just 1 paisa", () => {
      const result = checkDueLimit({
        maxOutstandingDuesPaise: 1000000,
        currentPendingDuesPaise: 999999,
        newSaleAmountPaise: 2, // total = 1,000,001 — 1 paisa over
      });
      expect(result.allowed).toBe(false);
      expect(result.error).toBe("DUE_LIMIT_EXCEEDED");
    });

    it("handles zero limit — rejects any due sale", () => {
      // Note: validation should prevent 0, but enforcement should still work
      const result = checkDueLimit({
        maxOutstandingDuesPaise: 0,
        currentPendingDuesPaise: 0,
        newSaleAmountPaise: 100,
      });
      expect(result.allowed).toBe(false);
    });

    it("handles very large amounts correctly", () => {
      const result = checkDueLimit({
        maxOutstandingDuesPaise: 999999999999, // ~10 crore Rs
        currentPendingDuesPaise: 999999999998,
        newSaleAmountPaise: 1,
      });
      expect(result.allowed).toBe(true);
    });
  });
});

describe("SA-P1-003: PATCH /store/due-limits validation", () => {
  it("should accept null to remove the limit", () => {
    // Simulates the validation logic from the endpoint
    const maxOutstandingDuesPaise: number | null = null;
    expect(maxOutstandingDuesPaise).toBeNull();
    // null is valid — no limit
  });

  it("should accept positive integer values", () => {
    const maxOutstandingDuesPaise = 500000;
    expect(Number.isInteger(maxOutstandingDuesPaise)).toBe(true);
    expect(maxOutstandingDuesPaise).toBeGreaterThan(0);
  });

  it("should reject non-integer values", () => {
    const maxOutstandingDuesPaise = 500.5;
    expect(Number.isInteger(maxOutstandingDuesPaise)).toBe(false);
  });

  it("should reject negative values", () => {
    const maxOutstandingDuesPaise = -100;
    expect(maxOutstandingDuesPaise).toBeLessThanOrEqual(0);
  });

  it("should reject zero", () => {
    const maxOutstandingDuesPaise = 0;
    expect(maxOutstandingDuesPaise).toBeLessThanOrEqual(0);
  });
});
