/**
 * GCP-STG-0336: Delta Sync Endpoint Unit Tests
 * Tests GET /api/v1/pos/store-products/delta?since=<ISO timestamp>
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------- Mock pool ---------
const mockQuery = vi.fn();
vi.mock("../src/db/client", () => ({
  getPool: () => ({ query: mockQuery }),
}));

// ---------- Mock middleware ---------
vi.mock("../src/middleware/deviceToken", () => ({
  requireDeviceToken: (_req: any, _res: any, next: any) => {
    _req.posDevice = { storeId: "STORE-001" };
    next();
  },
}));
vi.mock("../src/middleware/storeStatusGate", () => ({
  requireActiveStore: (_req: any, _res: any, next: any) => next(),
}));

// ---------- Mock storeIsolation ---------
vi.mock("../src/services/storeIsolation", () => ({
  assertStoreId: (id: string | null | undefined, _op: string) => {
    if (!id) throw new Error("STORE_ID_MISSING");
  },
}));

// ---------- Mock redis ---------
vi.mock("../src/db/redis", () => ({
  cacheGet: vi.fn().mockResolvedValue(null),
  cacheSet: vi.fn().mockResolvedValue(undefined),
}));

// ---------- Mock search localization ---------
vi.mock("../src/services/searchLocalization", () => ({
  expandHindiSearchTokens: (tokens: string[]) => tokens,
  normalizeQuantityTokens: (tokens: string[]) => tokens,
}));

// ---------- Mock product validation ---------
vi.mock("../src/utils/productValidation", () => ({
  validateProductName: () => ({ valid: true }),
  validateBarcode: () => ({ valid: true }),
  validatePrice: () => ({ valid: true }),
  validateStock: () => ({ valid: true }),
}));
vi.mock("../src/utils/priceBoundsValidator", () => ({
  validatePriceBounds: () => Promise.resolve({ valid: true }),
}));

// ---------- Mock digitisation service (required import) ---------
vi.mock("../src/services/storeProductDigitisationService", () => ({
  createStoreProductFromDigitisation: vi.fn(),
}));

// ---------- Mock logger ---------
vi.mock("../src/lib/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import express from "express";
import request from "supertest";
import { posStoreProductsRouter } from "../src/routes/v1/pos/storeProducts";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/pos", posStoreProductsRouter);
  return app;
}

describe("GET /api/v1/pos/store-products/delta", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("returns 400 when since param is missing", async () => {
    const app = buildApp();
    const res = await request(app).get("/api/v1/pos/store-products/delta");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("VALIDATION_ERROR");
    expect(res.body.message).toContain("since");
  });

  it("returns 400 when since param is invalid date", async () => {
    const app = buildApp();
    const res = await request(app).get("/api/v1/pos/store-products/delta?since=not-a-date");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("VALIDATION_ERROR");
    expect(res.body.message).toContain("valid ISO timestamp");
  });

  it("returns fullReloadRequired when changes exceed 500", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ total: 750 }] });

    const app = buildApp();
    const res = await request(app).get(
      "/api/v1/pos/store-products/delta?since=2026-01-01T00:00:00.000Z"
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.fullReloadRequired).toBe(true);
    expect(res.body.totalChanged).toBe(750);
    expect(res.body.deltaLimit).toBe(500);
  });

  it("returns upserted products and deletedIds for small delta", async () => {
    // Count query
    mockQuery.mockResolvedValueOnce({ rows: [{ total: 2 }] });
    // Data query — upserted active products
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          store_product_id: "SP-001",
          product_id: "P-001",
          name: "Test Product",
          primary_barcode: "1234567890",
          store_barcode: null,
          sell_price: 1500,
          mrp: null,
          purchase_price: null,
          display_name: null,
          product_mode: null,
          metadata_updated_at: "2026-01-02T00:00:00.000Z",
          expiry_date: null,
          batch_number: null,
          current_stock: 10,
          brand: "TestBrand",
          unit: "pcs",
          category: "Grocery",
          updated_at: "2026-01-02T00:00:00.000Z",
          image_url: null,
          gst_rate: 18,
          net_content_value: 500,
          net_content_unit: "g",
          sold_by: null,
          rate_unit: null,
          procurement_unit: null,
          procurement_pack_qty: null,
          base_stock_unit: null,
          allow_fractional_sell: false,
          conversion_precision: 2,
          conversion_confirmed: false,
          description: null,
          hsn_code: null,
          supplier_id: null,
          supplier_name: null,
          low_stock_alert_qty: null,
          notes: null,
          pack_size: null,
          pack_unit: null,
        },
      ],
    });
    // Deleted query
    mockQuery.mockResolvedValueOnce({
      rows: [{ product_id: "P-DEL-001" }],
    });

    const app = buildApp();
    const res = await request(app).get(
      "/api/v1/pos/store-products/delta?since=2026-01-01T00:00:00.000Z"
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.fullReloadRequired).toBe(false);
    expect(res.body.upserted).toHaveLength(1);
    expect(res.body.upserted[0].productId).toBe("P-001");
    expect(res.body.upserted[0].storeProductId).toBe("SP-001");
    expect(res.body.upserted[0].currentStock).toBe(10);
    expect(res.body.upserted[0].gst_rate).toBe(18);
    expect(res.body.deletedIds).toEqual(["P-DEL-001"]);
    expect(res.body.totalChanged).toBe(2);
  });

  it("returns empty arrays when nothing has changed", async () => {
    // Count query
    mockQuery.mockResolvedValueOnce({ rows: [{ total: 0 }] });
    // Data query
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // Deleted query
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const app = buildApp();
    const res = await request(app).get(
      "/api/v1/pos/store-products/delta?since=2026-03-23T00:00:00.000Z"
    );
    expect(res.status).toBe(200);
    expect(res.body.fullReloadRequired).toBe(false);
    expect(res.body.upserted).toEqual([]);
    expect(res.body.deletedIds).toEqual([]);
  });

  it("passes storeId from device token to all queries", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ total: 0 }] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const app = buildApp();
    await request(app).get(
      "/api/v1/pos/store-products/delta?since=2026-01-01T00:00:00.000Z"
    );

    // All 3 queries should have STORE-001 as first param
    expect(mockQuery).toHaveBeenCalledTimes(3);
    for (let i = 0; i < 3; i++) {
      expect(mockQuery.mock.calls[i][1][0]).toBe("STORE-001");
    }
  });
});
