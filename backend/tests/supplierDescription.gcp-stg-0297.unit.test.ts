/**
 * GCP-STG-0297: description column on supplier_products
 */
import * as fs from "fs";
import * as path from "path";

const MIGRATION = fs.readFileSync(
  path.resolve(__dirname, "../migrations/219_gcp_stg_0297_supplier_products_description.sql"), "utf8"
);

const SRC = fs.readFileSync(
  path.resolve(__dirname, "../src/routes/v1/supplier/products.ts"), "utf8"
);

describe("GCP-STG-0297: supplier_products description column", () => {
  test("migration adds description TEXT column", () => {
    expect(MIGRATION).toContain("ADD COLUMN IF NOT EXISTS description TEXT");
    expect(MIGRATION).toContain("catalog.supplier_products");
  });

  test("supplier products route references description in POST", () => {
    expect(SRC).toContain("description");
  });

  test("supplier products route handles description in PATCH", () => {
    expect(SRC).toContain("description = $");
  });
});
