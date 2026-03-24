/**
 * GCP-STG-0548: TOTP revoke-devices endpoint tests
 * Behavioral: supertest against mounted routers with mocked auth + logAuthEvent
 */
import express, { Request, Response, NextFunction } from "express";
import request from "supertest";

// Set required env vars before any imports
process.env.JWT_SECRET = "test-secret-for-totp-revoke";
process.env.NODE_ENV = "test";

// Mock logAuthEvent before any router imports
const mockLogAuthEvent = jest.fn();
jest.mock("../src/services/authAudit", () => ({
  logAuthEvent: (...args: unknown[]) => mockLogAuthEvent(...args),
}));

// Mock jsonwebtoken — controls extractAdminToken / extractRetailerToken
const mockVerify = jest.fn();
jest.mock("jsonwebtoken", () => ({
  verify: (...args: unknown[]) => mockVerify(...args),
  sign: jest.fn().mockReturnValue("mock-token"),
  decode: jest.fn(),
}));

// Mock db client (some routers import getPool at module level)
const mockQuery = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 });
jest.mock("../src/db/client", () => ({
  getPool: () => ({ query: mockQuery, connect: jest.fn().mockResolvedValue({ query: mockQuery, release: jest.fn() }) }),
}));

// Mock Redis
jest.mock("../src/db/redis", () => ({
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheSet: jest.fn().mockResolvedValue(undefined),
  getRedisClient: jest.fn().mockReturnValue(null),
}));

// Mock email service (adminAuth imports it)
jest.mock("../src/services/emailService", () => ({
  sendOtpEmail: jest.fn().mockResolvedValue({ sent: true }),
  __esModule: true,
}));

// Mock TOTP lib
jest.mock("../src/lib/totp", () => ({
  generateTotpSecret: jest.fn(),
  verifyTotpCode: jest.fn(),
  generateBackupCodes: jest.fn(),
}));

// Supplier auth uses jwt.verify internally (same mock as above)
// requireSupplierAuth is defined in the same auth.ts file, not a separate module

// Import routers after all mocks
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { adminAuthRouter } = require("../src/routes/v1/admin/adminAuth");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { retailerAdminAuthRouter } = require("../src/routes/v1/retailer-admin/auth");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { supplierAuthRouter } = require("../src/routes/v1/supplier/auth");

// Build Express apps
const adminApp = express();
adminApp.use(express.json());
adminApp.use("/admin", adminAuthRouter);

const retailerApp = express();
retailerApp.use(express.json());
retailerApp.use("/retailer-admin", retailerAdminAuthRouter);

const supplierApp = express();
supplierApp.use(express.json());
supplierApp.use("/supplier", supplierAuthRouter);

describe("GCP-STG-0548: TOTP revoke-devices — behavioral supertest", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  // ======================= ADMIN =======================
  describe("POST /admin/auth/totp-revoke-devices", () => {
    it("returns 200 with success when admin is authenticated", async () => {
      // Mock jwt.verify to return valid admin token
      mockVerify.mockReturnValue({ email: "admin@supermandi.tech", role: "superadmin" });

      const res = await request(adminApp)
        .post("/admin/auth/totp-revoke-devices")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain("revoked");
    });

    it("returns 401 when no token provided", async () => {
      mockVerify.mockImplementation(() => { throw new Error("invalid"); });

      const res = await request(adminApp)
        .post("/admin/auth/totp-revoke-devices");

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("NO_TOKEN");
    });

    it("calls logAuthEvent with totp_devices_revoked", async () => {
      mockVerify.mockReturnValue({ email: "admin@supermandi.tech", role: "superadmin" });

      await request(adminApp)
        .post("/admin/auth/totp-revoke-devices")
        .set("Authorization", "Bearer valid-token");

      expect(mockLogAuthEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "totp_devices_revoked",
          actorType: "admin",
          actorId: "admin@supermandi.tech",
        })
      );
    });
  });

  // ======================= RETAILER =======================
  describe("POST /retailer-admin/auth/totp-revoke-devices", () => {
    it("returns 200 with success when retailer is authenticated", async () => {
      mockVerify.mockReturnValue({ sub: "retailer-user-123", storeId: "store-1", role: "owner" });

      const res = await request(retailerApp)
        .post("/retailer-admin/auth/totp-revoke-devices")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain("revoked");
    });

    it("returns 401 when no token provided", async () => {
      mockVerify.mockImplementation(() => { throw new Error("invalid"); });

      const res = await request(retailerApp)
        .post("/retailer-admin/auth/totp-revoke-devices");

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("NO_TOKEN");
    });

    it("calls logAuthEvent with totp_devices_revoked for retailer", async () => {
      mockVerify.mockReturnValue({ sub: "retailer-user-123", storeId: "store-1", role: "owner" });

      await request(retailerApp)
        .post("/retailer-admin/auth/totp-revoke-devices")
        .set("Authorization", "Bearer valid-token");

      expect(mockLogAuthEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "totp_devices_revoked",
          actorType: "retailer",
        })
      );
    });
  });

  // ======================= SUPPLIER =======================
  describe("POST /supplier/auth/totp-revoke-devices", () => {
    it("returns 200 with success when supplier is authenticated", async () => {
      // Mock jwt.verify to return valid supplier JWT payload (actorType SUPPLIER required)
      mockVerify.mockReturnValue({
        sub: "supplier-123",
        actorType: "SUPPLIER",
        actorId: "supplier-123",
        email: "supplier@test.com",
        jti: "test-jti",
        iat: Math.floor(Date.now() / 1000),
      });
      // Mock DB queries: token revocation check returns empty (not revoked), supplier lookup
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const res = await request(supplierApp)
        .post("/supplier/auth/totp-revoke-devices")
        .set("Authorization", "Bearer valid-supplier-token");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain("revoked");
    });

    it("returns 401 when supplier not authenticated", async () => {
      mockVerify.mockImplementation(() => { throw new Error("invalid"); });

      const res = await request(supplierApp)
        .post("/supplier/auth/totp-revoke-devices");

      expect(res.status).toBe(401);
    });

    it("calls logAuthEvent with totp_devices_revoked for supplier", async () => {
      mockVerify.mockReturnValue({
        sub: "supplier-123",
        actorType: "SUPPLIER",
        actorId: "supplier-123",
        email: "supplier@test.com",
        jti: "test-jti",
        iat: Math.floor(Date.now() / 1000),
      });
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await request(supplierApp)
        .post("/supplier/auth/totp-revoke-devices")
        .set("Authorization", "Bearer valid-supplier-token");

      expect(mockLogAuthEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "totp_devices_revoked",
          actorType: "supplier",
        })
      );
    });
  });
});
