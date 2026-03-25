/**
 * GCP-STG-0744: Real-time order tracking — behavioral supertest tests
 *
 * Tests both supplier status update (PATCH) and POS tracking (GET) endpoints.
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
jest.mock("../src/middleware/deviceToken", () => ({
  requireDeviceToken: (req: any, _res: any, next: any) => {
    req.posDevice = { storeId: "store-1", deviceId: "dev-1" };
    next();
  },
  PosDeviceContext: {},
}));

import express from "express";
import request from "supertest";
import { supplierOrderTrackingRouter } from "../src/routes/v1/supplier/orderTracking";
import { posOrderTrackingRouter } from "../src/routes/v1/pos/orderTracking";

// Supplier app
const supplierApp = express();
supplierApp.use(express.json());
supplierApp.use("/", supplierOrderTrackingRouter);

// POS app
const posApp = express();
posApp.use(express.json());
posApp.use("/", posOrderTrackingRouter);

beforeEach(() => {
  mockQuery.mockReset();
});

describe("PATCH /orders/:orderId/status (GCP-STG-0744 supplier)", () => {
  it("updates order status and records history", async () => {
    // Verify order belongs to supplier
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "order-1", current_status: "pending" }],
    });
    // Update status
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // Insert history
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(supplierApp)
      .patch("/orders/order-1/status")
      .send({ status: "shipped", notes: "Dispatched via courier" });

    expect(res.status).toBe(200);
    expect(res.body.data.orderId).toBe("order-1");
    expect(res.body.data.previousStatus).toBe("pending");
    expect(res.body.data.newStatus).toBe("shipped");
  });

  it("rejects invalid status", async () => {
    const res = await request(supplierApp)
      .patch("/orders/order-1/status")
      .send({ status: "invalid_status" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_STATUS");
  });

  it("returns 404 for unknown order", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(supplierApp)
      .patch("/orders/order-999/status")
      .send({ status: "confirmed" });

    expect(res.status).toBe(404);
  });
});

describe("GET /orders/:orderId/tracking (GCP-STG-0744 POS)", () => {
  it("returns order status and history", async () => {
    // Get order
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "order-1", store_id: "store-1", status: "shipped", created_at: "2026-03-20", updated_at: "2026-03-21" }],
    });
    // Get history
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: "h1", previousStatus: "pending", newStatus: "confirmed", changedByRole: "supplier", notes: null, createdAt: "2026-03-20T10:00:00Z" },
        { id: "h2", previousStatus: "confirmed", newStatus: "shipped", changedByRole: "supplier", notes: "Dispatched", createdAt: "2026-03-21T09:00:00Z" },
      ],
    });

    const res = await request(posApp).get("/orders/order-1/tracking");

    expect(res.status).toBe(200);
    expect(res.body.data.currentStatus).toBe("shipped");
    expect(res.body.data.history).toHaveLength(2);
  });

  it("returns 404 for order not in store", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(posApp).get("/orders/order-999/tracking");

    expect(res.status).toBe(404);
  });
});
