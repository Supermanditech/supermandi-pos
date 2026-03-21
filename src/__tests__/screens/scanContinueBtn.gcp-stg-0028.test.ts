// GCP-STG-0028: Scan screen "Continue" button after not-found result
import * as fs from "fs";
import * as path from "path";

const scanPath = path.resolve(__dirname, "../../screens/v3/ScanScreenV3.tsx");
const scanCode = fs.readFileSync(scanPath, "utf-8");

describe("GCP-STG-0028: Scan screen Continue button", () => {
  test("Continue button exists with testID", () => {
    expect(scanCode).toContain('testID="scan-continue-btn"');
  });

  test("Continue button clears lastResult and barcodeInput", () => {
    expect(scanCode).toContain("setLastResult(null)");
    expect(scanCode).toContain('setBarcodeInput("")');
  });

  test("Continue button has accessible label", () => {
    expect(scanCode).toContain('accessibilityLabel="Continue scanning"');
  });

  test("Continue and New Product buttons are in a row layout", () => {
    expect(scanCode).toContain('flexDirection: "row"');
  });

  test("continueBtn style exists", () => {
    expect(scanCode).toContain("continueBtn:");
    expect(scanCode).toContain("continueBtnText:");
  });

  test("New Product button still exists", () => {
    expect(scanCode).toContain('testID="scan-new-product-btn"');
  });
});
