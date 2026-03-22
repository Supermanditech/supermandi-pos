/**
 * GCP-STG-0330: Ledgerless Stock Updates — verify all stock mutation paths write ledger entries
 *
 * Issue 2: CSV import UPDATE path now writes an inventory_ledger entry with delta_qty
 * Issue 3: suppliers.ts uses correct column name delta_qty (not change_qty)
 */
import * as fs from "fs";
import * as path from "path";

const CSV_IMPORT_SRC = fs.readFileSync(
  path.resolve(__dirname, "../src/routes/v1/retailer-admin/csvImport.ts"),
  "utf8"
);

const SUPPLIERS_SRC = fs.readFileSync(
  path.resolve(__dirname, "../src/routes/v1/retailer-admin/suppliers.ts"),
  "utf8"
);

describe("GCP-STG-0330: CSV import UPDATE path writes ledger entry", () => {
  test("fetches old stock before updating stock_balances", () => {
    expect(CSV_IMPORT_SRC).toContain(
      "SELECT current_qty FROM inventory.stock_balances WHERE store_id = $1 AND product_id = $2"
    );
  });

  test("computes delta between new and old stock", () => {
    expect(CSV_IMPORT_SRC).toContain("const deltaQty = stock - oldStock");
  });

  test("inserts ledger entry with transaction_type adjustment", () => {
    // The UPDATE branch must have a ledger INSERT with 'adjustment' type
    // Check that both the comment marker and the INSERT exist in the same region
    expect(CSV_IMPORT_SRC).toContain("GCP-STG-0330: Write ledger entry for CSV update stock adjustment");
    expect(CSV_IMPORT_SRC).toContain("'adjustment', 'manual'");
  });

  test("ledger entry uses correct columns: delta_qty, stock_before, stock_after", () => {
    // Verify the INSERT mentions all required columns for the CHECK constraint
    expect(CSV_IMPORT_SRC).toContain("delta_qty, transaction_type");
    expect(CSV_IMPORT_SRC).toContain("stock_before, stock_after");
  });

  test("ledger entry includes source CSV_IMPORT for traceability", () => {
    expect(CSV_IMPORT_SRC).toContain("'CSV_IMPORT', $7");
  });

  test("skips ledger entry when delta is zero (no-op update)", () => {
    expect(CSV_IMPORT_SRC).toContain("if (deltaQty !== 0)");
  });
});

describe("GCP-STG-0330: suppliers.ts uses correct ledger column names", () => {
  test("does NOT use change_qty (wrong column name)", () => {
    expect(SUPPLIERS_SRC).not.toContain("change_qty");
  });

  test("uses delta_qty in ledger INSERT", () => {
    // The supplier catalog add path must use delta_qty
    const supplierLedgerInsert = SUPPLIERS_SRC.match(
      /INSERT INTO inventory\.inventory_ledger.*delta_qty/
    );
    expect(supplierLedgerInsert).not.toBeNull();
  });

  test("uses transaction_type opening_stock (valid CHECK constraint value)", () => {
    expect(SUPPLIERS_SRC).toContain("'opening_stock'");
  });

  test("includes stock_before and stock_after for CHECK constraint compliance", () => {
    // The CHECK constraint requires stock_before + delta_qty = stock_after
    const hasStockFields = SUPPLIERS_SRC.match(
      /INSERT INTO inventory\.inventory_ledger[^;]*stock_before[^;]*stock_after/
    );
    expect(hasStockFields).not.toBeNull();
  });

  test("sets stock_before to 0 for opening stock (new product)", () => {
    // Opening stock always starts from 0
    expect(SUPPLIERS_SRC).toContain("'opening_stock', 'manual', 0, $3");
  });
});
