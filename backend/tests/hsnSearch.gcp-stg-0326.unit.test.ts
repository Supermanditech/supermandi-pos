/**
 * GCP-STG-0326: HSN Code searchable in SELL + BUY search WHERE clauses
 *
 * Validates that both storeProducts.ts (SELL) and catalog.ts (BUY) include
 * hsn_code in their search WHERE clauses so retailers/buyers can search by HSN.
 */
import * as fs from "fs";
import * as path from "path";

describe("GCP-STG-0326: HSN code in search WHERE clauses", () => {
  const storeProductsPath = path.resolve(
    __dirname,
    "../src/routes/v1/pos/storeProducts.ts"
  );
  const catalogPath = path.resolve(
    __dirname,
    "../src/routes/v1/catalog.ts"
  );

  let storeProductsSrc: string;
  let catalogSrc: string;

  beforeAll(() => {
    storeProductsSrc = fs.readFileSync(storeProductsPath, "utf-8");
    catalogSrc = fs.readFileSync(catalogPath, "utf-8");
  });

  test("SELL search (storeProducts.ts) includes p.hsn_code in token WHERE clause", () => {
    // The tokenWhereClauses section should contain hsn_code matching
    expect(storeProductsSrc).toContain(
      "COALESCE(p.hsn_code, '') ILIKE '%' || $"
    );
  });

  test("BUY catalog search (catalog.ts store catalog) includes p.hsn_code in WHERE clause", () => {
    // The store catalog search (sp.display_name / p.name / p.primary_barcode block)
    expect(catalogSrc).toContain(
      "COALESCE(p.hsn_code, '') ILIKE $"
    );
  });

  test("BUY supplier catalog search (catalog.ts) includes sp.hsn_code in token WHERE clause", () => {
    // The multilingual BUY search uses sp.hsn_code (supplier_products table)
    expect(catalogSrc).toContain(
      "COALESCE(sp.hsn_code, '') ILIKE $"
    );
  });

  test("SELL search hsn_code appears inside tokenWhereClauses push block", () => {
    // Verify it's in the right place — inside the tokenWhereClauses.push() block,
    // not just anywhere in the file
    const tokenBlock = storeProductsSrc.match(
      /tokenWhereClauses\.push\(`\([\s\S]*?hsn_code[\s\S]*?\)`\)/
    );
    expect(tokenBlock).not.toBeNull();
  });

  test("BUY search hsn_code appears inside tokenClauses push block", () => {
    // Verify it's in the right place — inside a tokenClauses.push() call
    const tokenBlock = catalogSrc.match(
      /tokenClauses\.push\(`\([\s\S]*?hsn_code[\s\S]*?\)`\)/
    );
    expect(tokenBlock).not.toBeNull();
  });
});
