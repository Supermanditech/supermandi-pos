/**
 * STG-536: Response format — standardize error JSON
 *
 * Verifies that errorHandler middleware emits standardized
 * { error: { code, message } } format instead of { error: "string" }.
 *
 * Test type: UNIT_TEST (static analysis)
 */

import * as fs from "fs";
import * as path from "path";

const handlerPath = path.resolve(
  __dirname,
  "../../../backend/src/middleware/errorHandler.ts"
);
const httpErrorPath = path.resolve(
  __dirname,
  "../../../backend/src/lib/httpError.ts"
);

describe("STG-536: Standardized error JSON format", () => {
  const handler = fs.readFileSync(handlerPath, "utf-8");
  const httpError = fs.readFileSync(httpErrorPath, "utf-8");

  test("errorHandler emits structured error for HttpError", () => {
    expect(handler).toContain('code: err.code ?? "HTTP_ERROR"');
    expect(handler).toContain("message: err.message");
  });

  test("500 fallback uses structured format", () => {
    expect(handler).toContain('code: "INTERNAL_ERROR"');
  });

  test("HttpError class has code property", () => {
    expect(httpError).toContain("public readonly code?: string");
  });
});
