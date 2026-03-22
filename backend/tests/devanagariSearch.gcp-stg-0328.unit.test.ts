/**
 * GCP-STG-0328: Devanagari script support in SELL search
 *
 * Validates that the SELL search SQL in storeProducts.ts:
 * 1. LEFT JOINs catalog.product_translations (locale='hi') as pt
 * 2. Includes pt.name in the token WHERE clause (ILIKE match)
 * 3. Includes pt.name in the scoring CASE (score 225)
 */
import * as fs from "fs";
import * as path from "path";

describe("GCP-STG-0328: Devanagari script search in SELL", () => {
  const storeProductsPath = path.resolve(
    __dirname,
    "../src/routes/v1/pos/storeProducts.ts"
  );

  let src: string;

  beforeAll(() => {
    src = fs.readFileSync(storeProductsPath, "utf-8");
  });

  test("SELL search JOINs product_translations with locale='hi'", () => {
    expect(src).toContain(
      "LEFT JOIN catalog.product_translations pt ON pt.product_id = p.id AND pt.locale = 'hi'"
    );
  });

  test("SELL search token WHERE clause includes pt.name ILIKE match", () => {
    expect(src).toContain(
      "OR COALESCE(pt.name, '') ILIKE '%' || $"
    );
  });

  test("pt.name ILIKE is inside tokenWhereClauses push block", () => {
    const tokenBlock = src.match(
      /tokenWhereClauses\.push\(`\([\s\S]*?pt\.name[\s\S]*?\)`\)/
    );
    expect(tokenBlock).not.toBeNull();
  });

  test("SELL search scoring includes pt.name match with score 225", () => {
    // Score 225 sits between brand (250) and fuzzy name (200)
    expect(src).toContain(
      "WHEN COALESCE(pt.name, '') ILIKE '%' || $"
    );
    expect(src).toContain("THEN 225");
  });

  test("product_translations JOIN appears after store_product_barcodes JOIN", () => {
    const barcodeJoinIdx = src.indexOf("LEFT JOIN catalog.store_product_barcodes spb");
    const translationJoinIdx = src.indexOf("LEFT JOIN catalog.product_translations pt");
    expect(barcodeJoinIdx).toBeGreaterThan(-1);
    expect(translationJoinIdx).toBeGreaterThan(-1);
    expect(translationJoinIdx).toBeGreaterThan(barcodeJoinIdx);
  });
});
