/**
 * GCP-STG-0486: Supplier portal JWT — HttpOnly cookie auth support
 *
 * The requireSupplierAuth middleware now accepts JWT from either:
 *   1. Authorization: Bearer <token> header (existing, backward compat)
 *   2. sm_access_token HttpOnly cookie (new, XSS-safe)
 *
 * Login sets HttpOnly cookies; logout clears them.
 */

import jwt from "jsonwebtoken";

const JWT_SECRET = "test-secret-for-unit-tests";
const JWT_ISSUER = "supermandi-auth";

// Mock environment
process.env.JWT_SECRET = JWT_SECRET;
process.env.JWT_ISSUER = JWT_ISSUER;
process.env.NODE_ENV = "test";

// Mock getPool
const mockQuery = jest.fn();
jest.mock("../src/db/client", () => ({
  getPool: () => ({ query: mockQuery, connect: jest.fn(), end: jest.fn() }),
  pool: { query: mockQuery },
}));

// Mock redis
jest.mock("../src/db/redis", () => ({
  blacklistToken: jest.fn().mockResolvedValue(undefined),
  isTokenBlacklisted: jest.fn().mockResolvedValue(false),
  getRedis: () => null,
}));

// Mock rate limiting
jest.mock("../src/middleware/rateLimit", () => ({
  redisRateLimit: () => (_req: any, _res: any, next: any) => next(),
}));

// Mock IP blocking
jest.mock("../src/services/ipBlockingService", () => ({
  checkIpBlockMiddleware: (_req: any, _res: any, next: any) => next(),
  recordAuthFailure: jest.fn().mockResolvedValue(undefined),
  clearIpFailures: jest.fn(),
}));

// Mock auth audit
jest.mock("../src/services/authAuditService", () => ({
  logLoginSuccess: jest.fn().mockResolvedValue(undefined),
  logLoginFailed: jest.fn().mockResolvedValue(undefined),
  logAccountLocked: jest.fn().mockResolvedValue(undefined),
}));

// Mock email service
jest.mock("../src/services/emailService", () => ({
  sendVerificationEmail: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
  generateSecureOTP: jest.fn(),
  hashOTP: jest.fn(),
  verifyOTPHash: jest.fn(),
  checkEmailRateLimit: jest.fn(),
  recordEmailSend: jest.fn(),
  isEmailServiceEnabled: jest.fn().mockReturnValue(false),
  generateSecureResetToken: jest.fn(),
  hashResetToken: jest.fn(),
  verifyResetTokenHash: jest.fn(),
}));

// Mock Firebase
jest.mock("@supermandi/common", () => ({
  initializeFirebase: jest.fn(),
  verifyFirebaseIdToken: null,
}));

// Mock logger
jest.mock("../src/lib/logger", () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import express from "express";
import request from "supertest";
import bcrypt from "bcryptjs";
import { supplierAuthRouter } from "../src/routes/v1/supplier/auth";

// Build test app
const app = express();
app.use(express.json());
app.use("/supplier", supplierAuthRouter);

// Helper: create a valid supplier JWT
function makeSupplierToken(overrides: Record<string, unknown> = {}): string {
  return jwt.sign(
    {
      sub: "supplier-001",
      actorType: "SUPPLIER",
      actorId: "supplier-001",
      email: "test@example.com",
      permissions: ["supplier:read", "supplier:write"],
      jti: "test-jti-001",
      ...overrides,
    },
    JWT_SECRET,
    { issuer: JWT_ISSUER, expiresIn: "1h" }
  );
}

beforeEach(() => {
  mockQuery.mockReset();
});

describe("GCP-STG-0486: Supplier cookie-based auth", () => {
  describe("Login sets HttpOnly cookie", () => {
    test("POST /supplier/auth/login sets Set-Cookie with sm_access_token (httpOnly)", async () => {
      const passwordHash = await bcrypt.hash("TestPass123!", 10);

      // Mock supplier lookup
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: "supplier-001",
            primary_email: "test@example.com",
            password_hash: passwordHash,
            business_name: "Test Biz",
            gstin: "22AAAAA0000A1Z5",
            verification_status: "ACTIVE",
            status: "active",
            failed_login_count: 0,
            locked_until: null,
          },
        ],
      });

      // Mock clear failed login count
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .post("/supplier/auth/login")
        .send({ email: "test@example.com", password: "TestPass123!" })
        .expect(200);

      // Verify Set-Cookie header is present
      const setCookieHeaders = res.headers["set-cookie"];
      expect(setCookieHeaders).toBeDefined();
      expect(Array.isArray(setCookieHeaders)).toBe(true);

      // Find sm_access_token cookie
      const cookies = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
      const accessCookie = cookies.find((c: string) =>
        c.startsWith("sm_access_token=")
      );
      expect(accessCookie).toBeDefined();
      expect(accessCookie).toMatch(/HttpOnly/i);
      expect(accessCookie).toMatch(/Path=\/api/i);

      // Verify token is also in JSON body (backward compat)
      expect(res.body.data.token).toBeDefined();
      expect(typeof res.body.data.token).toBe("string");
    });
  });

  describe("Middleware accepts cookie auth (no Bearer header)", () => {
    test("Protected endpoint works with sm_access_token cookie only", async () => {
      const token = makeSupplierToken();

      // isTokenRevoked: Check 1 — JTI revocation lookup (no match = not revoked)
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // isTokenRevoked: Check 2 — supplier.suppliers tokens_revoked_at
      mockQuery.mockResolvedValueOnce({ rows: [{ tokens_revoked_at: null }] });
      // verification-status query
      mockQuery.mockResolvedValueOnce({
        rows: [{ verification_status: "ACTIVE", email_verified: true }],
      });

      const res = await request(app)
        .get("/supplier/auth/verification-status")
        .set("Cookie", `sm_access_token=${token}`)
        .expect(200);

      expect(res.body.data).toBeDefined();
    });

    test("Protected endpoint returns 401 with no token and no cookie", async () => {
      await request(app)
        .get("/supplier/auth/verification-status")
        .expect(401);
    });
  });

  describe("Middleware still accepts Bearer header (backward compat)", () => {
    test("Protected endpoint works with Authorization: Bearer header", async () => {
      const token = makeSupplierToken();

      // isTokenRevoked: Check 1 — JTI revocation lookup
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // isTokenRevoked: Check 2 — supplier tokens_revoked_at
      mockQuery.mockResolvedValueOnce({ rows: [{ tokens_revoked_at: null }] });
      // verification-status query
      mockQuery.mockResolvedValueOnce({
        rows: [{ verification_status: "ACTIVE", email_verified: true }],
      });

      const res = await request(app)
        .get("/supplier/auth/verification-status")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(res.body.data).toBeDefined();
    });
  });

  describe("Logout clears cookies", () => {
    test("POST /supplier/auth/logout clears sm_access_token cookie", async () => {
      const token = makeSupplierToken();

      // isTokenRevoked: Check 1 — JTI revocation lookup
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // isTokenRevoked: Check 2 — supplier tokens_revoked_at
      mockQuery.mockResolvedValueOnce({ rows: [{ tokens_revoked_at: null }] });
      // Logout handler: INSERT into token_revocations
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .post("/supplier/auth/logout")
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(200);

      expect(res.body.data.success).toBe(true);

      // Verify cookies are cleared (Set-Cookie with empty/expired values)
      const setCookieHeaders = res.headers["set-cookie"];
      expect(setCookieHeaders).toBeDefined();

      const cookies2 = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
      const clearCookie = cookies2.find((c: string) =>
        c.startsWith("sm_access_token=")
      );
      expect(clearCookie).toBeDefined();
      // Cleared cookies have Expires in the past or empty value
      expect(clearCookie).toMatch(/Expires=Thu, 01 Jan 1970/i);
    });

    test("POST /supplier/auth/logout works with cookie-only auth", async () => {
      const token = makeSupplierToken();

      // isTokenRevoked: Check 1 — JTI revocation lookup
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // isTokenRevoked: Check 2 — supplier tokens_revoked_at
      mockQuery.mockResolvedValueOnce({ rows: [{ tokens_revoked_at: null }] });
      // Logout handler: INSERT into token_revocations
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .post("/supplier/auth/logout")
        .set("Cookie", `sm_access_token=${token}`)
        .send({})
        .expect(200);

      expect(res.body.data.success).toBe(true);
    });
  });
});
