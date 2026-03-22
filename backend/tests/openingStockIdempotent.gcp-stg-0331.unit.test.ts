/**
 * GCP-STG-0331: Opening Stock Idempotency Guard
 * Verifies that duplicate opening_stock submissions are rejected (409)
 * and stock is not doubled.
 */
import { describe, it, expect, jest, beforeEach } from "@jest/globals";

// --- Mock pool/client ---
const mockQuery = jest.fn<(...args: any[]) => Promise<any>>();
const mockRelease = jest.fn();
const mockConnect = jest.fn<() => Promise<any>>().mockResolvedValue({
  query: mockQuery,
  release: mockRelease,
});
const mockPool = { connect: mockConnect };

jest.mock("../src/db/client", () => ({
  getPool: () => mockPool,
}));

jest.mock("../src/lib/logger", () => ({
  log: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

// Stub middleware to inject posDevice
jest.mock("../src/middleware/deviceToken", () => ({
  requireDeviceToken: (_req: any, _res: any, next: any) => {
    _req.posDevice = { storeId: "store-1", deviceId: "dev-1" };
    next();
  },
}));
jest.mock("../src/middleware/storeStatusGate", () => ({
  requireActiveStore: (_req: any, _res: any, next: any) => next(),
}));

import express from "express";
import request from "supertest";
import { posOpeningStockRouter } from "../src/routes/v1/pos/openingStock";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/pos", posOpeningStockRouter);
  return app;
}

describe("GCP-STG-0331: Opening stock idempotency", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 409 when opening_stock already exists for the product", async () => {
    // BEGIN
    mockQuery.mockResolvedValueOnce({});
    // dupCheck — count=1 means already set
    mockQuery.mockResolvedValueOnce({ rows: [{ cnt: 1 }] });
    // COMMIT
    mockQuery.mockResolvedValueOnce({});

    const app = buildApp();
    const res = await request(app)
      .post("/pos/inventory/opening-stock")
      .send({ items: [{ productId: "prod-1", quantity: 10 }] });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already set/i);
    expect(res.body.duplicateProductIds).toContain("prod-1");
  });

  it("processes new product and returns 200 with processedCount=1", async () => {
    // BEGIN
    mockQuery.mockResolvedValueOnce({});
    // dupCheck — count=0
    mockQuery.mockResolvedValueOnce({ rows: [{ cnt: 0 }] });
    // stock_balances SELECT FOR UPDATE
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // INSERT ledger
    mockQuery.mockResolvedValueOnce({});
    // UPSERT stock_balances
    mockQuery.mockResolvedValueOnce({});
    // UPDATE store_products
    mockQuery.mockResolvedValueOnce({});
    // COMMIT
    mockQuery.mockResolvedValueOnce({});

    const app = buildApp();
    const res = await request(app)
      .post("/pos/inventory/opening-stock")
      .send({ items: [{ productId: "prod-2", quantity: 5 }] });

    expect(res.status).toBe(200);
    expect(res.body.processedCount).toBe(1);
    expect(res.body.skippedDuplicates).toEqual([]);
  });

  it("mixed batch: processes new, skips duplicate, returns 200", async () => {
    // BEGIN
    mockQuery.mockResolvedValueOnce({});
    // item-1 dupCheck — already exists
    mockQuery.mockResolvedValueOnce({ rows: [{ cnt: 1 }] });
    // item-2 dupCheck — new
    mockQuery.mockResolvedValueOnce({ rows: [{ cnt: 0 }] });
    // stock_balances SELECT FOR UPDATE
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // INSERT ledger
    mockQuery.mockResolvedValueOnce({});
    // UPSERT stock_balances
    mockQuery.mockResolvedValueOnce({});
    // UPDATE store_products
    mockQuery.mockResolvedValueOnce({});
    // COMMIT
    mockQuery.mockResolvedValueOnce({});

    const app = buildApp();
    const res = await request(app)
      .post("/pos/inventory/opening-stock")
      .send({
        items: [
          { productId: "prod-dup", quantity: 10 },
          { productId: "prod-new", quantity: 7 },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.processedCount).toBe(1);
    expect(res.body.skippedDuplicates).toEqual(["prod-dup"]);
  });

  it("dupCheck query uses correct store_id and product_id params", async () => {
    // BEGIN
    mockQuery.mockResolvedValueOnce({});
    // dupCheck — duplicate
    mockQuery.mockResolvedValueOnce({ rows: [{ cnt: 1 }] });
    // COMMIT
    mockQuery.mockResolvedValueOnce({});

    const app = buildApp();
    await request(app)
      .post("/pos/inventory/opening-stock")
      .send({ items: [{ productId: "prod-x", quantity: 3 }] });

    // Second call (index 1) should be the dupCheck
    const dupCall = mockQuery.mock.calls[1];
    expect(dupCall[0]).toContain("opening_stock");
    expect(dupCall[1]).toEqual(["store-1", "prod-x"]);
  });
});
