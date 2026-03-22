/**
 * GCP-STG-0310: Product image uses responsive dimensions, not hardcoded 32x32
 */
import * as fs from "fs";
import * as path from "path";

const SRC = fs.readFileSync(
  path.resolve(__dirname, "../../components/v3/ProductTileV3.tsx"), "utf8"
);

describe("GCP-STG-0310: Product image responsive size", () => {
  test("no hardcoded 32x32 image dimensions", () => {
    expect(SRC).not.toMatch(/width:\s*32.*height:\s*32/);
  });

  test("uses styles.productImage for product image", () => {
    expect(SRC).toContain("styles.productImage");
  });

  test("productImage style uses getChipFontSize for responsive sizing", () => {
    expect(SRC).toContain("getChipFontSize() * 3");
  });
});
