/**
 * GCP-STG-0740: Retailer customer database — behavioral supertest tests
 *
 * Mounts retailerAdminCustomersRouter, mocks getPool, verifies HTTP responses
 * for customer list with search, credit_balance, and pagination.
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
import { retailerAdminCustomersRouter } from "../src/routes/v1/retailer-admin/customers";

const app = express();
app.use(express.json());
// Simulate gateway headers (x-actor-id = storeId)
app.use((req, _res, next) => {
  req.headers['x-actor-id'] = 'store-1';
  next();
});
app.use("/retailer-admin", retailerAdminCustomersRouter);

beforeEach(() => {
  mockQuery.mockReset();
});

describe("GET /retailer-admin/customers (GCP-STG-0740)", () => {
  it("returns customer list with creditBalance field", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: "c1", storeId: "store-1", name: "Ravi Kumar", phone: "9876543210",
            totalPurchasesMinor: 50000, totalSpent: 50000, visitCount: 5, visits: 5,
            creditBalance: 2000, lastVisitAt: "2026-03-20T10:00:00Z", lastVisit: "2026-03-20T10:00:00Z",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ total: 1 }] });

    const res = await request(app).get("/retailer-admin/customers?limit=20&offset=0");

    expect(res.status).toBe(200);
    expect(res.body.customers).toHaveLength(1);
    expect(res.body.customers[0].name).toBe("Ravi Kumar");
    expect(res.body.customers[0].creditBalance).toBe(2000);
    expect(res.body.customers[0].totalSpent).toBe(50000);
    expect(res.body.customers[0].visits).toBe(5);
    expect(res.body.total).toBe(1);
  });

  it("supports ?search= parameter as alias for ?q=", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total: 0 }] });

    const res = await request(app).get("/retailer-admin/customers?search=Kumar&limit=20&offset=0");

    expect(res.status).toBe(200);
    expect(res.body.customers).toEqual([]);
    // Verify the search parameter was used (query was called with pattern)
    expect(mockQuery).toHaveBeenCalledTimes(2);
    const firstCallArgs = mockQuery.mock.calls[0][1];
    expect(firstCallArgs).toContain("%Kumar%");
  });

  it("defaults limit to 20", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total: 0 }] });

    const res = await request(app).get("/retailer-admin/customers");

    expect(res.status).toBe(200);
    // limit param = $2 in the query
    expect(mockQuery.mock.calls[0][1][1]).toBe(20);
  });

  it("returns 401 when store not identified", async () => {
    const noAuthApp = express();
    noAuthApp.use(express.json());
    noAuthApp.use("/retailer-admin", retailerAdminCustomersRouter);

    const res = await request(noAuthApp).get("/retailer-admin/customers");

    expect(res.status).toBe(401);
  });

  it("returns 500 on DB error", async () => {
    mockQuery.mockRejectedValueOnce(new Error("DB fail"));

    const res = await request(app).get("/retailer-admin/customers");

    expect(res.status).toBe(500);
  });
});
