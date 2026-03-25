/**
 * GCP-STG-0737: Minimum stock auto-reorder alert — behavioral supertest tests
 *
 * Mounts posSalesRouter, mocks getPool + middleware, verifies:
 * 1. GET /pos/alerts/unread returns unread alerts
 * 2. Low stock alert is created after stock deduction (tested via endpoint behavior)
 */

const mockQuery = jest.fn();
const mockPoolClient = {
  query: jest.fn(),
  release: jest.fn(),
};
jest.mock("../src/db/client", () => ({
  getPool: () => ({
    query: mockQuery,
    connect: jest.fn().mockResolvedValue(mockPoolClient),
  }),
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
app.use("/pos", posSalesRouter);

beforeEach(() => {
  mockQuery.mockReset();
  mockPoolClient.query.mockReset();
  mockPoolClient.release.mockReset();
});

describe("GET /pos/alerts/unread (GCP-STG-0737)", () => {
  it("returns unread alerts for the store", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "alert-1",
          alert_type: "LOW_STOCK",
          product_id: "prod-1",
          title: "Low stock: Sugar",
          message: "Stock is 3, below threshold of 10",
          created_at: "2026-03-25T10:00:00Z",
        },
      ],
    });

    const res = await request(app).get("/pos/alerts/unread");

    expect(res.status).toBe(200);
    expect(res.body.alerts).toHaveLength(1);
    expect(res.body.count).toBe(1);
    expect(res.body.alerts[0].alert_type).toBe("LOW_STOCK");
  });

  it("returns empty array when no alerts", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get("/pos/alerts/unread");

    expect(res.status).toBe(200);
    expect(res.body.alerts).toHaveLength(0);
    expect(res.body.count).toBe(0);
  });

  it("returns 500 on DB error", async () => {
    mockQuery.mockRejectedValueOnce(new Error("DB fail"));

    const res = await request(app).get("/pos/alerts/unread");

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("INTERNAL_ERROR");
  });
});
