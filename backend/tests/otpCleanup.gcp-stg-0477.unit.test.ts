/**
 * GCP-STG-0477: Expired OTP cleanup + GCP-STG-0474: 30-second cooldown
 *
 * Uses same supertest pattern as verifyOtpIsActive.gcp-stg-0453.unit.test.ts.
 */

(global as any).__DEV__ = false;

const mockQuery = jest.fn();
jest.mock("../src/db/client", () => ({
  getPool: () => ({ query: mockQuery, connect: jest.fn(), end: jest.fn() }),
  pool: { query: mockQuery },
}));

jest.mock("../src/services/whatsappService", () => ({
  isWhatsAppConfigured: () => false,
  sendTextMessage: jest.fn(),
}));

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

// Mock authAudit to prevent side effects
jest.mock("../src/services/authAudit", () => ({
  logAuthEvent: jest.fn(),
}));

import express from "express";
import request from "supertest";
import { posOtpAuthRouter } from "../src/routes/v1/pos/otpAuth";

const app = express();
app.use(express.json());
app.use("/pos", posOtpAuthRouter);

beforeEach(() => mockQuery.mockReset());

describe("GCP-STG-0477: Expired OTP cleanup on send-otp", () => {
  test("send-otp runs DELETE on expired entries before inserting new OTP", async () => {
    // 1: Store lookup — phone registered
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "store-1", store_name: "Test Store", store_code: "TS001", status: "ACTIVE" }],
    });
    // 2: DELETE expired OTP entries (GCP-STG-0477)
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    // 3: SELECT recent OTP for cooldown check (GCP-STG-0474)
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // 4: INSERT new OTP (ON CONFLICT DO UPDATE)
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await request(app)
      .post("/pos/auth/send-otp")
      .send({ phone: "9876543210" });

    // Verify the DELETE query was called (2nd call, index 1)
    const deleteCall = mockQuery.mock.calls[1];
    expect(deleteCall).toBeDefined();
    expect(deleteCall[0]).toContain("DELETE FROM pos_otp");
    expect(deleteCall[0]).toContain("expires_at < NOW()");
    expect(deleteCall[0]).toContain("1 hour");
  });
});

describe("GCP-STG-0474: 30-second cooldown on send-otp", () => {
  test("returns success without regenerating OTP when recent OTP exists", async () => {
    // 1: Store lookup — phone registered
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "store-1", store_name: "Test Store", store_code: "TS001", status: "ACTIVE" }],
    });
    // 2: DELETE expired OTP entries
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    // 3: SELECT recent OTP for cooldown — FOUND (OTP sent < 30s ago)
    mockQuery.mockResolvedValueOnce({
      rows: [{ created_at: new Date() }],
    });
    // No further queries should be made (no INSERT, no WhatsApp/SMS)

    const res = await request(app)
      .post("/pos/auth/send-otp")
      .send({ phone: "9876543210" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain("already sent");
    // Only 3 queries should have been made (store lookup, delete expired, cooldown check)
    expect(mockQuery).toHaveBeenCalledTimes(3);
  });

  test("generates new OTP when no recent OTP exists (cooldown not triggered)", async () => {
    // 1: Store lookup — phone registered
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "store-1", store_name: "Test Store", store_code: "TS001", status: "ACTIVE" }],
    });
    // 2: DELETE expired OTP entries
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    // 3: SELECT recent OTP for cooldown — NOT FOUND (no recent OTP)
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // 4: INSERT new OTP
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/pos/auth/send-otp")
      .send({ phone: "9876543210" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe("OTP sent to your phone");
    // 4+ queries (store lookup, delete, cooldown check, INSERT, possibly more)
    expect(mockQuery.mock.calls.length).toBeGreaterThanOrEqual(4);
  });

  test("cooldown query checks phone, expires_at, and created_at within 30 seconds", async () => {
    // 1: Store lookup
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "store-1", store_name: "Test Store", store_code: "TS001", status: "ACTIVE" }],
    });
    // 2: DELETE expired
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // 3: Cooldown check
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // 4: INSERT
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await request(app)
      .post("/pos/auth/send-otp")
      .send({ phone: "9876543210" });

    // 3rd call (index 2) is the cooldown check
    const cooldownCall = mockQuery.mock.calls[2];
    expect(cooldownCall).toBeDefined();
    expect(cooldownCall[0]).toContain("pos_otp");
    expect(cooldownCall[0]).toContain("expires_at > NOW()");
    expect(cooldownCall[0]).toContain("30 seconds");
    expect(cooldownCall[1]).toEqual(["+919876543210"]);
  });
});
