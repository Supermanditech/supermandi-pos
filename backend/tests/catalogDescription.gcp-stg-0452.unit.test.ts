/**
 * GCP-STG-0452: Admin catalog GET products SELECT must include sp.description
 *
 * Verifies the SQL SELECT query returns the description field and the
 * response includes it in the data rows.
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

describe("GCP-STG-0452: admin catalog products returns description field", () => {
  it("SELECT query includes sp.description", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total: "1" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "prod-desc-1",
            name: "Tata Salt 1kg",
            description: "Premium iodised salt, vacuum evaporated",
            displayName: "Tata Salt 1kg",
            originalCategory: "Salt",
            editedCategory: null,
            currentCategory: "Salt",
            brand: "Tata",
            barcode: "8901234500001",
            supplierSku: "SKU-TS1",
            purchasePrice: "2500",
            mrp: "2800",
            approvalStatus: "approved",
            supplierId: "sup-1",
            supplierName: "Tata Consumer",
          },
        ],
      });

    const res = await request(app)
      .get("/catalog/products")
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].description).toBe("Premium iodised salt, vacuum evaporated");

    // Verify the SQL SELECT includes sp.description
    const selectCall = mockQuery.mock.calls[1];
    expect(selectCall).toBeDefined();
    const sql: string = selectCall[0];
    expect(sql).toContain("sp.description");
  });

  it("description is null-safe when column has no data", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total: "1" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "prod-desc-2",
            name: "No Description Product",
            description: null,
          },
        ],
      });

    const res = await request(app)
      .get("/catalog/products")
      .expect(200);

    expect(res.body.data[0].description).toBeNull();
  });

  it("source file contains sp.description in the products SELECT", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../src/routes/v1/admin/catalog.ts"),
      "utf8"
    );

    expect(src).toContain("sp.description");
  });
});
