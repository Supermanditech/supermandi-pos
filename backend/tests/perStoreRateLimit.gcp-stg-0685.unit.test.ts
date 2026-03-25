/**
 * GCP-STG-0685: Per-store API rate limit
 *
 * Behavioral test: mounts the redisRateLimit middleware on an express app,
 * mocks the Redis checkRateLimit to control allowed/denied responses,
 * and verifies rate limit headers and 429 behavior.
 */

const mockCheckRateLimit = jest.fn();

jest.mock("../src/db/redis", () => ({
  checkRateLimit: (...args: any[]) => mockCheckRateLimit(...args),
  getRedis: () => null,
}));

jest.mock("../src/lib/logger", () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import express from "express";
import request from "supertest";
import { redisRateLimit } from "../src/middleware/rateLimit";

describe("GCP-STG-0685: Per-store rate limit", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function createApp(opts: {
    windowMs: number;
    max: number;
    keyGenerator?: (req: express.Request) => string;
    keyPrefix?: string;
  }): express.Express {
    const app = express();
    app.use(express.json());
    app.use(redisRateLimit(opts));
    app.get("/test", (_req, res) => res.json({ ok: true }));
    return app;
  }

  it("allows requests within rate limit and sets X-RateLimit headers", async () => {
    mockCheckRateLimit.mockResolvedValueOnce({ allowed: true, remaining: 299, resetAt: 0 });

    const app = createApp({ windowMs: 60000, max: 300, keyPrefix: "per-store" });
    const res = await request(app).get("/test");

    expect(res.status).toBe(200);
    expect(res.headers["x-ratelimit-limit"]).toBe("300");
    expect(res.headers["x-ratelimit-remaining"]).toBe("299");
  });

  it("returns 429 when rate limit is exceeded", async () => {
    mockCheckRateLimit.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 30000,
    });

    const app = createApp({ windowMs: 60000, max: 300, keyPrefix: "per-store" });
    const res = await request(app).get("/test");

    expect(res.status).toBe(429);
    expect(res.body.error).toBe("Rate limit exceeded");
    expect(res.headers["retry-after"]).toBeDefined();
  });

  it("uses custom keyGenerator for per-store isolation", async () => {
    mockCheckRateLimit.mockResolvedValueOnce({ allowed: true, remaining: 100, resetAt: 0 });

    const storeId = "store-abc-123";
    const keyGen = (req: express.Request) =>
      `store:${(req as any).storeId || "unknown"}`;

    const app = express();
    app.use((_req: any, _res, next) => {
      _req.storeId = storeId;
      next();
    });
    app.use(redisRateLimit({ windowMs: 60000, max: 300, keyGenerator: keyGen, keyPrefix: "per-store" }));
    app.get("/test", (_req, res) => res.json({ ok: true }));

    await request(app).get("/test");

    // Verify checkRateLimit was called with the store-prefixed key
    expect(mockCheckRateLimit).toHaveBeenCalledTimes(1);
    const calledKey = mockCheckRateLimit.mock.calls[0][0];
    expect(calledKey).toContain("per-store");
    expect(calledKey).toContain(storeId);
  });

  it("falls back to in-memory rate limit when Redis errors", async () => {
    mockCheckRateLimit.mockRejectedValue(new Error("Redis connection refused"));

    const app = createApp({ windowMs: 60000, max: 2, keyPrefix: "per-store" });

    // First two requests should pass (in-memory fallback)
    const res1 = await request(app).get("/test");
    expect(res1.status).toBe(200);

    const res2 = await request(app).get("/test");
    expect(res2.status).toBe(200);

    // Third request should be rate-limited by in-memory fallback
    const res3 = await request(app).get("/test");
    expect(res3.status).toBe(429);
  });

  it("per-store rate limit config matches production values (300 req/min)", () => {
    // Verify the production config from index.ts: windowMs=60000, max=300
    // This is a code-level assertion that the rate limit is configured correctly
    const fs = require("fs");
    const path = require("path");
    const indexSrc = fs.readFileSync(
      path.resolve(__dirname, "../src/routes/v1/index.ts"),
      "utf8",
    );

    // Verify perStoreRateLimit is defined with correct params
    expect(indexSrc).toContain("perStoreRateLimit");
    expect(indexSrc).toMatch(/windowMs:\s*60\s*\*\s*1000/);
    expect(indexSrc).toMatch(/max:\s*300/);
    // Verify it's applied to /pos routes
    expect(indexSrc).toContain('v1Router.use("/pos", perStoreRateLimit)');
  });
});
