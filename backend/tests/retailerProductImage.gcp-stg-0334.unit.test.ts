/**
 * GCP-STG-0334: Retailer Web GET /products returns image_url
 *
 * Verifies:
 * 1. SELECT query includes COALESCE(sp.image_url, p.image_url) for fallback
 * 2. Response mapping includes image_url field from row.imageUrl
 */
import * as fs from "fs";
import * as path from "path";

const PRODUCTS_SRC = fs.readFileSync(
  path.resolve(__dirname, "../src/routes/v1/retailer-admin/products.ts"),
  "utf8"
);

describe("GCP-STG-0334: Retailer GET /products returns image_url", () => {
  describe("SELECT query", () => {
    test("includes COALESCE(sp.image_url, p.image_url) in the list query", () => {
      // The GET /products SELECT should coalesce store-level over product-level image
      expect(PRODUCTS_SRC).toContain('COALESCE(sp.image_url, p.image_url)');
    });

    test("aliases the coalesced image_url as imageUrl", () => {
      expect(PRODUCTS_SRC).toContain('COALESCE(sp.image_url, p.image_url) AS "imageUrl"');
    });
  });

  describe("Response mapping", () => {
    test("maps row.imageUrl to image_url in response data", () => {
      // The response mapping should output image_url for frontend compatibility
      expect(PRODUCTS_SRC).toContain("image_url: row.imageUrl || null");
    });
  });
});
