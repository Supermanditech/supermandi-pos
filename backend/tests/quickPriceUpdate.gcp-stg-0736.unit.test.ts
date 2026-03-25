/**
 * GCP-STG-0736: Quick price update from POS tile — behavioral supertest tests
 *
 * Mounts posStoreProductsRouter, mocks getPool + middleware, verifies HTTP responses.
 */

const mockQuery = jest.fn();
jest.mock("../src/db/client", () => ({
  getPool: () => ({ query: mockQuery }),
}));
jest.mock("../src/lib/logger", () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("../src/middleware/deviceToken", () => ({
  requireDeviceToken: (req: any, _res: any, next: any) => {
    req.posDevice = { storeId: "store-1", deviceId: "dev-1" };
    next();
  },
}));
jest.mock("../src/middleware/storeStatusGate", () => ({
  requireActiveStore: (_req: any, _res: any, next: any) => next(),
  requireOperationalStore: (_req: any, _res: any, next: any) => next(),
}));
jest.mock("../src/services/storeIsolation", () => ({
  assertStoreId: (storeId: any, _op: string) => {
    if (!storeId) throw new Error("Store isolation violation");
    return storeId;
  },
}));
jest.mock("../src/utils/productValidation", () => ({
  validateProductName: () => ({ valid: true }),
  validateBarcode: () => ({ valid: true }),
  validatePrice: () => ({ valid: true }),
  validateStock: () => ({ valid: true }),
}));
jest.mock("../src/utils/priceBoundsValidator", () => ({
  validatePriceBounds: () => Promise.resolve({ valid: true }),
}));
jest.mock("../src/services/searchLocalization", () => ({
  expandHindiSearchTokens: (t: string) => [t],
  normalizeQuantityTokens: (t: string) => t,
}));
jest.mock("../src/db/redis", () => ({
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheSet: jest.fn().mockResolvedValue(undefined),
}));

import express from "express";
import request from "supertest";
import { posStoreProductsRouter } from "../src/routes/v1/pos/storeProducts";

const app = express();
app.use(express.json());
app.use("/pos", posStoreProductsRouter);

beforeEach(() => {
  mockQuery.mockReset();
});

describe("PATCH /pos/store-products/:productId/price (GCP-STG-0736)", () => {
  const PRODUCT_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

  it("returns 422 when sellPriceMinor is missing", async () => {
    const res = await request(app)
      .patch(`/pos/store-products/${PRODUCT_ID}/price`)
      .send({});
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("VALIDATION_ERROR");
  });

  it("returns 422 when sellPriceMinor is zero", async () => {
    const res = await request(app)
      .patch(`/pos/store-products/${PRODUCT_ID}/price`)
      .send({ sellPriceMinor: 0 });
    expect(res.status).toBe(422);
  });

  it("returns 422 when sellPriceMinor is negative", async () => {
    const res = await request(app)
      .patch(`/pos/store-products/${PRODUCT_ID}/price`)
      .send({ sellPriceMinor: -100 });
    expect(res.status).toBe(422);
  });

  it("returns 404 when product not found", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // UPDATE returns 0
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // fallback also 0
    const res = await request(app)
      .patch(`/pos/store-products/${PRODUCT_ID}/price`)
      .send({ sellPriceMinor: 2500 });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("NOT_FOUND");
  });

  it("returns 200 with updated data on success", async () => {
    const now = new Date().toISOString();
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: PRODUCT_ID,
        product_id: "prod-1",
        sell_price: 2500,
        mrp: 3000,
        display_name: "Test Product",
        updated_at: now,
        price_updated_at: now,
      }],
      rowCount: 1,
    });

    const res = await request(app)
      .patch(`/pos/store-products/${PRODUCT_ID}/price`)
      .send({ sellPriceMinor: 2500, mrpMinor: 3000 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.sellPrice).toBe(2500);
    expect(res.body.data.mrp).toBe(3000);
    expect(res.body.data.storeProductId).toBe(PRODUCT_ID);
  });

  it("validates mrpMinor when provided as negative", async () => {
    const res = await request(app)
      .patch(`/pos/store-products/${PRODUCT_ID}/price`)
      .send({ sellPriceMinor: 2500, mrpMinor: -100 });
    expect(res.status).toBe(422);
    expect(res.body.message).toContain("mrpMinor");
  });
});
