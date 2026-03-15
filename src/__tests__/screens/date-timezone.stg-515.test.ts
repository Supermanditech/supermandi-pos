/**
 * STG-515: Date conversion timezone — TIMESTAMPTZ handled safely
 *
 * Verifies that sales route uses instanceof Date check instead of
 * new Date() constructor, and never falls back to generating "now".
 *
 * Test type: UNIT_TEST (static analysis)
 */

import * as fs from "fs";
import * as path from "path";

const salesPath = path.resolve(
  __dirname,
  "../../../backend/src/routes/v1/pos/sales.ts"
);

describe("STG-515: TIMESTAMPTZ date handling in sales", () => {
  const sales = fs.readFileSync(salesPath, "utf-8");

  test("uses instanceof Date for created_at in bills list", () => {
    expect(sales).toContain("row.created_at instanceof Date");
  });

  test("uses instanceof Date for created_at in bill detail", () => {
    expect(sales).toContain("sale.created_at instanceof Date");
  });

  test("never falls back to new Date() for missing created_at", () => {
    // Should NOT have the old pattern: new Date().toISOString() as created_at fallback
    const lines = sales.split("\n");
    const createdAtLines = lines.filter(
      (l) => l.includes("createdAt:") && l.includes("new Date().toISOString()")
    );
    expect(createdAtLines).toHaveLength(0);
  });

  test("has STG-515 comment documenting TIMESTAMPTZ safety", () => {
    expect(sales).toContain("STG-515: TIMESTAMPTZ");
  });
});
