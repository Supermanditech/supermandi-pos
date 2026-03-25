// GCP-STG-0738: Receipt customization structural test
import { describe, it, expect } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";

describe("GCP-STG-0738: Receipt customization", () => {
  it("settingsStore has receiptFooterLine1 and receiptFooterLine2", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../stores/settingsStore.ts"),
      "utf8"
    );
    expect(src).toContain("receiptFooterLine1");
    expect(src).toContain("receiptFooterLine2");
    expect(src).toContain("setReceiptFooterLine1");
    expect(src).toContain("setReceiptFooterLine2");
  });

  it("SettingsScreenV3 has receipt footer TextInputs (MANAGER gated)", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../screens/v3/SettingsScreenV3.tsx"),
      "utf8"
    );
    expect(src).toContain("GCP-STG-0738");
    expect(src).toContain("receipt-footer-line1");
    expect(src).toContain("receipt-footer-line2");
    expect(src).toContain("RECEIPT FOOTER");
    // Verify MANAGER gating
    expect(src).toContain('role !== "MANAGER"');
  });
});
