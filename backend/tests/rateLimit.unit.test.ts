/**
 * SA-P2-011: Redis-backed rate limiting tests
 *
 * Tests:
 * 1. redisRateLimit allows requests under the limit
 * 2. redisRateLimit blocks requests over the limit with 429
 * 3. redisRateLimit falls back to in-memory when Redis is unavailable
 * 4. redisRateLimit uses custom keyGenerator when provided
 * 5. rateLimitAi (legacy) still works for backward compatibility
 */

import type { Request, Response, NextFunction } from "express";

// ---------------------------------------------------------------------------
// Mock redis.ts BEFORE importing rateLimit module
// ---------------------------------------------------------------------------

let mockCheckRateLimit: jest.Mock;

jest.mock("../src/db/redis", () => {
  mockCheckRateLimit = jest.fn();
  return {
    checkRateLimit: mockCheckRateLimit,
  };
});

import { redisRateLimit, rateLimitAi } from "../src/middleware/rateLimit";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    ip: "127.0.0.1",
    body: {},
    ...overrides,
  } as unknown as Request;
}

function mockRes(): Response & { _status: number; _body: unknown; _headers: Record<string, string> } {
  const res: any = {
    _status: 200,
    _body: null,
    _headers: {} as Record<string, string>,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(body: unknown) {
      res._body = body;
      return res;
    },
    set(key: string, value: string) {
      res._headers[key] = value;
      return res;
    },
  };
  return res;
}

// ---------------------------------------------------------------------------
// Tests: redisRateLimit
// ---------------------------------------------------------------------------

describe("redisRateLimit (SA-P2-011)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("allows requests when Redis says allowed=true", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 4, resetAt: 0 });

    const middleware = redisRateLimit({ windowMs: 60_000, max: 5 });
    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();

    middleware(req, res, next);

    // Wait for async resolution
    await new Promise((r) => setTimeout(r, 10));

    expect(next).toHaveBeenCalled();
    expect(res._status).toBe(200);
    expect(res._headers["X-RateLimit-Limit"]).toBe("5");
    expect(res._headers["X-RateLimit-Remaining"]).toBe("4");
  });

  it("blocks requests when Redis says allowed=false with 429", async () => {
    const futureReset = Date.now() + 30_000;
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: futureReset });

    const middleware = redisRateLimit({ windowMs: 60_000, max: 5 });
    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();

    middleware(req, res, next);

    await new Promise((r) => setTimeout(r, 10));

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(429);
    expect(res._body).toEqual({ error: "Rate limit exceeded" });
    expect(res._headers["Retry-After"]).toBeDefined();
  });

  it("falls back to in-memory when Redis throws an error", async () => {
    mockCheckRateLimit.mockRejectedValue(new Error("Redis connection refused"));

    const middleware = redisRateLimit({ windowMs: 60_000, max: 2 });
    const next = jest.fn();

    // First request — should pass (in-memory fallback, count=1 <= max=2)
    const req1 = mockReq();
    const res1 = mockRes();
    middleware(req1, res1, next);
    await new Promise((r) => setTimeout(r, 10));
    expect(next).toHaveBeenCalledTimes(1);

    // Second request — should pass (count=2 <= max=2)
    const req2 = mockReq();
    const res2 = mockRes();
    middleware(req2, res2, next);
    await new Promise((r) => setTimeout(r, 10));
    expect(next).toHaveBeenCalledTimes(2);

    // Third request — should be blocked (count=3 > max=2)
    const req3 = mockReq();
    const res3 = mockRes();
    middleware(req3, res3, next);
    await new Promise((r) => setTimeout(r, 10));
    expect(next).toHaveBeenCalledTimes(2); // still 2
    expect(res3._status).toBe(429);
  });

  it("uses custom keyGenerator when provided", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 9, resetAt: 0 });

    const keyGen = (req: Request) => `custom:${(req as any).userId}`;
    const middleware = redisRateLimit({ windowMs: 60_000, max: 10, keyGenerator: keyGen });
    const req = mockReq({ userId: "user-123" } as any);
    const res = mockRes();
    const next = jest.fn();

    middleware(req, res, next);
    await new Promise((r) => setTimeout(r, 10));

    expect(mockCheckRateLimit).toHaveBeenCalledWith("custom:user-123", 10, 60);
    expect(next).toHaveBeenCalled();
  });

  it("passes windowMs converted to seconds to checkRateLimit", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 19, resetAt: 0 });

    const middleware = redisRateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();

    middleware(req, res, next);
    await new Promise((r) => setTimeout(r, 10));

    expect(mockCheckRateLimit).toHaveBeenCalledWith("127.0.0.1", 20, 900);
  });
});

// ---------------------------------------------------------------------------
// Tests: rateLimitAi (legacy backward compatibility)
// ---------------------------------------------------------------------------

describe("rateLimitAi (legacy)", () => {
  it("allows requests under the limit", () => {
    const middleware = rateLimitAi({ windowMs: 60_000, max: 2 });
    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();

    middleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);

    middleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it("blocks requests over the limit with 429", () => {
    const middleware = rateLimitAi({ windowMs: 60_000, max: 1 });
    const req = mockReq();
    const next = jest.fn();

    const res1 = mockRes();
    middleware(req, res1, next);
    expect(next).toHaveBeenCalledTimes(1);

    const res2 = mockRes();
    middleware(req, res2, next);
    expect(next).toHaveBeenCalledTimes(1); // still 1
    expect(res2._status).toBe(429);
    expect(res2._body).toEqual({ error: "Rate limit exceeded" });
  });
});
