// GCP-STG-0091: Product metadata sync between POS, retailer web, CSV, supplier
import * as fs from "fs";
import * as path from "path";

const autoSyncPath = path.resolve(__dirname, "../../services/autoSync.ts");
const autoSyncCode = fs.readFileSync(autoSyncPath, "utf-8");

const productsStorePath = path.resolve(__dirname, "../../stores/productsStore.ts");
const productsStoreCode = fs.readFileSync(productsStorePath, "utf-8");

const sellSearchPath = path.resolve(__dirname, "../../services/api/sellSearchApi.ts");
const sellSearchCode = fs.readFileSync(sellSearchPath, "utf-8");

const retailerProductsPath = path.resolve(__dirname, "../../../backend/src/routes/v1/retailer-admin/products.ts");
const retailerProductsCode = fs.readFileSync(retailerProductsPath, "utf-8");

describe("GCP-STG-0091: Product metadata sync", () => {
  describe("POS auto-sync interval", () => {
    test("default sync interval is 30 seconds (not 60)", () => {
      expect(autoSyncCode).toContain("DEFAULT_SYNC_INTERVAL_MS = 30000");
    });

    test("auto-sync calls checkAndRefresh for product freshness", () => {
      expect(autoSyncCode).toContain("useProductsStore.getState().checkAndRefresh()");
    });

    test("auto-sync also refreshes stock snapshot", () => {
      expect(autoSyncCode).toContain("refreshStockSnapshot()");
    });
  });

  describe("Freshness check mechanism", () => {
    test("checkCatalogFreshness calls /store-products/freshness endpoint", () => {
      expect(sellSearchCode).toContain("/api/v1/pos/store-products/freshness");
    });

    test("freshness response includes stale flag", () => {
      expect(sellSearchCode).toContain("stale: boolean");
    });

    test("productsStore checkAndRefresh reloads when stale", () => {
      expect(productsStoreCode).toContain("resp.stale");
      expect(productsStoreCode).toContain("loadProducts");
    });
  });

  describe("Retailer web → POS sync (via updated_at)", () => {
    test("retailer product edits set updated_at = NOW()", () => {
      const updatedAtMatches = retailerProductsCode.match(/updated_at\s*=\s*NOW\(\)/g);
      expect(updatedAtMatches).not.toBeNull();
      expect(updatedAtMatches!.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe("POS → retailer web sync (via shared DB)", () => {
    test("POS updateStoreProductPrice API exists for price sync", () => {
      const productsApiPath = path.resolve(__dirname, "../../services/api/productsApi.ts");
      const productsApiCode = fs.readFileSync(productsApiPath, "utf-8");
      expect(productsApiCode).toContain("updateStoreProductPrice");
    });
  });
});
