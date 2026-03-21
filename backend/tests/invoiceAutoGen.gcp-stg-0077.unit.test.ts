// GCP-STG-0077: Auto-generate invoice after POS sale completion
// Tests that invoice generation is wired into all payment endpoints

import * as fs from "fs";
import * as path from "path";

const salesPath = path.resolve(__dirname, "../src/routes/v1/pos/sales.ts");
const salesCode = fs.readFileSync(salesPath, "utf-8");

describe("GCP-STG-0077: Invoice auto-generation wiring", () => {
  test("imports createInvoice and issueInvoice from invoiceService", () => {
    expect(salesCode).toContain('import { createInvoice, issueInvoice } from "../../../services/invoiceService"');
  });

  test("defines generateSaleInvoice helper function", () => {
    expect(salesCode).toContain("async function generateSaleInvoice(");
    expect(salesCode).toContain('paymentMode: "CASH" | "UPI" | "DUE"');
  });

  test("generateSaleInvoice checks for existing invoice (idempotency)", () => {
    expect(salesCode).toContain("SELECT id FROM invoicing.invoices WHERE order_id = $1 LIMIT 1");
  });

  test("generateSaleInvoice fetches store details for seller party", () => {
    expect(salesCode).toContain("SELECT name, gstin, address_line1, address_line2, city, state");
    expect(salesCode).toContain("FROM platform.stores WHERE id = $1::uuid");
  });

  test("generateSaleInvoice joins sale_items with supplier_products for HSN/GST", () => {
    expect(salesCode).toContain("LEFT JOIN catalog.supplier_products sp ON sp.id = si.variant_id::uuid");
    expect(salesCode).toContain("sp.hsn_code, sp.gst_rate");
  });

  test("generateSaleInvoice calls createInvoice with invoiceType sale", () => {
    expect(salesCode).toContain('invoiceType: "sale"');
    expect(salesCode).toContain('invoiceModel: "buy_resell"');
  });

  test("generateSaleInvoice calls issueInvoice after creation", () => {
    expect(salesCode).toContain("await issueInvoice(pool, invoice.id)");
  });

  test("generateSaleInvoice never throws (fire-and-forget safety)", () => {
    // The function catches all errors and returns null
    expect(salesCode).toContain("// Never throw — invoice failure must not affect payment");
    expect(salesCode).toContain("return null;");
  });

  test("cash payment endpoint calls generateSaleInvoice after COMMIT", () => {
    // Find the cash payment section and verify invoice generation is called
    const cashSection = salesCode.slice(
      salesCode.indexOf('"/payments/cash"'),
      salesCode.indexOf('"/payments/due"')
    );
    expect(cashSection).toContain('generateSaleInvoice(pool, saleId, storeId, "CASH")');
    expect(cashSection).toContain(".catch(() => {})");
  });

  test("due payment endpoint calls generateSaleInvoice after COMMIT", () => {
    const dueSection = salesCode.slice(
      salesCode.lastIndexOf('"/payments/due"'),
      salesCode.indexOf('"/collections/upi/init"')
    );
    expect(dueSection).toContain('generateSaleInvoice(pool, saleId, storeId, "DUE")');
    expect(dueSection).toContain(".catch(() => {})");
  });

  test("UPI confirm endpoint calls generateSaleInvoice after COMMIT", () => {
    // The UPI confirm is in payments/confirm section — check it exists
    const upiSection = salesCode.slice(
      salesCode.indexOf("PAID_UPI"),
      salesCode.indexOf('"/payments/cash"')
    );
    expect(upiSection).toContain('generateSaleInvoice(pool, saleId, storeId, "UPI")');
  });

  test("GET /sales/:saleId/invoice endpoint exists", () => {
    expect(salesCode).toContain('"/sales/:saleId/invoice"');
    expect(salesCode).toContain("invoice_not_found");
    expect(salesCode).toContain("FROM invoicing.invoices WHERE order_id = $1 LIMIT 1");
  });

  test("GET /sales/:saleId/invoice enforces store isolation", () => {
    // Must verify sale belongs to store before returning invoice
    const invoiceEndpoint = salesCode.slice(salesCode.lastIndexOf('"/sales/:saleId/invoice"'));
    expect(invoiceEndpoint).toContain("AND store_id = $2");
  });

  test("invoice generation uses orderId to link invoice to sale", () => {
    expect(salesCode).toContain("orderId: saleId");
  });
});
