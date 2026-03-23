/**
 * GCP-STG-0369: SuperAdmin Catalog Categories — Partial Index + Redis Cache
 *
 * Validates:
 * 1. Migration 225 creates idx_sp_active_category partial index
 * 2. Categories endpoint returns cache-first, DB-fallback
 * 3. Cache key and TTL are correct
 */

import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// 1. Migration file validation
// ---------------------------------------------------------------------------
describe("GCP-STG-0369: Migration 225 — idx_sp_active_category", () => {
  const migrationPath = path.resolve(
    __dirname,
    "../migrations/225_gcp_stg_0369_idx_sp_active_category.sql"
  );

  let sql: string;

  beforeAll(() => {
    sql = fs.readFileSync(migrationPath, "utf-8");
  });

  it("migration file exists", () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
  });

  it("creates a partial index on catalog.supplier_products(category) WHERE is_active = true", () => {
    expect(sql).toMatch(/CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_sp_active_category/i);
    expect(sql).toMatch(/ON\s+catalog\.supplier_products\s*\(\s*category\s*\)/i);
    expect(sql).toMatch(/WHERE\s+is_active\s*=\s*true/i);
  });

  it("includes ROLLBACK comment", () => {
    expect(sql).toMatch(/ROLLBACK.*DROP\s+INDEX/i);
  });
});

// ---------------------------------------------------------------------------
// 2. Route file — Redis cache wiring
// ---------------------------------------------------------------------------
describe("GCP-STG-0369: Categories endpoint Redis cache", () => {
  const routePath = path.resolve(
    __dirname,
    "../src/routes/v1/admin/catalog.ts"
  );

  let routeSrc: string;

  beforeAll(() => {
    routeSrc = fs.readFileSync(routePath, "utf-8");
  });

  it("imports cacheGet and cacheSet from redis module", () => {
    expect(routeSrc).toMatch(/import\s*\{[^}]*cacheGet[^}]*\}\s*from\s*["'].*redis["']/);
    expect(routeSrc).toMatch(/import\s*\{[^}]*cacheSet[^}]*\}\s*from\s*["'].*redis["']/);
  });

  it("defines CATEGORIES_CACHE_KEY constant", () => {
    expect(routeSrc).toContain('CATEGORIES_CACHE_KEY = "admin:catalog:categories"');
  });

  it("defines CATEGORIES_CACHE_TTL as 300 seconds (5 minutes)", () => {
    expect(routeSrc).toMatch(/CATEGORIES_CACHE_TTL\s*=\s*300/);
  });

  it("checks cache before DB query in categories handler", () => {
    // cacheGet call should appear before the GROUP BY query
    const cacheGetPos = routeSrc.indexOf("cacheGet<");
    const groupByPos = routeSrc.indexOf("GROUP BY COALESCE(sp.edited_category");
    expect(cacheGetPos).toBeGreaterThan(-1);
    expect(groupByPos).toBeGreaterThan(-1);
    expect(cacheGetPos).toBeLessThan(groupByPos);
  });

  it("populates cache after successful DB query", () => {
    // cacheSet call should appear after GROUP BY query
    const cacheSetPos = routeSrc.indexOf("cacheSet(CATEGORIES_CACHE_KEY");
    const groupByPos = routeSrc.indexOf("GROUP BY COALESCE(sp.edited_category");
    expect(cacheSetPos).toBeGreaterThan(-1);
    expect(cacheSetPos).toBeGreaterThan(groupByPos);
  });
});
