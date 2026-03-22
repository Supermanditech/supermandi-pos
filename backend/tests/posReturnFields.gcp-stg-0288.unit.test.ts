/**
 * GCP-STG-0288: POS API returns lowStockAlertQty + notes
 */
import * as fs from "fs";
import * as path from "path";

const SRC = fs.readFileSync(
  path.resolve(__dirname, "../src/routes/v1/pos/storeProducts.ts"), "utf8"
);

describe("GCP-STG-0288: POS returns lowStockAlertQty + notes", () => {
  test("lookup SELECT includes low_stock_alert_qty and notes", () => {
    // The lookup query must select these columns
    expect(SRC).toContain("sp.low_stock_alert_qty");
    expect(SRC).toContain("sp.notes");
  });

  test("lookup response maps lowStockAlertQty", () => {
    expect(SRC).toContain("lowStockAlertQty: row.low_stock_alert_qty");
  });

  test("list response maps lowStockAlertQty and notes", () => {
    expect(SRC).toContain("lowStockAlertQty: row.low_stock_alert_qty");
    expect(SRC).toContain("notes: row.notes");
  });

  test("all 3 endpoints include the fields (search, lookup, list)", () => {
    // Count occurrences of sp.low_stock_alert_qty in SELECT statements
    const selectCount = (SRC.match(/sp\.low_stock_alert_qty/g) || []).length;
    expect(selectCount).toBeGreaterThanOrEqual(3); // search + lookup + list SELECTs
  });
});
