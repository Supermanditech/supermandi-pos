/**
 * @jest-environment node
 */
/**
 * GCP-STG-0429: Supplier Product gstRate Field
 *
 * BEHAVIORAL test — mounts the supplier products router via supertest,
 * calls GET /supplier/products, verifies the response includes gstRate
 * mapped from gst_rate in the DB row.
 */

(global as any).__DEV__ = false;

const mockQuery = jest.fn();

jest.mock("../../backend/src/db/client", () => ({
  getPool: () => ({ query: mockQuery }),
}));

jest.mock("../../backend/src/routes/v1/supplier/auth", () => ({
  requireSupplierAuth: (req: any, _res: any, next: any) => {
    req.supplierId = "supplier-uuid-1";
    req.supplierStatus = "ACTIVE";
    next();
  },
  SupplierAuthRequest: {},
}));

jest.mock("../../backend/src/middleware/supplierStatusGate", () => ({
  requireActiveSupplier: (_req: any, _res: any, next: any) => next(),
  requireRegisteredSupplier: (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../../backend/src/middleware/rateLimit", () => ({
  redisRateLimit: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../../backend/src/lib/logger", () => ({
  log: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.mock("../../backend/src/services/supplierReadiness", () => ({
  checkSupplierReadiness: jest.fn().mockResolvedValue({ ready: true, blockers: [], checks: [] }),
}));

import express from "express";
import request from "supertest";
import { supplierProductsRouter } from "../../backend/src/routes/v1/supplier/products";

const app = express();
app.use(express.json());
app.use("/supplier", supplierProductsRouter);

beforeEach(() => {
  mockQuery.mockReset();
});

describe("GCP-STG-0429: Supplier product gstRate field (BEHAVIORAL)", () => {
  const PRODUCT_ROW = {
    id: "prod-1",
    name: "Test Rice 5kg",
    category: "Grocery",
    brand: "TestBrand",
    supplier_sku: "SKU-001",
    barcode: "8901234567890",
    purchase_price: 15000,
    mrp: 20000,
    moq: 1,
    unit: "KG",
    stock_quantity: 100,
    stock_status: "in_stock",
    is_active: true,
    approval_status: "approved",
    rejection_reason: null,
    edited_name: null,
    edited_category: null,
    supermandi_margin_minor: 500,
    bnpl_eligible: false,
    price_change_pending: false,
    pending_purchase_price: null,
    pending_mrp: null,
    image_url: null,
    thumbnail_url: null,
    net_content_value: 5,
    net_content_unit: "kg",
    manufacturer_name: "Test Mfg",
    country_of_origin: "IN",
    shelf_life_days: 365,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    ptr_minor: null,
    pts_minor: null,
    trade_discount_pct: null,
    scheme: null,
    delivery_sla_days: null,
    delivery_terms: null,
    credit_days: null,
    finance_eligible: false,
    delivery_days: null,
    bnpl_max_days: null,
    published_terms_version: null,
    published_at: null,
    moq_tiers: null,
    procurement_unit: null,
    procurement_pack_qty: null,
    base_stock_unit: null,
    hsn_code: "1006",
    split_sell_eligible: false,
    gst_rate: 5,
  };

  function setupListMock(rows: any[]) {
    mockQuery.mockImplementation((sql: string) => {
      if (typeof sql !== "string") return { rows: [] };
      if (sql.includes("COUNT(*)")) {
        return { rows: [{ total: String(rows.length) }] };
      }
      if (sql.includes("FROM catalog.supplier_products")) {
        return { rows };
      }
      return { rows: [] };
    });
  }

  test("GET /supplier/products returns gstRate mapped from gst_rate", async () => {
    setupListMock([PRODUCT_ROW]);

    const res = await request(app)
      .get("/supplier/products")
      .expect(200);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toHaveProperty("gstRate", 5);
  });

  test("gstRate is null when gst_rate is null in DB", async () => {
    setupListMock([{ ...PRODUCT_ROW, gst_rate: null }]);

    const res = await request(app)
      .get("/supplier/products")
      .expect(200);

    expect(res.body.data[0]).toHaveProperty("gstRate", null);
  });

  test("gstRate is numeric even when gst_rate is a string from DB", async () => {
    setupListMock([{ ...PRODUCT_ROW, gst_rate: "18" }]);

    const res = await request(app)
      .get("/supplier/products")
      .expect(200);

    expect(res.body.data[0].gstRate).toBe(18);
    expect(typeof res.body.data[0].gstRate).toBe("number");
  });

  test("gstRate=0 is preserved (not coerced to null/false)", async () => {
    setupListMock([{ ...PRODUCT_ROW, gst_rate: 0 }]);

    const res = await request(app)
      .get("/supplier/products")
      .expect(200);

    expect(res.body.data[0].gstRate).toBe(0);
  });

  test("response includes gstRate alongside other product fields", async () => {
    setupListMock([PRODUCT_ROW]);

    const res = await request(app)
      .get("/supplier/products")
      .expect(200);

    const product = res.body.data[0];
    // Verify gstRate coexists with other key fields
    expect(product).toHaveProperty("id", "prod-1");
    expect(product).toHaveProperty("name", "Test Rice 5kg");
    expect(product).toHaveProperty("hsnCode", "1006");
    expect(product).toHaveProperty("gstRate", 5);
    expect(product).toHaveProperty("splitSellEligible", false);
  });
});
