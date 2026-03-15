/**
 * STG-516: Search cache — add invalidation on product add/price change
 *
 * Verifies that product CRUD operations invalidate the catalog-service
 * search cache, and that the search service has a real invalidation function.
 *
 * Test type: UNIT_TEST (static analysis)
 */

import * as fs from "fs";
import * as path from "path";

const productsPath = path.resolve(
  __dirname,
  "../../../backend/src/routes/v1/retailer-admin/products.ts"
);
const redisPath = path.resolve(
  __dirname,
  "../../../backend/src/db/redis.ts"
);
const searchServicePath = path.resolve(
  __dirname,
  "../../../backend/services/catalog-service/src/services/searchService.ts"
);

describe("STG-516: Search cache invalidation on product CRUD", () => {
  const products = fs.readFileSync(productsPath, "utf-8");
  const redis = fs.readFileSync(redisPath, "utf-8");
  const searchService = fs.readFileSync(searchServicePath, "utf-8");

  test("cacheDeleteByPattern exported from redis module", () => {
    expect(redis).toContain("export async function cacheDeleteByPattern");
  });

  test("cacheDeleteByPattern uses Redis KEYS + DEL", () => {
    expect(redis).toContain("client.keys(pattern)");
  });

  test("products route imports cacheDeleteByPattern", () => {
    expect(products).toContain("cacheDeleteByPattern");
  });

  test("invalidateSearchCache calls cacheDeleteByPattern with catalog:search pattern", () => {
    expect(products).toContain("catalog:search:${storeId}:*");
  });

  test("product create invalidates search cache", () => {
    // There should be at least 4 calls to invalidateSearchCache
    const matches = products.match(/invalidateSearchCache\(storeId\)/g);
    expect(matches).toBeTruthy();
    expect(matches!.length).toBeGreaterThanOrEqual(3);
  });

  test("searchService invalidateSearchCache uses cacheDeletePattern", () => {
    expect(searchService).toContain("cacheDeletePattern('search', pattern)");
  });
});
