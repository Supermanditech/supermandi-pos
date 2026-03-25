/**
 * GCP-STG-0755: SuperAdmin password security-status + change-password
 *
 * Behavioral supertest: mounts adminAuthRouter on an express app,
 * mocks JWT verification, bcrypt, and database pool to test both
 * endpoints end-to-end through HTTP.
 */

// Must set JWT_SECRET before importing adminAuth (it reads env at import time)
process.env.JWT_SECRET = "test-jwt-secret-for-unit-tests";
process.env.ADMIN_EMAIL_ALLOWLIST = "admin@test.com";

const mockQuery = jest.fn();
const mockPool = { query: mockQuery };

jest.mock("../src/db/client", () => ({
  getPool: jest.fn(() => mockPool),
}));

jest.mock("../src/db/redis", () => ({
  getRedis: jest.fn(() => null),
  checkRateLimit: jest.fn().mockResolvedValue({ allowed: true, remaining: 99, resetAt: 0 }),
  blacklistToken: jest.fn(),
}));

jest.mock("../src/lib/logger", () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("../src/services/emailService", () => ({
  generateSecureOTP: jest.fn(),
  hashOTP: jest.fn(),
  verifyOTPHash: jest.fn(),
  sendVerificationEmail: jest.fn(),
  checkEmailRateLimit: jest.fn().mockResolvedValue(true),
  recordEmailSend: jest.fn(),
}));

jest.mock("../src/services/authAudit", () => ({
  logAuthEvent: jest.fn(),
}));

jest.mock("../src/middleware/rateLimit", () => ({
  redisRateLimit: () => (_req: any, _res: any, next: any) => next(),
}));

import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";

// Import the router after all mocks
import { adminAuthRouter } from "../src/routes/v1/admin/adminAuth";

function createApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use("/admin", adminAuthRouter);
  return app;
}

function makeToken(email = "admin@test.com"): string {
  return jwt.sign(
    { email, role: "superadmin" },
    process.env.JWT_SECRET!,
    { issuer: process.env.JWT_ISSUER || "supermandi-auth", algorithm: "HS256", expiresIn: "1h" }
  );
}

describe("GCP-STG-0755: Security status + change password", () => {
  let app: express.Express;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // --- GET /admin/auth/security-status ---

  describe("GET /admin/auth/security-status", () => {
    it("returns 401 without JWT", async () => {
      const res = await request(app).get("/admin/auth/security-status");
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("NO_TOKEN");
    });

    it("returns passwordConfigured: false when no password hash", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ email: "admin@test.com", totp_secret: null, totp_enabled: false, password_hash: null }],
      });

      const res = await request(app)
        .get("/admin/auth/security-status")
        .set("Authorization", `Bearer ${makeToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.passwordConfigured).toBe(false);
      expect(res.body.totpEnabled).toBe(false);
      expect(res.body.email).toBe("admin@test.com");
    });

    it("returns passwordConfigured: true when password hash exists", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ email: "admin@test.com", totp_secret: "abc", totp_enabled: true, password_hash: "$2a$12$hash" }],
      });

      const res = await request(app)
        .get("/admin/auth/security-status")
        .set("Authorization", `Bearer ${makeToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.passwordConfigured).toBe(true);
      expect(res.body.totpEnabled).toBe(true);
    });
  });

  // --- POST /admin/auth/change-password ---

  describe("POST /admin/auth/change-password", () => {
    it("returns 401 without JWT", async () => {
      const res = await request(app)
        .post("/admin/auth/change-password")
        .send({ currentPassword: "old", newPassword: "NewPass1234" });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("NO_TOKEN");
    });

    it("returns 400 for weak password (too short)", async () => {
      const res = await request(app)
        .post("/admin/auth/change-password")
        .set("Authorization", `Bearer ${makeToken()}`)
        .send({ currentPassword: "old", newPassword: "short1" });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("WEAK_PASSWORD");
    });

    it("returns 400 for weak password (no number)", async () => {
      const res = await request(app)
        .post("/admin/auth/change-password")
        .set("Authorization", `Bearer ${makeToken()}`)
        .send({ currentPassword: "old", newPassword: "NoNumbersHere" });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("WEAK_PASSWORD");
    });

    it("returns 401 for wrong current password", async () => {
      // bcrypt is real — we need a real hash for comparison
      const bcrypt = require("bcryptjs");
      const realHash = await bcrypt.hash("correctPassword1", 4);

      mockQuery.mockResolvedValueOnce({
        rows: [{ email: "admin@test.com", totp_secret: null, totp_enabled: false, password_hash: realHash }],
      });

      const res = await request(app)
        .post("/admin/auth/change-password")
        .set("Authorization", `Bearer ${makeToken()}`)
        .send({ currentPassword: "wrongPassword1", newPassword: "NewSecure1234" });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("WRONG_PASSWORD");
    });

    it("returns 200 and updates password when current is correct", async () => {
      const bcrypt = require("bcryptjs");
      const realHash = await bcrypt.hash("correctPassword1", 4);

      // First call: getTotpRecord SELECT
      mockQuery.mockResolvedValueOnce({
        rows: [{ email: "admin@test.com", totp_secret: null, totp_enabled: false, password_hash: realHash }],
      });
      // Second call: UPDATE password_hash
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const res = await request(app)
        .post("/admin/auth/change-password")
        .set("Authorization", `Bearer ${makeToken()}`)
        .send({ currentPassword: "correctPassword1", newPassword: "NewSecure1234" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify UPDATE was called
      expect(mockQuery).toHaveBeenCalledTimes(2);
      const updateCall = mockQuery.mock.calls[1];
      expect(updateCall[0]).toContain("UPDATE admin_totp SET password_hash");
    });
  });
});
