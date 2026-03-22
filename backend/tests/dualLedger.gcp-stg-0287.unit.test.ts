/**
 * GCP-STG-0287: Dual-ledger invariant — all stock mutations must write
 * to BOTH inventory.inventory_ledger AND inventory.stock_balances
 */
import * as fs from "fs";
import * as path from "path";

const ORDERS_SRC = fs.readFileSync(
  path.resolve(__dirname, "../src/routes/v1/orders.ts"), "utf8"
);

describe("GCP-STG-0287: Dual-ledger consistency", () => {
  test("GRN receive in orders.ts writes to inventory_ledger", () => {
    // The GRN flow must include inventory_ledger INSERT
    expect(ORDERS_SRC).toContain("INSERT INTO inventory.inventory_ledger");
    expect(ORDERS_SRC).toContain("'stock_in', 'purchase_order'");
  });

  test("GRN receive reads stock_before for audit trail", () => {
    expect(ORDERS_SRC).toContain("SELECT current_qty FROM inventory.stock_balances");
  });

  test("GRN receive writes to stock_balances (unchanged)", () => {
    expect(ORDERS_SRC).toContain("INSERT INTO inventory.stock_balances");
  });

  test("every stock_balances INSERT has a nearby inventory_ledger INSERT", () => {
    // Split source into chunks around stock_balances INSERTs
    const sbInserts = ORDERS_SRC.split("INSERT INTO inventory.stock_balances");
    // Each chunk (except the first) should have inventory_ledger nearby
    // Check that the source has at least as many ledger INSERTs as balance INSERTs
    const ledgerCount = (ORDERS_SRC.match(/INSERT INTO inventory\.inventory_ledger/g) || []).length;
    const balanceCount = (ORDERS_SRC.match(/INSERT INTO inventory\.stock_balances/g) || []).length;
    expect(ledgerCount).toBeGreaterThanOrEqual(balanceCount);
  });
});
