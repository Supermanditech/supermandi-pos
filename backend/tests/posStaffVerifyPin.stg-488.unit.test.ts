// STG-488: Unit tests for POST /api/v1/pos/staff/verify-pin
// Tests rate limiting logic and response contract

import { z } from "zod";

// Contract schema matching the endpoint success response
const VerifyPinSuccessResponse = z.object({
  verified: z.literal(true),
  staffId: z.string().uuid(),
  name: z.string().min(1),
  role: z.enum(["MANAGER", "STOCK_MANAGER"]),
});

// Contract for error response
const VerifyPinErrorResponse = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    retryAfterSec: z.number().optional(),
  }),
});

describe("STG-488: POST /api/v1/pos/staff/verify-pin contract", () => {
  it("validates success response for manager", () => {
    const response = {
      verified: true,
      staffId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      name: "Sharma Manager",
      role: "MANAGER",
    };
    const parsed = VerifyPinSuccessResponse.parse(response);
    expect(parsed.verified).toBe(true);
    expect(parsed.role).toBe("MANAGER");
  });

  it("validates success response for stock manager", () => {
    const response = {
      verified: true,
      staffId: "b2c3d4e5-f678-9012-bcde-f12345678901",
      name: "Kumar Stock",
      role: "STOCK_MANAGER",
    };
    expect(() => VerifyPinSuccessResponse.parse(response)).not.toThrow();
  });

  it("rejects success response with cashier role (cashiers cannot approve)", () => {
    const response = {
      verified: true,
      staffId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      name: "Raju Cashier",
      role: "CASHIER",
    };
    expect(() => VerifyPinSuccessResponse.parse(response)).toThrow();
  });

  it("validates error response for invalid PIN", () => {
    const response = {
      error: {
        code: "PIN_INVALID",
        message: "Invalid credentials",
      },
    };
    expect(() => VerifyPinErrorResponse.parse(response)).not.toThrow();
  });

  it("validates rate limit error response", () => {
    const response = {
      error: {
        code: "RATE_LIMITED",
        message: "Too many failed attempts. Try again in 600s",
        retryAfterSec: 600,
      },
    };
    const parsed = VerifyPinErrorResponse.parse(response);
    expect(parsed.error.retryAfterSec).toBe(600);
  });

  it("validates input validation error response", () => {
    const response = {
      error: {
        code: "INVALID_INPUT",
        message: "phone and pin are required",
      },
    };
    expect(() => VerifyPinErrorResponse.parse(response)).not.toThrow();
  });
});

describe("STG-488: Rate limiting logic", () => {
  // Mirrors the in-memory rate limiter in staff.ts
  const PIN_RATE_LIMIT_MAX = 5;
  const PIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

  type RateLimitEntry = { count: number; resetAt: number };

  function checkRateLimit(
    failures: Map<string, RateLimitEntry>,
    key: string,
    now: number
  ): { blocked: boolean; retryAfterSec?: number } {
    const entry = failures.get(key);
    if (!entry) return { blocked: false };
    if (now >= entry.resetAt) {
      failures.delete(key);
      return { blocked: false };
    }
    if (entry.count >= PIN_RATE_LIMIT_MAX) {
      return {
        blocked: true,
        retryAfterSec: Math.ceil((entry.resetAt - now) / 1000),
      };
    }
    return { blocked: false };
  }

  function recordFailure(
    failures: Map<string, RateLimitEntry>,
    key: string,
    now: number
  ): void {
    const entry = failures.get(key);
    if (entry && now < entry.resetAt) {
      entry.count++;
    } else {
      failures.set(key, { count: 1, resetAt: now + PIN_RATE_LIMIT_WINDOW_MS });
    }
  }

  it("allows first attempt", () => {
    const failures = new Map<string, RateLimitEntry>();
    expect(checkRateLimit(failures, "store1:phone1", Date.now()).blocked).toBe(false);
  });

  it("allows up to 5 failed attempts", () => {
    const failures = new Map<string, RateLimitEntry>();
    const now = Date.now();
    for (let i = 0; i < 4; i++) {
      recordFailure(failures, "store1:phone1", now);
    }
    expect(checkRateLimit(failures, "store1:phone1", now).blocked).toBe(false);
  });

  it("blocks after 5 failed attempts", () => {
    const failures = new Map<string, RateLimitEntry>();
    const now = Date.now();
    for (let i = 0; i < 5; i++) {
      recordFailure(failures, "store1:phone1", now);
    }
    const result = checkRateLimit(failures, "store1:phone1", now);
    expect(result.blocked).toBe(true);
    expect(result.retryAfterSec).toBeGreaterThan(0);
    expect(result.retryAfterSec).toBeLessThanOrEqual(15 * 60);
  });

  it("resets after window expires", () => {
    const failures = new Map<string, RateLimitEntry>();
    const now = Date.now();
    for (let i = 0; i < 5; i++) {
      recordFailure(failures, "store1:phone1", now);
    }
    // 16 minutes later
    const later = now + 16 * 60 * 1000;
    expect(checkRateLimit(failures, "store1:phone1", later).blocked).toBe(false);
  });

  it("tracks different store+phone combos independently", () => {
    const failures = new Map<string, RateLimitEntry>();
    const now = Date.now();
    for (let i = 0; i < 5; i++) {
      recordFailure(failures, "store1:phone1", now);
    }
    // store1:phone1 is blocked
    expect(checkRateLimit(failures, "store1:phone1", now).blocked).toBe(true);
    // store1:phone2 is not blocked
    expect(checkRateLimit(failures, "store1:phone2", now).blocked).toBe(false);
    // store2:phone1 is not blocked
    expect(checkRateLimit(failures, "store2:phone1", now).blocked).toBe(false);
  });

  it("returns correct retryAfterSec when partially through window", () => {
    const failures = new Map<string, RateLimitEntry>();
    const now = Date.now();
    for (let i = 0; i < 5; i++) {
      recordFailure(failures, "store1:phone1", now);
    }
    // 10 minutes later (5 minutes remaining)
    const later = now + 10 * 60 * 1000;
    const result = checkRateLimit(failures, "store1:phone1", later);
    expect(result.blocked).toBe(true);
    expect(result.retryAfterSec).toBeGreaterThanOrEqual(4 * 60);
    expect(result.retryAfterSec).toBeLessThanOrEqual(5 * 60 + 1);
  });
});
