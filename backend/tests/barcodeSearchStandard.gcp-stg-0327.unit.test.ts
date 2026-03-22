/**
 * GCP-STG-0327: Standardize barcode search — SELL exact+ILIKE, BUY exact+ILIKE
 *
 * Validates that both storeProducts.ts (SELL) and catalog.ts (BUY) use:
 *  - Exact barcode match as primary (highest score)
 *  - ILIKE partial barcode match as fallback (lower score)
 */
import * as fs from "fs";
import * as path from "path";

describe("GCP-STG-0327: Barcode search standardization (SELL + BUY)", () => {
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

  // ── SELL search (storeProducts.ts) ──

  test("SELL WHERE clause has exact barcode match (p.primary_barcode = $idx)", () => {
    expect(storeProductsSrc).toContain("p.primary_barcode = $");
  });

  test("SELL WHERE clause has exact store-barcode match (spb.barcode = $idx)", () => {
    expect(storeProductsSrc).toContain("spb.barcode = $");
  });

  test("SELL WHERE clause has ILIKE partial barcode match for p.primary_barcode", () => {
    expect(storeProductsSrc).toContain(
      "p.primary_barcode ILIKE '%' || $"
    );
  });

  test("SELL WHERE clause has ILIKE partial barcode match for spb.barcode", () => {
    expect(storeProductsSrc).toContain(
      "spb.barcode ILIKE '%' || $"
    );
  });

  test("SELL scoring has barcode exact = 1000", () => {
    const scoreBlock = storeProductsSrc.match(
      /tokenScoreCases\.push\(`CASE[\s\S]*?END`\)/
    );
    expect(scoreBlock).not.toBeNull();
    expect(scoreBlock![0]).toContain("THEN 1000");
    // Exact barcode is the first WHEN (highest priority)
    const firstWhen = scoreBlock![0].match(/WHEN\s+(.+?)\s+THEN\s+(\d+)/);
    expect(firstWhen).not.toBeNull();
    expect(firstWhen![2]).toBe("1000");
  });

  test("SELL scoring has barcode ILIKE partial = 600", () => {
    const scoreBlock = storeProductsSrc.match(
      /tokenScoreCases\.push\(`CASE[\s\S]*?END`\)/
    );
    expect(scoreBlock).not.toBeNull();
    expect(scoreBlock![0]).toContain("ILIKE '%' || $");
    expect(scoreBlock![0]).toContain("THEN 600");
  });

  test("SELL barcode ILIKE partial appears inside tokenWhereClauses.push block", () => {
    const tokenBlock = storeProductsSrc.match(
      /tokenWhereClauses\.push\(`\([\s\S]*?primary_barcode ILIKE[\s\S]*?\)`\)/
    );
    expect(tokenBlock).not.toBeNull();
  });

  // ── BUY store catalog search (catalog.ts — store catalog endpoint) ──

  test("BUY store catalog has exact barcode match (p.primary_barcode = $exactIdx)", () => {
    // The store catalog search should have exact match: p.primary_barcode = $N
    // alongside the ILIKE partial
    const storeCatalogSearch = catalogSrc.match(
      /GCP-STG-0327[\s\S]*?whereClause \+= ` AND \([\s\S]*?\)/
    );
    expect(storeCatalogSearch).not.toBeNull();
    expect(storeCatalogSearch![0]).toContain("p.primary_barcode = $");
  });

  test("BUY store catalog still has ILIKE partial barcode match", () => {
    expect(catalogSrc).toContain("p.primary_barcode ILIKE $");
  });

  // ── BUY supplier catalog search (catalog.ts — multilingual token search) ──

  test("BUY supplier catalog has exact barcode match (sp.barcode = $exactIdx)", () => {
    // The multilingual BUY search should have sp.barcode = $exactIdx for exact match
    expect(catalogSrc).toContain("sp.barcode = $");
  });

  test("BUY supplier catalog still has ILIKE partial barcode match", () => {
    expect(catalogSrc).toContain("sp.barcode ILIKE $");
  });

  test("BUY supplier catalog exact barcode appears inside tokenClauses.push block", () => {
    const tokenBlock = catalogSrc.match(
      /tokenClauses\.push\(`\([\s\S]*?sp\.barcode = \$[\s\S]*?\)`\)/
    );
    expect(tokenBlock).not.toBeNull();
  });

  // ── Consistency check ──

  test("Both SELL and BUY have exact barcode match capability", () => {
    // SELL has p.primary_barcode = and spb.barcode =
    expect(storeProductsSrc).toMatch(/p\.primary_barcode = \$/);
    expect(storeProductsSrc).toMatch(/spb\.barcode = \$/);
    // BUY store catalog has p.primary_barcode =
    expect(catalogSrc).toMatch(/p\.primary_barcode = \$/);
    // BUY supplier catalog has sp.barcode =
    expect(catalogSrc).toMatch(/sp\.barcode = \$/);
  });

  test("Both SELL and BUY have ILIKE partial barcode match capability", () => {
    // SELL
    expect(storeProductsSrc).toMatch(/primary_barcode ILIKE/);
    expect(storeProductsSrc).toMatch(/spb\.barcode ILIKE/);
    // BUY
    expect(catalogSrc).toMatch(/primary_barcode ILIKE/);
    expect(catalogSrc).toMatch(/sp\.barcode ILIKE/);
  });
});
