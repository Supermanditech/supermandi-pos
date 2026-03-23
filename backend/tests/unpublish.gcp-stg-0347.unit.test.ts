/**
 * GCP-STG-0347: Unpublish/deactivate published products from stores
 *
 * Behavioral test: mocks DB client, invokes the unpublish handler,
 * verifies store_products are deactivated (is_active = false) and
 * audit log is written.
 */

(global as any).__DEV__ = false;

const mockClientQuery = jest.fn();
const mockClientRelease = jest.fn();
const mockPoolConnect = jest.fn().mockResolvedValue({
  query: mockClientQuery,
  release: mockClientRelease,
});

jest.mock("../src/db/client", () => ({
  getPool: () => ({
    connect: mockPoolConnect,
  }),
}));

// Mock services with side-effect imports
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
jest.mock("../src/services/whatsappService", () => ({
  isWhatsAppConfigured: () => false,
  sendTextMessage: jest.fn(),
}));
jest.mock("../src/services/emailService", () => ({
  sendEmail: jest.fn().mockResolvedValue({ success: true }),
  isEmailConfigured: () => false,
}));
jest.mock("../src/services/storeCodeService", () => ({
  generateStoreCode: jest.fn().mockResolvedValue("SU260322-TEST"),
}));

// Mock admin auth middleware to skip token validation
jest.mock("../src/middleware/adminToken", () => ({
  requireAdminToken: (req: any, _res: any, next: () => void) => {
    req.adminId = "admin-test-1";
    next();
  },
  requirePermission: () => (_req: any, _res: any, next: () => void) => next(),
}));

// Mock rate limiter
jest.mock("../src/middleware/rateLimit", () => ({
  redisRateLimit: () => (_req: any, _res: any, next: () => void) => next(),
}));

// Mock logger (named export "log")
jest.mock("../src/lib/logger", () => ({
  log: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import request from "supertest";
import express from "express";

const app = express();
app.use(express.json());

// Must import AFTER mocks
const { adminSuppliersRouter } = require("../src/routes/v1/admin/suppliers");
app.use("/api/v1/admin", adminSuppliersRouter);

beforeEach(() => {
  jest.clearAllMocks();
});

describe("POST /api/v1/admin/products/:productId/unpublish", () => {
  const PRODUCT_ID = "aaaa-bbbb-cccc-dddd";

  it("returns 404 when product not found", async () => {
    // BEGIN
    mockClientQuery.mockResolvedValueOnce({});
    // product check - empty
    mockClientQuery.mockResolvedValueOnce({ rows: [] });
    // ROLLBACK
    mockClientQuery.mockResolvedValueOnce({});

    const res = await request(app)
      .post(`/api/v1/admin/products/${PRODUCT_ID}/unpublish`)
      .send({});

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it("deactivates all store_products when no storeId given", async () => {
    // BEGIN
    mockClientQuery.mockResolvedValueOnce({});
    // product check
    mockClientQuery.mockResolvedValueOnce({
      rows: [{ id: PRODUCT_ID, name: "Test Rice" }],
    });
    // supplier_product_map lookup
    mockClientQuery.mockResolvedValueOnce({ rows: [] });
    // UPDATE store_products RETURNING id
    mockClientQuery.mockResolvedValueOnce({
      rows: [{ id: "sp-1" }, { id: "sp-2" }, { id: "sp-3" }],
      rowCount: 3,
    });
    // audit log INSERT
    mockClientQuery.mockResolvedValueOnce({});
    // COMMIT
    mockClientQuery.mockResolvedValueOnce({});

    const res = await request(app)
      .post(`/api/v1/admin/products/${PRODUCT_ID}/unpublish`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.deactivatedFromStores).toBe(3);
    expect(res.body.productName).toBe("Test Rice");

    // Verify UPDATE query sets is_active = false
    const updateCall = mockClientQuery.mock.calls.find(
      (c: any[]) => typeof c[0] === "string" && c[0].includes("is_active = false")
    );
    expect(updateCall).toBeTruthy();
    // Should NOT include store_id filter
    expect(updateCall![0]).not.toContain("store_id = $2");
  });

  it("deactivates only specific store when storeId given", async () => {
    const STORE_ID = "store-xyz-123";

    // BEGIN
    mockClientQuery.mockResolvedValueOnce({});
    // product check
    mockClientQuery.mockResolvedValueOnce({
      rows: [{ id: PRODUCT_ID, name: "Test Rice" }],
    });
    // supplier_product_map lookup - has mapping
    mockClientQuery.mockResolvedValueOnce({
      rows: [{ product_id: "catalog-prod-1" }],
    });
    // UPDATE store_products RETURNING id
    mockClientQuery.mockResolvedValueOnce({
      rows: [{ id: "sp-1" }],
      rowCount: 1,
    });
    // audit log INSERT
    mockClientQuery.mockResolvedValueOnce({});
    // COMMIT
    mockClientQuery.mockResolvedValueOnce({});

    const res = await request(app)
      .post(`/api/v1/admin/products/${PRODUCT_ID}/unpublish?storeId=${STORE_ID}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.deactivatedFromStores).toBe(1);

    // Verify UPDATE query includes store_id filter
    const updateCall = mockClientQuery.mock.calls.find(
      (c: any[]) => typeof c[0] === "string" && c[0].includes("is_active = false")
    );
    expect(updateCall).toBeTruthy();
    expect(updateCall![0]).toContain("store_id = $2");
    expect(updateCall![1]).toContain(STORE_ID);
  });

  it("writes audit log with unpublish action", async () => {
    // BEGIN
    mockClientQuery.mockResolvedValueOnce({});
    // product check
    mockClientQuery.mockResolvedValueOnce({
      rows: [{ id: PRODUCT_ID, name: "Test Rice" }],
    });
    // supplier_product_map
    mockClientQuery.mockResolvedValueOnce({ rows: [] });
    // UPDATE
    mockClientQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    // audit log
    mockClientQuery.mockResolvedValueOnce({});
    // COMMIT
    mockClientQuery.mockResolvedValueOnce({});

    await request(app)
      .post(`/api/v1/admin/products/${PRODUCT_ID}/unpublish`)
      .send({});

    // Find the audit log INSERT call
    const auditCall = mockClientQuery.mock.calls.find(
      (c: any[]) => typeof c[0] === "string" && c[0].includes("approval_logs") && c[0].includes("unpublished")
    );
    expect(auditCall).toBeTruthy();
    // Verify the changes JSON contains action: unpublish
    const changesJson = JSON.parse(auditCall![1][2]);
    expect(changesJson.action).toBe("unpublish");
  });

  it("returns 0 deactivated when product has no active store_products", async () => {
    // BEGIN
    mockClientQuery.mockResolvedValueOnce({});
    // product check
    mockClientQuery.mockResolvedValueOnce({
      rows: [{ id: PRODUCT_ID, name: "Test Rice" }],
    });
    // supplier_product_map
    mockClientQuery.mockResolvedValueOnce({ rows: [] });
    // UPDATE - no rows matched
    mockClientQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    // audit log
    mockClientQuery.mockResolvedValueOnce({});
    // COMMIT
    mockClientQuery.mockResolvedValueOnce({});

    const res = await request(app)
      .post(`/api/v1/admin/products/${PRODUCT_ID}/unpublish`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.deactivatedFromStores).toBe(0);
  });
});
