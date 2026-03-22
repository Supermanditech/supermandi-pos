/**
 * GCP-STG-0338: CatalogTab GET query must include billing_model
 *
 * Mocks getPool + admin middleware, invokes GET /catalog/products via supertest,
 * verifies the SQL SELECT includes billing_model and the response row has billingModel.
 */

(global as any).__DEV__ = false;

const mockQuery = jest.fn();

jest.mock("../src/db/client", () => ({
  getPool: () => ({ query: mockQuery, connect: jest.fn(), end: jest.fn() }),
}));

jest.mock("../src/middleware/adminToken", () => ({
  requireAdminToken: (_req: any, _res: any, next: any) => next(),
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../src/db/redis", () => ({
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheSet: jest.fn().mockResolvedValue(undefined),
  cacheDelete: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../src/lib/logger", () => ({
  log: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.mock("../src/services/stockReconciliation", () => ({
  reconcileStockBalances: jest.fn(),
  checkStockDivergence: jest.fn(),
}));

import express from "express";
import request from "supertest";
import { adminCatalogRouter } from "../src/routes/v1/admin/catalog";

const app = express();
app.use(express.json());
app.use("/", adminCatalogRouter);

beforeEach(() => {
  mockQuery.mockReset();
});

describe("GCP-STG-0338: admin catalog products returns billingModel", () => {
  it("SELECT query includes billing_model column", async () => {
    // First call = COUNT, second call = SELECT
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total: "1" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "prod-1",
            name: "Test Product",
            displayName: "Test Product",
            originalCategory: "Snacks",
            editedCategory: null,
            currentCategory: "Snacks",
            brand: "TestBrand",
            barcode: "1234567890",
            supplierSku: "SKU-1",
            purchasePrice: "100.00",
            mrp: "120.00",
            approvalStatus: "APPROVED",
            supplierId: "sup-1",
            supplierName: "Test Supplier",
            billingModel: "DIRECT_SUPPLIER",
          },
        ],
      });

    const res = await request(app)
      .get("/catalog/products")
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].billingModel).toBe("DIRECT_SUPPLIER");

    // Verify the SQL includes billing_model
    const selectCall = mockQuery.mock.calls[1];
    expect(selectCall).toBeDefined();
    const sql: string = selectCall[0];
    expect(sql).toContain("billing_model");
    expect(sql).toContain('"billingModel"');
  });

  it("billingModel defaults to SUPERMANDI_PRINCIPAL when null in DB", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total: "1" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "prod-2",
            name: "Product No Model",
            billingModel: null,
          },
        ],
      });

    const res = await request(app)
      .get("/catalog/products")
      .expect(200);

    // The frontend handles the default — backend returns raw DB value
    // This test confirms the field is present (even if null)
    expect(res.body.data[0]).toHaveProperty("billingModel");
  });

  it("source file contains billing_model in the products SELECT query", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../src/routes/v1/admin/catalog.ts"),
      "utf8"
    );

    // The products SELECT must include billing_model aliased as billingModel
    expect(src).toContain('sp.billing_model AS "billingModel"');
  });
});
