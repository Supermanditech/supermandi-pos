/**
 * GCP-STG-0304: BuyScreenV3 uses getGridColumns() instead of hardcoded 3
 */
import * as fs from "fs";
import * as path from "path";

const SRC = fs.readFileSync(
  path.resolve(__dirname, "../../screens/v3/BuyScreenV3.tsx"), "utf8"
);

describe("GCP-STG-0304: BuyScreenV3 responsive grid columns", () => {
  test("uses getGridColumns() for numColumns", () => {
    expect(SRC).toContain("numColumns={getGridColumns()}");
  });

  test("does NOT hardcode numColumns={3}", () => {
    expect(SRC).not.toMatch(/numColumns=\{3\}/);
  });

  test("imports getGridColumns from responsive module", () => {
    expect(SRC).toContain("getGridColumns");
    expect(SRC).toMatch(/import.*getGridColumns.*from.*responsive/);
  });
});
