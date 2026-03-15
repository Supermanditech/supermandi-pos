/**
 * STG-506: Migration 128 UNIQUE INDEX — add IF NOT EXISTS guard
 *
 * Verifies that CREATE UNIQUE INDEX statements in migration 128 include
 * IF NOT EXISTS to prevent failures on re-run during recovery.
 *
 * Test type: UNIT_TEST (static analysis — no DB connection)
 */

import * as fs from "fs";
import * as path from "path";

const migrationPath = path.resolve(
  __dirname,
  "../../../backend/migrations/128_t001_relax_gstin_draft_uniqueness.sql"
);

describe("STG-506: Migration 128 has IF NOT EXISTS guards", () => {
  const content = fs.readFileSync(migrationPath, "utf-8");

  test("migration file exists", () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
  });

  test("all CREATE UNIQUE INDEX statements have IF NOT EXISTS", () => {
    const lines = content.split("\n");
    const violations: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip comments
      if (line.trim().startsWith("--")) continue;
      // Match CREATE UNIQUE INDEX without IF NOT EXISTS
      if (
        /CREATE\s+UNIQUE\s+INDEX\b/i.test(line) &&
        !/IF\s+NOT\s+EXISTS/i.test(line)
      ) {
        violations.push(`Line ${i + 1}: ${line.trim()}`);
      }
    }
    expect(violations).toEqual([]);
  });

  test("DROP IF EXISTS precedes each CREATE for defense-in-depth", () => {
    expect(content).toContain("DROP INDEX IF EXISTS auth.ux_applications_gstin_active");
    expect(content).toContain("DROP INDEX IF EXISTS auth.ux_applications_phone_entity_active");
  });
});
