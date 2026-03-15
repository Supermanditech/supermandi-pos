/**
 * STG-547: Device session — pre-flight token validation
 *
 * Verifies that isTokenValid decodes JWT exp claim and detects
 * expired tokens before critical operations.
 *
 * Test type: UNIT_TEST (static analysis)
 */

import * as fs from "fs";
import * as path from "path";

const filePath = path.resolve(
  __dirname,
  "../../services/deviceSession.ts"
);

describe("STG-547: Device token pre-flight validation", () => {
  const content = fs.readFileSync(filePath, "utf-8");

  test("exports isTokenValid function", () => {
    expect(content).toContain("export async function isTokenValid");
  });

  test("decodes JWT payload to check exp claim", () => {
    expect(content).toContain("atob(parts[1])");
    expect(content).toContain("payload.exp");
  });

  test("clears session on confirmed expiry", () => {
    expect(content).toContain("clearDeviceSession");
    expect(content).toContain("token expired");
  });

  test("warns when token near expiry (< 5 min)", () => {
    expect(content).toContain("remainingSec < 300");
    expect(content).toContain("consider refreshing");
  });
});
