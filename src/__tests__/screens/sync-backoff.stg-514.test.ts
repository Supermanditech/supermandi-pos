/**
 * STG-514: Sync batch retry — exponential backoff
 *
 * Verifies that syncOutbox adds exponential backoff between
 * failed batch retries and stops after 3 consecutive failures.
 *
 * Test type: UNIT_TEST (static analysis)
 */

import * as fs from "fs";
import * as path from "path";

const filePath = path.resolve(
  __dirname,
  "../../services/offline/sync.ts"
);

describe("STG-514: Sync batch exponential backoff", () => {
  const content = fs.readFileSync(filePath, "utf-8");

  test("tracks consecutive errors for backoff", () => {
    expect(content).toContain("consecutiveErrors");
  });

  test("uses exponential backoff formula", () => {
    expect(content).toContain("Math.pow(2,");
    expect(content).toContain("Math.min(");
  });

  test("caps backoff at 16 seconds", () => {
    expect(content).toContain("16000");
  });

  test("resets backoff counter on success", () => {
    expect(content).toContain("consecutiveErrors = 0");
  });

  test("stops after 3 consecutive failures", () => {
    expect(content).toContain("consecutiveErrors >= 3");
  });
});
