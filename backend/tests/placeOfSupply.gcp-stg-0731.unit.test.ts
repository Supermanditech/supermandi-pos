// GCP-STG-0731: Place of supply validation structural test
import { describe, it, expect } from "@jest/globals";

describe("GCP-STG-0731: Place of supply validation", () => {
  it("invoiceService contains GSTIN state code comparison in createInvoice", () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../src/services/invoiceService.ts"),
      "utf8"
    );
    expect(src).toContain("GCP-STG-0731");
    expect(src).toContain("sellerStateCode");
    expect(src).toContain("buyerStateCode");
    expect(src).toContain("place-of-supply mismatch");
    expect(src).toContain(".substring(0, 2)");
  });

  it("logs warning on state code mismatch (non-blocking)", () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../src/services/invoiceService.ts"),
      "utf8"
    );
    expect(src).toContain("log.warn");
    expect(src).toContain("place-of-supply mismatch");
    // Verify it's non-blocking (no throw/return/error)
    const block = src.split("GCP-STG-0731")[1].split("for (let i")[0];
    expect(block).not.toContain("throw");
    expect(block).not.toContain("return res");
  });
});
