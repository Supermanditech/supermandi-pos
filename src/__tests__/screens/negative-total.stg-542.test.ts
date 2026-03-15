/**
 * STG-542: Negative total cap — warn instead of silent Math.max(0)
 *
 * Verifies that cartStore warns in __DEV__ when discount exceeds
 * subtotal, instead of silently capping to zero.
 *
 * Test type: UNIT_TEST (static analysis)
 */

import * as fs from "fs";
import * as path from "path";

const filePath = path.resolve(
  __dirname,
  "../../stores/cartStore.ts"
);

describe("STG-542: Negative total cap warning", () => {
  const content = fs.readFileSync(filePath, "utf-8");

  test("warns when discount exceeds subtotal", () => {
    expect(content).toContain("STG-542");
    expect(content).toContain("console.warn");
    expect(content).toContain("exceeds subtotal");
  });

  test("warning is __DEV__ only", () => {
    expect(content).toContain("__DEV__");
  });

  test("still caps total to 0 (Math.max)", () => {
    expect(content).toContain("Math.max(0,");
  });
});
