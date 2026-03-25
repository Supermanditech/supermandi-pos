/**
 * GCP-STG-0741: Supplier fulfillment dashboard — behavioral supertest tests
 *
 * Mounts supplierDashboardRouter, mocks getPool + requireSupplierAuth,
 * verifies fulfillment KPI endpoint returns correct structure.
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

// Mock requireSupplierAuth to inject supplierId
jest.mock("../src/routes/v1/supplier/auth", () => ({
  requireSupplierAuth: (req: any, _res: any, next: any) => {
    req.supplierId = "supplier-1";
    next();
  },
  SupplierAuthRequest: {},
}));

import { supplierDashboardRouter } from "../src/routes/v1/supplier/dashboard";

const app = express();
app.use(express.json());
app.use("/", supplierDashboardRouter);

beforeEach(() => {
  mockQuery.mockReset();
});

describe("GET /dashboard/fulfillment (GCP-STG-0741)", () => {
  it("returns fulfillment KPIs", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        pending_orders: "5",
        today_dispatch: "2",
        overdue_orders: "1",
        completed_this_week: "8",
        avg_fulfillment_days: "2.3",
      }],
    });

    const res = await request(app).get("/dashboard/fulfillment");

    expect(res.status).toBe(200);
    expect(res.body.data.pendingOrders).toBe(5);
    expect(res.body.data.todayDispatch).toBe(2);
    expect(res.body.data.overdueOrders).toBe(1);
    expect(res.body.data.completedThisWeek).toBe(8);
    expect(res.body.data.avgFulfillmentDays).toBe(2.3);
  });

  it("returns zeros when no data", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        pending_orders: "0",
        today_dispatch: "0",
        overdue_orders: "0",
        completed_this_week: "0",
        avg_fulfillment_days: "0",
      }],
    });

    const res = await request(app).get("/dashboard/fulfillment");

    expect(res.status).toBe(200);
    expect(res.body.data.pendingOrders).toBe(0);
    expect(res.body.data.avgFulfillmentDays).toBe(0);
  });

  it("returns 503 when database unavailable", async () => {
    // Override getPool to return null
    jest.resetModules();
    const appNoDb = express();
    appNoDb.use(express.json());

    jest.doMock("../src/db/client", () => ({ getPool: () => null }));
    jest.doMock("../src/routes/v1/supplier/auth", () => ({
      requireSupplierAuth: (req: any, _res: any, next: any) => {
        req.supplierId = "supplier-1";
        next();
      },
    }));

    const { supplierDashboardRouter: router2 } = require("../src/routes/v1/supplier/dashboard");
    appNoDb.use("/", router2);

    const res = await request(appNoDb).get("/dashboard/fulfillment");
    expect(res.status).toBe(503);
  });
});
