/**
 * GCP-STG-0309: caseSize/packSize populated in POS API responses
 */
import * as fs from "fs";
import * as path from "path";

const SRC = fs.readFileSync(
  path.resolve(__dirname, "../src/routes/v1/pos/storeProducts.ts"), "utf8"
);

describe("GCP-STG-0309: caseSize/packSize in POS API", () => {
  test("all 3 SELECTs include p.pack_size and p.pack_unit", () => {
    const packSizeCount = (SRC.match(/p\.pack_size/g) || []).length;
    const packUnitCount = (SRC.match(/p\.pack_unit/g) || []).length;
    expect(packSizeCount).toBeGreaterThanOrEqual(3);
    expect(packUnitCount).toBeGreaterThanOrEqual(3);
  });

  test("response maps caseSize from pack_size", () => {
    const caseSizeCount = (SRC.match(/caseSize: row\.pack_size/g) || []).length;
    expect(caseSizeCount).toBeGreaterThanOrEqual(3);
  });

  test("response maps packUnit", () => {
    const packUnitCount = (SRC.match(/packUnit: row\.pack_unit/g) || []).length;
    expect(packUnitCount).toBeGreaterThanOrEqual(3);
  });
});
