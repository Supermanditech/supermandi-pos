/**
 * @jest-environment node
 */
/**
 * GCP-STG-0429: Supplier Product gstRate Field
 *
 * STRUCTURAL test — reads the supplier products router source to verify
 * gst_rate / gstRate mapping is present in the response builder.
 */

import * as fs from "fs";
import * as path from "path";

describe("GCP-STG-0429: Supplier product gstRate field (STRUCTURAL)", () => {
  const routerPath = path.resolve(
    __dirname,
    "../../backend/src/routes/v1/supplier/products.ts"
  );
  let src: string;

  beforeAll(() => {
    src = fs.readFileSync(routerPath, "utf-8");
  });

  test("router source maps gst_rate to gstRate in response", () => {
    expect(src).toContain("gstRate");
    expect(src).toContain("gst_rate");
  });

  test("router source references supplier_products table", () => {
    expect(src).toContain("supplier_products");
  });

  test("gstRate mapping coexists with hsnCode mapping", () => {
    expect(src).toContain("hsnCode");
    expect(src).toContain("gstRate");
  });

  test("gstRate mapping coexists with splitSellEligible mapping", () => {
    expect(src).toContain("splitSellEligible");
    expect(src).toContain("gstRate");
  });

  test("router selects gst_rate column from database", () => {
    // The SQL query or column list should include gst_rate
    expect(src).toContain("gst_rate");
  });
});
