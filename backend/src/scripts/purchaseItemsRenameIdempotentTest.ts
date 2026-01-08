import assert from "assert";
import { getPool } from "../db/client";

const SQL_BLOCK = `
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='purchase_items' AND column_name='product_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='purchase_items' AND column_name='variant_id'
  ) THEN
    ALTER TABLE purchase_items RENAME COLUMN product_id TO variant_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='purchase_items' AND column_name='product_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='purchase_items' AND column_name='variant_id'
  ) THEN
    UPDATE purchase_items
      SET variant_id = COALESCE(variant_id, product_id)
    WHERE variant_id IS NULL AND product_id IS NOT NULL;
  END IF;
END $$;
`;

async function dropTable(): Promise<void> {
  const pool = getPool();
  if (!pool) throw new Error("DATABASE_URL missing; cannot run schema test.");
  await pool.query("DROP TABLE IF EXISTS purchase_items");
}

async function getColumns(): Promise<Set<string>> {
  const pool = getPool();
  if (!pool) throw new Error("DATABASE_URL missing; cannot run schema test.");
  const res = await pool.query(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'purchase_items'
    `
  );
  return new Set(res.rows.map((row) => String(row.column_name)));
}

async function runCaseA(): Promise<void> {
  const pool = getPool();
  if (!pool) throw new Error("DATABASE_URL missing; cannot run schema test.");

  await dropTable();
  await pool.query(`
    CREATE TABLE purchase_items (
      id TEXT PRIMARY KEY,
      product_id TEXT NULL
    )
  `);
  await pool.query(
    `INSERT INTO purchase_items (id, product_id) VALUES ($1, $2)`,
    ["row-a", "prod-a"]
  );
  await pool.query(SQL_BLOCK);

  const columns = await getColumns();
  assert(columns.has("variant_id"), "Case A: variant_id should exist after rename");
  assert(!columns.has("product_id"), "Case A: product_id should be renamed away");

  const row = await pool.query(`SELECT variant_id FROM purchase_items WHERE id = $1`, ["row-a"]);
  assert.strictEqual(row.rows[0]?.variant_id, "prod-a", "Case A: variant_id should carry data");
}

async function runCaseB(): Promise<void> {
  const pool = getPool();
  if (!pool) throw new Error("DATABASE_URL missing; cannot run schema test.");

  await dropTable();
  await pool.query(`
    CREATE TABLE purchase_items (
      id TEXT PRIMARY KEY,
      variant_id TEXT NULL
    )
  `);
  await pool.query(
    `INSERT INTO purchase_items (id, variant_id) VALUES ($1, $2)`,
    ["row-b", "var-b"]
  );
  await pool.query(SQL_BLOCK);

  const columns = await getColumns();
  assert(columns.has("variant_id"), "Case B: variant_id should remain");
  assert(!columns.has("product_id"), "Case B: product_id should not be created");

  const row = await pool.query(`SELECT variant_id FROM purchase_items WHERE id = $1`, ["row-b"]);
  assert.strictEqual(row.rows[0]?.variant_id, "var-b", "Case B: variant_id should be unchanged");
}

async function runCaseC(): Promise<void> {
  const pool = getPool();
  if (!pool) throw new Error("DATABASE_URL missing; cannot run schema test.");

  await dropTable();
  await pool.query(`
    CREATE TABLE purchase_items (
      id TEXT PRIMARY KEY,
      product_id TEXT NULL,
      variant_id TEXT NULL
    )
  `);
  await pool.query(
    `INSERT INTO purchase_items (id, product_id, variant_id) VALUES ($1, $2, $3)`,
    ["row-c1", "prod-c1", null]
  );
  await pool.query(
    `INSERT INTO purchase_items (id, product_id, variant_id) VALUES ($1, $2, $3)`,
    ["row-c2", "prod-c2", "var-c2"]
  );
  await pool.query(SQL_BLOCK);

  const columns = await getColumns();
  assert(columns.has("variant_id"), "Case C: variant_id should remain");
  assert(columns.has("product_id"), "Case C: product_id should remain");

  const row1 = await pool.query(`SELECT variant_id FROM purchase_items WHERE id = $1`, ["row-c1"]);
  assert.strictEqual(row1.rows[0]?.variant_id, "prod-c1", "Case C: variant_id should backfill");

  const row2 = await pool.query(`SELECT variant_id FROM purchase_items WHERE id = $1`, ["row-c2"]);
  assert.strictEqual(row2.rows[0]?.variant_id, "var-c2", "Case C: existing variant_id should remain");
}

async function main(): Promise<void> {
  if (process.env.ALLOW_SCHEMA_TEST !== "1") {
    console.error("Set ALLOW_SCHEMA_TEST=1 to run this script against a test database.");
    process.exit(1);
  }

  const pool = getPool();
  if (!pool) {
    throw new Error("DATABASE_URL missing; cannot run schema test.");
  }

  try {
    await runCaseA();
    console.log("Case A passed (rename product_id -> variant_id).");
    await runCaseB();
    console.log("Case B passed (variant_id only, no changes).");
    await runCaseC();
    console.log("Case C passed (backfill when both columns exist).");
  } finally {
    await dropTable();
    await pool.end();
  }

  console.log("purchase_items rename idempotency tests passed.");
}

main().catch((error) => {
  console.error("purchase_items rename idempotency test failed", error);
  process.exit(1);
});
