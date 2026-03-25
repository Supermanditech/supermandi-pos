/**
 * GCP-STG-0725: Bulk invoice issue/void/cancel for SuperAdmin
 *
 * Behavioral test: mounts the adminInvoicesRouter on an express app,
 * mocks the pool to control invoice lookups and updates,
 * verifies bulk action transitions, validation, and error reporting.
 */

const mockQuery = jest.fn();
const mockClientQuery = jest.fn();
const mockConnect = jest.fn();
const mockRelease = jest.fn();

jest.mock("../src/db/client", () => ({
  getPool: () => ({
    query: mockQuery,
    connect: mockConnect,
  }),
}));

jest.mock("../src/middleware/adminToken", () => ({
  requireAdminToken: (_req: any, _res: any, next: any) => {
    (_req as any).adminId = "admin-1";
    next();
  },
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../src/services/invoiceService", () => ({
  createInvoice: jest.fn(),
  issueInvoice: jest.fn(),
  recordInvoicePayment: jest.fn(),
  getInvoice: jest.fn(),
  listInvoices: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  getCurrentFiscalYear: () => "2025-26",
}));

jest.mock("../src/services/invoicePdfService", () => ({
  generateInvoicePdf: jest.fn(),
}));

jest.mock("../src/services/eInvoiceService", () => ({
  generateIrn: jest.fn(),
  cancelIrn: jest.fn(),
  generateQrCodeBuffer: jest.fn(),
  getEInvoiceConfig: () => ({ enabled: false, sandbox: true, gstin: "" }),
}));

jest.mock("../src/lib/logger", () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import express from "express";
import request from "supertest";
import { adminInvoicesRouter } from "../src/routes/v1/admin/invoices";

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/admin", adminInvoicesRouter);
  return app;
}

describe("GCP-STG-0725: Bulk invoice action", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConnect.mockResolvedValue({
      query: mockClientQuery,
      release: mockRelease,
    });
  });

  it("returns 400 when invoiceIds missing", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/v1/admin/invoices/bulk-action")
      .send({ action: "issue" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invoiceIds and action required/);
  });

  it("returns 400 when action is invalid", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/v1/admin/invoices/bulk-action")
      .send({ invoiceIds: ["id-1"], action: "delete" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/action must be issue, void, or cancel/);
  });

  it("issues draft invoices in bulk", async () => {
    mockClientQuery
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: "id-1", status: "draft" }] }) // SELECT inv 1
      .mockResolvedValueOnce(undefined) // UPDATE inv 1
      .mockResolvedValueOnce({ rows: [{ id: "id-2", status: "draft" }] }) // SELECT inv 2
      .mockResolvedValueOnce(undefined) // UPDATE inv 2
      .mockResolvedValueOnce(undefined); // COMMIT

    const app = createApp();
    const res = await request(app)
      .post("/api/v1/admin/invoices/bulk-action")
      .send({ invoiceIds: ["id-1", "id-2"], action: "issue" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(2);
    expect(res.body.failed).toBe(0);
    expect(res.body.errors).toEqual([]);
  });

  it("reports not-found and invalid-status errors without rolling back successful ones", async () => {
    mockClientQuery
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // SELECT inv 1 — not found
      .mockResolvedValueOnce({ rows: [{ id: "id-2", status: "issued" }] }) // SELECT inv 2 — wrong status for issue
      .mockResolvedValueOnce({ rows: [{ id: "id-3", status: "draft" }] }) // SELECT inv 3 — ok
      .mockResolvedValueOnce(undefined) // UPDATE inv 3
      .mockResolvedValueOnce(undefined); // COMMIT

    const app = createApp();
    const res = await request(app)
      .post("/api/v1/admin/invoices/bulk-action")
      .send({ invoiceIds: ["id-1", "id-2", "id-3"], action: "issue" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(1);
    expect(res.body.failed).toBe(2);
    expect(res.body.errors).toEqual([
      { invoiceId: "id-1", reason: "Not found" },
      { invoiceId: "id-2", reason: "Cannot issue from issued" },
    ]);
  });

  it("cancels issued and draft invoices", async () => {
    mockClientQuery
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: "id-1", status: "issued" }] })
      .mockResolvedValueOnce(undefined) // UPDATE
      .mockResolvedValueOnce({ rows: [{ id: "id-2", status: "draft" }] })
      .mockResolvedValueOnce(undefined) // UPDATE
      .mockResolvedValueOnce(undefined); // COMMIT

    const app = createApp();
    const res = await request(app)
      .post("/api/v1/admin/invoices/bulk-action")
      .send({ invoiceIds: ["id-1", "id-2"], action: "cancel" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(2);
    expect(res.body.failed).toBe(0);
  });

  it("voids only issued invoices", async () => {
    mockClientQuery
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: "id-1", status: "draft" }] }) // draft — can't void
      .mockResolvedValueOnce({ rows: [{ id: "id-2", status: "issued" }] })
      .mockResolvedValueOnce(undefined) // UPDATE
      .mockResolvedValueOnce(undefined); // COMMIT

    const app = createApp();
    const res = await request(app)
      .post("/api/v1/admin/invoices/bulk-action")
      .send({ invoiceIds: ["id-1", "id-2"], action: "void" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(1);
    expect(res.body.failed).toBe(1);
    expect(res.body.errors[0].reason).toMatch(/Cannot void from draft/);
  });

  it("rolls back on unexpected DB error and returns 500", async () => {
    mockClientQuery
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockRejectedValueOnce(new Error("connection lost")); // SELECT fails

    const app = createApp();
    const res = await request(app)
      .post("/api/v1/admin/invoices/bulk-action")
      .send({ invoiceIds: ["id-1"], action: "issue" });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Bulk action failed");
    // Verify ROLLBACK was called
    expect(mockClientQuery).toHaveBeenCalledWith("ROLLBACK");
    expect(mockRelease).toHaveBeenCalled();
  });
});
