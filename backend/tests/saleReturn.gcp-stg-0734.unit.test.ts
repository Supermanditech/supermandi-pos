/**
 * GCP-STG-0734: Item-level sale return — behavioral supertest tests
 *
 * Mounts posSalesRouter, mocks getPool + deviceToken, verifies HTTP responses.
 */

process.env.JWT_SECRET = "test-secret-for-return";
process.env.NODE_ENV = "test";
process.env.RETURN_WINDOW_DAYS = "7";

const mockPoolQuery = jest.fn();
const mockClientQuery = jest.fn();
const mockClientRelease = jest.fn();
const mockConnect = jest.fn().mockResolvedValue({
  query: mockClientQuery,
  release: mockClientRelease,
});

jest.mock("../src/db/client", () => ({
  getPool: () => ({
    query: mockPoolQuery,
    connect: mockConnect,
  }),
}));

jest.mock("../src/middleware/deviceToken", () => ({
  requireDeviceToken: (req: any, _res: any, next: any) => {
    req.posDevice = { storeId: "store-RTN", deviceId: "dev-001" };
    next();
  },
  PosDeviceContext: {},
}));

jest.mock("../src/middleware/storeStatusGate", () => ({
  requireActiveStore: (_req: any, _res: any, next: any) => next(),
  requireOperationalStore: (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../src/middleware/posRateLimiter", () => ({
  salesRateLimiter: (_req: any, _res: any, next: any) => next(),
  financialOperationsRateLimiter: (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../src/services/storeIsolation", () => ({
  assertStoreId: (id: any) => { if (!id) throw new Error("missing store"); },
}));

jest.mock("../src/services/inventoryService", () => ({
  applyBulkDeductions: jest.fn(),
  ensureSaleAvailability: jest.fn(),
  ensureStandardVariants: jest.fn(),
  ensureSupermandiBarcode: jest.fn(),
  normalizeUnit: jest.fn((u: string) => u),
}));

jest.mock("../src/services/conversionEngine", () => ({
  getUnitMultiplier: jest.fn(() => 1),
  retailToStockDecrement: jest.fn(),
  inferBaseStockUnit: jest.fn(),
}));

jest.mock("../src/services/inventoryLedgerService", () => ({
  recordSaleInventoryMovements: jest.fn(),
  recordSaleReturnMovements: jest.fn(),
  ensureStoreInventoryAvailability: jest.fn(),
  InsufficientStockError: class extends Error {},
  StockVersionConflictError: class extends Error {},
}));

jest.mock("../src/services/posEventLogger", () => ({
  logPosEventSafe: jest.fn(),
}));

jest.mock("../src/services/lifecycleEventService", () => ({
  publishLifecycleEvent: jest.fn(),
}));

jest.mock("../src/services/invoiceService", () => ({
  createInvoice: jest.fn(),
  issueInvoice: jest.fn(),
  getInvoice: jest.fn(),
}));

jest.mock("../src/services/invoicePdfService", () => ({
  generateInvoicePdf: jest.fn(),
}));

jest.mock("../src/services/eInvoiceService", () => ({
  generateQrCodeBuffer: jest.fn(),
}));

jest.mock("../src/lib/logger", () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import express from "express";
import request from "supertest";
import { posSalesRouter } from "../src/routes/v1/pos/sales";

const app = express();
app.use(express.json());
app.use("/pos", posSalesRouter);

beforeEach(() => {
  mockPoolQuery.mockReset();
  mockClientQuery.mockReset();
  mockClientRelease.mockReset();
});

describe("GCP-STG-0734: POST /pos/sales/:saleId/item-return", () => {
  const validBody = {
    items: [{ productId: "prod-1", qty: 2, reason: "Damaged" }],
    refundType: "CASH",
  };

  it("returns 400 when items array is missing", async () => {
    const res = await request(app)
      .post("/pos/sales/sale-1/item-return")
      .send({ refundType: "CASH" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("items");
  });

  it("returns 400 when items array is empty", async () => {
    const res = await request(app)
      .post("/pos/sales/sale-1/item-return")
      .send({ items: [], refundType: "CASH" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("items");
  });

  it("returns 404 when sale not found", async () => {
    // BEGIN, SET TRANSACTION, set_config, SELECT sale
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // SET TRANSACTION
      .mockResolvedValueOnce({ rows: [] }) // set_config
      .mockResolvedValueOnce({ rows: [] }) // SELECT sale — not found
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

    const res = await request(app)
      .post("/pos/sales/nonexistent/item-return")
      .send(validBody);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("sale_not_found");
  });

  it("returns 409 when sale is older than 7 days", async () => {
    const oldDate = new Date(Date.now() - 10 * 86400000).toISOString();

    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // SET TRANSACTION
      .mockResolvedValueOnce({ rows: [] }) // set_config
      .mockResolvedValueOnce({ rows: [{ id: "sale-1", store_id: "store-RTN", status: "PAID_CASH", total_minor: 5000, created_at: oldDate }] })
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

    const res = await request(app)
      .post("/pos/sales/sale-1/item-return")
      .send(validBody);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("return_window_expired");
  });

  it("returns 200 and processes return for valid request", async () => {
    const recentDate = new Date(Date.now() - 86400000).toISOString(); // 1 day ago

    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // SET TRANSACTION
      .mockResolvedValueOnce({ rows: [] }) // set_config
      .mockResolvedValueOnce({ rows: [{ id: "sale-1", store_id: "store-RTN", status: "PAID_CASH", total_minor: 5000, created_at: recentDate }] }) // SELECT sale
      .mockResolvedValueOnce({ rows: [{ id: "si-1", variant_id: "var-1", quantity: "5", stock_quantity: null, price_minor: "1000", name: "Milk", product_id: "prod-1" }] }) // SELECT sale_items
      .mockResolvedValueOnce({ rows: [] }) // INSERT into orders.sale_returns
      .mockResolvedValueOnce({ rows: [] }) // recordSaleReturnMovements (mocked separately)
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await request(app)
      .post("/pos/sales/sale-1/item-return")
      .send(validBody);

    expect(res.status).toBe(200);
    expect(res.body.saleId).toBe("sale-1");
    expect(res.body.returnRef).toMatch(/^RTN-/);
    expect(res.body.refundType).toBe("CASH");
    expect(res.body.totalRefundMinor).toBe(2000); // 2 * 1000
    expect(res.body.itemsReturned).toBe(1);
  });

  it("returns 400 when return qty exceeds original", async () => {
    const recentDate = new Date(Date.now() - 86400000).toISOString();

    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // SET TRANSACTION
      .mockResolvedValueOnce({ rows: [] }) // set_config
      .mockResolvedValueOnce({ rows: [{ id: "sale-1", store_id: "store-RTN", status: "PAID_CASH", total_minor: 5000, created_at: recentDate }] })
      .mockResolvedValueOnce({ rows: [{ id: "si-1", variant_id: "var-1", quantity: "2", stock_quantity: null, price_minor: "1000", name: "Milk", product_id: "prod-1" }] })
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

    const res = await request(app)
      .post("/pos/sales/sale-1/item-return")
      .send({ items: [{ productId: "prod-1", qty: 5 }], refundType: "CASH" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("qty_exceeds_original");
  });
});
