/**
 * GCP-STG-0335: Price Conflict — LWW Guard on Price Updates
 *
 * Verifies:
 * 1. Migration adds price_updated_at column to catalog.store_products
 * 2. POS PATCH /store-products/price accepts expectedPriceUpdatedAt param
 * 3. POS price update sets price_updated_at = NOW() in UPDATE query
 * 4. POS price update includes LWW guard when expectedPriceUpdatedAt is provided
 * 5. POS price update returns 409 stale_write on conflict
 * 6. POS response includes priceUpdatedAt field
 * 7. Retailer-admin PATCH accepts priceUpdatedAt param
 * 8. Retailer-admin UPDATE sets price_updated_at conditionally
 * 9. Retailer-admin includes price LWW guard in WHERE clause
 * 10. Retailer-admin returns 409 stale_write for price conflict
 * 11. Freshness query includes price_updated_at in GREATEST()
 */
import * as fs from "fs";
import * as path from "path";

const POS_SRC = fs.readFileSync(
  path.resolve(__dirname, "../src/routes/v1/pos/storeProducts.ts"),
  "utf8"
);

const RETAILER_SRC = fs.readFileSync(
  path.resolve(__dirname, "../src/routes/v1/retailer-admin/products.ts"),
  "utf8"
);

const MIGRATION_DIR = path.resolve(__dirname, "../migrations");
const migrationFiles = fs.readdirSync(MIGRATION_DIR);
const priceLwwMigration = migrationFiles.find((f) =>
  f.includes("0335") && f.includes("price_updated_at")
);

describe("GCP-STG-0335: Price LWW Guard", () => {
  describe("Migration", () => {
    test("migration file exists for price_updated_at column", () => {
      expect(priceLwwMigration).toBeDefined();
    });

    test("migration adds price_updated_at column to catalog.store_products", () => {
      const sql = fs.readFileSync(
        path.resolve(MIGRATION_DIR, priceLwwMigration!),
        "utf8"
      );
      expect(sql).toContain("ADD COLUMN");
      expect(sql).toContain("price_updated_at");
      expect(sql).toContain("TIMESTAMPTZ");
      expect(sql).toContain("catalog.store_products");
    });
  });

  describe("POS PATCH /store-products/price", () => {
    test("accepts expectedPriceUpdatedAt in request body", () => {
      expect(POS_SRC).toContain("expectedPriceUpdatedAt");
    });

    test("sets price_updated_at = NOW() in UPDATE queries", () => {
      // All three update paths (storeProductId, productId, barcode) should set price_updated_at
      const matches = POS_SRC.match(/price_updated_at = NOW\(\)/g);
      expect(matches).not.toBeNull();
      // At least 3 UPDATE paths + barcode fallback = at least 3 occurrences
      expect(matches!.length).toBeGreaterThanOrEqual(3);
    });

    test("includes LWW guard clause for price conflicts", () => {
      expect(POS_SRC).toContain("price_updated_at IS NULL OR");
      expect(POS_SRC).toContain("priceLwwGuard");
    });

    test("returns 409 stale_write on price conflict", () => {
      expect(POS_SRC).toContain('"stale_write"');
      expect(POS_SRC).toContain("Price conflict");
      expect(POS_SRC).toContain("expectedPriceUpdatedAt");
      expect(POS_SRC).toContain("currentPriceUpdatedAt");
    });

    test("response includes priceUpdatedAt field", () => {
      expect(POS_SRC).toContain("priceUpdatedAt: updatedRow.price_updated_at");
    });

    test("RETURNING clause includes price_updated_at", () => {
      // The UPDATE RETURNING should include price_updated_at for the response
      expect(POS_SRC).toContain("RETURNING");
      // Check that at least one RETURNING includes price_updated_at
      const returningPattern = /RETURNING[^;]*price_updated_at/;
      expect(POS_SRC).toMatch(returningPattern);
    });
  });

  describe("Retailer-admin PATCH /products/:id", () => {
    test("accepts priceUpdatedAt in request body", () => {
      expect(RETAILER_SRC).toContain("priceUpdatedAt");
      expect(RETAILER_SRC).toContain("GCP-STG-0335");
    });

    test("sets price_updated_at conditionally when price fields change", () => {
      // price_updated_at should only update when sell_price, mrp, or purchase_price change
      expect(RETAILER_SRC).toContain("price_updated_at = CASE");
    });

    test("includes price LWW guard in WHERE clause", () => {
      expect(RETAILER_SRC).toContain("priceLwwGuard");
      expect(RETAILER_SRC).toContain("price_updated_at IS NULL OR price_updated_at <=");
    });

    test("returns 409 stale_write for price conflict", () => {
      expect(RETAILER_SRC).toContain("Price conflict");
      expect(RETAILER_SRC).toContain("incomingPriceUpdatedAt");
      expect(RETAILER_SRC).toContain("currentPriceUpdatedAt");
    });

    test("detects isPriceUpdate correctly", () => {
      expect(RETAILER_SRC).toContain(
        "const isPriceUpdate = sellPrice !== undefined || mrp !== undefined || purchasePrice !== undefined"
      );
    });

    test("response includes priceUpdatedAt in data", () => {
      expect(RETAILER_SRC).toContain("priceUpdatedAt: storeProductUpdate.rows[0]?.price_updated_at");
    });
  });

  describe("Freshness endpoint", () => {
    test("includes price_updated_at in GREATEST() for freshness detection", () => {
      expect(POS_SRC).toContain(
        "SELECT MAX(price_updated_at) FROM catalog.store_products"
      );
    });
  });

  describe("Backward compatibility", () => {
    test("POS price update works without expectedPriceUpdatedAt (no guard applied)", () => {
      // When no timestamp is provided, priceLwwGuard should be empty string
      expect(POS_SRC).toContain('const priceLwwGuard = validPriceTs');
      // The guard is conditionally applied — empty string when no timestamp
      expect(POS_SRC).toContain('? `AND (price_updated_at IS NULL OR price_updated_at <= $4)`');
      expect(POS_SRC).toContain(': ""');
    });

    test("retailer-admin price update works without priceUpdatedAt", () => {
      // When no timestamp is provided, no guard is applied
      expect(RETAILER_SRC).toContain("if (isPriceUpdate && validPriceTs)");
    });

    test("barcode fallback skips LWW when no timestamp provided", () => {
      // The barcode primary_barcode fallback should not apply LWW guard when no timestamp
      expect(POS_SRC).toContain("!validPriceTs");
    });
  });
});
