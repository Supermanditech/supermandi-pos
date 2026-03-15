/**
 * STG-541: Search minimum query — allow 1-char search
 *
 * Verifies that SellScanScreen uses search endpoint for 1-char queries
 * instead of falling back to the list endpoint.
 *
 * Test type: UNIT_TEST (static analysis)
 */

import * as fs from "fs";
import * as path from "path";

const filePath = path.resolve(
  __dirname,
  "../../screens/SellScanScreen.tsx"
);

describe("STG-541: Search allows 1-char queries", () => {
  const content = fs.readFileSync(filePath, "utf-8");

  test("minimum query length is 1 (not 2)", () => {
    // Should use < 1 threshold (empty string only goes to list endpoint)
    expect(content).toContain("trimmedQuery.length < 1");
    expect(content).not.toMatch(/trimmedQuery\.length < 2/);
  });

  test("1-char search note is documented", () => {
    expect(content).toContain("STG-541");
  });
});
