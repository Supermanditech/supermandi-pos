/**
 * GCP-STG-0727: Verify getInvoice returns pdfGcsPath and pdfSignature fields
 *
 * Behavioral test: mounts the admin invoices GET /:invoiceId endpoint via
 * express + supertest. Mocks getPool to return a row with pdf_gcs_path set.
 * Verifies the response JSON includes pdfGcsPath.
 */

const mockQuery = jest.fn();
const mockPool = { query: mockQuery };

jest.mock("../src/db/client", () => ({
  getPool: () => mockPool,
}));

jest.mock("../src/middleware/adminToken", () => ({
  requireAdminToken: (_req: any, _res: any, next: any) => next(),
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../src/services/invoicePdfService", () => ({
  generateInvoicePdf: jest.fn(),
}));

jest.mock("../src/services/eInvoiceService", () => ({
  generateIrn: jest.fn(),
  cancelIrn: jest.fn(),
  generateQrCodeBuffer: jest.fn(),
  getEInvoiceConfig: jest.fn(),
}));

jest.mock("../src/lib/logger", () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import express from "express";
import request from "supertest";
import { adminInvoicesRouter } from "../src/routes/v1/admin/invoices";

function createApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/admin", adminInvoicesRouter);
  return app;
}

describe("GCP-STG-0727: Invoice GCS path retrieval (behavioral)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("GET /invoices/:id returns pdfGcsPath when pdf_gcs_path is set", async () => {
    const invoiceRow = {
      id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      invoiceNumber: "INV-2026-001",
      invoiceDate: "2026-01-01",
      dueDate: "2026-02-01",
      invoiceModel: "b2b",
      invoiceType: "sale",
      status: "issued",
      sellerType: "platform",
      sellerName: "SuperMandi",
      sellerGstin: "27AAAAA0000A1Z5",
      sellerAddress: "Mumbai",
      buyerType: "store",
      buyerName: "Test Store",
      buyerGstin: "27BBBBB0000B1Z5",
      buyerAddress: "Pune",
      subtotalMinor: 10000,
      discountMinor: 0,
      taxableAmountMinor: 10000,
      cgstMinor: 250,
      sgstMinor: 250,
      igstMinor: 0,
      totalTaxMinor: 500,
      totalAmountMinor: 10500,
      amountPaidMinor: 0,
      balanceDueMinor: 10500,
      platformFeePercent: null,
      platformFeeMinor: null,
      fiscalYear: "2025-26",
      sellerId: "s1",
      buyerId: "b1",
      orderId: null,
      createdAt: "2026-01-01",
      issuedAt: "2026-01-01",
      paidAt: null,
      irn: null,
      irnStatus: null,
      irnGeneratedAt: null,
      signedQrString: null,
      ackNumber: null,
      ackDate: null,
      pdfGcsPath: "gs://supermandi-invoices/INV-2026-001.pdf",
      pdfSignature: "abc123def456",
    };

    // First call: invoice query; Second: items; Third: payments; Fourth+: seller/buyer phone lookups
    mockQuery
      .mockResolvedValueOnce({ rows: [invoiceRow] })  // invoice
      .mockResolvedValueOnce({ rows: [] })             // items
      .mockResolvedValueOnce({ rows: [] })             // payments
      .mockResolvedValueOnce({ rows: [{ phone: "+919876543210" }] }) // seller phone
      .mockResolvedValueOnce({ rows: [{ phone: "+919876543211" }] }); // buyer phone

    const app = createApp();
    const res = await request(app).get(
      `/api/v1/admin/invoices/${invoiceRow.id}`
    );

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.pdfGcsPath).toBe("gs://supermandi-invoices/INV-2026-001.pdf");
    expect(res.body.data.pdfSignature).toBe("abc123def456");
  });

  it("GET /invoices/:id returns null pdfGcsPath when not archived", async () => {
    const invoiceRow = {
      id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      invoiceNumber: "INV-2026-002",
      invoiceDate: "2026-01-01",
      dueDate: "2026-02-01",
      invoiceModel: "b2b",
      invoiceType: "sale",
      status: "draft",
      sellerType: "platform",
      sellerName: "SuperMandi",
      sellerGstin: null,
      sellerAddress: "Mumbai",
      buyerType: "store",
      buyerName: "Test Store",
      buyerGstin: null,
      buyerAddress: "Pune",
      subtotalMinor: 5000,
      discountMinor: 0,
      taxableAmountMinor: 5000,
      cgstMinor: 0,
      sgstMinor: 0,
      igstMinor: 0,
      totalTaxMinor: 0,
      totalAmountMinor: 5000,
      amountPaidMinor: 0,
      balanceDueMinor: 5000,
      platformFeePercent: null,
      platformFeeMinor: null,
      fiscalYear: "2025-26",
      sellerId: "s1",
      buyerId: "b1",
      orderId: null,
      createdAt: "2026-01-01",
      issuedAt: null,
      paidAt: null,
      irn: null,
      irnStatus: null,
      irnGeneratedAt: null,
      signedQrString: null,
      ackNumber: null,
      ackDate: null,
      pdfGcsPath: null,
      pdfSignature: null,
    };

    mockQuery
      .mockResolvedValueOnce({ rows: [invoiceRow] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const app = createApp();
    const res = await request(app).get(
      `/api/v1/admin/invoices/${invoiceRow.id}`
    );

    expect(res.status).toBe(200);
    expect(res.body.data.pdfGcsPath).toBeFalsy();
    expect(res.body.data.pdfSignature).toBeFalsy();
  });
});
