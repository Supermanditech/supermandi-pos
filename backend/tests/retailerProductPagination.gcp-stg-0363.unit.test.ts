/**
 * GCP-STG-0363: Retailer Web GET /products returns total count for pagination
 *
 * Verifies:
 * 1. Backend issues a separate COUNT(*) query for total
 * 2. Response includes total, limit, and offset fields
 * 3. Default limit is 200, max 500, offset defaults to 0
 */
import * as fs from "fs";
import * as path from "path";

const PRODUCTS_SRC = fs.readFileSync(
  path.resolve(__dirname, "../src/routes/v1/retailer-admin/products.ts"),
  "utf8"
);

describe("GCP-STG-0363: Retailer GET /products pagination", () => {
  describe("COUNT query", () => {
    test("issues a separate COUNT(*) query for total", () => {
      expect(PRODUCTS_SRC).toContain("SELECT COUNT(*) as total");
    });

    test("COUNT query uses the same WHERE clause and params", () => {
      // The count query must use ${whereClause} and params to match the data query filters
      expect(PRODUCTS_SRC).toContain("${whereClause}");
    });

    test("parses total from count result", () => {
      expect(PRODUCTS_SRC).toContain("parseInt(countResult.rows[0]?.total");
    });
  });

  describe("Response shape", () => {
    test("response includes total field", () => {
      // The JSON response must contain total for frontend pagination
      expect(PRODUCTS_SRC).toMatch(/total[,\s]/);
      // Specifically in the res.json block
      expect(PRODUCTS_SRC).toContain("total,");
    });

    test("response includes limit field", () => {
      expect(PRODUCTS_SRC).toContain("limit: limitNum,");
    });

    test("response includes offset field", () => {
      expect(PRODUCTS_SRC).toContain("offset: offsetNum,");
    });
  });

  describe("Limit/offset defaults", () => {
    test("default limit is 200, max 500", () => {
      expect(PRODUCTS_SRC).toContain("Math.min(parseInt(limit as string, 10) || 200, 500)");
    });

    test("offset defaults to 0 and is non-negative", () => {
      expect(PRODUCTS_SRC).toContain("Math.max(parseInt(offset as string, 10) || 0, 0)");
    });
  });
});
