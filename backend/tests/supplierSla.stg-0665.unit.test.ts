/**
 * GCP-STG-0665: Supplier SLA monitoring — behavioral supertest tests
 *
 * Mounts supplierSlaRouter, mocks getPool, verifies HTTP responses.
 */

const mockQuery = jest.fn();
jest.mock("../src/db/client", () => ({
  getPool: () => ({ query: mockQuery }),
}));

import express from "express";
import request from "supertest";
import { supplierSlaRouter } from "../src/routes/v1/admin/supplierSla";

const app = express();
app.use(express.json());
app.use("/admin", supplierSlaRouter);

beforeEach(() => mockQuery.mockReset());

describe("GCP-STG-0665: GET /admin/suppliers/:supplierId/sla", () => {
  it("returns 200 with GOOD slaStatus when on-time rate >= 90%", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        total_orders: "100",
        on_time: "95",
        late: "5",
        avg_delivery_days: "2.3",
      }],
    });

    const res = await request(app).get("/admin/suppliers/sup-1/sla");

    expect(res.status).toBe(200);
    expect(res.body.slaStatus).toBe("GOOD");
    expect(res.body.totalOrders).toBe(100);
    expect(res.body.onTimeDeliveries).toBe(95);
    expect(res.body.lateDeliveries).toBe(5);
    expect(res.body.onTimeRate).toBe(95);
    expect(res.body.avgDeliveryDays).toBe(2.3);
    expect(res.body.supplierId).toBe("sup-1");
  });

  it("returns WARNING when on-time rate is 70-89%", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        total_orders: "20",
        on_time: "15",
        late: "5",
        avg_delivery_days: "3.1",
      }],
    });

    const res = await request(app).get("/admin/suppliers/sup-2/sla");

    expect(res.status).toBe(200);
    expect(res.body.slaStatus).toBe("WARNING");
    expect(res.body.onTimeRate).toBe(75);
  });

  it("returns POOR when on-time rate < 70%", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        total_orders: "10",
        on_time: "5",
        late: "5",
        avg_delivery_days: "5.0",
      }],
    });

    const res = await request(app).get("/admin/suppliers/sup-3/sla");

    expect(res.status).toBe(200);
    expect(res.body.slaStatus).toBe("POOR");
    expect(res.body.onTimeRate).toBe(50);
  });

  it("handles zero orders gracefully", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        total_orders: "0",
        on_time: "0",
        late: "0",
        avg_delivery_days: null,
      }],
    });

    const res = await request(app).get("/admin/suppliers/sup-4/sla");

    expect(res.status).toBe(200);
    expect(res.body.totalOrders).toBe(0);
    expect(res.body.onTimeRate).toBe(0);
    expect(res.body.slaStatus).toBe("POOR");
  });

  it("returns 500 on DB error", async () => {
    mockQuery.mockRejectedValueOnce(new Error("connection refused"));

    const res = await request(app).get("/admin/suppliers/sup-5/sla");

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to fetch SLA data");
  });
});
