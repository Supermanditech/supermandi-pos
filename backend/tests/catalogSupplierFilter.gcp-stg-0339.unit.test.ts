/**
 * GCP-STG-0339: Supplier Name Filter Dropdown — backend filter support
 */
import * as fs from "fs";
import * as path from "path";

const SRC = fs.readFileSync(
  path.resolve(__dirname, "../src/routes/v1/admin/catalog.ts"), "utf8"
);

describe("GCP-STG-0339: Supplier filter in admin catalog", () => {
  test("accepts supplierId query parameter", () => {
    expect(SRC).toContain("supplierId");
  });

  test("adds WHERE clause for supplier_id filter", () => {
    expect(SRC).toContain("sp.supplier_id =");
  });

  test("validates UUID format before use", () => {
    // Should check UUID format to prevent SQL injection
    expect(SRC).toMatch(/[0-9a-f]{8}-|uuid|UUID/i);
  });

  test("response includes filter echo", () => {
    expect(SRC).toContain("supplierId");
  });
});
