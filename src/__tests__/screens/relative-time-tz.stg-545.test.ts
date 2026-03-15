/**
 * STG-545: Relative time format — handle UTC vs IST
 *
 * Verifies that formatRelativeTime handles timestamps without timezone
 * suffix by treating them as UTC (matching server convention).
 *
 * Test type: UNIT_TEST (static analysis)
 */

import * as fs from "fs";
import * as path from "path";

const filePath = path.resolve(
  __dirname,
  "../../i18n/formatters.ts"
);

describe("STG-545: formatRelativeTime UTC awareness", () => {
  const content = fs.readFileSync(filePath, "utf-8");

  test("handles timestamps without timezone suffix as UTC", () => {
    // Should append 'Z' to strings that lack timezone info
    expect(content).toContain('date + "Z"');
  });

  test("checks for existing timezone suffix before appending Z", () => {
    // Should check for Z suffix and +/-HH:MM offset
    expect(content).toContain('endsWith("Z")');
    expect(content).toContain("[+-]");
  });

  test("STG-545 ticket reference present", () => {
    expect(content).toContain("STG-545");
  });
});
