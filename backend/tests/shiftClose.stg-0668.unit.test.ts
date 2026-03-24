/**
 * GCP-STG-0668: Shift close / cash reconciliation — behavioral supertest tests
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

describe("GCP-STG-0668: POST /pos/sales/shift-close", () => {
  it("returns 200 with BALANCED status when variance <= 100", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        total_sales: "10",
        total_revenue: "5000",
        cash_total: "3000",
        upi_total: "1500",
        due_total: "500",
      }],
    });

    const res = await request(app)
      .post("/pos/sales/shift-close")
      .send({ actualCashAmount: 3050, staffId: "staff-1" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("BALANCED");
    expect(res.body.cashTotal).toBe(3000);
    expect(res.body.actualCashAmount).toBe(3050);
    expect(res.body.cashVariance).toBe(50);
    expect(res.body.totalSales).toBe(10);
    expect(res.body.storeId).toBe("store-1");
  });

  it("returns VARIANCE status when cash difference exceeds 100", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        total_sales: "10",
        total_revenue: "5000",
        cash_total: "3000",
        upi_total: "1500",
        due_total: "500",
      }],
    });

    const res = await request(app)
      .post("/pos/sales/shift-close")
      .send({ actualCashAmount: 3500 });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("VARIANCE");
    expect(res.body.cashVariance).toBe(500);
  });

  it("returns UNCOUNTED when no actualCashAmount provided", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        total_sales: "5",
        total_revenue: "2000",
        cash_total: "1000",
        upi_total: "800",
        due_total: "200",
      }],
    });

    const res = await request(app)
      .post("/pos/sales/shift-close")
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("UNCOUNTED");
    expect(res.body.actualCashAmount).toBeNull();
    expect(res.body.cashVariance).toBeNull();
  });

  it("handles negative variance (short cash)", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        total_sales: "8",
        total_revenue: "5000",
        cash_total: "3000",
        upi_total: "1500",
        due_total: "500",
      }],
    });

    const res = await request(app)
      .post("/pos/sales/shift-close")
      .send({ actualCashAmount: 2000 });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("VARIANCE");
    expect(res.body.cashVariance).toBe(-1000);
  });
});
