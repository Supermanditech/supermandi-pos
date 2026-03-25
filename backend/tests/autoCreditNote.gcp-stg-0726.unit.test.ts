/**
 * GCP-STG-0726: Auto-trigger credit note on GRN rejection (goods return confirmation)
 *
 * Behavioral test: mounts the ordersRouter on an express app,
 * mocks pool + generateCreditNote, verifies that confirming a
 * PENDING goods return transitions to CONFIRMED and auto-generates
 * a credit note.
 */

const mockQuery = jest.fn();
const mockGenerateCreditNote = jest.fn();

jest.mock("../src/db/client", () => ({
  getPool: () => ({
    query: mockQuery,
  }),
}));

jest.mock("../src/services/creditNoteService", () => ({
  generateCreditNote: (...args: any[]) => mockGenerateCreditNote(...args),
}));

jest.mock("../src/middleware/deviceToken", () => ({
  requireDeviceToken: (req: any, _res: any, next: any) => {
    req.posDevice = { storeId: "store-1", deviceId: "dev-1" };
    next();
  },
  PosDeviceContext: {},
}));

jest.mock("../src/services/supplierPayoutService", () => ({
  isPayoutsEnabled: () => false,
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

jest.mock("../src/lib/logger", () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("../src/lib/errorUtils", () => ({
  asError: (e: any) => e instanceof Error ? e : new Error(String(e)),
}));

import express from "express";
import request from "supertest";
import { ordersRouter } from "../src/routes/v1/orders";

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/orders", ordersRouter);
  return app;
}

describe("GCP-STG-0726: Auto credit note on goods return confirmation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGenerateCreditNote.mockResolvedValue({ id: "cn-1" });
  });

  it("confirms a PENDING goods return and generates a credit note", async () => {
    const returnItems = [
      { productId: "p-1", productName: "Tomatoes", qty: 5, amountMinor: 5000, gstMinor: 250, reasonCode: "DAMAGED" },
    ];

    mockQuery
      // Fetch goods return
      .mockResolvedValueOnce({
        rows: [{
          id: "ret-1",
          order_id: "ord-1",
          store_id: "store-1",
          items: JSON.stringify(returnItems),
          reason: "Damaged goods",
          status: "PENDING",
        }],
      })
      // Update status
      .mockResolvedValueOnce({ rowCount: 1 })
      // Fetch order for supplier
      .mockResolvedValueOnce({
        rows: [{ id: "ord-1", supplier_id: "sup-1" }],
      });

    const app = createApp();
    const res = await request(app)
      .post("/api/v1/orders/stores/store-1/returns/ret-1/confirm")
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("CONFIRMED");

    // Verify credit note was generated
    expect(mockGenerateCreditNote).toHaveBeenCalledTimes(1);
    const cnArgs = mockGenerateCreditNote.mock.calls[0][0];
    expect(cnArgs.type).toBe("CREDIT_NOTE");
    expect(cnArgs.storeId).toBe("store-1");
    expect(cnArgs.supplierId).toBe("sup-1");
    expect(cnArgs.items).toHaveLength(1);
    expect(cnArgs.items[0].productId).toBe("p-1");
    expect(cnArgs.items[0].qty).toBe(5);
    expect(cnArgs.reason).toBe("Auto-generated from goods return");
  });

  it("returns 404 when goods return not found", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const app = createApp();
    const res = await request(app)
      .post("/api/v1/orders/stores/store-1/returns/ret-999/confirm")
      .send({});

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
    expect(mockGenerateCreditNote).not.toHaveBeenCalled();
  });

  it("returns 400 when return is not PENDING", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: "ret-1",
        order_id: "ord-1",
        store_id: "store-1",
        items: "[]",
        status: "CONFIRMED",
      }],
    });

    const app = createApp();
    const res = await request(app)
      .post("/api/v1/orders/stores/store-1/returns/ret-1/confirm")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Cannot confirm/);
    expect(mockGenerateCreditNote).not.toHaveBeenCalled();
  });

  it("succeeds even if credit note generation fails (non-blocking)", async () => {
    const returnItems = [
      { productId: "p-1", qty: 2, amountMinor: 2000, gstMinor: 100 },
    ];

    mockQuery
      .mockResolvedValueOnce({
        rows: [{
          id: "ret-1",
          order_id: "ord-1",
          store_id: "store-1",
          items: returnItems,
          status: "PENDING",
        }],
      })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: "ord-1", supplier_id: "sup-1" }] });

    // Credit note fails
    mockGenerateCreditNote.mockRejectedValueOnce(new Error("DB error"));

    const app = createApp();
    const res = await request(app)
      .post("/api/v1/orders/stores/store-1/returns/ret-1/confirm")
      .send({});

    // Return confirmation still succeeds
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("CONFIRMED");
    expect(mockGenerateCreditNote).toHaveBeenCalledTimes(1);
  });

  it("enforces store isolation (different store cannot confirm)", async () => {
    // Query returns no rows because store_id doesn't match
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const app = createApp();
    const res = await request(app)
      .post("/api/v1/orders/stores/other-store/returns/ret-1/confirm")
      .send({});

    expect(res.status).toBe(404);
    expect(mockGenerateCreditNote).not.toHaveBeenCalled();
  });
});
