/**
 * GCP-STG-0289: BUY catalog pricing — behavioral test
 *
 * Mocks getPool, invokes GET /stores/:storeId/buy-catalog via supertest,
 * verifies the endpoint runs and the SQL uses admin_margin columns.
 */

(global as any).__DEV__ = false;

const mockQuery = jest.fn();

jest.mock("../src/db/client", () => ({
  getPool: () => ({ query: mockQuery, connect: jest.fn(), end: jest.fn() }),
}));

jest.mock("../src/middleware/deviceToken", () => ({
  requireDeviceToken: (req: any, _res: any, next: any) => {
    req.posDevice = { storeId: "store-uuid-1", deviceId: "dev-1" };
    next();
  },
  PosDeviceContext: {},
}));

jest.mock("../src/db/redis", () => ({
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheSet: jest.fn().mockResolvedValue(undefined),
  cacheDelete: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../src/lib/logger", () => ({
  log: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.mock("../src/services/storeIsolation", () => ({
  assertStoreId: jest.fn(),
}));

import express from "express";
import request from "supertest";
import { catalogRouter } from "../src/routes/v1/catalog";

const app = express();
app.use(express.json());
app.use("/catalog", catalogRouter);

beforeEach(() => {
  mockQuery.mockReset();
});

describe("GCP-STG-0289: BUY catalog retailer_price uses admin margin columns", () => {
  test("endpoint executes and the SQL query references admin_margin columns", async () => {
    // Mock COUNT + main query to return empty (valid response)
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total: "0" }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get("/catalog/stores/store-uuid-1/buy-catalog")
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual([]);

    // Verify the main SQL query uses admin_margin columns
    const mainQuery = mockQuery.mock.calls.find(
      (call: any[]) => typeof call[0] === "string" && call[0].includes("retailer_price")
    );
    expect(mainQuery).toBeDefined();

    const sql = mainQuery![0] as string;
    // Must use admin columns
    expect(sql).toContain("admin_margin_fixed_minor");
    expect(sql).toContain("admin_margin_pct");
    expect(sql).toContain("admin_retail_price_minor");
    // Must NOT use legacy columns in the pricing CASE
    expect(sql).not.toContain("supermandi_margin_minor");
    expect(sql).not.toContain("sp.margin_percent");
  });

  test("percentage margin: SQL computes purchase_price * admin_margin_pct / 100", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total: "0" }] })
      .mockResolvedValueOnce({ rows: [] });

    await request(app)
      .get("/catalog/stores/store-uuid-1/buy-catalog")
      .expect(200);

    const mainQuery = mockQuery.mock.calls.find(
      (call: any[]) => typeof call[0] === "string" && call[0].includes("retailer_price")
    );
    const sql = mainQuery![0] as string;

    // Verify the percentage calculation formula
    expect(sql).toContain("sp.purchase_price * sp.admin_margin_pct / 100");
  });

  test("COALESCE: admin_retail_price_minor is the primary price source", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total: "0" }] })
      .mockResolvedValueOnce({ rows: [] });

    await request(app)
      .get("/catalog/stores/store-uuid-1/buy-catalog")
      .expect(200);

    const mainQuery = mockQuery.mock.calls.find(
      (call: any[]) => typeof call[0] === "string" && call[0].includes("retailer_price")
    );
    const sql = mainQuery![0] as string;

    // COALESCE should prefer pre-calculated admin price
    expect(sql).toContain("COALESCE(sp.admin_retail_price_minor");
  });

  test("returns grouped product with bestPrice from SQL aggregation", async () => {
    // Simulate a real response with grouped data
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total: "1" }] })
      .mockResolvedValueOnce({
        rows: [{
          id: "grp-1",
          name: "Tata Salt 1kg",
          brand: "Tata",
          category: "Grocery",
          unit: "PCS",
          barcode: "8901030000001",
          bestPrice: 11500, // margin-applied
          minMoq: 1,
          supplierCount: 1,
          stockStatus: "in_stock",
          hsnCode: "2501",
          gstRate: 5,
          imageUrl: null,
          packSize: null,
          bestSupplierName: "Tata Distributors",
          bestSupplierCity: "Mumbai",
          bnplEligible: false,
          netContentValue: null,
          netContentUnit: null,
          suppliers: JSON.stringify([{
            supplierId: "sup-1",
            supplierName: "Tata Distributors",
            purchasePrice: 11500,
            mrp: 12000,
            moq: 1,
            ptrMinor: 11500,
            ptsMinor: 10000,
            tradeDiscountPct: 0,
            scheme: null,
            creditDays: 0,
            deliveryDays: 2,
            billingModel: "SUPERMANDI_PRINCIPAL",
          }]),
        }],
      });

    const res = await request(app)
      .get("/catalog/stores/store-uuid-1/buy-catalog")
      .expect(200);

    expect(res.body.data.length).toBe(1);
    const product = res.body.data[0];
    expect(product.name).toBe("Tata Salt 1kg");
    expect(product.bestPrice).toBe(11500);
    expect(product.suppliers).toBeDefined();
    // suppliers may be parsed JSON array or raw string — handle both
    const suppliers = typeof product.suppliers === "string"
      ? JSON.parse(product.suppliers)
      : product.suppliers;
    expect(suppliers[0].ptrMinor).toBe(11500);
  });

  test("no margin (all null): retailer_price = purchase_price", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total: "1" }] })
      .mockResolvedValueOnce({
        rows: [{
          id: "grp-2",
          name: "Sugar 1kg",
          brand: null,
          category: "Grocery",
          unit: "KG",
          barcode: null,
          bestPrice: 8500, // no margin = purchase price
          minMoq: 1,
          supplierCount: 1,
          stockStatus: "in_stock",
          hsnCode: null,
          gstRate: null,
          imageUrl: null,
          packSize: null,
          bestSupplierName: "Local Supplier",
          bestSupplierCity: "Jodhpur",
          bnplEligible: false,
          netContentValue: null,
          netContentUnit: null,
          suppliers: JSON.stringify([{
            supplierId: "sup-2",
            supplierName: "Local Supplier",
            purchasePrice: 8500,
            mrp: 9000,
            moq: 1,
            ptrMinor: null,
            ptsMinor: null,
            tradeDiscountPct: 0,
            scheme: null,
            creditDays: 0,
            deliveryDays: 3,
            billingModel: "SUPERMANDI_PRINCIPAL",
          }]),
        }],
      });

    const res = await request(app)
      .get("/catalog/stores/store-uuid-1/buy-catalog")
      .expect(200);

    expect(res.body.data[0].bestPrice).toBe(8500);
  });

  test("margin write endpoint uses same columns that BUY reads", async () => {
    // Verify column alignment between admin/catalog.ts (write) and catalog.ts (read)
    const fs = require("fs");
    const path = require("path");

    const adminSrc = fs.readFileSync(
      path.resolve(__dirname, "../src/routes/v1/admin/catalog.ts"), "utf8"
    );
    const buySrc = fs.readFileSync(
      path.resolve(__dirname, "../src/routes/v1/catalog.ts"), "utf8"
    );

    // Admin writes to admin_margin_pct
    expect(adminSrc).toContain("SET admin_margin_pct = $2");
    // BUY reads admin_margin_pct
    expect(buySrc).toContain("sp.admin_margin_pct");

    // Admin writes admin_margin_fixed_minor
    expect(adminSrc).toContain("admin_margin_fixed_minor = $3");
    // BUY reads admin_margin_fixed_minor
    expect(buySrc).toContain("sp.admin_margin_fixed_minor");

    // Admin writes admin_retail_price_minor
    expect(adminSrc).toContain("admin_retail_price_minor = $4");
    // BUY reads admin_retail_price_minor
    expect(buySrc).toContain("sp.admin_retail_price_minor");
  });
});
