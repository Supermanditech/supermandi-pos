/**
 * GCP-STG-0494: Rate limit on public CTA config endpoint
 * Behavioral tests using supertest — verifies Cache-Control header
 * and rate limiter middleware is applied.
 */

// Mock DB
const mockQuery = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 });
jest.mock("../src/db/client", () => ({
  getPool: () => ({ query: mockQuery }),
}));

// Mock Redis checkRateLimit — allow all requests by default
const mockCheckRateLimit = jest.fn().mockResolvedValue({ allowed: true, remaining: 29 });
jest.mock("../src/db/redis", () => ({
  checkRateLimit: (...args: any[]) => mockCheckRateLimit(...args),
}));

import express from "express";
import request from "supertest";
import { publicConfigRouter } from "../src/routes/v1/publicConfig";

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/public", publicConfigRouter);
  return app;
}

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockResolvedValue({
    rows: [{ enabled: true, superadminNumber: "919251893684", superadminMessage: "Hi", companyNumber: "919251893684", companyMessage: "Hello" }],
  });
  mockCheckRateLimit.mockReset();
  mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 29 });
});

describe("GET /public/whatsapp-cta-config — GCP-STG-0494", () => {
  const app = createApp();

  it("returns Cache-Control header on successful response", async () => {
    const res = await request(app).get("/public/whatsapp-cta-config");

    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("public, max-age=300, stale-while-revalidate=600");
  });

  it("returns X-Content-Type-Options: nosniff header", async () => {
    const res = await request(app).get("/public/whatsapp-cta-config");

    expect(res.status).toBe(200);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("rate limiter middleware is called with correct key prefix", async () => {
    await request(app).get("/public/whatsapp-cta-config");

    expect(mockCheckRateLimit).toHaveBeenCalledTimes(1);
    // Key should include "public-cta" prefix
    const keyArg = mockCheckRateLimit.mock.calls[0][0];
    expect(keyArg).toContain("public-cta");
  });

  it("returns 429 when rate limit exceeded", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: Date.now() + 30000 });

    const res = await request(app).get("/public/whatsapp-cta-config");

    expect(res.status).toBe(429);
    expect(res.body.error).toContain("Rate limit");
  });

  it("returns config data when rate limit allows", async () => {
    const res = await request(app).get("/public/whatsapp-cta-config");

    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(true);
    expect(res.body.superadminNumber).toBeDefined();
  });

  it("returns Cache-Control even when DB returns empty rows (disabled config)", async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    const res = await request(app).get("/public/whatsapp-cta-config");

    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(false);
    expect(res.headers["cache-control"]).toBe("public, max-age=300, stale-while-revalidate=600");
  });
});
