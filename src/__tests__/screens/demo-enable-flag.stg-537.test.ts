/**
 * STG-537: Demo endpoint — add explicit enableDemo flag
 *
 * Verifies that demo/token endpoint requires enableDemo: true
 * in the request body to prevent accidental invocation.
 *
 * Test type: UNIT_TEST (static analysis)
 */

import * as fs from "fs";
import * as path from "path";

const filePath = path.resolve(
  __dirname,
  "../../../backend/src/routes/v1/demo.ts"
);

describe("STG-537: Demo enableDemo flag", () => {
  const content = fs.readFileSync(filePath, "utf-8");

  test("requires enableDemo flag in request body", () => {
    expect(content).toContain("enableDemo");
    expect(content).toContain("DEMO_NOT_ENABLED");
  });

  test("returns 400 when flag is missing", () => {
    expect(content).toMatch(/status\(400\)/);
  });

  test("flag must be boolean true (not truthy)", () => {
    expect(content).toContain("enableDemo !== true");
  });
});
