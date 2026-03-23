/**
 * GCP-STG-0374: Remove Duplicate Indexes on store_products
 *
 * Validates:
 * 1. Migration 226 drops the two duplicate indexes
 * 2. Migration 226 includes ROLLBACK comment with original CREATE INDEX statements
 * 3. The original indexes (migrations 004, 036) are NOT dropped
 */

import * as fs from "fs";
import * as path from "path";

describe("GCP-STG-0374: Migration 226 — drop duplicate indexes", () => {
  const migrationPath = path.resolve(
    __dirname,
    "../migrations/226_gcp_stg_0374_drop_duplicate_indexes.sql"
  );

  let sql: string;

  beforeAll(() => {
    sql = fs.readFileSync(migrationPath, "utf-8");
  });

  it("migration file exists", () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
  });

  it("drops store_products_store_id_idx (duplicate of store_products_store_idx)", () => {
    expect(sql).toMatch(
      /DROP\s+INDEX\s+IF\s+EXISTS\s+catalog\.store_products_store_id_idx/i
    );
  });

  it("drops idx_store_products_name_trgm (duplicate of idx_store_products_display_name_trgm)", () => {
    expect(sql).toMatch(
      /DROP\s+INDEX\s+IF\s+EXISTS\s+catalog\.idx_store_products_name_trgm/i
    );
  });

  it("does NOT drop the original store_products_store_idx", () => {
    // Should not contain a DROP for the original index
    expect(sql).not.toMatch(
      /DROP\s+INDEX\s+IF\s+EXISTS\s+catalog\.store_products_store_idx\s*;/i
    );
  });

  it("does NOT drop the original idx_store_products_display_name_trgm", () => {
    expect(sql).not.toMatch(
      /DROP\s+INDEX\s+IF\s+EXISTS\s+catalog\.idx_store_products_display_name_trgm/i
    );
  });

  it("includes ROLLBACK comment with CREATE INDEX for store_products_store_id_idx", () => {
    expect(sql).toMatch(/ROLLBACK/i);
    expect(sql).toMatch(
      /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+store_products_store_id_idx/i
    );
  });

  it("includes ROLLBACK comment with CREATE INDEX for idx_store_products_name_trgm", () => {
    expect(sql).toMatch(
      /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_store_products_name_trgm/i
    );
  });
});
