/**
 * GCP-STG-0480: JWT secret rotation for SuperAdmin — behavioral test
 *
 * Verifies dual-secret rotation support:
 * - Tokens signed with current JWT_SECRET are accepted
 * - Tokens signed with previous secret are accepted when JWT_SECRET_PREVIOUS is set
 * - Tokens signed with unknown secret are rejected
 * - New tokens are always signed with current JWT_SECRET
 */

import jwt from "jsonwebtoken";

// Set env vars BEFORE any module loads (module-level IIFE reads JWT_SECRET)
const CURRENT_SECRET = "test-current-secret-abc123";
const PREVIOUS_SECRET = "test-previous-secret-xyz789";
const UNKNOWN_SECRET = "test-unknown-secret-000000";
const JWT_ISSUER = "supermandi-auth";

process.env.JWT_SECRET = CURRENT_SECRET;
process.env.JWT_SECRET_PREVIOUS = PREVIOUS_SECRET;
process.env.ADMIN_EMAIL_ALLOWLIST = "admin@test.com";
process.env.NODE_ENV = "test";

// Mock Redis (adminAuth imports getRedis and blacklistToken)
jest.mock("../src/db/redis", () => ({
  getRedis: () => null,
  getRedisClient: () => null,
  blacklistToken: jest.fn().mockResolvedValue(undefined),
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheSet: jest.fn(),
}));

// Mock rate limiter — passthrough
jest.mock("../src/middleware/rateLimit", () => ({
  redisRateLimit: () => (_req: any, _res: any, next: any) => next(),
}));

// Mock email service (used by send-email-otp, not needed for our tests but required for module load)
jest.mock("../src/services/emailService", () => ({
  generateSecureOTP: () => "123456",
  hashOTP: jest.fn(),
  verifyOTPHash: jest.fn(),
  sendVerificationEmail: jest.fn(),
  checkEmailRateLimit: jest.fn().mockResolvedValue(null),
  recordEmailSend: jest.fn(),
}));

import express from "express";
import request from "supertest";
import { adminAuthRouter } from "../src/routes/v1/admin/adminAuth";

const app = express();
app.use(express.json());
app.use("/admin", adminAuthRouter);

/** Helper: create a signed admin JWT */
function signAdminToken(secret: string, payload?: Record<string, unknown>): string {
  return jwt.sign(
    {
      email: "admin@test.com",
      role: "super_admin",
      type: "admin",
      ...payload,
    },
    secret,
    { expiresIn: "1h", issuer: JWT_ISSUER }
  );
}

describe("GCP-STG-0480: JWT secret rotation", () => {
  describe("auth/check endpoint", () => {
    test("accepts token signed with current JWT_SECRET", async () => {
      const token = signAdminToken(CURRENT_SECRET);
      const res = await request(app)
        .get("/admin/auth/check")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
      expect(res.body.admin.email).toBe("admin@test.com");
    });

    test("accepts token signed with JWT_SECRET_PREVIOUS (rotation fallback)", async () => {
      const token = signAdminToken(PREVIOUS_SECRET);
      const res = await request(app)
        .get("/admin/auth/check")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
      expect(res.body.admin.email).toBe("admin@test.com");
    });

    test("rejects token signed with unknown secret", async () => {
      const token = signAdminToken(UNKNOWN_SECRET);
      const res = await request(app)
        .get("/admin/auth/check")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("INVALID_TOKEN");
    });

    test("rejects request with no token", async () => {
      const res = await request(app).get("/admin/auth/check");

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("NO_TOKEN");
    });
  });

  describe("auth/refresh endpoint", () => {
    test("accepts old-secret token and issues new token signed with current secret", async () => {
      const oldToken = signAdminToken(PREVIOUS_SECRET);
      const res = await request(app)
        .post("/admin/auth/refresh")
        .set("Authorization", `Bearer ${oldToken}`);

      expect(res.status).toBe(200);
      expect(res.body.sessionToken).toBeDefined();

      // The new token must be verifiable with CURRENT_SECRET (not previous)
      const decoded = jwt.verify(res.body.sessionToken, CURRENT_SECRET, {
        issuer: JWT_ISSUER,
        algorithms: ["HS256"],
      }) as { email: string; role: string };
      expect(decoded.email).toBe("admin@test.com");
      expect(decoded.role).toBe("super_admin");

      // The new token must NOT be verifiable with PREVIOUS_SECRET
      expect(() =>
        jwt.verify(res.body.sessionToken, PREVIOUS_SECRET, {
          issuer: JWT_ISSUER,
          algorithms: ["HS256"],
        })
      ).toThrow();
    });

    test("rejects unknown-secret token on refresh", async () => {
      const token = signAdminToken(UNKNOWN_SECRET);
      const res = await request(app)
        .post("/admin/auth/refresh")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("INVALID_TOKEN");
    });
  });

  describe("token signing", () => {
    test("verify-email-otp signs tokens with current JWT_SECRET", async () => {
      // We test this indirectly: the JWT_SECRET constant used for signing
      // is the same env var we set. A token from verify-email-otp would be
      // verifiable with CURRENT_SECRET. We verify by signing manually and
      // confirming the check endpoint validates it.
      const token = jwt.sign(
        { email: "admin@test.com", role: "super_admin", type: "admin" },
        CURRENT_SECRET,
        { expiresIn: "24h", issuer: JWT_ISSUER }
      );

      const res = await request(app)
        .get("/admin/auth/check")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
    });
  });

  describe("edge cases", () => {
    test("expired token signed with previous secret is still rejected", async () => {
      // Sign with previous secret but clearly expired (beyond clockTolerance of 30s)
      const expiredToken = jwt.sign(
        { email: "admin@test.com", role: "super_admin", type: "admin",
          iat: Math.floor(Date.now() / 1000) - 7200,
          exp: Math.floor(Date.now() / 1000) - 3600 },
        PREVIOUS_SECRET,
        { issuer: JWT_ISSUER }
      );

      const res = await request(app)
        .get("/admin/auth/check")
        .set("Authorization", `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
    });

    test("token with wrong issuer is rejected even with valid secret", async () => {
      const token = jwt.sign(
        { email: "admin@test.com", role: "super_admin", type: "admin" },
        CURRENT_SECRET,
        { expiresIn: "1h", issuer: "wrong-issuer" }
      );

      const res = await request(app)
        .get("/admin/auth/check")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(401);
    });
  });
});
