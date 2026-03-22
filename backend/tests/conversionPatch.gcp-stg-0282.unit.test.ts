/**
 * GCP-STG-0282: Conversion profile fields accepted on PATCH
 *
 * Verifies PATCH handler destructures and includes procurement_unit,
 * procurement_pack_qty, base_stock_unit, allow_fractional_sell,
 * conversion_precision in the UPDATE SQL.
 */
import * as fs from "fs";
import * as path from "path";

const SRC = fs.readFileSync(
  path.resolve(__dirname, "../src/routes/v1/retailer-admin/products.ts"),
  "utf8"
);

// Split source into POST section and PATCH section
const patchSection = SRC.split("AUD-025-B: Parse incoming timestamp")[0].split("} = req.body;").slice(-1)[0] || "";
const updateSql = SRC.match(/UPDATE catalog\.store_products SET[\s\S]*?RETURNING id, metadata_updated_at/)?.[0] || "";

describe("GCP-STG-0282: Conversion profile fields on PATCH", () => {
  describe("PATCH destructuring", () => {
    // The PATCH handler is after the POST handler. The GCP-STG-0282 comment
    // uniquely identifies the PATCH destructuring block.
    const gcp0282Block = SRC.split("GCP-STG-0282")[1] || "";

    test("destructures procurementUnit from req.body (in PATCH block)", () => {
      expect(gcp0282Block).toContain("procurementUnit");
      // Verify it's before the closing } = req.body
      const beforeBody = gcp0282Block.split("} = req.body;")[0];
      expect(beforeBody).toContain("procurementUnit");
    });

    test("destructures procurementPackQty", () => {
      const beforeBody = gcp0282Block.split("} = req.body;")[0];
      expect(beforeBody).toContain("procurementPackQty");
    });

    test("destructures baseStockUnit", () => {
      const beforeBody = gcp0282Block.split("} = req.body;")[0];
      expect(beforeBody).toContain("baseStockUnit");
    });

    test("destructures allowFractionalSell", () => {
      const beforeBody = gcp0282Block.split("} = req.body;")[0];
      expect(beforeBody).toContain("allowFractionalSell");
    });

    test("destructures conversionPrecision", () => {
      const beforeBody = gcp0282Block.split("} = req.body;")[0];
      expect(beforeBody).toContain("conversionPrecision");
    });
  });

  describe("UPDATE SQL includes conversion columns", () => {
    test("procurement_unit = COALESCE($16, procurement_unit)", () => {
      expect(updateSql).toContain("procurement_unit = COALESCE($16, procurement_unit)");
    });

    test("procurement_pack_qty = COALESCE($17, procurement_pack_qty)", () => {
      expect(updateSql).toContain("procurement_pack_qty = COALESCE($17, procurement_pack_qty)");
    });

    test("base_stock_unit = COALESCE($18, base_stock_unit)", () => {
      expect(updateSql).toContain("base_stock_unit = COALESCE($18, base_stock_unit)");
    });

    test("allow_fractional_sell = COALESCE($19, allow_fractional_sell)", () => {
      expect(updateSql).toContain("allow_fractional_sell = COALESCE($19, allow_fractional_sell)");
    });

    test("conversion_precision = COALESCE($20, conversion_precision)", () => {
      expect(updateSql).toContain("conversion_precision = COALESCE($20, conversion_precision)");
    });
  });

  describe("LWW guard shifted correctly", () => {
    test("LWW guard uses $21 (after 5 conversion params added)", () => {
      expect(SRC).toContain("metadata_updated_at < $21");
    });

    test("LWW guard does NOT use old $16 position", () => {
      expect(SRC).not.toContain("metadata_updated_at < $16");
    });
  });

  describe("updateParams array includes conversion values", () => {
    test("procurementUnit is pushed to params", () => {
      expect(SRC).toContain("procurementUnit || null,");
    });

    test("procurementPackQty is parsed as integer", () => {
      expect(SRC).toContain("parseInt(procurementPackQty)");
    });

    test("allowFractionalSell is boolean-coerced", () => {
      // Must coerce string 'true' to boolean
      expect(SRC).toMatch(/allowFractionalSell === true \|\| allowFractionalSell === 'true'/);
    });

    test("conversionPrecision is clamped 0-6", () => {
      expect(SRC).toContain("Math.min(Math.max(parseInt(conversionPrecision)");
    });
  });
});
