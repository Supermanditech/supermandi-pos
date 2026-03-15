/**
 * STG-517: Supplier price cache — reduce TTL from 5min to 2min
 *
 * Verifies that catalog cache TTL default is 120s (2 minutes)
 * instead of the previous 300s (5 minutes).
 *
 * Test type: UNIT_TEST (static analysis)
 */

import * as fs from "fs";
import * as path from "path";

const filePath = path.resolve(
  __dirname,
  "../../../backend/services/catalog-service/src/config.ts"
);

describe("STG-517: Catalog cache TTL reduction", () => {
  const content = fs.readFileSync(filePath, "utf-8");

  test("catalogTtl default is 120 seconds", () => {
    expect(content).toContain("'CACHE_CATALOG_TTL', 120");
  });

  test("searchTtl is also 120 seconds", () => {
    expect(content).toContain("'CACHE_SEARCH_TTL', 120");
  });

  test("TTL is configurable via env var", () => {
    expect(content).toContain("CACHE_CATALOG_TTL");
  });
});
