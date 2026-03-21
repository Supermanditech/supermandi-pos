// GCP-STG-0129: Reorder suggestions endpoint — fix missing column references
// Tests that the SQL query doesn't reference non-existent columns

import * as fs from "fs";
import * as path from "path";

const reorderPath = path.resolve(__dirname, "../src/routes/v1/reorder.ts");
const reorderCode = fs.readFileSync(reorderPath, "utf-8");

describe("GCP-STG-0129: Reorder pending endpoint SQL fix", () => {
  test("does NOT reference ssl.credit_limit (column doesn't exist on supplier_store_links)", () => {
    expect(reorderCode).not.toContain("ssl.credit_limit");
  });

  test("does NOT reference ssl.credit_period_days (column doesn't exist anywhere)", () => {
    expect(reorderCode).not.toContain("ssl.credit_period_days");
  });

  test("still references ssl.payment_terms (column exists)", () => {
    expect(reorderCode).toContain('ssl.payment_terms as "paymentTerms"');
  });

  test("GET /stores/:storeId/reorder/pending endpoint exists", () => {
    expect(reorderCode).toContain('"/stores/:storeId/reorder/pending"');
  });

  test("uses V3 catalog schema (store_products + products)", () => {
    expect(reorderCode).toContain("catalog.store_products sp");
    expect(reorderCode).toContain("catalog.products p");
  });

  test("uses V3 inventory schema (stock_balances)", () => {
    expect(reorderCode).toContain("inventory.stock_balances sb");
  });

  test("COALESCE for product name uses display_name first", () => {
    expect(reorderCode).toContain("COALESCE(sp.display_name, p.name)");
  });

  test("COALESCE for stock uses stock_balances first, then store_products", () => {
    expect(reorderCode).toContain("COALESCE(sb.current_qty, sp.current_stock, 0)");
  });

  test("returns empty list on table-not-exist error (42P01)", () => {
    expect(reorderCode).toContain('error.code === "42P01"');
  });
});
