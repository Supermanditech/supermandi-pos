/**
 * GCP-STG-0459: POS OTP phone stored as +91 E.164 in pos_otp
 *
 * Previously pos_otp stored raw 10-digit phone while auth.users used +91.
 * This caused lookup mismatches. Now all 4 pos_otp operations
 * (INSERT, SELECT, UPDATE, DELETE) use normalizedPhone (+91XXXXXXXXXX).
 */

// Set __DEV__ global (React Native global used in otpAuth.ts logging)
(global as any).__DEV__ = false;

// Mock getPool before any imports
const mockQuery = jest.fn();
const mockConnect = jest.fn();
const mockClientQuery = jest.fn();
const mockRelease = jest.fn();
mockConnect.mockResolvedValue({
  query: mockClientQuery,
  release: mockRelease,
});

jest.mock("../src/db/client", () => ({
  getPool: () => ({ query: mockQuery, connect: mockConnect, end: jest.fn() }),
  pool: { query: mockQuery },
}));

// Mock whatsappService
jest.mock("../src/services/whatsappService", () => ({
  isWhatsAppConfigured: () => false,
  sendTextMessage: jest.fn(),
}));

import express from "express";
import request from "supertest";
import crypto from "crypto";
import { posOtpAuthRouter } from "../src/routes/v1/pos/otpAuth";

const app = express();
app.use(express.json());
app.use("/pos", posOtpAuthRouter);

beforeEach(() => {
  mockQuery.mockReset();
  mockConnect.mockClear();
  mockClientQuery.mockReset();
  mockRelease.mockClear();
  mockConnect.mockResolvedValue({
    query: mockClientQuery,
    release: mockRelease,
  });
});

function hashOtp(otp: string): string {
  return crypto.createHash("sha256").update(otp).digest("hex");
}

describe("GCP-STG-0459: pos_otp uses +91 E.164 phone format", () => {
  describe("POST /pos/auth/send-otp", () => {
    test("INSERT into pos_otp uses +91 normalized phone, not raw 10-digit", async () => {
      // Mock: auth.users lookup returns a store
      mockQuery.mockResolvedValue({
        rows: [{ id: "store-1", store_name: "Test Store", store_code: "TS001", status: "ACTIVE" }],
      });

      await request(app)
        .post("/pos/auth/send-otp")
        .send({ phone: "9876543210" })
        .expect(200);

      // Find the pos_otp INSERT call
      const insertCall = mockQuery.mock.calls.find(
        (call: any[]) => typeof call[0] === "string" && call[0].includes("INSERT INTO pos_otp")
      );
      expect(insertCall).toBeDefined();
      // First param ($1) should be +91 normalized, NOT raw 10-digit
      expect(insertCall![1][0]).toBe("+919876543210");
    });
  });

  describe("POST /pos/auth/verify-otp", () => {
    test("SELECT from pos_otp uses +91 normalized phone", async () => {
      const hashed = hashOtp("123456");

      mockQuery
        // 1st: pos_otp SELECT
        .mockResolvedValueOnce({ rows: [{ otp_hash: hashed, expires_at: new Date(Date.now() + 300000), attempts: 0 }] })
        // 2nd: UPDATE attempts
        .mockResolvedValueOnce({ rows: [] })
        // 3rd: auth.users store lookup
        .mockResolvedValueOnce({ rows: [{ id: "store-1", store_name: "Test", store_code: "TS001", status: "ACTIVE" }] })
        // 4th+: device count + transaction queries
        .mockResolvedValue({ rows: [{ device_count: 0 }] });

      // Mock transaction client
      mockClientQuery.mockResolvedValue({ rows: [] });

      await request(app)
        .post("/pos/auth/verify-otp")
        .send({ phone: "9876543210", otp: "123456", storeId: "store-1" })
        .expect(200);

      // pos_otp SELECT should use +91 phone
      const selectCall = mockQuery.mock.calls[0];
      expect(selectCall[0]).toContain("FROM pos_otp");
      expect(selectCall[1]).toEqual(["+919876543210"]);
    });

    test("UPDATE pos_otp attempts uses +91 normalized phone", async () => {
      const hashed = hashOtp("999999");

      mockQuery
        .mockResolvedValueOnce({ rows: [{ otp_hash: hashed, expires_at: new Date(Date.now() + 300000), attempts: 0 }] })
        .mockResolvedValueOnce({ rows: [] }) // UPDATE
        .mockResolvedValueOnce({ rows: [{ id: "store-1", store_name: "Test", store_code: "TS001", status: "ACTIVE" }] })
        .mockResolvedValue({ rows: [{ device_count: 0 }] });

      mockClientQuery.mockResolvedValue({ rows: [] });

      await request(app)
        .post("/pos/auth/verify-otp")
        .send({ phone: "9876543210", otp: "999999", storeId: "store-1" })
        .expect(200);

      // UPDATE call should use +91 phone
      const updateCall = mockQuery.mock.calls.find(
        (call: any[]) => typeof call[0] === "string" && call[0].includes("UPDATE pos_otp")
      );
      expect(updateCall).toBeDefined();
      expect(updateCall![1]).toEqual(["+919876543210"]);
    });

    test("DELETE from pos_otp (in transaction) uses +91 normalized phone", async () => {
      const hashed = hashOtp("123456");

      mockQuery
        .mockResolvedValueOnce({ rows: [{ otp_hash: hashed, expires_at: new Date(Date.now() + 300000), attempts: 0 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: "store-1", store_name: "Test", store_code: "TS001", status: "ACTIVE" }] })
        .mockResolvedValue({ rows: [{ device_count: 0 }] });

      mockClientQuery.mockResolvedValue({ rows: [] });

      await request(app)
        .post("/pos/auth/verify-otp")
        .send({ phone: "9876543210", otp: "123456", storeId: "store-1" })
        .expect(200);

      // Transaction client DELETE should use +91 phone
      const deleteCall = mockClientQuery.mock.calls.find(
        (call: any[]) => typeof call[0] === "string" && call[0].includes("DELETE FROM pos_otp")
      );
      expect(deleteCall).toBeDefined();
      expect(deleteCall![1]).toEqual(["+919876543210"]);
    });

    test("all pos_otp operations use same format as auth.users query", async () => {
      const hashed = hashOtp("123456");

      mockQuery
        .mockResolvedValueOnce({ rows: [{ otp_hash: hashed, expires_at: new Date(Date.now() + 300000), attempts: 0 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: "store-1", store_name: "Test", store_code: "TS001", status: "ACTIVE" }] })
        .mockResolvedValue({ rows: [{ device_count: 0 }] });

      mockClientQuery.mockResolvedValue({ rows: [] });

      await request(app)
        .post("/pos/auth/verify-otp")
        .send({ phone: "9876543210", otp: "123456", storeId: "store-1" })
        .expect(200);

      // Collect all phone params from all queries
      const allPoolPhones = mockQuery.mock.calls
        .filter((call: any[]) => call[1] && call[1].length > 0)
        .map((call: any[]) => call[1][0]);

      // Every phone param should be +91 format
      for (const phoneParam of allPoolPhones) {
        if (typeof phoneParam === "string" && phoneParam.match(/\d{10,}/)) {
          expect(phoneParam).toMatch(/^\+91\d{10}$/);
        }
      }
    });
  });
});
