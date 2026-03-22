/**
 * GCP-STG-0283: Ledger-sum vs stock_balances reconciliation endpoint
 *
 * Behavioral test: mocks getPool, invokes GET /stock-reconciliation/ledger-check
 * via supertest, verifies SQL compares SUM(delta_qty) against current_qty.
 */

(global as any).__DEV__ = false;

const mockQuery = jest.fn();

jest.mock("../src/db/client", () => ({
  getPool: () => ({ query: mockQuery }),
}));

jest.mock("../src/middleware/adminToken", () => ({
  requireAdminToken: (_req: any, _res: any, next: any) => next(),
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../src/middleware/rateLimit", () => ({
  redisRateLimit: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../src/db/redis", () => ({
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheSet: jest.fn().mockResolvedValue(undefined),
  cacheDelete: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../src/lib/logger", () => ({
  log: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.mock("../src/services/stockReconciliation", () => ({
  reconcileStockBalances: jest.fn(),
  checkStockDivergence: jest.fn(),
}));

import express from "express";
import request from "supertest";
import { adminCatalogRouter } from "../src/routes/v1/admin/catalog";

const app = express();
app.use(express.json());
app.use("/admin/catalog", adminCatalogRouter);

beforeEach(() => {
  mockQuery.mockReset();
});

describe("GCP-STG-0283: Ledger reconciliation endpoint", () => {
  test("GET /ledger-check returns discrepancies where balance != ledger sum", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { store_id: "s1", product_id: "p1", balance_qty: "100.000", ledger_qty: "95.000", drift: "5.000" },
        { store_id: "s1", product_id: "p2", balance_qty: "50.000", ledger_qty: "52.000", drift: "-2.000" },
      ],
    });

    const res = await request(app)
      .get("/admin/catalog/stock-reconciliation/ledger-check")
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.discrepancies).toHaveLength(2);
    expect(res.body.discrepancies[0].drift).toBe(5);
    expect(res.body.discrepancies[1].drift).toBe(-2);
    expect(res.body.count).toBe(2);
    expect(res.body.checkedAt).toBeDefined();
  });

  test("SQL compares SUM(delta_qty) from inventory.inventory_ledger against stock_balances", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await request(app)
      .get("/admin/catalog/stock-reconciliation/ledger-check")
      .expect(200);

    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain("SUM(delta_qty) AS total_delta");
    expect(sql).toContain("FROM inventory.inventory_ledger");
    expect(sql).toContain("inventory.stock_balances sb");
    expect(sql).toContain("sb.current_qty - COALESCE(ledger.total_delta, 0) AS drift");
  });

  test("filters by storeId when provided", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await request(app)
      .get("/admin/catalog/stock-reconciliation/ledger-check?storeId=store-123")
      .expect(200);

    expect(mockQuery.mock.calls[0][0]).toContain("sb.store_id = $1");
    expect(mockQuery.mock.calls[0][1]).toEqual(["store-123"]);
  });

  test("returns all stores when storeId not provided", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await request(app)
      .get("/admin/catalog/stock-reconciliation/ledger-check")
      .expect(200);

    expect(mockQuery.mock.calls[0][1]).toEqual([]);
  });

  test("returns empty array when no discrepancies", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get("/admin/catalog/stock-reconciliation/ledger-check")
      .expect(200);

    expect(res.body.discrepancies).toEqual([]);
    expect(res.body.count).toBe(0);
  });

  test("limits results to 200 and orders by drift magnitude", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await request(app)
      .get("/admin/catalog/stock-reconciliation/ledger-check")
      .expect(200);

    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain("LIMIT 200");
    expect(sql).toContain("ORDER BY ABS(");
  });

  test("uses 0.001 threshold to ignore floating point noise", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await request(app)
      .get("/admin/catalog/stock-reconciliation/ledger-check")
      .expect(200);

    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain("> 0.001");
  });

  test("returns 500 on database error", async () => {
    mockQuery.mockRejectedValueOnce(new Error("DB connection failed"));

    const res = await request(app)
      .get("/admin/catalog/stock-reconciliation/ledger-check")
      .expect(500);

    expect(res.body.error).toContain("Failed to check ledger");
  });
});
