/**
 * STG-520: Admin API key timing-safe response
 *
 * Verifies that verifyAdminApiKey normalizes response timing on miss
 * by hashing a dummy value when no DB row is found.
 *
 * Test type: UNIT_TEST (static analysis — no DB)
 */

import * as fs from "fs";
import * as path from "path";

const filePath = path.resolve(
  __dirname,
  "../../../backend/src/middleware/adminToken.ts"
);

describe("STG-520: Admin API key timing normalization", () => {
  const content = fs.readFileSync(filePath, "utf-8");

  test("hashApiKey called on miss path (rowCount === 0)", () => {
    // After rowCount === 0 check, hashApiKey should be called before returning null
    const missBlock = content.substring(
      content.indexOf("result.rowCount === 0"),
      content.indexOf("result.rowCount === 0") + 200
    );
    expect(missBlock).toContain("hashApiKey");
    expect(missBlock).toContain("timing-normalization");
  });

  test("hashApiKey exists as a function", () => {
    expect(content).toContain("function hashApiKey");
    expect(content).toContain("sha256");
  });
});
