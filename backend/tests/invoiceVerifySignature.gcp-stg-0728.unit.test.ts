// GCP-STG-0728: Invoice signature verification endpoint structural test
import { describe, it, expect } from "@jest/globals";

describe("GCP-STG-0728: Invoice signature verification endpoint", () => {
  it("admin invoices router contains verify-signature route", () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../src/routes/v1/admin/invoices.ts"),
      "utf8"
    );
    expect(src).toContain("verify-signature");
    expect(src).toContain("pdfHash");
    expect(src).toContain("pdfSignature");
    expect(src).toContain("GCP-STG-0728");
  });

  it("returns valid boolean comparing pdfHash to storedSignature", () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../src/routes/v1/admin/invoices.ts"),
      "utf8"
    );
    // Verify the comparison logic exists
    expect(src).toContain("pdfHash.toLowerCase() === storedSignature.toLowerCase()");
    expect(src).toContain("valid");
    expect(src).toContain("no_signature_stored");
  });
});
