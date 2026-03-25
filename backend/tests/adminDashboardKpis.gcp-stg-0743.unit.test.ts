/**
 * GCP-STG-0743: SuperAdmin revenue dashboard KPIs — behavioral supertest tests
 *
 * Mounts adminAnalyticsRouter, mocks getPool + requireAdminToken,
 * verifies dashboard/kpis endpoint returns correct GMV and counts.
 */

const mockQuery = jest.fn();
jest.mock("../src/db/client", () => ({
  getPool: () => ({ query: mockQuery }),
}));
jest.mock("../src/lib/logger", () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("../src/middleware/adminToken", () => ({
  requireAdminToken: (_req: any, _res: any, next: any) => next(),
}));
jest.mock("../src/middleware/rateLimit", () => ({
  redisRateLimit: () => (_req: any, _res: any, next: any) => next(),
}));
jest.mock("../src/middleware/apiCache", () => ({
  apiCache: () => (_req: any, _res: any, next: any) => next(),
}));
jest.mock("../src/services/analytics/analyticsService", () => ({
  fetchConsumerSalesAnalytics: jest.fn(),
  fetchDuesAnalytics: jest.fn(),
  fetchPaymentsAnalytics: jest.fn(),
  fetchDevicesAnalytics: jest.fn(),
  fetchOverview: jest.fn(),
  fetchProductsAnalytics: jest.fn(),
  fetchPurchasesAnalytics: jest.fn(),
  fetchActivityAnalytics: jest.fn(),
}));
jest.mock("../src/services/ai/slowMoverService", () => ({
  detectSlowMovers: jest.fn(),
}));

import express from "express";
import request from "supertest";
import { adminAnalyticsRouter } from "../src/routes/v1/admin/analytics";

const app = express();
app.use(express.json());
app.use("/admin", adminAnalyticsRouter);

beforeEach(() => {
  mockQuery.mockReset();
});

describe("GET /admin/dashboard/kpis (GCP-STG-0743)", () => {
  it("returns revenue dashboard KPIs", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ today_gmv: "120000", month_gmv: "5000000" }] })  // GMV
      .mockResolvedValueOnce({ rows: [{ commission: "150000" }] })  // Commission
      .mockResolvedValueOnce({ rows: [{ active_stores: "12", total_stores: "15" }] })  // Stores
      .mockResolvedValueOnce({ rows: [{ active_suppliers: "8", total_suppliers: "10" }] });  // Suppliers

    const res = await request(app).get("/admin/dashboard/kpis");

    expect(res.status).toBe(200);
    expect(res.body.data.todayGmv).toBe(120000);
    expect(res.body.data.monthGmv).toBe(5000000);
    expect(res.body.data.commissionEarned).toBe(150000);
    expect(res.body.data.activeStores).toBe(12);
    expect(res.body.data.totalStores).toBe(15);
    expect(res.body.data.activeSuppliers).toBe(8);
    expect(res.body.data.totalSuppliers).toBe(10);
  });

  it("returns zeros when no data", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ today_gmv: "0", month_gmv: "0" }] })
      .mockResolvedValueOnce({ rows: [{ commission: "0" }] })
      .mockResolvedValueOnce({ rows: [{ active_stores: "0", total_stores: "0" }] })
      .mockResolvedValueOnce({ rows: [{ active_suppliers: "0", total_suppliers: "0" }] });

    const res = await request(app).get("/admin/dashboard/kpis");

    expect(res.status).toBe(200);
    expect(res.body.data.todayGmv).toBe(0);
  });

  it("returns 500 on DB error", async () => {
    mockQuery.mockRejectedValueOnce(new Error("DB fail"));

    const res = await request(app).get("/admin/dashboard/kpis");

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("ANALYTICS_FAILED");
  });
});
