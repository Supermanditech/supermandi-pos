/**
 * GCP-STG-0669: Z-report (daily tax totals) — behavioral supertest tests
 *
 * Mounts posSalesRouter, mocks getPool + middleware, verifies HTTP responses.
 */

const mockQuery = jest.fn();
jest.mock("../src/db/client", () => ({
  getPool: () => ({ query: mockQuery }),
}));
jest.mock("../src/lib/logger", () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("../src/middleware/deviceToken", () => ({
  requireDeviceToken: (req: any, _res: any, next: any) => {
    req.posDevice = { storeId: "store-1", deviceId: "dev-1" };
    next();
  },
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
  assertStoreId: (storeId: any, _op: string) => {
    if (!storeId) throw new Error("Store isolation violation");
    return storeId;
  },
}));
jest.mock("../src/services/posEventLogger", () => ({
  logPosEventSafe: jest.fn(),
}));
jest.mock("../src/services/lifecycleEventService", () => ({
  publishLifecycleEvent: jest.fn(),
}));
jest.mock("../src/services/inventoryService", () => ({
  applyBulkDeductions: jest.fn(),
  ensureSaleAvailability: jest.fn(),
  ensureStandardVariants: jest.fn(),
  ensureSupermandiBarcode: jest.fn(),
  normalizeUnit: jest.fn(),
}));
jest.mock("../src/services/conversionEngine", () => ({
  getUnitMultiplier: jest.fn().mockReturnValue(1),
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
jest.mock("../src/routes/v1/pos/inventory", () => ({
  invalidateStockCache: jest.fn(),
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

import express from "express";
import request from "supertest";
import { posSalesRouter } from "../src/routes/v1/pos/sales";

const app = express();
app.use(express.json());
app.use("/pos/sales", posSalesRouter);

beforeEach(() => mockQuery.mockReset());

describe("GCP-STG-0669: GET /pos/sales/z-report", () => {
  it("returns 200 with Z-REPORT data and daily tax aggregates", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        total_transactions: "15",
        gross_total: "10000",
        total_discount: "500",
        total_tax: "1800",
        net_total: "8200",
      }],
    });

    const res = await request(app)
      .get("/pos/sales/z-report?date=2026-03-25");

    expect(res.status).toBe(200);
    expect(res.body.reportType).toBe("Z-REPORT");
    expect(res.body.storeId).toBe("store-1");
    expect(res.body.date).toBe("2026-03-25");
    expect(res.body.totalTransactions).toBe(15);
    expect(res.body.grossTotal).toBe(10000);
    expect(res.body.totalDiscount).toBe(500);
    expect(res.body.totalTax).toBe(1800);
    expect(res.body.netTotal).toBe(8200);
    expect(res.body.generatedAt).toBeDefined();
  });

  it("returns zero values for no transactions", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        total_transactions: "0",
        gross_total: "0",
        total_discount: "0",
        total_tax: "0",
        net_total: "0",
      }],
    });

    const res = await request(app)
      .get("/pos/sales/z-report?date=2026-03-25");

    expect(res.status).toBe(200);
    expect(res.body.totalTransactions).toBe(0);
    expect(res.body.grossTotal).toBe(0);
    expect(res.body.totalTax).toBe(0);
    expect(res.body.netTotal).toBe(0);
  });

  it("defaults date to today when not provided", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        total_transactions: "0",
        gross_total: "0",
        total_discount: "0",
        total_tax: "0",
        net_total: "0",
      }],
    });

    const res = await request(app)
      .get("/pos/sales/z-report");

    expect(res.status).toBe(200);
    expect(res.body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(res.body.reportType).toBe("Z-REPORT");
  });

  it("returns 500 on DB error", async () => {
    mockQuery.mockRejectedValueOnce(new Error("connection refused"));

    const res = await request(app)
      .get("/pos/sales/z-report");

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to generate Z-report");
  });
});
