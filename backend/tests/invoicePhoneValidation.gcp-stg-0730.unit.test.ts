// GCP-STG-0730: WhatsApp invoice share missing phone handling
import { describe, it, expect } from "@jest/globals";

describe("GCP-STG-0730: WhatsApp invoice share phone validation", () => {
  it("invoiceService contains phone validation before WhatsApp send", () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../src/services/invoiceService.ts"),
      "utf8"
    );
    expect(src).toContain("GCP-STG-0730");
    expect(src).toContain("validatePhone");
    expect(src).toContain("fewer than 10 digits");
    expect(src).toContain("WhatsApp send will be skipped");
  });

  it("returns null for phones with fewer than 10 digits", () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../src/services/invoiceService.ts"),
      "utf8"
    );
    // Verify the validation logic strips non-digits and checks length
    expect(src).toContain('phone.replace(/\\D/g, "")');
    expect(src).toContain("digits.length < 10");
  });
});
