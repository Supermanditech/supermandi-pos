/**
 * GCP-STG-0284: POS /store-products/list returns description, hsnCode, supplierId, supplierName
 *
 * Verifies SQL SELECT and response mapping include the 4 missing fields.
 */
import * as fs from "fs";
import * as path from "path";

const SRC = fs.readFileSync(
  path.resolve(__dirname, "../src/routes/v1/pos/storeProducts.ts"), "utf8"
);

// Extract the /list endpoint section — it's the largest SELECT with conversion_confirmed
// and uses sort: sortFefo which is unique to the /list handler
const listSection = SRC.split("sort: sortFefo")[0] || "";

describe("GCP-STG-0284: store-products/list missing fields", () => {
  describe("SQL SELECT", () => {
    test("includes p.description", () => {
      expect(listSection).toContain("p.description");
    });

    test("includes p.hsn_code", () => {
      expect(listSection).toContain("p.hsn_code");
    });

    test("includes sp.supplier_id", () => {
      expect(listSection).toContain("sp.supplier_id");
    });

    test("includes sup.business_name AS supplier_name", () => {
      expect(listSection).toContain("sup.business_name AS supplier_name");
    });

    test("JOINs supplier.suppliers table", () => {
      expect(listSection).toContain("LEFT JOIN supplier.suppliers sup ON sup.id = sp.supplier_id");
    });
  });

  describe("Response mapping", () => {
    test("maps description from row", () => {
      expect(SRC).toContain("description: row.description");
    });

    test("maps hsnCode from row.hsn_code", () => {
      expect(SRC).toContain("hsnCode: row.hsn_code");
    });

    test("maps supplierId from row.supplier_id", () => {
      expect(SRC).toContain("supplierId: row.supplier_id");
    });

    test("maps supplierName from row.supplier_name", () => {
      expect(SRC).toContain("supplierName: row.supplier_name");
    });
  });
});
