/**
 * GCP-STG-0735: Daily P&L summary — behavioral supertest tests
 *
 * Mounts posReportsRouter, mocks getPool + deviceToken, verifies HTTP responses.
 */

process.env.JWT_SECRET = "test-secret-for-pl";
process.env.NODE_ENV = "test";

const mockQuery = jest.fn();
jest.mock("../src/db/client", () => ({
  getPool: () => ({ query: mockQuery }),
}));

jest.mock("../src/middleware/deviceToken", () => ({
  requireDeviceToken: (req: any, _res: any, next: any) => {
    req.posDevice = { storeId: "store-PL", deviceId: "dev-001" };
    next();
  },
  PosDeviceContext: {},
}));

jest.mock("../src/lib/logger", () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock("../src/lib/errorUtils", () => ({
  asError: (e: unknown) => (e instanceof Error ? e : new Error(String(e))),
}));

import express from "express";
import request from "supertest";
import { posReportsRouter } from "../src/routes/v1/pos/reports";

const app = express();
app.use(express.json());
app.use("/pos", posReportsRouter);

beforeEach(() => mockQuery.mockReset());

describe("GCP-STG-0735: GET /pos/reports/daily-pl", () => {
  it("returns 200 with correct P&L breakdown", async () => {
    // Query 1: Revenue
    mockQuery.mockResolvedValueOnce({
      rows: [{
        total_revenue_minor: "1500000",
        transaction_count: "45",
        cash_minor: "800000",
        upi_minor: "500000",
        udhar_minor: "200000",
      }],
    });
    // Query 2: COGS
    mockQuery.mockResolvedValueOnce({
      rows: [{ cogs_minor: "1200000" }],
    });
    // Query 3: Previous day revenue
    mockQuery.mockResolvedValueOnce({
      rows: [{ prev_revenue_minor: "1400000" }],
    });
    // Query 4: Previous day COGS
    mockQuery.mockResolvedValueOnce({
      rows: [{ prev_cogs_minor: "1100000" }],
    });

    const res = await request(app).get("/pos/reports/daily-pl?date=2026-03-25");

    expect(res.status).toBe(200);
    expect(res.body.totalRevenue).toBe(1500000);
    expect(res.body.costOfGoods).toBe(1200000);
    expect(res.body.grossProfit).toBe(300000);
    expect(res.body.grossMarginPct).toBe(20);
    expect(res.body.transactionCount).toBe(45);
    expect(res.body.averageBasket).toBe(33333); // 1500000/45
    expect(res.body.paymentBreakdown.cash).toBe(800000);
    expect(res.body.paymentBreakdown.upi).toBe(500000);
    expect(res.body.paymentBreakdown.udhar).toBe(200000);
    expect(res.body.previousDay.trend).toBe("flat"); // 300k today vs 300k prev (1400k-1100k)

    // Verify store isolation
    for (const call of mockQuery.mock.calls) {
      expect(call[1]).toContain("store-PL");
    }
  });

  it("returns trend 'up' when profit increased", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ total_revenue_minor: "2000000", transaction_count: "50", cash_minor: "1000000", upi_minor: "800000", udhar_minor: "200000" }],
    });
    mockQuery.mockResolvedValueOnce({ rows: [{ cogs_minor: "1000000" }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ prev_revenue_minor: "1000000" }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ prev_cogs_minor: "600000" }] });

    const res = await request(app).get("/pos/reports/daily-pl?date=2026-03-25");

    expect(res.status).toBe(200);
    expect(res.body.grossProfit).toBe(1000000); // 2M - 1M
    expect(res.body.previousDay.grossProfit).toBe(400000); // 1M - 600K
    expect(res.body.previousDay.trend).toBe("up");
  });

  it("returns trend 'down' when profit decreased", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ total_revenue_minor: "500000", transaction_count: "10", cash_minor: "300000", upi_minor: "200000", udhar_minor: "0" }],
    });
    mockQuery.mockResolvedValueOnce({ rows: [{ cogs_minor: "400000" }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ prev_revenue_minor: "1000000" }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ prev_cogs_minor: "500000" }] });

    const res = await request(app).get("/pos/reports/daily-pl?date=2026-03-25");

    expect(res.status).toBe(200);
    expect(res.body.grossProfit).toBe(100000); // 500K - 400K
    expect(res.body.previousDay.trend).toBe("down");
  });

  it("defaults to today when no date param", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ total_revenue_minor: "0", transaction_count: "0", cash_minor: "0", upi_minor: "0", udhar_minor: "0" }],
    });
    mockQuery.mockResolvedValueOnce({ rows: [{ cogs_minor: "0" }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ prev_revenue_minor: "0" }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ prev_cogs_minor: "0" }] });

    const res = await request(app).get("/pos/reports/daily-pl");

    expect(res.status).toBe(200);
    expect(res.body.totalRevenue).toBe(0);
    expect(res.body.grossMarginPct).toBe(0);
    expect(res.body.averageBasket).toBe(0);
  });

  it("returns 500 on unexpected DB error", async () => {
    mockQuery.mockRejectedValueOnce(new Error("connection lost"));

    const res = await request(app).get("/pos/reports/daily-pl?date=2026-03-25");

    expect(res.status).toBe(500);
    expect(res.body.error).toContain("Failed");
  });

  it("gracefully handles missing purchase_price_minor column", async () => {
    const pgError = new Error("column missing") as any;
    pgError.code = "42703";
    mockQuery.mockRejectedValueOnce(pgError);

    const res = await request(app).get("/pos/reports/daily-pl?date=2026-03-25");

    expect(res.status).toBe(200);
    expect(res.body.totalRevenue).toBe(0);
    expect(res.body.previousDay.trend).toBe("flat");
  });
});
