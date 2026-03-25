/**
 * GCP-STG-0732: Customer Udhar (Credit) Ledger — behavioral supertest tests
 *
 * Mounts posCustomersRouter, mocks getPool + deviceToken, verifies HTTP responses.
 */

process.env.JWT_SECRET = "test-secret-for-ledger";
process.env.NODE_ENV = "test";

const mockQuery = jest.fn();
jest.mock("../src/db/client", () => ({
  getPool: () => ({ query: mockQuery }),
}));

// Mock deviceToken middleware — injects posDevice context
jest.mock("../src/middleware/deviceToken", () => ({
  requireDeviceToken: (req: any, _res: any, next: any) => {
    req.posDevice = { storeId: "store-AAA", deviceId: "dev-001" };
    next();
  },
  PosDeviceContext: {},
}));

// Mock storeStatusGate middleware
jest.mock("../src/middleware/storeStatusGate", () => ({
  requireActiveStore: (_req: any, _res: any, next: any) => next(),
}));

import express from "express";
import request from "supertest";
import { posCustomersRouter } from "../src/routes/v1/pos/customers";

const app = express();
app.use(express.json());
app.use("/pos", posCustomersRouter);

beforeEach(() => mockQuery.mockReset());

describe("GCP-STG-0732: GET /pos/customers/:customerId/balance", () => {
  it("returns 200 with correct outstanding balance", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        outstanding_minor: "5000",
        last_payment_date: "2026-03-20T10:00:00Z",
        oldest_unpaid_date: "2026-03-01T09:00:00Z",
      }],
    });

    const res = await request(app).get("/pos/customers/cust-1/balance");

    expect(res.status).toBe(200);
    expect(res.body.outstandingMinor).toBe(5000);
    expect(res.body.lastPaymentDate).toBe("2026-03-20T10:00:00Z");
    expect(res.body.oldestUnpaidDate).toBe("2026-03-01T09:00:00Z");

    // Verify store isolation in query
    const queryCall = mockQuery.mock.calls[0];
    expect(queryCall[1]).toContain("store-AAA");
    expect(queryCall[1]).toContain("cust-1");
  });

  it("returns 200 with zero balance when no ledger entries", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ outstanding_minor: "0", last_payment_date: null, oldest_unpaid_date: null }],
    });

    const res = await request(app).get("/pos/customers/cust-2/balance");

    expect(res.status).toBe(200);
    expect(res.body.outstandingMinor).toBe(0);
    expect(res.body.lastPaymentDate).toBeNull();
    expect(res.body.oldestUnpaidDate).toBeNull();
  });
});

describe("GCP-STG-0732: GET /pos/customers/:customerId/ledger", () => {
  it("returns 200 with paginated ledger entries", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "led-1", storeId: "store-AAA", customerId: "cust-1", saleId: "sale-1",
          type: "CREDIT", amountMinor: "3000", balanceAfterMinor: "3000",
          note: "Udhar sale", paymentMethod: null, createdAt: "2026-03-20T10:00:00Z", createdBy: "dev-001",
        },
        {
          id: "led-2", storeId: "store-AAA", customerId: "cust-1", saleId: null,
          type: "PAYMENT", amountMinor: "1000", balanceAfterMinor: "2000",
          note: "Cash payment", paymentMethod: "CASH", createdAt: "2026-03-21T10:00:00Z", createdBy: "dev-001",
        },
      ],
    });

    const res = await request(app).get("/pos/customers/cust-1/ledger?limit=10&offset=0");

    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(2);
    expect(res.body.entries[0].type).toBe("CREDIT");
    expect(res.body.entries[0].amountMinor).toBe(3000);
    expect(res.body.entries[1].type).toBe("PAYMENT");
    expect(res.body.entries[1].amountMinor).toBe(1000);
    expect(res.body.limit).toBe(10);
    expect(res.body.offset).toBe(0);
  });

  it("defaults limit to 20 and offset to 0", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get("/pos/customers/cust-1/ledger");

    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(20);
    expect(res.body.offset).toBe(0);
  });
});

describe("GCP-STG-0732: POST /pos/customers/:customerId/payments", () => {
  it("returns 200 and reduces balance after payment", async () => {
    // First query: get current balance
    mockQuery.mockResolvedValueOnce({
      rows: [{ outstanding_minor: "5000" }],
    });
    // Second query: insert payment entry
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: "pay-1", storeId: "store-AAA", customerId: "cust-1",
        type: "PAYMENT", amountMinor: "2000", balanceAfterMinor: "3000",
        paymentMethod: "CASH", note: "Partial payment", createdAt: "2026-03-25T10:00:00Z",
      }],
    });

    const res = await request(app)
      .post("/pos/customers/cust-1/payments")
      .send({ amountMinor: 2000, paymentMethod: "CASH", note: "Partial payment" });

    expect(res.status).toBe(200);
    expect(res.body.entry.type).toBe("PAYMENT");
    expect(res.body.entry.amountMinor).toBe(2000);
    expect(res.body.outstandingMinor).toBe(3000);
  });

  it("returns 400 when amountMinor is missing", async () => {
    const res = await request(app)
      .post("/pos/customers/cust-1/payments")
      .send({ paymentMethod: "CASH" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/amountMinor/);
  });

  it("returns 400 when amountMinor is zero or negative", async () => {
    const res = await request(app)
      .post("/pos/customers/cust-1/payments")
      .send({ amountMinor: 0 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/amountMinor/);
  });
});

describe("GCP-STG-0732: Store isolation", () => {
  it("balance query includes store_id from device token", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ outstanding_minor: "0", last_payment_date: null, oldest_unpaid_date: null }],
    });

    await request(app).get("/pos/customers/cust-1/balance");

    const queryArgs = mockQuery.mock.calls[0][1];
    expect(queryArgs[0]).toBe("store-AAA"); // storeId from device token, not client
  });

  it("ledger query includes store_id from device token", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await request(app).get("/pos/customers/cust-1/ledger");

    const queryArgs = mockQuery.mock.calls[0][1];
    expect(queryArgs[0]).toBe("store-AAA");
  });

  it("payment query includes store_id from device token", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ outstanding_minor: "1000" }] });
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: "pay-2", storeId: "store-AAA", customerId: "cust-1",
        type: "PAYMENT", amountMinor: "500", balanceAfterMinor: "500",
        paymentMethod: "UPI", note: null, createdAt: "2026-03-25T10:00:00Z",
      }],
    });

    await request(app)
      .post("/pos/customers/cust-1/payments")
      .send({ amountMinor: 500, paymentMethod: "UPI" });

    // Both balance check and insert should use store-AAA
    expect(mockQuery.mock.calls[0][1][0]).toBe("store-AAA");
    expect(mockQuery.mock.calls[1][1][0]).toBe("store-AAA");
  });
});
