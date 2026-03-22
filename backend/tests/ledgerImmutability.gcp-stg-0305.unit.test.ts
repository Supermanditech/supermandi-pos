/**
 * GCP-STG-0305: DB trigger prevents financial field mutation on inventory_ledger
 *
 * Verifies migration 217 creates the trigger function and trigger.
 */
import * as fs from "fs";
import * as path from "path";

const MIGRATION_SRC = fs.readFileSync(
  path.resolve(__dirname, "../migrations/217_gcp_stg_0305_ledger_immutability_trigger.sql"),
  "utf8"
);

describe("GCP-STG-0305: Ledger immutability trigger", () => {
  test("creates trigger function in inventory schema", () => {
    expect(MIGRATION_SRC).toContain("CREATE OR REPLACE FUNCTION inventory.prevent_ledger_financial_mutation()");
    expect(MIGRATION_SRC).toContain("RETURNS TRIGGER");
  });

  test("blocks delta_qty modification", () => {
    expect(MIGRATION_SRC).toContain("OLD.delta_qty IS DISTINCT FROM NEW.delta_qty");
  });

  test("blocks stock_before modification", () => {
    expect(MIGRATION_SRC).toContain("OLD.stock_before IS DISTINCT FROM NEW.stock_before");
  });

  test("blocks stock_after modification", () => {
    expect(MIGRATION_SRC).toContain("OLD.stock_after IS DISTINCT FROM NEW.stock_after");
  });

  test("blocks unit_cost modification", () => {
    expect(MIGRATION_SRC).toContain("OLD.unit_cost IS DISTINCT FROM NEW.unit_cost");
  });

  test("raises exception with descriptive message", () => {
    expect(MIGRATION_SRC).toContain("RAISE EXCEPTION");
    expect(MIGRATION_SRC).toContain("Cannot modify financial fields");
  });

  test("creates BEFORE UPDATE trigger on inventory.inventory_ledger", () => {
    expect(MIGRATION_SRC).toContain("CREATE TRIGGER trg_ledger_immutable");
    expect(MIGRATION_SRC).toContain("BEFORE UPDATE ON inventory.inventory_ledger");
    expect(MIGRATION_SRC).toContain("FOR EACH ROW");
  });

  test("uses IS DISTINCT FROM (handles NULL correctly)", () => {
    // IS DISTINCT FROM handles NULL != NULL as false (correct behavior)
    // Regular != would return NULL for NULL comparisons
    const distinctCount = (MIGRATION_SRC.match(/IS DISTINCT FROM/g) || []).length;
    expect(distinctCount).toBe(4); // one per financial field
  });

  test("allows metadata updates (reversed_by_id, updated_at) by not checking them", () => {
    // The trigger should NOT check reversed_by_id, reversed_at, is_reversed, updated_at
    expect(MIGRATION_SRC).not.toContain("OLD.reversed_by_id");
    expect(MIGRATION_SRC).not.toContain("OLD.is_reversed");
    expect(MIGRATION_SRC).not.toContain("OLD.updated_at");
  });

  test("has ROLLBACK comment", () => {
    expect(MIGRATION_SRC).toContain("ROLLBACK:");
    expect(MIGRATION_SRC).toContain("DROP TRIGGER");
    expect(MIGRATION_SRC).toContain("DROP FUNCTION");
  });

  test("is wrapped in BEGIN/COMMIT transaction", () => {
    expect(MIGRATION_SRC).toContain("BEGIN;");
    expect(MIGRATION_SRC).toContain("COMMIT;");
  });
});
