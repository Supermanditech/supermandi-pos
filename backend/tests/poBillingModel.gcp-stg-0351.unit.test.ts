/**
 * GCP-STG-0351: Verify orders.purchase_orders.billing_model column exists
 * and accepts the expected values.
 *
 * Tests:
 * 1. Migration file exists and contains ADD COLUMN billing_model
 * 2. Migration includes CHECK constraint with both enum values
 * 3. Migration includes ROLLBACK comment
 * 4. Migration uses IF NOT EXISTS (idempotent)
 * 5. orders.ts INSERT references billing_model (confirms wiring)
 */

import * as fs from "fs";
import * as path from "path";

const MIGRATION_DIR = path.resolve(__dirname, "../migrations");
const MIGRATION_FILE = "223_gcp_stg_0351_purchase_orders_billing_model.sql";
const ORDERS_FILE = path.resolve(__dirname, "../src/routes/v1/orders.ts");

describe("GCP-STG-0351: purchase_orders.billing_model migration", () => {
  let migrationSql: string;

  beforeAll(() => {
    const migrationPath = path.join(MIGRATION_DIR, MIGRATION_FILE);
    expect(fs.existsSync(migrationPath)).toBe(true);
    migrationSql = fs.readFileSync(migrationPath, "utf-8");
  });

  test("migration adds billing_model column to orders.purchase_orders", () => {
    expect(migrationSql).toMatch(
      /ALTER\s+TABLE\s+orders\.purchase_orders\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+billing_model/i
    );
  });

  test("column type is VARCHAR(30) with DEFAULT SUPERMANDI_PRINCIPAL", () => {
    expect(migrationSql).toMatch(/VARCHAR\(30\)/i);
    expect(migrationSql).toMatch(/DEFAULT\s+'SUPERMANDI_PRINCIPAL'/i);
  });

  test("CHECK constraint allows both billing model values", () => {
    expect(migrationSql).toMatch(/SUPERMANDI_PRINCIPAL/);
    expect(migrationSql).toMatch(/DIRECT_SUPPLIER/);
    expect(migrationSql).toMatch(/chk_po_billing_model/i);
  });

  test("migration includes ROLLBACK comment", () => {
    expect(migrationSql).toMatch(/-- ROLLBACK:/);
    expect(migrationSql).toMatch(/DROP COLUMN IF EXISTS billing_model/i);
  });

  test("migration is idempotent (IF NOT EXISTS)", () => {
    expect(migrationSql).toMatch(/IF NOT EXISTS/i);
  });

  test("migration drops stale constraints before adding new one", () => {
    expect(migrationSql).toMatch(
      /DROP CONSTRAINT IF EXISTS chk_po_billing_model/i
    );
    expect(migrationSql).toMatch(
      /DROP CONSTRAINT IF EXISTS purchase_orders_billing_model_check/i
    );
  });

  test("orders.ts INSERT references billing_model column", () => {
    const ordersSource = fs.readFileSync(ORDERS_FILE, "utf-8");
    expect(ordersSource).toContain("billing_model");
  });
});
