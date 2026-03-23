/**
 * GCP-STG-0484: POS device token expiry with auto-renewal — behavioral tests
 *
 * Tests:
 * 1. Expired device token returns 401
 * 2. Valid (non-expired) token passes middleware
 * 3. Successful auth extends expires_at (auto-refresh UPDATE called)
 * 4. otpAuth INSERT includes token_expires_at
 */
import crypto from "crypto";

(global as any).__DEV__ = false;

const mockQuery = jest.fn();
const mockConnect = jest.fn();
const mockClientQuery = jest.fn();
const mockClientRelease = jest.fn();

jest.mock("../src/db/client", () => ({
  getPool: () => ({
    query: mockQuery,
    connect: mockConnect,
    end: jest.fn(),
  }),
  pool: { query: mockQuery },
}));

jest.mock("../src/services/whatsappService", () => ({
  isWhatsAppConfigured: () => false,
  sendTextMessage: jest.fn(),
}));

// Mock smsService (GCP-STG-0467)
jest.mock("../src/services/smsService", () => ({
  sendSms: jest.fn().mockResolvedValue(false),
}));

jest.mock("../src/db/redis", () => ({
  getRedisClient: () => null,
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheSet: jest.fn(),
}));

jest.mock("../src/middleware/rateLimit", () => ({
  redisRateLimit: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../src/lib/logger", () => ({
  log: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import express from "express";
import request from "supertest";
import { requireDeviceToken } from "../src/middleware/deviceToken";
import { posOtpAuthRouter } from "../src/routes/v1/pos/otpAuth";

// App with deviceToken middleware for middleware tests
const middlewareApp = express();
middlewareApp.use(express.json());
middlewareApp.get("/test", requireDeviceToken, (_req, res) => {
  res.json({ ok: true });
});

// App with otpAuth router for INSERT tests
const otpApp = express();
otpApp.use(express.json());
otpApp.use("/pos", posOtpAuthRouter);

function otpHash(otp: string) {
  return crypto.createHash("sha256").update(otp).digest("hex");
}

beforeEach(() => {
  mockQuery.mockReset();
  mockConnect.mockReset();
  mockClientQuery.mockReset();
  mockClientRelease.mockReset();
  mockConnect.mockResolvedValue({
    query: mockClientQuery,
    release: mockClientRelease,
  });
});

describe("GCP-STG-0484: device token expiry enforcement", () => {
  test("expired device token returns 401 TOKEN_EXPIRED", async () => {
    // Device found but token_expires_at is in the past
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          device_id: "dev-1",
          store_id: "store-1",
          device_active: true,
          store_active: true,
          token_expires_at: new Date(Date.now() - 86400000), // 1 day ago
          token_revoked_at: null,
        },
      ],
    });

    const res = await request(middlewareApp)
      .get("/test")
      .set("x-device-token", "expired-token-abc");

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("TOKEN_EXPIRED");
  });

  test("valid (non-expired) token passes middleware", async () => {
    // Device found with future token_expires_at
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            device_id: "dev-2",
            store_id: "store-2",
            device_active: true,
            store_active: true,
            token_expires_at: new Date(Date.now() + 86400000 * 60), // 60 days from now
            token_revoked_at: null,
          },
        ],
      })
      // auto-refresh: last_active_at update (token not within 30 days of expiry)
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(middlewareApp)
      .get("/test")
      .set("x-device-token", "valid-token-xyz");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test("auto-refresh extends expires_at when token is within 30 days of expiry", async () => {
    // Device with token expiring in 15 days (within 30-day refresh window)
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            device_id: "dev-3",
            store_id: "store-3",
            device_active: true,
            store_active: true,
            token_expires_at: new Date(Date.now() + 86400000 * 15), // 15 days from now
            token_revoked_at: null,
          },
        ],
      })
      // auto-refresh UPDATE query
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(middlewareApp)
      .get("/test")
      .set("x-device-token", "soon-expiring-token");

    expect(res.status).toBe(200);

    // Wait a tick for the async auto-refresh to fire
    await new Promise((r) => setTimeout(r, 50));

    // The second query should be the auto-refresh UPDATE
    const refreshCall = mockQuery.mock.calls[1];
    expect(refreshCall).toBeDefined();
    expect(refreshCall[0]).toContain("token_expires_at");
    expect(refreshCall[0]).toContain("UPDATE pos_devices");
    // The parameterized interval uses TOKEN_EXPIRY_DAYS (90)
    expect(refreshCall[1]).toEqual(["dev-3", 90]);
  });
});

describe("GCP-STG-0484: otpAuth INSERT includes token_expires_at", () => {
  test("verify-otp INSERT sets token_expires_at and token_refreshed_at", async () => {
    // 1: pos_otp lookup — valid OTP found
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          otp_hash: otpHash("123456"),
          expires_at: new Date(Date.now() + 300000),
          attempts: 0,
        },
      ],
    });
    // 2: UPDATE pos_otp attempts
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // 3: auth.users + stores lookup — found
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "store-1",
          store_name: "Test Store",
          store_code: "TS001",
          status: "ACTIVE",
        },
      ],
    });
    // 4: device count
    mockQuery.mockResolvedValueOnce({ rows: [{ device_count: 0 }] });

    // Transaction queries via client
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // UPDATE deactivate old devices
      .mockResolvedValueOnce({ rows: [] }) // INSERT new device
      .mockResolvedValueOnce({ rows: [] }) // DELETE pos_otp
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await request(otpApp)
      .post("/pos/auth/verify-otp")
      .send({ phone: "9876543210", otp: "123456" });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();

    // The INSERT is the 3rd client query (index 2): BEGIN=0, UPDATE=1, INSERT=2
    const insertCall = mockClientQuery.mock.calls[2];
    expect(insertCall).toBeDefined();
    expect(insertCall[0]).toContain("token_expires_at");
    expect(insertCall[0]).toContain("token_refreshed_at");
    expect(insertCall[0]).toContain("INTERVAL '90 days'");
  });
});
