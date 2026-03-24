/**
 * GCP-STG-0321: Category filter on SELL search endpoint
 *
 * Verifies that GET /api/v1/pos/store-products/search?q=...&category=...
 * correctly applies a category filter when the parameter is present,
 * and returns all categories when the parameter is absent.
 */

// ── Mock DB pool ──────────────────────────────────────────────────────
const mockQuery = jest.fn();
jest.mock("../src/db/client", () => ({
  getPool: () => ({ query: mockQuery }),
}));

// ── Mock Redis cache (no-op for search) ───────────────────────────────
jest.mock("../src/db/redis", () => ({
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheSet: jest.fn().mockResolvedValue(undefined),
}));

// ── Mock search localization ──────────────────────────────────────────
jest.mock("../src/services/searchLocalization", () => ({
  expandHindiSearchTokens: (tokens: string[]) => tokens,
  normalizeQuantityTokens: (q: string) => q.split(/\s+/),
}));

// ── Mock store isolation ──────────────────────────────────────────────
jest.mock("../src/services/storeIsolation", () => ({
  assertStoreId: jest.fn(),
}));

// ── Mock product validation ───────────────────────────────────────────
jest.mock("../src/utils/productValidation", () => ({
  validateProductName: jest.fn(),
  validateBarcode: jest.fn(),
  validatePrice: jest.fn(),
  validateStock: jest.fn(),
}));
jest.mock("../src/utils/priceBoundsValidator", () => ({
  validatePriceBounds: jest.fn().mockReturnValue({ valid: true }),
}));

// ── Mock storeProductDigitisationService ──────────────────────────────
jest.mock("../src/services/storeProductDigitisationService", () => ({
  createStoreProductFromDigitisation: jest.fn(),
}));

// ── Mock middleware ───────────────────────────────────────────────────
jest.mock("../src/middleware/deviceToken", () => ({
  requireDeviceToken: (_req: any, _res: any, next: any) => next(),
}));
jest.mock("../src/middleware/storeStatusGate", () => ({
  requireActiveStore: (_req: any, _res: any, next: any) => next(),
}));

// ── Mock logger ───────────────────────────────────────────────────────
jest.mock("../src/lib/logger", () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import express from "express";
import request from "supertest";
import { posStoreProductsRouter } from "../src/routes/v1/pos/storeProducts";

function buildApp() {
  const app = express();
  app.use(express.json());
  // Inject fake posDevice on every request
  app.use((req, _res, next) => {
    (req as any).posDevice = { storeId: "STORE-001" };
    next();
  });
  app.use("/api/v1/pos", posStoreProductsRouter);
  return app;
}

const sampleRow = (category: string) => ({
  store_product_id: `sp-${category}`,
  product_id: `p-${category}`,
  sell_price: 1000,
  mrp: 1200,
  purchase_price: 800,
  sp_display_name: `Test ${category}`,
  product_mode: "PACKAGED",
  metadata_updated_at: null,
  current_stock: 10,
  name: `Test ${category}`,
  brand: "TestBrand",
  category,
  unit: "pcs",
  primary_barcode: `BAR-${category}`,
  store_barcode: null,
  updated_at: new Date().toISOString(),
  group_key: `test ${category.toLowerCase()}::testbrand`,
  priority_score: 500,
  image_url: null,
  gst_rate: 18,
  net_content_value: null,
  net_content_unit: null,
  sold_by: null,
  rate_unit: null,
  procurement_unit: null,
  procurement_pack_qty: null,
  base_stock_unit: null,
  allow_fractional_sell: false,
  conversion_precision: 2,
  conversion_confirmed: true,
  low_stock_alert_qty: null,
  notes: null,
  pack_size: null,
  pack_unit: null,
});

describe("GCP-STG-0321: SELL search category filter", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    app = buildApp();
    jest.clearAllMocks();
  });

  it("passes category param to SQL when ?category= is provided", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [sampleRow("Dairy")] });

    const res = await request(app)
      .get("/api/v1/pos/store-products/search?q=milk&category=Dairy")
      .expect(200);

    expect(res.body.success).toBe(true);
    // Verify the query was called and category param was included
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0];
    // $1 = storeId, $2 = category ("Dairy"), then tokens follow
    expect(params).toContain("Dairy");
    // SQL should contain the category clause
    expect(sql).toContain("LOWER(p.category) = LOWER($");
  });

  it("does NOT include category clause when ?category= is absent", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [sampleRow("Dairy"), sampleRow("Snacks")] });

    const res = await request(app)
      .get("/api/v1/pos/store-products/search?q=test")
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0];
    // Should NOT have category in params (only storeId + tokens + limit)
    expect(sql).not.toContain("LOWER(p.category) = LOWER($");
    // All results returned (no category filtering)
    expect(res.body.data.length).toBe(2);
  });

  it("returns empty results when category matches no products", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get("/api/v1/pos/store-products/search?q=test&category=NonExistent")
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it("category filter is case-insensitive (LOWER comparison)", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [sampleRow("beverages")] });

    const res = await request(app)
      .get("/api/v1/pos/store-products/search?q=cola&category=Beverages")
      .expect(200);

    expect(res.body.success).toBe(true);
    const [sql] = mockQuery.mock.calls[0];
    // Uses LOWER() on both sides for case-insensitive comparison
    expect(sql).toMatch(/LOWER\(p\.category\)\s*=\s*LOWER\(\$/);
  });

  it("trims whitespace from category parameter", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [sampleRow("Dairy")] });

    await request(app)
      .get("/api/v1/pos/store-products/search?q=milk&category=%20Dairy%20")
      .expect(200);

    const [, params] = mockQuery.mock.calls[0];
    // categoryFilter should be trimmed
    expect(params).toContain("Dairy");
    expect(params).not.toContain(" Dairy ");
  });
});
