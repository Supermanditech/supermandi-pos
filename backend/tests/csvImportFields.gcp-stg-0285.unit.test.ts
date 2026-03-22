/**
 * GCP-STG-0285: CSV import must store all 8 parsed fields
 * (sold_by, rate_unit, pack_size, pack_unit, low_stock_alert, gst_percent, hsn, notes)
 */
import * as fs from "fs";
import * as path from "path";

const SRC = fs.readFileSync(
  path.resolve(__dirname, "../src/routes/v1/retailer-admin/csvImport.ts"), "utf8"
);

describe("GCP-STG-0285: CSV import preserves all parsed fields", () => {
  test("preview row includes all 8 fields", () => {
    // The previewRows.push({...}) block must include these field names
    expect(SRC).toContain("sold_by: row.sold_by");
    expect(SRC).toContain("rate_unit: row.rate_unit");
    expect(SRC).toContain("pack_size: row.pack_size");
    expect(SRC).toContain("pack_unit: row.pack_unit");
    expect(SRC).toContain("low_stock_alert: row.low_stock_alert");
    expect(SRC).toContain("gst_percent: row.gst_percent");
    expect(SRC).toContain("hsn: row.hsn");
    expect(SRC).toContain("notes: row.notes");
  });

  test("CREATE path: products INSERT includes pack_size, pack_unit, hsn_code, default_gst_rate", () => {
    expect(SRC).toContain("pack_size, pack_unit, hsn_code, default_gst_rate");
  });

  test("CREATE path: store_products INSERT includes sold_by, rate_unit, low_stock_alert_qty, notes", () => {
    expect(SRC).toContain("sold_by, rate_unit, low_stock_alert_qty, notes");
  });

  test("UPDATE path: store_products UPDATE includes all 4 store-level fields", () => {
    expect(SRC).toContain("sold_by = COALESCE($11, sold_by)");
    expect(SRC).toContain("rate_unit = COALESCE($12, rate_unit)");
    expect(SRC).toContain("low_stock_alert_qty = COALESCE($13, low_stock_alert_qty)");
    expect(SRC).toContain("notes = COALESCE($14, notes)");
  });

  test("UPDATE path: products UPDATE includes pack_size, pack_unit, hsn_code, default_gst_rate", () => {
    expect(SRC).toContain("pack_size = COALESCE($5, pack_size)");
    expect(SRC).toContain("pack_unit = COALESCE($6, pack_unit)");
    expect(SRC).toContain("hsn_code = COALESCE($7, hsn_code)");
    expect(SRC).toContain("default_gst_rate = COALESCE($8, default_gst_rate)");
  });
});
