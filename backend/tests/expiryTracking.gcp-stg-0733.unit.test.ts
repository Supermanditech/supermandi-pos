/**
 * GCP-STG-0733: Batch-level expiry tracking — behavioral supertest tests
 *
 * Mounts posInventoryRouter, mocks getPool + deviceToken, verifies HTTP responses.
 */

process.env.JWT_SECRET = "test-secret-for-expiry";
process.env.NODE_ENV = "test";

const mockQuery = jest.fn();
jest.mock("../src/db/client", () => ({
  getPool: () => ({ query: mockQuery, connect: jest.fn().mockResolvedValue({ query: mockQuery, release: jest.fn() }) }),
}));

jest.mock("../src/middleware/deviceToken", () => ({
  requireDeviceToken: (req: any, _res: any, next: any) => {
    req.posDevice = { storeId: "store-EXP", deviceId: "dev-001" };
    next();
  },
  PosDeviceContext: {},
}));

jest.mock("../src/middleware/storeStatusGate", () => ({
  requireActiveStore: (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../src/lib/logger", () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock("../src/lib/errorUtils", () => ({
  asError: (e: unknown) => (e instanceof Error ? e : new Error(String(e))),
}));

import express from "express";
import request from "supertest";
import { posInventoryRouter } from "../src/routes/v1/pos/inventory";

const app = express();
app.use(express.json());
app.use("/pos", posInventoryRouter);

beforeEach(() => mockQuery.mockReset());

describe("GCP-STG-0733: GET /pos/inventory/expiring-batches", () => {
  it("returns expiring batches within 7 days (default)", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          productId: "prod-1",
          productName: "Milk 1L",
          batchId: "batch-1",
          qty: "10.000",
          expiryDate: "2026-04-01",
          daysRemaining: "5",
        },
        {
          productId: "prod-2",
          productName: "Bread",
          batchId: "batch-2",
          qty: "3.000",
          expiryDate: "2026-03-30",
          daysRemaining: "3",
        },
      ],
    });

    const res = await request(app).get("/pos/inventory/expiring-batches");

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.expiring).toHaveLength(2);
    expect(res.body.expiring[0].productName).toBe("Milk 1L");
    expect(res.body.expiring[0].qty).toBe(10);
    expect(res.body.expiring[0].daysRemaining).toBe(5);
    expect(res.body.expiring[1].productName).toBe("Bread");

    // Verify store isolation
    const queryCall = mockQuery.mock.calls[0];
    expect(queryCall[1]).toContain("store-EXP");
  });

  it("respects custom days parameter", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get("/pos/inventory/expiring-batches?days=14");

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
    expect(res.body.expiring).toEqual([]);

    // Verify days parameter passed to query
    const queryCall = mockQuery.mock.calls[0];
    expect(queryCall[1][1]).toBe(14);
  });

  it("returns empty array when stock_batches table does not exist", async () => {
    const pgError = new Error("relation does not exist") as any;
    pgError.code = "42P01";
    mockQuery.mockRejectedValueOnce(pgError);

    const res = await request(app).get("/pos/inventory/expiring-batches");

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
    expect(res.body.expiring).toEqual([]);
  });

  it("returns 500 on unexpected DB error", async () => {
    mockQuery.mockRejectedValueOnce(new Error("connection lost"));

    const res = await request(app).get("/pos/inventory/expiring-batches");

    expect(res.status).toBe(500);
    expect(res.body.error).toContain("Failed");
  });

  it("clamps days to 365 maximum", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await request(app).get("/pos/inventory/expiring-batches?days=9999");

    const queryCall = mockQuery.mock.calls[0];
    expect(queryCall[1][1]).toBe(365);
  });
});
