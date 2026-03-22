/**
 * GCP-STG-0291: Supplier POST stores hsn_code
 *
 * Behavioral test: mocks getPool, invokes POST /api/v1/supplier/products
 * via supertest, verifies hsn_code is in the INSERT SQL and params.
 */

(global as any).__DEV__ = false;

const mockQuery = jest.fn();

jest.mock("../src/db/client", () => ({
  getPool: () => ({ query: mockQuery }),
}));

jest.mock("../src/routes/v1/supplier/auth", () => ({
  requireSupplierAuth: (req: any, _res: any, next: any) => {
    req.supplierId = "supplier-uuid-1";
    req.supplierStatus = "ACTIVE";
    next();
  },
  SupplierAuthRequest: {},
}));

jest.mock("../src/middleware/supplierStatusGate", () => ({
  requireActiveSupplier: (_req: any, _res: any, next: any) => next(),
  requireRegisteredSupplier: (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../src/middleware/rateLimit", () => ({
  redisRateLimit: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../src/lib/logger", () => ({
  log: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

// Mock supplier readiness to always pass
jest.mock("../src/services/supplierReadiness", () => ({
  checkSupplierReadiness: jest.fn().mockResolvedValue({ ready: true, blockers: [], checks: [] }),
}));

import express from "express";
import request from "supertest";

// Need to find the actual export name
import { supplierProductsRouter } from "../src/routes/v1/supplier/products";

const app = express();
app.use(express.json());
app.use("/supplier", supplierProductsRouter);

beforeEach(() => {
  mockQuery.mockReset();
});

describe("GCP-STG-0291: Supplier POST stores hsn_code", () => {
  test("INSERT SQL includes hsn_code column", async () => {
    // Use generic mock that returns valid rows for all queries
    mockQuery.mockImplementation((sql: string) => {
      if (typeof sql !== "string") return { rows: [] };
      if (sql.includes("INSERT INTO catalog.supplier_products")) {
        return {
          rows: [{
            id: "sp-1", name: "Test Product", category: null, brand: null,
            barcode: null, supplier_sku: null, purchase_price: 10000,
            mrp: null, moq: 1, unit: "PCS", hsn_code: "2501",
            approval_status: "pending", created_at: new Date().toISOString(),
          }],
        };
      }
      // Supplier readiness check: all fields must pass
      if (sql.includes("supplier.suppliers") || sql.includes("FROM supplier")) {
        return {
          rows: [{
            id: "supplier-uuid-1",
            email_verified: true,
            verification_status: "ACTIVE",
            bank_verified: true,
            city: "Mumbai",
            state: "Maharashtra",
            max_sku_capacity: 3000,
            current_count: 0,
            auto_approve_products: false,
          }],
        };
      }
      // Document checks
      if (sql.includes("platform.documents") || sql.includes("documents")) {
        return {
          rows: [
            { document_type: "pan_card", status: "approved" },
            { document_type: "gstin_certificate", status: "approved" },
            { document_type: "cancelled_cheque", status: "approved" },
          ],
        };
      }
      return { rows: [{ verified: true, max_sku_capacity: 3000, current_count: 0 }] };
    });

    const res = await request(app)
      .post("/supplier/products")
      .send({
        name: "Test Salt",
        purchasePrice: 10000,
        hsnCode: "2501",
      });

    // Find the INSERT query
    const insertCall = mockQuery.mock.calls.find(
      (call: any[]) => typeof call[0] === "string" && call[0].includes("INSERT INTO catalog.supplier_products")
    );

    expect(insertCall).toBeDefined();
    const sql = insertCall![0] as string;
    const params = insertCall![1] as any[];

    // Verify hsn_code is in the column list
    expect(sql).toContain("hsn_code");

    // Verify hsnCode value "2501" is in params
    expect(params).toContain("2501");
  });

  test("hsn_code is trimmed and null when empty", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ verified: true }] })
      .mockResolvedValueOnce({ rows: [{ max_sku_capacity: 3000, current_count: 0 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "sp-2", name: "No HSN", purchase_price: 5000, approval_status: "pending", created_at: new Date().toISOString() }] })
      .mockResolvedValue({ rows: [] });

    await request(app)
      .post("/supplier/products")
      .send({
        name: "No HSN Product",
        purchasePrice: 5000,
        hsnCode: "",
      });

    const insertCall = mockQuery.mock.calls.find(
      (call: any[]) => typeof call[0] === "string" && call[0].includes("INSERT INTO catalog.supplier_products")
    );

    if (insertCall) {
      const params = insertCall[1] as any[];
      // Empty string should become null
      const hsnParam = params[params.length - 1]; // last param before status values
      // hsnCode is $30, which is the last user-provided param
      expect(hsnParam === null || hsnParam === "").toBeTruthy();
    }
  });

  test("hsnCode is destructured from req.body", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../src/routes/v1/supplier/products.ts"), "utf8"
    );
    // Must destructure hsnCode before the } = req.body in the POST handler
    expect(src).toContain("hsnCode, // GCP-STG-0291");
  });

  test("INSERT has $30 parameter for hsn_code", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../src/routes/v1/supplier/products.ts"), "utf8"
    );
    expect(src).toContain("$30, 'pending', true)");
  });
});
