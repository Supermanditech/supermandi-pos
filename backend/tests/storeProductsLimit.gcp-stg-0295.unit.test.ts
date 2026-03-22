/**
 * GCP-STG-0295: POS limit raised from 200 to 500 to match client
 */
import * as fs from "fs";
import * as path from "path";

const SRC = fs.readFileSync(
  path.resolve(__dirname, "../src/routes/v1/pos/storeProducts.ts"), "utf8"
);

describe("GCP-STG-0295: store-products/list limit cap", () => {
  test("limit cap is 500 (not 200)", () => {
    expect(SRC).toContain(", 500)");
    expect(SRC).not.toMatch(/Math\.min\([^)]*,\s*200\)/);
  });

  test("default limit is 50", () => {
    expect(SRC).toContain('|| "50"');
  });
});
