/**
 * STG-511: Offline stock cache — multi-barcode product merge
 *
 * Verifies that the stock cache has barcode-to-productId aliasing
 * so multi-barcode products resolve to the same stock entry.
 *
 * Test type: UNIT_TEST (static analysis)
 */

import * as fs from "fs";
import * as path from "path";

const cachePath = path.resolve(
  __dirname,
  "../../services/stockCache.ts"
);
const servicePath = path.resolve(
  __dirname,
  "../../services/stockService.ts"
);

describe("STG-511: Multi-barcode stock cache merge", () => {
  const cache = fs.readFileSync(cachePath, "utf-8");
  const service = fs.readFileSync(servicePath, "utf-8");

  test("stockCache has barcodeToProductId alias map", () => {
    expect(cache).toContain("barcodeToProductId");
  });

  test("getCachedStock resolves barcode aliases", () => {
    expect(cache).toContain("barcodeToProductId.get(key)");
  });

  test("registerBarcodeAlias function exported", () => {
    expect(cache).toContain("export function registerBarcodeAlias");
  });

  test("stockService imports registerBarcodeAlias", () => {
    expect(service).toContain("registerBarcodeAlias");
  });

  test("buildStockEntriesFromProducts registers aliases", () => {
    expect(service).toContain("registerBarcodeAlias(barcodeKey, idKey)");
  });
});
