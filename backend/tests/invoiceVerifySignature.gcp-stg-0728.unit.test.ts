/**
 * GCP-STG-0728: Invoice signature verification endpoint
 *
 * Behavioral test: mounts admin invoices router via express + supertest.
 * Mocks pool + admin auth. POST /invoices/:id/verify-signature with pdfHash.
 * Verifies { valid: true } when hash matches, { valid: false } when different.
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

const INVOICE_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

function mockInvoiceRow(overrides: Record<string, any> = {}) {
  return {
    id: INVOICE_ID,
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
    pdfGcsPath: null,
    pdfSignature: null,
    ...overrides,
  };
}

describe("GCP-STG-0728: Invoice signature verification (behavioral)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockReset();
  });

  it("returns { valid: true } when pdfHash matches stored signature", async () => {
    const storedSig = "abc123def456";
    mockQuery
      .mockResolvedValueOnce({ rows: [mockInvoiceRow({ pdfSignature: storedSig })] }) // invoice
      .mockResolvedValueOnce({ rows: [] }) // items
      .mockResolvedValueOnce({ rows: [] }) // payments
      .mockResolvedValueOnce({ rows: [{ phone: "+919876543210" }] }) // seller phone
      .mockResolvedValueOnce({ rows: [{ phone: "+919876543211" }] }); // buyer phone

    const app = createApp();
    const res = await request(app)
      .post(`/api/v1/admin/invoices/${INVOICE_ID}/verify-signature`)
      .send({ pdfHash: "ABC123DEF456" }); // different case — should still match

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.invoiceId).toBe(INVOICE_ID);
  });

  it("returns { valid: false } when pdfHash differs from stored signature", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [mockInvoiceRow({ pdfSignature: "abc123" })] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ phone: "+919876543210" }] })
      .mockResolvedValueOnce({ rows: [{ phone: "+919876543211" }] });

    const app = createApp();
    const res = await request(app)
      .post(`/api/v1/admin/invoices/${INVOICE_ID}/verify-signature`)
      .send({ pdfHash: "zzz999" });

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(false);
  });

  it("returns { valid: false, reason: 'no_signature_stored' } when invoice has no signature", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [mockInvoiceRow({ pdfSignature: null })] })
      .mockResolvedValueOnce({ rows: [] })  // items
      .mockResolvedValueOnce({ rows: [] })  // payments
      .mockResolvedValueOnce({ rows: [{ primary_phone: "+919876543210" }] }) // seller phone (if queried)
      .mockResolvedValueOnce({ rows: [{ phone: "+919876543211" }] }); // buyer phone (buyerType=store)

    const app = createApp();
    const res = await request(app)
      .post(`/api/v1/admin/invoices/${INVOICE_ID}/verify-signature`)
      .send({ pdfHash: "abc" });

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(false);
    expect(res.body.reason).toBe("no_signature_stored");
  });

  it("returns 400 when pdfHash is missing", async () => {
    const app = createApp();
    const res = await request(app)
      .post(`/api/v1/admin/invoices/${INVOICE_ID}/verify-signature`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("pdfHash");
  });
});
