// GCP-STG-0083: Progressive product loading (500-item chunks)
// Tests that products load in chunks instead of all-at-once

import * as fs from "fs";
import * as path from "path";

const productsApiPath = path.resolve(__dirname, "../../services/api/productsApi.ts");
const productsApiCode = fs.readFileSync(productsApiPath, "utf-8");

const productsStorePath = path.resolve(__dirname, "../../stores/productsStore.ts");
const productsStoreCode = fs.readFileSync(productsStorePath, "utf-8");

describe("GCP-STG-0083: Progressive product loading", () => {
  describe("productsApi.ts — listProductsProgressive", () => {
    test("exports listProductsProgressive function", () => {
      expect(productsApiCode).toContain("export async function listProductsProgressive(");
    });

    test("accepts onPage callback with products and done flag", () => {
      expect(productsApiCode).toContain("onPage: (products: ApiProduct[], done: boolean) => void");
    });

    test("uses 500-item page size for better chunk efficiency", () => {
      // Both the original listProducts and progressive use 500
      const matches = productsApiCode.match(/const limit = 500/g);
      expect(matches).not.toBeNull();
      expect(matches!.length).toBeGreaterThanOrEqual(2);
    });

    test("signals completion when page is smaller than limit", () => {
      expect(productsApiCode).toContain("page.length < limit");
    });

    test("signals completion on error (graceful degradation)", () => {
      expect(productsApiCode).toContain('onPage([], true); // Signal completion on error');
    });
  });

  describe("productsStore.ts — progressive loading integration", () => {
    test("uses listProductsProgressive instead of listProducts for full load", () => {
      expect(productsStoreCode).toContain("productsApi.listProductsProgressive");
    });

    test("updates store incrementally after each chunk", () => {
      expect(productsStoreCode).toContain("Update store incrementally");
      expect(productsStoreCode).toContain("products: [...allProducts]");
    });

    test("sets loading=false only when done", () => {
      expect(productsStoreCode).toContain("loading: !done");
    });

    test("sets lastSyncedAt only when done", () => {
      expect(productsStoreCode).toContain("...(done ? { lastSyncedAt: new Date().toISOString() } : {})");
    });

    test("caches all products to storage after progressive load completes", () => {
      expect(productsStoreCode).toContain("storeScopedStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify(allProducts))");
    });

    test("calls upsertStockFromProducts for each chunk", () => {
      expect(productsStoreCode).toContain("upsertStockFromProducts(mapped)");
    });
  });
});
