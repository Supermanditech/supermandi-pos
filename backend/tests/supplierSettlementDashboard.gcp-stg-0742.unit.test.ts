/**
 * GCP-STG-0742: Supplier settlement dashboard — behavioral supertest tests
 *
 * Mounts supplierSettlementsRouter, mocks getPool + requireSupplierAuth,
 * verifies settlement dashboard endpoint returns receivables + aging buckets.
 */

const mockQuery = jest.fn();
jest.mock("../src/db/client", () => ({
  getPool: () => ({ query: mockQuery }),
}));
jest.mock("../src/lib/logger", () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("../src/routes/v1/supplier/auth", () => ({
  requireSupplierAuth: (req: any, _res: any, next: any) => {
    req.supplierId = "supplier-1";
    next();
  },
  SupplierAuthRequest: {},
}));
jest.mock("../src/services/settlementService", () => ({
  getSupplierSettlements: jest.fn(),
}));

import express from "express";
import request from "supertest";
import { supplierSettlementsRouter } from "../src/routes/v1/supplier/settlements";

const app = express();
app.use(express.json());
app.use("/", supplierSettlementsRouter);

beforeEach(() => {
  mockQuery.mockReset();
});

describe("GET /dashboard (GCP-STG-0742)", () => {
  it("returns settlement summary with aging buckets", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{
          total_receivable: "150000",
          paid_this_month: "50000",
          overdue_amount: "20000",
          current_bucket: "80000",
          bucket_30d: "30000",
          bucket_60d: "25000",
          bucket_90plus: "15000",
        }],
      })
      .mockResolvedValueOnce({
        rows: [
          { id: "s1", amount_minor: "25000", paid_at: "2026-03-20", reference_number: "REF001", store_id: "store-1" },
        ],
      });

    const res = await request(app).get("/dashboard");

    expect(res.status).toBe(200);
    expect(res.body.data.totalReceivable).toBe(150000);
    expect(res.body.data.paidThisMonth).toBe(50000);
    expect(res.body.data.overdueAmount).toBe(20000);
    expect(res.body.data.agingBuckets.current).toBe(80000);
    expect(res.body.data.agingBuckets.days30).toBe(30000);
    expect(res.body.data.agingBuckets.days60).toBe(25000);
    expect(res.body.data.agingBuckets.days90Plus).toBe(15000);
    expect(res.body.data.recentPayments).toHaveLength(1);
    expect(res.body.data.recentPayments[0].amountMinor).toBe(25000);
  });

  it("returns zeros when no settlements exist", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{
          total_receivable: "0", paid_this_month: "0", overdue_amount: "0",
          current_bucket: "0", bucket_30d: "0", bucket_60d: "0", bucket_90plus: "0",
        }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get("/dashboard");

    expect(res.status).toBe(200);
    expect(res.body.data.totalReceivable).toBe(0);
    expect(res.body.data.recentPayments).toEqual([]);
  });

  it("returns graceful fallback when table missing (42P01)", async () => {
    const tableError: any = new Error("relation does not exist");
    tableError.code = "42P01";
    mockQuery.mockRejectedValueOnce(tableError);

    const res = await request(app).get("/dashboard");

    expect(res.status).toBe(200);
    expect(res.body.data.totalReceivable).toBe(0);
    expect(res.body.data.agingBuckets.current).toBe(0);
    expect(res.body.data.recentPayments).toEqual([]);
  });
});
