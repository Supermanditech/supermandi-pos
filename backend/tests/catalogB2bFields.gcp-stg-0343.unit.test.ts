/**
 * GCP-STG-0343: CatalogTab GET query must include B2B commercial fields
 *
 * Verifies the admin catalog products SELECT returns:
 * ptrMinor, ptsMinor, tradeDiscountPct, scheme, moq, deliverySlaDays,
 * creditDays, imageUrl, stockQuantity
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

describe("GCP-STG-0343: admin catalog products returns B2B commercial fields", () => {
  const B2B_FIELDS = [
    "ptrMinor",
    "ptsMinor",
    "tradeDiscountPct",
    "scheme",
    "moq",
    "deliverySlaDays",
    "creditDays",
    "imageUrl",
    "stockQuantity",
  ];

  it("SELECT query includes all B2B columns", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total: "1" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "prod-b2b-1",
            name: "Toor Dal 1kg",
            displayName: "Toor Dal 1kg",
            originalCategory: "Pulses",
            editedCategory: null,
            currentCategory: "Pulses",
            brand: "Tata",
            barcode: "8901234567890",
            supplierSku: "SKU-TD1",
            purchasePrice: "8500",
            mrp: "10000",
            approvalStatus: "approved",
            supplierId: "sup-1",
            supplierName: "Tata Consumer",
            billingModel: "SUPERMANDI_PRINCIPAL",
            publishedToStores: 3,
            ptrMinor: 9000,
            ptsMinor: 8800,
            tradeDiscountPct: 5.5,
            scheme: "10+1 Free",
            moq: 10,
            deliverySlaDays: 3,
            creditDays: 30,
            imageUrl: "https://storage.googleapis.com/img/toor-dal.jpg",
            stockQuantity: 250,
          },
        ],
      });

    const res = await request(app)
      .get("/catalog/products")
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);

    const row = res.body.data[0];
    expect(row.ptrMinor).toBe(9000);
    expect(row.ptsMinor).toBe(8800);
    expect(row.tradeDiscountPct).toBe(5.5);
    expect(row.scheme).toBe("10+1 Free");
    expect(row.moq).toBe(10);
    expect(row.deliverySlaDays).toBe(3);
    expect(row.creditDays).toBe(30);
    expect(row.imageUrl).toBe("https://storage.googleapis.com/img/toor-dal.jpg");
    expect(row.stockQuantity).toBe(250);

    // Verify the SQL includes all B2B columns
    const selectCall = mockQuery.mock.calls[1];
    expect(selectCall).toBeDefined();
    const sql: string = selectCall[0];
    expect(sql).toContain("ptr_minor");
    expect(sql).toContain("pts_minor");
    expect(sql).toContain("trade_discount_pct");
    expect(sql).toContain("sp.scheme");
    expect(sql).toContain("sp.moq");
    expect(sql).toContain("delivery_sla_days");
    expect(sql).toContain("credit_days");
    expect(sql).toContain("image_url");
    expect(sql).toContain("stock_quantity");
  });

  it("B2B fields are null-safe when columns have no data", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total: "1" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "prod-b2b-2",
            name: "No B2B Data Product",
            ptrMinor: null,
            ptsMinor: null,
            tradeDiscountPct: null,
            scheme: null,
            moq: 1,
            deliverySlaDays: null,
            creditDays: 0,
            imageUrl: null,
            stockQuantity: 0,
          },
        ],
      });

    const res = await request(app)
      .get("/catalog/products")
      .expect(200);

    const row = res.body.data[0];
    expect(row.ptrMinor).toBeNull();
    expect(row.ptsMinor).toBeNull();
    expect(row.tradeDiscountPct).toBeNull();
    expect(row.scheme).toBeNull();
    expect(row.moq).toBe(1);
    expect(row.imageUrl).toBeNull();
    expect(row.stockQuantity).toBe(0);
  });

  it("source file contains all B2B column aliases in the products SELECT", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../src/routes/v1/admin/catalog.ts"),
      "utf8"
    );

    expect(src).toContain('sp.ptr_minor AS "ptrMinor"');
    expect(src).toContain('sp.pts_minor AS "ptsMinor"');
    expect(src).toContain('sp.trade_discount_pct AS "tradeDiscountPct"');
    expect(src).toContain("sp.scheme");
    expect(src).toContain("sp.moq");
    expect(src).toContain('sp.delivery_sla_days AS "deliverySlaDays"');
    expect(src).toContain('sp.credit_days AS "creditDays"');
    expect(src).toContain('sp.image_url AS "imageUrl"');
    expect(src).toContain('sp.stock_quantity AS "stockQuantity"');
  });

  it("CatalogProduct type includes all B2B fields", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../supermandi-superadmin/src/api/catalog.ts"),
      "utf8"
    );

    for (const field of B2B_FIELDS) {
      expect(src).toContain(`${field}?:`);
    }
  });

  it("CatalogTab renders B2B Terms and Stock columns", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../supermandi-superadmin/src/tabs/CatalogTab.tsx"),
      "utf8"
    );

    expect(src).toContain("<th>B2B Terms</th>");
    expect(src).toContain("<th>Stock</th>");
    expect(src).toContain("product.ptrMinor");
    expect(src).toContain("product.ptsMinor");
    expect(src).toContain("product.tradeDiscountPct");
    expect(src).toContain("product.scheme");
    expect(src).toContain("product.moq");
    expect(src).toContain("product.imageUrl");
    expect(src).toContain("product.stockQuantity");
  });
});
