/**
 * STG-502: Device token plaintext fallback — warn when SecureStore unavailable
 *
 * Verifies that storage.ts warns via console.warn when falling back
 * to plaintext AsyncStorage because SecureStore is unavailable.
 *
 * Test type: UNIT_TEST (static analysis of source)
 */

import * as fs from "fs";
import * as path from "path";

const filePath = path.resolve(
  __dirname,
  "../../services/api/storage.ts"
);

describe("STG-502: Plaintext fallback warnings", () => {
  const content = fs.readFileSync(filePath, "utf-8");

  test("warns on plaintext read when SecureStore unavailable", () => {
    expect(content).toContain("PLAINTEXT AsyncStorage");
    // Specifically in the getAuthToken path
    const getAuthSection = content.split("export async function getAuthToken")[1]?.split("export async function")[0];
    expect(getAuthSection).toBeDefined();
    expect(getAuthSection).toContain("PLAINTEXT");
    expect(getAuthSection).toContain("console.warn");
  });

  test("warns on plaintext write when SecureStore unavailable", () => {
    const setAuthSection = content.split("export async function setAuthToken")[1]?.split("export async function")[0];
    expect(setAuthSection).toBeDefined();
    expect(setAuthSection).toContain("PLAINTEXT");
    expect(setAuthSection).toContain("console.warn");
  });

  test("warning includes STG-502 ticket reference", () => {
    const warnings = content.match(/console\.warn.*STG-502/g);
    expect(warnings).not.toBeNull();
    expect(warnings!.length).toBeGreaterThanOrEqual(2);
  });
});
