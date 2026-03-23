/**
 * GCP-STG-0471: SuperAdmin password login
 *
 * Behavioral tests using supertest:
 * - Correct password → 200 + JWT
 * - Wrong password → 401
 * - Email not in allowlist → 403
 * - No password_hash configured → 400
 * - Account locked out → 429
 * - Set password → 200
 */

// Set env vars BEFORE any module imports (module reads them at load time)
process.env.JWT_SECRET = "test-jwt-secret-for-password-tests-0471";
process.env.ADMIN_EMAIL_ALLOWLIST = "admin@supermandi.tech,other@supermandi.tech";
process.env.NODE_ENV = "test";

// Mock bcryptjs
const mockBcryptHash = jest.fn();
const mockBcryptCompare = jest.fn();
jest.mock("bcryptjs", () => ({
  __esModule: true,
  default: {
    hash: (...args: any[]) => mockBcryptHash(...args),
    compare: (...args: any[]) => mockBcryptCompare(...args),
  },
}));

// Mock database
const mockQuery = jest.fn();
jest.mock("../src/db/client", () => ({
  getPool: () => ({ query: mockQuery }),
}));

// Mock Redis — null (use in-memory fallbacks)
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

// Mock email service (required for module load)
jest.mock("../src/services/emailService", () => ({
  generateSecureOTP: () => "123456",
  hashOTP: jest.fn(),
  verifyOTPHash: jest.fn(),
  sendVerificationEmail: jest.fn(),
  checkEmailRateLimit: jest.fn().mockResolvedValue(null),
  recordEmailSend: jest.fn(),
}));

// Mock auth audit
jest.mock("../src/services/authAudit", () => ({
  logAuthEvent: jest.fn(),
}));

import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { adminAuthRouter } from "../src/routes/v1/admin/adminAuth";

const app = express();
app.use(express.json());
app.use("/admin", adminAuthRouter);

const JWT_SECRET = "test-jwt-secret-for-password-tests-0471";
const JWT_ISSUER = "supermandi-auth";

/** Helper: sign an admin JWT for set-password auth */
function signAdminToken(email: string): string {
  return jwt.sign(
    { email, role: "super_admin", type: "admin" },
    JWT_SECRET,
    { expiresIn: "1h", issuer: JWT_ISSUER, algorithm: "HS256" }
  );
}

beforeEach(() => {
  mockQuery.mockReset();
  mockBcryptHash.mockReset();
  mockBcryptCompare.mockReset();
});

describe("GCP-STG-0471: POST /admin/auth/login-password", () => {
  test("correct password → 200 + JWT token in response", async () => {
    // Mock getTotpRecord — returns a row with password_hash, TOTP not enabled
    mockQuery.mockResolvedValueOnce({
      rows: [{
        email: "admin@supermandi.tech",
        totp_secret: "",
        totp_enabled: false,
        password_hash: "$2a$12$hashedpassword",
      }],
    });

    mockBcryptCompare.mockResolvedValueOnce(true);

    const res = await request(app)
      .post("/admin/auth/login-password")
      .send({ email: "admin@supermandi.tech", password: "MySecure1" })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();
    expect(res.body.admin.email).toBe("admin@supermandi.tech");
    expect(res.body.admin.role).toBe("super_admin");

    // Verify JWT is valid
    const decoded = jwt.verify(res.body.token, JWT_SECRET, { issuer: JWT_ISSUER }) as any;
    expect(decoded.email).toBe("admin@supermandi.tech");
    expect(decoded.role).toBe("super_admin");
    expect(decoded.type).toBe("admin");
  });

  test("wrong password → 401", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        email: "admin@supermandi.tech",
        totp_secret: "",
        totp_enabled: false,
        password_hash: "$2a$12$hashedpassword",
      }],
    });

    mockBcryptCompare.mockResolvedValueOnce(false);

    // Mock getOtp (returns null — no previous failed attempts)
    // getOtp uses in-memory fallback since Redis is null

    const res = await request(app)
      .post("/admin/auth/login-password")
      .send({ email: "admin@supermandi.tech", password: "WrongPass1" })
      .expect(401);

    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  test("email not in allowlist → 403", async () => {
    const res = await request(app)
      .post("/admin/auth/login-password")
      .send({ email: "hacker@evil.com", password: "SomePass1" })
      .expect(403);

    expect(res.body.error.code).toBe("NOT_ALLOWED");
  });

  test("no password_hash configured → 400", async () => {
    // Mock getTotpRecord — row exists but password_hash is null
    mockQuery.mockResolvedValueOnce({
      rows: [{
        email: "admin@supermandi.tech",
        totp_secret: "ABCDEFGH",
        totp_enabled: false,
        password_hash: null,
      }],
    });

    const res = await request(app)
      .post("/admin/auth/login-password")
      .send({ email: "admin@supermandi.tech", password: "SomePass1" })
      .expect(400);

    expect(res.body.error.code).toBe("NO_PASSWORD");
    expect(res.body.error.message).toContain("Password not configured");
  });

  test("account locked out → 429", async () => {
    // Pre-populate lockout via in-memory fallback by making 5 failed attempts
    // Simpler: directly trigger lockout by sending multiple wrong passwords
    // The lockout uses in-memory store since Redis is mocked as null

    // Need to fail MAX_VERIFY_ATTEMPTS (5) times to trigger lockout
    for (let i = 0; i < 5; i++) {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          email: "other@supermandi.tech",
          totp_secret: "",
          totp_enabled: false,
          password_hash: "$2a$12$hashedpassword",
        }],
      });
      mockBcryptCompare.mockResolvedValueOnce(false);
    }

    // Send 5 wrong password attempts
    for (let i = 0; i < 4; i++) {
      await request(app)
        .post("/admin/auth/login-password")
        .send({ email: "other@supermandi.tech", password: "Wrong1234" });
    }

    // 5th attempt should trigger lockout (429)
    const lockoutRes = await request(app)
      .post("/admin/auth/login-password")
      .send({ email: "other@supermandi.tech", password: "Wrong1234" })
      .expect(429);

    expect(lockoutRes.body.error.code).toBe("TOO_MANY_ATTEMPTS");

    // Next attempt should also return 429 (already locked)
    const res = await request(app)
      .post("/admin/auth/login-password")
      .send({ email: "other@supermandi.tech", password: "AnyPass1" })
      .expect(429);

    expect(res.body.error.code).toBe("TOO_MANY_ATTEMPTS");
    expect(res.body.error.unlockAt).toBeDefined();
  });

  test("missing fields → 400", async () => {
    await request(app)
      .post("/admin/auth/login-password")
      .send({ email: "admin@supermandi.tech" })
      .expect(400);

    await request(app)
      .post("/admin/auth/login-password")
      .send({ password: "Test1234" })
      .expect(400);
  });

  test("TOTP enabled → returns requiresTOTP", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        email: "admin@supermandi.tech",
        totp_secret: "ABCDEFGHIJKLMNOP",
        totp_enabled: true,
        password_hash: "$2a$12$hashedpassword",
      }],
    });

    mockBcryptCompare.mockResolvedValueOnce(true);

    const res = await request(app)
      .post("/admin/auth/login-password")
      .send({ email: "admin@supermandi.tech", password: "MySecure1" })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.requiresTOTP).toBe(true);
    expect(res.body.email).toBe("admin@supermandi.tech");
    expect(res.body.token).toBeUndefined();
  });
});

describe("GCP-STG-0471: POST /admin/auth/set-password", () => {
  test("valid password + admin JWT → 200", async () => {
    const token = signAdminToken("admin@supermandi.tech");
    mockBcryptHash.mockResolvedValueOnce("$2a$12$newhashedvalue");
    mockQuery.mockResolvedValueOnce({ rows: [] }); // upsert

    const res = await request(app)
      .post("/admin/auth/set-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ password: "NewSecure1" })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(mockBcryptHash).toHaveBeenCalledWith("NewSecure1", 12);
    // Verify upsert was called with the hash
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO admin_totp"),
      ["admin@supermandi.tech", "$2a$12$newhashedvalue"]
    );
  });

  test("no JWT → 401", async () => {
    await request(app)
      .post("/admin/auth/set-password")
      .send({ password: "NewSecure1" })
      .expect(401);
  });

  test("password too short → 400", async () => {
    const token = signAdminToken("admin@supermandi.tech");

    const res = await request(app)
      .post("/admin/auth/set-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ password: "Short1" })
      .expect(400);

    expect(res.body.error.code).toBe("WEAK_PASSWORD");
  });

  test("password without number → 400", async () => {
    const token = signAdminToken("admin@supermandi.tech");

    const res = await request(app)
      .post("/admin/auth/set-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ password: "NoNumberHere" })
      .expect(400);

    expect(res.body.error.code).toBe("WEAK_PASSWORD");
  });

  test("missing password → 400", async () => {
    const token = signAdminToken("admin@supermandi.tech");

    await request(app)
      .post("/admin/auth/set-password")
      .set("Authorization", `Bearer ${token}`)
      .send({})
      .expect(400);
  });
});
