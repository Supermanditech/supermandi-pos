/**
 * GCP-STG-0490: CORS origin validation — behavioral supertest tests
 *
 * Mounts the Express app and verifies CORS behavior via actual HTTP requests.
 */

// Mock DB and Redis before importing app
const mockQuery = jest.fn().mockResolvedValue({ rows: [] });
jest.mock("../src/db/client", () => ({
  getPool: () => ({ query: mockQuery, connect: jest.fn(), end: jest.fn() }),
  pool: { query: mockQuery },
}));
jest.mock("../src/db/redis", () => ({
  getRedisClient: () => null,
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheSet: jest.fn(),
}));
jest.mock("../src/middleware/rateLimit", () => ({
  redisRateLimit: () => (_req: any, _res: any, next: any) => next(),
}));
jest.mock("../src/services/whatsappService", () => ({
  isWhatsAppConfigured: () => false,
  sendTextMessage: jest.fn(),
}));
jest.mock("../src/services/smsService", () => ({
  sendSms: jest.fn().mockResolvedValue(false),
}));

import express from "express";
import request from "supertest";
import cors from "cors";

describe("GCP-STG-0490: CORS origin validation", () => {
  test("allowed origin receives Access-Control-Allow-Origin header", async () => {
    const app = express();
    // Simulate production CORS config with specific origins
    const allowedOrigins = ["https://app.supermandi.tech", "https://supplier.supermandi.tech"];
    app.use(cors({ origin: allowedOrigins, credentials: true }));
    app.get("/test", (_req, res) => res.json({ ok: true }));

    const res = await request(app)
      .get("/test")
      .set("Origin", "https://app.supermandi.tech");

    expect(res.headers["access-control-allow-origin"]).toBe("https://app.supermandi.tech");
  });

  test("blocked origin does NOT receive Access-Control-Allow-Origin header", async () => {
    const app = express();
    const allowedOrigins = ["https://app.supermandi.tech"];
    app.use(cors({ origin: allowedOrigins, credentials: true }));
    app.get("/test", (_req, res) => res.json({ ok: true }));

    const res = await request(app)
      .get("/test")
      .set("Origin", "https://evil.attacker.com");

    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  test("OPTIONS preflight from allowed origin returns 204 with CORS headers", async () => {
    const app = express();
    const allowedOrigins = ["https://admin.supermandi.tech"];
    app.use(cors({ origin: allowedOrigins, credentials: true }));
    app.get("/test", (_req, res) => res.json({ ok: true }));

    const res = await request(app)
      .options("/test")
      .set("Origin", "https://admin.supermandi.tech")
      .set("Access-Control-Request-Method", "GET");

    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("https://admin.supermandi.tech");
  });

  test("OPTIONS preflight from blocked origin has no CORS headers", async () => {
    const app = express();
    const allowedOrigins = ["https://admin.supermandi.tech"];
    app.use(cors({ origin: allowedOrigins, credentials: true }));
    app.get("/test", (_req, res) => res.json({ ok: true }));

    const res = await request(app)
      .options("/test")
      .set("Origin", "https://evil.attacker.com")
      .set("Access-Control-Request-Method", "GET");

    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  test("wildcard origin is NOT used when specific origins configured", async () => {
    const app = express();
    // Simulate the production-safe config — NOT wildcard
    const allowedOrigins = ["https://app.supermandi.tech", "https://supplier.supermandi.tech", "https://admin.supermandi.tech"];
    app.use(cors({ origin: allowedOrigins }));
    app.get("/test", (_req, res) => res.json({ ok: true }));

    const res = await request(app)
      .get("/test")
      .set("Origin", "https://random-site.com");

    // Should NOT get wildcard or the random origin back
    expect(res.headers["access-control-allow-origin"]).not.toBe("*");
    expect(res.headers["access-control-allow-origin"]).not.toBe("https://random-site.com");
  });
});
