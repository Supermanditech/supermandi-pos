/**
 * STG-522: Error handler — stop leaking DB details
 *
 * Verifies that errorHandler always returns "Internal server error"
 * regardless of environment, never exposing internal error messages.
 *
 * Test type: UNIT_TEST (static analysis)
 */

import * as fs from "fs";
import * as path from "path";

const filePath = path.resolve(
  __dirname,
  "../../../backend/src/middleware/errorHandler.ts"
);

describe("STG-522: Error handler never leaks internal details", () => {
  const content = fs.readFileSync(filePath, "utf-8");

  test("does not conditionally expose error messages based on NODE_ENV", () => {
    // The old pattern: process.env.NODE_ENV === 'production' ? "Internal server error" : err.message
    // This should NOT exist anymore
    expect(content).not.toMatch(
      /NODE_ENV.*===.*production.*\?.*Internal server error.*:.*err\.message/
    );
  });

  test("always returns generic error message", () => {
    // The 500 response should always include "Internal server error"
    const lines = content.split("\n");
    const responseLines = lines.filter(
      (l) => l.includes("500") && l.includes("json")
    );
    for (const line of responseLines) {
      expect(line).toContain("Internal server error");
    }
  });

  test("logs full error details server-side", () => {
    expect(content).toContain("log.error");
    expect(content).toContain("err.message");
    expect(content).toContain("err.stack");
  });
});
