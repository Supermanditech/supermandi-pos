/**
 * GCP-STG-0664: Goods return endpoint — behavioral supertest tests
 *
 * Mounts ordersRouter, mocks getPool + middleware, verifies HTTP responses.
 */

const mockQuery = jest.fn();
jest.mock("../src/db/client", () => ({
  getPool: () => ({ query: mockQuery, connect: jest.fn() }),
}));
jest.mock("../src/lib/logger", () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("../src/lib/errorUtils", () => ({
  asError: (e: any) => (e instanceof Error ? e : new Error(String(e))),
}));
jest.mock("../src/middleware/deviceToken", () => ({
  requireDeviceToken: (req: any, _res: any, next: any) => {
    req.posDevice = { storeId: "store-1", deviceId: "dev-1" };
    next();
  },
}));
jest.mock("../src/services/supplierPayoutService", () => ({
  isPayoutsEnabled: jest.fn().mockResolvedValue(false),
}));
jest.mock("../src/services/grnAlertNotificationService", () => ({
  notifyGrnExcessAlert: jest.fn(),
  notifyGrnMismatch: jest.fn(),
  notifyOrderStatusChange: jest.fn(),
}));
jest.mock("../src/services/spendingLimitService", () => ({
  checkSpendingLimits: jest.fn().mockResolvedValue({ allowed: true }),
}));
jest.mock("../src/services/lifecycleEventService", () => ({
  publishLifecycleEvent: jest.fn(),
}));

import express from "express";
import request from "supertest";
import { ordersRouter } from "../src/routes/v1/orders";

const app = express();
app.use(express.json());
app.use("/orders", ordersRouter);

beforeEach(() => mockQuery.mockReset());

describe("GCP-STG-0664: Goods return endpoint", () => {
  it("POST /orders/stores/:storeId/orders/:orderId/return returns 201 for DELIVERED order", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: "order-1", status: "delivered" }] }) // SELECT order
      .mockResolvedValueOnce({ rows: [{ id: "ret-1", status: "PENDING", created_at: new Date() }] }); // INSERT return

    const res = await request(app)
      .post("/orders/stores/store-1/orders/order-1/return")
      .send({ items: [{ productId: "p1", qty: 2, reasonCode: "DAMAGED" }], reason: "Broken packaging" });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("PENDING");
    expect(res.body.message).toBe("Return request submitted");
  });

  it("rejects return on non-DELIVERED order with NOT_RETURNABLE", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: "order-1", status: "submitted" }] });

    const res = await request(app)
      .post("/orders/stores/store-1/orders/order-1/return")
      .send({ items: [{ productId: "p1", qty: 1, reasonCode: "DAMAGED" }] });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("NOT_RETURNABLE");
  });

  it("returns 404 when order not found", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/orders/stores/store-1/orders/order-999/return")
      .send({ items: [{ productId: "p1", qty: 1, reasonCode: "DAMAGED" }] });

    expect(res.status).toBe(404);
  });

  it("returns 400 when items array is empty", async () => {
    const res = await request(app)
      .post("/orders/stores/store-1/orders/order-1/return")
      .send({ items: [] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("items required");
  });
});
