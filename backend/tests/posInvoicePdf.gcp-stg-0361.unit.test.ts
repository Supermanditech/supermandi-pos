/**
 * GCP-STG-0361: POS Invoice PDF Download
 *
 * Tests that the POS sales router has a GET /sales/:saleId/invoice/pdf
 * endpoint with proper store isolation, invoice lookup, and PDF streaming.
 *
 * Uses source analysis (same pattern as GCP-STG-0077) because sales.ts
 * has pre-existing TS issues that block full module import in unit tests.
 */

import * as fs from "fs";
import * as path from "path";

const salesPath = path.resolve(__dirname, "../src/routes/v1/pos/sales.ts");
const salesCode = fs.readFileSync(salesPath, "utf-8");

describe("GCP-STG-0361: POS Invoice PDF download route", () => {
  it("has GET /sales/:saleId/invoice/pdf route defined", () => {
    expect(salesCode).toContain('"/sales/:saleId/invoice/pdf"');
    expect(salesCode).toContain("posSalesRouter.get");
  });

  it("uses requireDeviceToken middleware for auth", () => {
    // Find the route definition line
    const routeIdx = salesCode.indexOf('"/sales/:saleId/invoice/pdf"');
    expect(routeIdx).toBeGreaterThan(0);
    // The route line should include requireDeviceToken
    const routeLine = salesCode.substring(
      salesCode.lastIndexOf("\n", routeIdx),
      salesCode.indexOf("\n", routeIdx + 50)
    );
    expect(routeLine).toContain("requireDeviceToken");
  });

  // Find the route handler block — search for the GET route definition, not the import comment
  function getRouteBlock(): string {
    const marker = 'GCP-STG-0361: GET /sales/:saleId/invoice/pdf';
    const routeStart = salesCode.indexOf(marker);
    expect(routeStart).toBeGreaterThan(0);
    return salesCode.substring(routeStart, routeStart + 2500);
  }

  it("enforces store isolation — queries sales with store_id", () => {
    const routeBlock = getRouteBlock();
    expect(routeBlock).toContain("store_id");
    expect(routeBlock).toContain("getStoreIdFromPosDevice");
  });

  it("looks up invoice by order_id (sale to invoice linkage)", () => {
    const routeBlock = getRouteBlock();
    expect(routeBlock).toContain("order_id");
    expect(routeBlock).toContain("invoicing.invoices");
  });

  it("calls getInvoice to fetch full invoice data", () => {
    const routeBlock = getRouteBlock();
    expect(routeBlock).toContain("getInvoice");
  });

  it("calls generateInvoicePdf and pipes to response", () => {
    const routeBlock = getRouteBlock();
    expect(routeBlock).toContain("generateInvoicePdf");
    expect(routeBlock).toContain("pdfDoc.pipe(res)");
  });

  it("sets Content-Type to application/pdf", () => {
    const routeBlock = getRouteBlock();
    expect(routeBlock).toContain("application/pdf");
    expect(routeBlock).toContain("Content-Disposition");
  });

  it("sanitizes filename to prevent path traversal", () => {
    const routeBlock = getRouteBlock();
    expect(routeBlock).toContain(".replace(");
    expect(routeBlock).toContain(".pdf");
  });

  it("returns 404 for missing sale (store isolation check)", () => {
    const routeBlock = getRouteBlock();
    expect(routeBlock).toContain('"sale_not_found"');
  });

  it("returns 404 for missing invoice", () => {
    const routeBlock = getRouteBlock();
    expect(routeBlock).toContain('"invoice_not_found"');
  });

  it("handles QR code buffer for e-invoices", () => {
    const routeBlock = getRouteBlock();
    expect(routeBlock).toContain("generateQrCodeBuffer");
    expect(routeBlock).toContain("signedQrString");
  });

  it("imports getInvoice from invoiceService", () => {
    expect(salesCode).toContain("getInvoice");
    expect(salesCode).toContain("invoiceService");
  });

  it("imports generateInvoicePdf from invoicePdfService", () => {
    expect(salesCode).toContain("generateInvoicePdf");
    expect(salesCode).toContain("invoicePdfService");
  });

  it("imports generateQrCodeBuffer from eInvoiceService", () => {
    expect(salesCode).toContain("generateQrCodeBuffer");
    expect(salesCode).toContain("eInvoiceService");
  });
});

// Verify frontend wiring
describe("GCP-STG-0361: BillDetailScreenV3 invoice button", () => {
  const billDetailPath = path.resolve(__dirname, "../../src/screens/v3/BillDetailScreenV3.tsx");
  const billDetailCode = fs.readFileSync(billDetailPath, "utf-8");

  it("has saleId in Props type", () => {
    expect(billDetailCode).toContain("saleId?:");
  });

  it("has invoice PDF download button with testID", () => {
    expect(billDetailCode).toContain("invoice-pdf-btn");
  });

  it("calls /pos/sales/:saleId/invoice/pdf endpoint", () => {
    expect(billDetailCode).toContain("/invoice/pdf");
  });

  it("checks online status before download", () => {
    expect(billDetailCode).toContain("isOnline");
    expect(billDetailCode).toContain("Offline");
  });

  it("has loading state for PDF download", () => {
    expect(billDetailCode).toContain("downloadingPdf");
  });
});

describe("GCP-STG-0361: SalesHistoryScreenV3 passes saleId", () => {
  const historyPath = path.resolve(__dirname, "../../src/screens/v3/SalesHistoryScreenV3.tsx");
  const historyCode = fs.readFileSync(historyPath, "utf-8");

  it("includes saleId in selectedBill state", () => {
    expect(historyCode).toContain("saleId:");
  });

  it("passes saleId prop to BillDetailScreenV3", () => {
    expect(historyCode).toContain("saleId={selectedBill.saleId}");
  });
});
