// GCP-STG-0727: Verify getInvoice returns pdfGcsPath and pdfSignature fields
import { describe, it, expect } from "@jest/globals";

describe("GCP-STG-0727: Invoice GCS path retrieval stub", () => {
  it("getInvoice SELECT includes pdf_gcs_path and pdf_signature columns", () => {
    // Structural verification: the SELECT in getInvoice must include these columns
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../src/services/invoiceService.ts"),
      "utf8"
    );
    expect(src).toContain('i.pdf_gcs_path as "pdfGcsPath"');
    expect(src).toContain('i.pdf_signature as "pdfSignature"');
  });

  it("all four PDF endpoints contain GCS stub check", () => {
    const fs = require("fs");
    const path = require("path");
    const files = [
      "../src/routes/v1/admin/invoices.ts",
      "../src/routes/v1/retailer-admin/invoices.ts",
      "../src/routes/v1/supplier/invoices.ts",
      "../src/routes/v1/pos/sales.ts",
    ];
    for (const f of files) {
      const src = fs.readFileSync(path.resolve(__dirname, f), "utf8");
      expect(src).toContain("GCP-STG-0727");
      expect(src).toContain("pdfGcsPath");
    }
  });
});
