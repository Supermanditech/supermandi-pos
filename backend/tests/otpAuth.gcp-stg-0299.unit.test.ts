/**
 * GCP-STG-0299: POS OTP phone format — behavioral test
 *
 * Mocks getPool() and verifies the actual handler normalizes
 * 10-digit phone to E.164 (+91) before auth.users query,
 * while keeping raw phone for pos_otp storage.
 */

// Set __DEV__ global (React Native global used in otpAuth.ts logging)
(global as any).__DEV__ = false;

// Mock getPool before any imports
const mockQuery = jest.fn();
jest.mock("../src/db/client", () => ({
  getPool: () => ({ query: mockQuery, connect: jest.fn(), end: jest.fn() }),
  pool: { query: mockQuery },
}));

// Mock whatsappService
jest.mock("../src/services/whatsappService", () => ({
  isWhatsAppConfigured: () => false,
  sendTextMessage: jest.fn(),
}));

// Mock smsService (GCP-STG-0467)
jest.mock("../src/services/smsService", () => ({
  sendSms: jest.fn().mockResolvedValue(false),
}));

import express from "express";
import request from "supertest";
import { posOtpAuthRouter } from "../src/routes/v1/pos/otpAuth";

const app = express();
app.use(express.json());
app.use("/pos", posOtpAuthRouter);

beforeEach(() => {
  mockQuery.mockReset();
});

describe("GCP-STG-0299: POS OTP phone normalization", () => {
  describe("POST /pos/auth/send-otp", () => {
    test("normalizes 10-digit phone to +91 E.164 for auth.users query", async () => {
      // Mock all queries: auth.users lookup, pos_otp INSERT, and any others
      mockQuery.mockResolvedValue({ rows: [{ id: "store-1", store_name: "Test Store", store_code: "TS001", status: "ACTIVE" }] });

      await request(app)
        .post("/pos/auth/send-otp")
        .send({ phone: "9876543210" })
        .expect(200);

      // Verify auth.users query used +91 normalized phone
      const authQuery = mockQuery.mock.calls[0];
      expect(authQuery[0]).toContain("FROM auth.users");
      expect(authQuery[1]).toEqual(["+919876543210"]);

      // GCP-STG-0459: pos_otp INSERT now uses +91 normalized phone (unified with auth.users)
      const otpQuery = mockQuery.mock.calls[1];
      expect(otpQuery[0]).toContain("INSERT INTO pos_otp");
      expect(otpQuery[1][0]).toBe("+919876543210");
    });

    test("returns 404 PHONE_NOT_REGISTERED when no auth.users match", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .post("/pos/auth/send-otp")
        .send({ phone: "9876543210" })
        .expect(404);

      expect(res.body.error.code).toBe("PHONE_NOT_REGISTERED");
    });

    test("returns 400 for empty phone", async () => {
      const res = await request(app)
        .post("/pos/auth/send-otp")
        .send({ phone: "" })
        .expect(400);

      expect(res.body.error.code).toBe("INVALID_PHONE");
    });

    test("returns 400 for null phone", async () => {
      const res = await request(app)
        .post("/pos/auth/send-otp")
        .send({})
        .expect(400);

      expect(res.body.error.code).toBe("INVALID_PHONE");
    });

    test("returns 400 for non-10-digit phone", async () => {
      const res = await request(app)
        .post("/pos/auth/send-otp")
        .send({ phone: "12345" })
        .expect(400);

      expect(res.body.error.code).toBe("INVALID_PHONE");
    });

    test("returns 400 for 12-digit phone (already has country code)", async () => {
      const res = await request(app)
        .post("/pos/auth/send-otp")
        .send({ phone: "919876543210" })
        .expect(400);

      // 12 digits fails the /^\d{10}$/ validation — correct behavior
      expect(res.body.error.code).toBe("INVALID_PHONE");
    });
  });

  describe("POST /pos/auth/verify-otp", () => {
    test("normalizes phone to +91 for auth.users query after OTP verification", async () => {
      const hashedOtp = require("crypto").createHash("sha256").update("123456").digest("hex");

      mockQuery
        // 1st: pos_otp lookup (raw phone)
        .mockResolvedValueOnce({ rows: [{ otp_hash: hashedOtp, expires_at: new Date(Date.now() + 300000), attempts: 0 }] })
        // 2nd: increment attempts
        .mockResolvedValueOnce({ rows: [] })
        // 3rd: auth.users store lookup (should use +91)
        .mockResolvedValueOnce({ rows: [{ id: "store-1", store_name: "Test", store_code: "TS001", status: "ACTIVE" }] })
        // 4th+: device token creation etc.
        .mockResolvedValue({ rows: [{ id: "dev-1" }] });

      await request(app)
        .post("/pos/auth/verify-otp")
        .send({ phone: "9876543210", otp: "123456", storeId: "store-1" });

      // GCP-STG-0459: pos_otp query now uses +91 normalized phone
      expect(mockQuery.mock.calls[0][1]).toEqual(["+919876543210"]);

      // auth.users query uses +91 normalized phone
      const authCall = mockQuery.mock.calls.find(
        (call: any[]) => typeof call[0] === "string" && call[0].includes("FROM auth.users")
      );
      expect(authCall).toBeDefined();
      expect(authCall![1]).toEqual(["+919876543210"]);
    });

    test("returns 400 for invalid OTP format", async () => {
      const res = await request(app)
        .post("/pos/auth/verify-otp")
        .send({ phone: "9876543210", otp: "12345" })
        .expect(400);

      expect(res.body.error.code).toBe("INVALID_INPUT");
    });

    test("returns 400 for expired OTP", async () => {
      const hashedOtp = require("crypto").createHash("sha256").update("123456").digest("hex");

      mockQuery.mockResolvedValueOnce({
        rows: [{ otp_hash: hashedOtp, expires_at: new Date(Date.now() - 1000), attempts: 0 }],
      });

      const res = await request(app)
        .post("/pos/auth/verify-otp")
        .send({ phone: "9876543210", otp: "123456" })
        .expect(400);

      expect(res.body.error.code).toBe("OTP_EXPIRED");
    });

    test("returns 429 when attempts exceeded", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ otp_hash: "abc", expires_at: new Date(Date.now() + 300000), attempts: 5 }],
      });

      const res = await request(app)
        .post("/pos/auth/verify-otp")
        .send({ phone: "9876543210", otp: "123456" })
        .expect(429);

      expect(res.body.error.code).toBe("OTP_RATE_LIMITED");
    });
  });
});
