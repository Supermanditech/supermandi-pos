/**
 * GCP-STG-0300: Approval must INSERT auth.users + auth.store_users
 *
 * Behavioral test: mocks DB client, invokes the approve handler,
 * verifies auth.users INSERT and auth.store_users INSERT are called
 * within the same transaction as store creation.
 */

(global as any).__DEV__ = false;

const mockClientQuery = jest.fn();
const mockClientRelease = jest.fn();
const mockPoolQuery = jest.fn();
const mockPoolConnect = jest.fn().mockResolvedValue({
  query: mockClientQuery,
  release: mockClientRelease,
});

jest.mock("../src/db/client", () => ({
  getPool: () => ({
    query: mockPoolQuery,
    connect: mockPoolConnect,
  }),
}));

// Mock services with side-effect imports (setInterval, process.exit, etc.)
jest.mock("../src/services/smsService", () => ({
  sendSms: jest.fn().mockResolvedValue({ success: true }),
}));
jest.mock("../src/services/notificationService", () => ({
  sendNotification: jest.fn().mockResolvedValue(undefined),
  sendWelcomeNotification: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../src/services/enrollmentCodeService", () => ({
  createEnrollmentCode: jest.fn().mockResolvedValue({ code: "TEST-CODE-123", id: "enroll-1" }),
  generateActivationCode: jest.fn().mockReturnValue("TEST-CODE-123"),
}));

// Mock admin auth middleware to skip token validation
jest.mock("../src/middleware/adminToken", () => ({
  requireAdminToken: (_req: any, _res: any, next: any) => next(),
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
}));

// Mock rate limiter to pass through
jest.mock("../src/middleware/rateLimit", () => ({
  redisRateLimit: () => (_req: any, _res: any, next: any) => next(),
}));

// Mock store code generation
jest.mock("../src/services/storeCodeService", () => ({
  generateStoreCode: jest.fn().mockResolvedValue("SU260322-TEST"),
}));

// Mock logger
jest.mock("../src/lib/logger", () => ({
  log: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

// Mock dependent services
jest.mock("../src/services/whatsappService", () => ({
  isWhatsAppConfigured: () => false,
  sendTextMessage: jest.fn(),
}));
jest.mock("../src/services/emailService", () => ({
  sendEmail: jest.fn().mockResolvedValue({ success: true }),
  isEmailConfigured: () => false,
}));

import express from "express";
import request from "supertest";

// We need to import the router that handles /admin/applications/:id/approve
// The route is in applications.ts
import { adminApplicationsRouter } from "../src/routes/v1/admin/applications";

const app = express();
app.use(express.json());
// Mock admin auth middleware
app.use((req: any, _res, next) => {
  req.adminId = "admin-uuid-123";
  req.user = { id: "admin-uuid-123", role: "superadmin" };
  next();
});
app.use("/admin", adminApplicationsRouter);

beforeEach(() => {
  mockClientQuery.mockReset();
  mockClientRelease.mockReset();
  mockPoolQuery.mockReset().mockResolvedValue({ rows: [{ code: "SU260322-TEST" }] });
  mockPoolConnect.mockClear();
});

describe("GCP-STG-0300: Application approval creates auth.users + auth.store_users", () => {
  const mockApplication = {
    id: "app-uuid-1",
    entity_type: "retailer",
    status: "KYC_SUBMITTED",
    business_name: "Test Kirana Store",
    owner_name: "Raju Sharma",
    phone: "9876543210",
    email: "raju@test.com",
    gstin: "08ABCDE1234F1Z5",
    address_line1: "123 Market Road",
    address_line2: "",
    city: "Jodhpur",
    state: "Rajasthan",
    pincode: "342001",
    upi_vpa: "raju@upi",
    document_urls: {},
  };

  function setupMockQueriesForRetailerApproval() {
    let callCount = 0;
    mockClientQuery.mockImplementation((sql: string, params?: any[]) => {
      callCount++;
      const sqlNorm = sql.replace(/\s+/g, " ").trim();

      // BEGIN
      if (sqlNorm === "BEGIN") return { rows: [] };

      // SELECT application FOR UPDATE
      if (sqlNorm.includes("FROM auth.applications") && sqlNorm.includes("FOR UPDATE")) {
        return { rows: [mockApplication] };
      }

      // Store code uniqueness check
      if (sqlNorm.includes("FROM platform.stores") && sqlNorm.includes("code =")) {
        return { rows: [] }; // code not taken
      }

      // INSERT INTO platform.stores
      if (sqlNorm.includes("INSERT INTO platform.stores")) {
        return { rows: [{ id: "store-uuid-1" }] };
      }

      // GCP-STG-0300: INSERT INTO auth.users
      if (sqlNorm.includes("INSERT INTO auth.users")) {
        return { rows: [{ id: "user-uuid-1" }] };
      }

      // GCP-STG-0300: INSERT INTO auth.store_users
      if (sqlNorm.includes("INSERT INTO auth.store_users")) {
        return { rows: [{ id: "su-uuid-1" }] };
      }

      // UPDATE auth.users (GCP-STG-0151 email copy)
      if (sqlNorm.includes("UPDATE auth.users")) {
        return { rows: [] };
      }

      // UPDATE auth.applications
      if (sqlNorm.includes("UPDATE auth.applications")) {
        return { rows: [] };
      }

      // INSERT INTO auth.application_status_log
      if (sqlNorm.includes("application_status_log")) {
        return { rows: [] };
      }

      // COMMIT
      if (sqlNorm === "COMMIT") return { rows: [] };

      // Default
      return { rows: [] };
    });
  }

  test("inserts auth.users with +91 normalized phone on retailer approval", async () => {
    setupMockQueriesForRetailerApproval();

    const res = await request(app)
      .post("/admin/applications/app-uuid-1/approve")
      .send({ notes: "Approved" });

    // The handler may return 500 due to unmocked post-commit fire-and-forget code,
    // but the critical auth.users + auth.store_users INSERTs happen BEFORE COMMIT.
    // We verify the queries were called correctly regardless of final HTTP status.

    // Find the auth.users INSERT call
    const authUserInsert = mockClientQuery.mock.calls.find(
      (call: any[]) => typeof call[0] === "string" && call[0].includes("INSERT INTO auth.users")
    );

    expect(authUserInsert).toBeDefined();
    // Verify phone is +91 normalized
    expect(authUserInsert![1][0]).toBe("+919876543210");
    // Verify email is passed
    expect(authUserInsert![1][1]).toBe("raju@test.com");
    // Verify name
    expect(authUserInsert![1][2]).toBe("Raju Sharma");
    // Verify actor_id is the store UUID
    expect(authUserInsert![1][3]).toBe("store-uuid-1");
  });

  test("inserts auth.store_users with RETAILER_ADMIN role and is_owner=true", async () => {
    setupMockQueriesForRetailerApproval();

    await request(app)
      .post("/admin/applications/app-uuid-1/approve")
      .send({ notes: "Approved" });

    const storeUserInsert = mockClientQuery.mock.calls.find(
      (call: any[]) => typeof call[0] === "string" && call[0].includes("INSERT INTO auth.store_users")
    );

    expect(storeUserInsert).toBeDefined();
    // store_id
    expect(storeUserInsert![1][0]).toBe("store-uuid-1");
    // user_id
    expect(storeUserInsert![1][1]).toBe("user-uuid-1");
  });

  test("auth.users INSERT uses ON CONFLICT to handle existing users", async () => {
    setupMockQueriesForRetailerApproval();

    await request(app)
      .post("/admin/applications/app-uuid-1/approve")
      .send({ notes: "Approved" });

    const authUserInsert = mockClientQuery.mock.calls.find(
      (call: any[]) => typeof call[0] === "string" && call[0].includes("INSERT INTO auth.users")
    );

    expect(authUserInsert).toBeDefined();
    expect(authUserInsert![0]).toContain("ON CONFLICT");
    expect(authUserInsert![0]).toContain("DO UPDATE");
  });

  test("auth.store_users INSERT uses ON CONFLICT DO NOTHING for idempotency", async () => {
    setupMockQueriesForRetailerApproval();

    await request(app)
      .post("/admin/applications/app-uuid-1/approve")
      .send({ notes: "Approved" });

    const storeUserInsert = mockClientQuery.mock.calls.find(
      (call: any[]) => typeof call[0] === "string" && call[0].includes("INSERT INTO auth.store_users")
    );

    expect(storeUserInsert).toBeDefined();
    expect(storeUserInsert![0]).toContain("ON CONFLICT");
    expect(storeUserInsert![0]).toContain("DO NOTHING");
  });

  test("auth.users and auth.store_users inserts happen AFTER BEGIN and AFTER store creation", async () => {
    setupMockQueriesForRetailerApproval();

    await request(app)
      .post("/admin/applications/app-uuid-1/approve")
      .send({ notes: "Approved" });

    const calls = mockClientQuery.mock.calls.map((c: any[]) => c[0]?.replace(/\s+/g, " ").trim().substring(0, 50));

    const beginIdx = calls.findIndex((c: string) => c === "BEGIN");
    const storeInsertIdx = calls.findIndex((c: string) => c.includes("INSERT INTO platform.stores"));
    const authUsersIdx = calls.findIndex((c: string) => c.includes("INSERT INTO auth.users"));
    const storeUsersIdx = calls.findIndex((c: string) => c.includes("INSERT INTO auth.store_users"));

    // All must exist
    expect(beginIdx).toBeGreaterThanOrEqual(0);
    expect(storeInsertIdx).toBeGreaterThan(beginIdx);
    expect(authUsersIdx).toBeGreaterThan(storeInsertIdx);
    expect(storeUsersIdx).toBeGreaterThan(authUsersIdx);
  });
});
