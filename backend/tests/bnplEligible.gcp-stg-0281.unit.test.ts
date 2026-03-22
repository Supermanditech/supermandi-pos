/**
 * GCP-STG-0281: bnpl_eligible column + backend wiring
 *
 * Verifies:
 * 1. Migration 216 adds bnpl_eligible to catalog.store_products
 * 2. POST handler destructures bnplEligible and includes in INSERT
 * 3. PATCH handler destructures bnplEligible and includes in UPDATE
 */
import * as fs from "fs";
import * as path from "path";

const PRODUCTS_SRC = fs.readFileSync(
  path.resolve(__dirname, "../src/routes/v1/retailer-admin/products.ts"),
  "utf8"
);

const MIGRATION_SRC = fs.readFileSync(
  path.resolve(__dirname, "../migrations/216_gcp_stg_0281_store_products_bnpl.sql"),
  "utf8"
);

describe("GCP-STG-0281: bnpl_eligible on store_products", () => {
  describe("Migration 216", () => {
    test("adds bnpl_eligible column to catalog.store_products", () => {
      expect(MIGRATION_SRC).toContain("ALTER TABLE catalog.store_products");
      expect(MIGRATION_SRC).toContain("bnpl_eligible BOOLEAN DEFAULT false");
    });
  });

  describe("POST handler (product creation)", () => {
    test("destructures bnplEligible from req.body", () => {
      // Find the POST destructuring block (before the first MAX_PRICE_MINOR)
      const postBlock = PRODUCTS_SRC.split("MAX_PRICE_MINOR")[0];
      expect(postBlock).toContain("bnplEligible");
    });

    test("includes bnpl_eligible in INSERT INTO catalog.store_products", () => {
      // Find the first INSERT block
      const insertMatch = PRODUCTS_SRC.match(/INSERT INTO catalog\.store_products\s*\(([\s\S]*?)\)\s*VALUES/);
      expect(insertMatch).not.toBeNull();
      expect(insertMatch![1]).toContain("bnpl_eligible");
    });

    test("passes boolean-coerced value as INSERT parameter", () => {
      expect(PRODUCTS_SRC).toContain("bnplEligible === true || bnplEligible === 'true'");
    });
  });

  describe("PATCH handler (product update)", () => {
    test("destructures bnplEligible from req.body in PATCH", () => {
      // Find the PATCH destructuring (after the POST handler)
      const patchBlock = PRODUCTS_SRC.split("AUD-025-B: Parse incoming timestamp")[0].split("} = req.body;").pop();
      // The last destructuring before AUD-025-B should contain bnplEligible
      expect(PRODUCTS_SRC).toMatch(/bnplEligible.*GCP-STG-0281[\s\S]*?\} = req\.body;[\s\S]*?AUD-025-B/);
    });

    test("includes bnpl_eligible = COALESCE in UPDATE SQL", () => {
      expect(PRODUCTS_SRC).toContain("bnpl_eligible = COALESCE($15, bnpl_eligible)");
    });

    test("LWW guard uses $16 (shifted from $15 after bnpl_eligible addition)", () => {
      expect(PRODUCTS_SRC).toContain("metadata_updated_at < $16");
    });
  });
});
