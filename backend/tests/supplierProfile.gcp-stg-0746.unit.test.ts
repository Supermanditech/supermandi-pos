// GCP-STG-0746: Behavioral test for supplier profile endpoint via supertest
import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import express from "express";
import request from "supertest";

// Build a minimal Express app that mounts the supplier profile router
// with mocked DB pool + supplier auth middleware

const MOCK_SUPPLIER_ID = "sup-test-001";
const MOCK_SUPPLIER_ROW = {
  id: MOCK_SUPPLIER_ID,
  email: "vendor@example.com",
  business_name: "Fresh Farms",
  trade_name: "Fresh Farms Trading",
  gstin: "27AABCS1234Z1Z5",
  pan: "AABCS1234Z",
  contact_name: "Vendor Owner",
  phone: "+919876543210",
  address: "123 Market Street",
  city: "Mumbai",
  state: "Maharashtra",
  pincode: "400001",
  verification_status: "verified",
  email_verified: true,
  status: "active",
  rating: "4.5",
  bank_account_number: "12345678901234",
  bank_ifsc: "HDFC0001234",
  bank_account_name: "Fresh Farms Trading",
  bank_name: "HDFC Bank",
  bank_verification_status: "verified",
  created_at: new Date("2025-01-01"),
};

// Mock the DB pool
jest.mock("../src/db/client", () => ({
  getPool: jest.fn(() => ({
    query: jest.fn().mockResolvedValue({ rows: [MOCK_SUPPLIER_ROW], rowCount: 1 }),
  })),
}));

// Mock logger
jest.mock("../src/lib/logger", () => ({
  log: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

// Mock the common validators (imported by profile.ts)
jest.mock("@supermandi/common", () => ({
  validatePinCode: jest.fn(() => ({ valid: true })),
  validateEmail: jest.fn(() => ({ valid: true })),
  validatePhone: jest.fn(() => ({ valid: true })),
}));

// Build the app with real router but inject auth via middleware
function buildApp(authenticated: boolean) {
  const app = express();
  app.use(express.json());

  if (authenticated) {
    // Simulate supplier auth middleware: attach supplierId to req
    app.use((req: any, _res, next) => {
      req.supplierId = MOCK_SUPPLIER_ID;
      next();
    });
  }

  // We need to override requireSupplierAuth inside the router.
  // Since the router file binds requireSupplierAuth inline, we mock it at module level.
  return app;
}

// Mock requireSupplierAuth to either pass or reject based on test needs
let authShouldPass = true;
jest.mock("../src/routes/v1/supplier/auth", () => ({
  requireSupplierAuth: (req: any, res: any, next: any) => {
    if (!authShouldPass) {
      return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Not authenticated" } });
    }
    req.supplierId = MOCK_SUPPLIER_ID;
    next();
  },
  SupplierAuthRequest: {},
}));

// Now import the router (after mocks are set up)
import { supplierProfileRouter } from "../src/routes/v1/supplier/profile";

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use("/supplier", supplierProfileRouter);
  return app;
}

describe("GCP-STG-0746: Supplier profile endpoint", () => {
  let app: express.Express;

  beforeAll(() => {
    authShouldPass = true;
    app = createTestApp();
  });

  it("GET /supplier/profile returns 200 with supplier data shape", async () => {
    authShouldPass = true;
    const res = await request(app).get("/supplier/profile");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("data");
    expect(res.body.data).toMatchObject({
      id: MOCK_SUPPLIER_ID,
      email: "vendor@example.com",
      businessName: "Fresh Farms",
      tradeName: "Fresh Farms Trading",
      gstin: "27AABCS1234Z1Z5",
      contactName: "Vendor Owner",
      phone: "+919876543210",
      verificationStatus: "verified",
      emailVerified: true,
      status: "active",
    });
    // Bank details should be masked
    expect(res.body.data.bankDetails).toBeTruthy();
    expect(res.body.data.bankDetails.accountNumber).toMatch(/^\*{4}\d{4}$/);
  });

  it("GET /supplier/profile without auth returns 401", async () => {
    authShouldPass = false;
    const res = await request(app).get("/supplier/profile");

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error");
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  afterAll(() => {
    authShouldPass = true;
  });
});
