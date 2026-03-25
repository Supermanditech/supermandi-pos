/**
 * GCP-STG-0467: SMS fallback for POS OTP delivery
 *
 * Tests:
 * - WhatsApp success → SMS NOT called
 * - WhatsApp failure → SMS fallback attempted
 * - SMS_PROVIDER=disabled → sendSms returns false
 * - Both fail → endpoint still returns 200 (OTP stored, delivery best-effort)
 */

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

// Mock rateLimit, authAudit, logger
jest.mock("../src/middleware/rateLimit", () => ({
  redisRateLimit: () => (_req: any, _res: any, next: any) => next(),
}));
jest.mock("../src/services/authAudit", () => ({
  logAuthEvent: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../src/lib/logger", () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock("../src/lib/errorUtils", () => ({
  asError: (e: unknown) => (e instanceof Error ? e : new Error(String(e))),
}));

// Mock whatsappService
const mockSendTextMessage = jest.fn();
const mockIsWhatsAppConfigured = jest.fn();
jest.mock("../src/services/whatsappService", () => ({
  isWhatsAppConfigured: (...args: any[]) => mockIsWhatsAppConfigured(...args),
  sendTextMessage: (...args: any[]) => mockSendTextMessage(...args),
}));

// Mock smsService
const mockSendSms = jest.fn();
jest.mock("../src/services/smsService", () => ({
  sendSms: (...args: any[]) => mockSendSms(...args),
}));

import express from "express";
import request from "supertest";
import { posOtpAuthRouter } from "../src/routes/v1/pos/otpAuth";

const app = express();
app.use(express.json());
app.use("/pos", posOtpAuthRouter);

// Standard mock for store lookup success + OTP insert
// Query sequence: auth.users → DELETE expired → SELECT cooldown → INSERT pos_otp → logAuthEvent
function mockStoreFound() {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ id: "store-1", store_name: "Test Store", store_code: "TS001", status: "ACTIVE" }] }) // auth.users
    .mockResolvedValueOnce({ rows: [] }) // DELETE expired OTPs
    .mockResolvedValueOnce({ rows: [] }) // SELECT cooldown check (no recent OTP)
    .mockResolvedValue({ rows: [] });    // INSERT pos_otp + logAuthEvent
}

beforeEach(() => {
  mockQuery.mockReset();
  mockConnect.mockClear();
  mockClientQuery.mockReset();
  mockRelease.mockClear();
  mockSendTextMessage.mockReset();
  mockIsWhatsAppConfigured.mockReset();
  mockSendSms.mockReset();
  mockConnect.mockResolvedValue({
    query: mockClientQuery,
    release: mockRelease,
  });
});

describe("GCP-STG-0467: SMS fallback for POS OTP delivery", () => {
  test("when WhatsApp succeeds, SMS is NOT called", async () => {
    mockStoreFound();
    mockIsWhatsAppConfigured.mockReturnValue(true);
    mockSendTextMessage.mockResolvedValue({ sent: true, wamid: "wamid-123" });

    const res = await request(app)
      .post("/pos/auth/send-otp")
      .send({ phone: "9876543210" })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(mockSendTextMessage).toHaveBeenCalledTimes(1);
    expect(mockSendSms).not.toHaveBeenCalled();
  });

  test("when WhatsApp fails, SMS fallback is attempted", async () => {
    mockStoreFound();
    mockIsWhatsAppConfigured.mockReturnValue(true);
    mockSendTextMessage.mockRejectedValue(new Error("WhatsApp API timeout"));
    mockSendSms.mockResolvedValue(true);

    const res = await request(app)
      .post("/pos/auth/send-otp")
      .send({ phone: "9876543210" })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(mockSendTextMessage).toHaveBeenCalledTimes(1);
    expect(mockSendSms).toHaveBeenCalledTimes(1);
    // SMS called with +91 prefixed phone
    expect(mockSendSms.mock.calls[0][0]).toBe("+919876543210");
    // SMS body contains the OTP message
    expect(mockSendSms.mock.calls[0][1]).toContain("verification code");
  });

  test("when WhatsApp not configured, SMS fallback is attempted", async () => {
    mockStoreFound();
    mockIsWhatsAppConfigured.mockReturnValue(false);
    mockSendSms.mockResolvedValue(true);

    const res = await request(app)
      .post("/pos/auth/send-otp")
      .send({ phone: "9876543210" })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(mockSendTextMessage).not.toHaveBeenCalled();
    expect(mockSendSms).toHaveBeenCalledTimes(1);
  });

  test("when both WhatsApp and SMS fail, endpoint still returns 200", async () => {
    mockStoreFound();
    mockIsWhatsAppConfigured.mockReturnValue(true);
    mockSendTextMessage.mockRejectedValue(new Error("WhatsApp down"));
    mockSendSms.mockResolvedValue(false);

    const res = await request(app)
      .post("/pos/auth/send-otp")
      .send({ phone: "9876543210" })
      .expect(200);

    // OTP is stored in DB regardless of delivery — user can retry
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe("OTP sent to your phone");
    expect(mockSendTextMessage).toHaveBeenCalledTimes(1);
    expect(mockSendSms).toHaveBeenCalledTimes(1);
  });
});

describe("GCP-STG-0467: sendSms with SMS_PROVIDER=disabled", () => {
  // Use requireActual to bypass the jest.mock above
  const realSmsService = jest.requireActual("../src/services/smsService") as typeof import("../src/services/smsService");

  test("sendSms returns false when provider is disabled", async () => {
    const origProvider = process.env.SMS_PROVIDER;
    process.env.SMS_PROVIDER = 'disabled';

    const result = await realSmsService.sendSms("+919876543210", "Test OTP 123456");
    expect(result).toBe(false);

    if (origProvider !== undefined) {
      process.env.SMS_PROVIDER = origProvider;
    } else {
      delete process.env.SMS_PROVIDER;
    }
  });

  test("sendSms returns false when SMS_PROVIDER is not set (defaults to disabled)", async () => {
    const origProvider = process.env.SMS_PROVIDER;
    delete process.env.SMS_PROVIDER;

    const result = await realSmsService.sendSms("+919876543210", "Test OTP 123456");
    expect(result).toBe(false);

    if (origProvider !== undefined) {
      process.env.SMS_PROVIDER = origProvider;
    } else {
      delete process.env.SMS_PROVIDER;
    }
  });
});
