/**
 * GCP-STG-0293: BUY detail sheet barcode — not undefined
 *
 * Verifies BuyScreenV3 passes detailProduct.barcode to the detail sheet
 * instead of hardcoded undefined.
 */
import * as fs from "fs";
import * as path from "path";

const SRC = fs.readFileSync(
  path.resolve(__dirname, "../../screens/v3/BuyScreenV3.tsx"), "utf8"
);

describe("GCP-STG-0293: BUY detail sheet barcode", () => {
  test("does NOT pass barcode: undefined to ProductDetailSheetV3", () => {
    // Must not have the literal "barcode: undefined" without any product reference
    expect(SRC).not.toMatch(/barcode:\s*undefined\s*,/);
  });

  test("passes detailProduct.barcode to the detail sheet", () => {
    expect(SRC).toContain("detailProduct.barcode");
  });

  test("uses nullish coalescing for barcode (handles null from API)", () => {
    // Should be detailProduct.barcode ?? undefined (not just detailProduct.barcode)
    expect(SRC).toContain("detailProduct.barcode ??");
  });
});
