/**
 * GCP-STG-0739: Retailer dashboard analytics — behavioral supertest tests
 *
 * Mounts retailerAnalyticsRouter, mocks getPool, verifies HTTP responses
 * for sales-trend, top-products, and payment-methods endpoints.
 */

const mockQuery = jest.fn();
jest.mock("../src/db/client", () => ({
  getPool: () => ({ query: mockQuery }),
}));
jest.mock("../src/lib/logger", () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import express from "express";
import request from "supertest";
import { retailerAnalyticsRouter } from "../src/routes/v1/retailer-admin/analytics";

const app = express();
app.use(express.json());
// Simulate gateway headers (x-actor-id = storeId)
app.use((req, _res, next) => {
  req.headers['x-actor-id'] = 'store-1';
  next();
});
app.use("/retailer-admin", retailerAnalyticsRouter);

beforeEach(() => {
  mockQuery.mockReset();
});

describe("GET /retailer-admin/analytics/sales-trend (GCP-STG-0739)", () => {
  it("returns daily revenue trend", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { date: "2026-03-24", revenue_minor: "150000", transactions: 12 },
        { date: "2026-03-25", revenue_minor: "200000", transactions: 18 },
      ],
    });

    const res = await request(app).get("/retailer-admin/analytics/sales-trend?days=7");

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].revenueMinor).toBe(150000);
    expect(res.body.data[0].transactions).toBe(12);
    expect(res.body.days).toBe(7);
  });

  it("defaults to 30 days", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get("/retailer-admin/analytics/sales-trend");

    expect(res.status).toBe(200);
    expect(res.body.days).toBe(30);
  });

  it("returns 500 on DB error", async () => {
    mockQuery.mockRejectedValueOnce(new Error("DB fail"));

    const res = await request(app).get("/retailer-admin/analytics/sales-trend");

    expect(res.status).toBe(500);
  });
});

describe("GET /retailer-admin/analytics/top-products (GCP-STG-0739)", () => {
  it("returns top products by revenue", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { name: "Sugar 1kg", revenue_minor: "50000", qty_sold: "25" },
        { name: "Tea 250g", revenue_minor: "30000", qty_sold: "40" },
      ],
    });

    const res = await request(app).get("/retailer-admin/analytics/top-products?limit=5&days=30");

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].name).toBe("Sugar 1kg");
    expect(res.body.data[0].revenueMinor).toBe(50000);
  });
});

describe("GET /retailer-admin/analytics/payment-methods (GCP-STG-0739)", () => {
  it("returns payment method breakdown with percentages", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { method: "CASH", total_minor: "60000", count: 30 },
        { method: "UPI", total_minor: "30000", count: 20 },
        { method: "DUE", total_minor: "10000", count: 5 },
      ],
    });

    const res = await request(app).get("/retailer-admin/analytics/payment-methods?days=30");

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.data[0].method).toBe("CASH");
    expect(res.body.data[0].percentage).toBe(60);
    expect(res.body.data[1].percentage).toBe(30);
    expect(res.body.data[2].percentage).toBe(10);
    expect(res.body.totalMinor).toBe(100000);
  });

  it("returns 401 when store not identified", async () => {
    // Create app without x-actor-id header
    const noAuthApp = express();
    noAuthApp.use(express.json());
    noAuthApp.use("/retailer-admin", retailerAnalyticsRouter);

    const res = await request(noAuthApp).get("/retailer-admin/analytics/payment-methods");

    expect(res.status).toBe(401);
  });
});
