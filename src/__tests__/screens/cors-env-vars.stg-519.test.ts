/**
 * STG-519: CORS env var — accept both CORS_ALLOWED_ORIGINS and ALLOWED_ORIGINS
 *
 * Verifies that backend/src/app.ts reads CORS_ALLOWED_ORIGINS with
 * ALLOWED_ORIGINS as a fallback, and filters empty entries.
 *
 * Test type: UNIT_TEST (static analysis)
 */

import * as fs from "fs";
import * as path from "path";

const appPath = path.resolve(
  __dirname,
  "../../../backend/src/app.ts"
);

describe("STG-519: CORS_ALLOWED_ORIGINS env var support", () => {
  const app = fs.readFileSync(appPath, "utf-8");

  test("reads CORS_ALLOWED_ORIGINS as primary env var", () => {
    expect(app).toContain("CORS_ALLOWED_ORIGINS");
  });

  test("falls back to ALLOWED_ORIGINS for backwards compatibility", () => {
    expect(app).toContain(
      "process.env.CORS_ALLOWED_ORIGINS || process.env.ALLOWED_ORIGINS"
    );
  });

  test("filters empty entries from split origins", () => {
    expect(app).toContain(".filter(Boolean)");
  });

  test("fatal error message references both env var names", () => {
    expect(app).toContain("CORS_ALLOWED_ORIGINS or ALLOWED_ORIGINS");
  });
});
