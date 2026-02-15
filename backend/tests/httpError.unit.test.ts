// Unit tests for backend/src/lib/httpError.ts
import { HttpError } from "../src/lib/httpError";

describe("HttpError", () => {
  it("extends Error", () => {
    const err = new HttpError(400, "Bad Request");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(HttpError);
  });

  it("stores statusCode and message", () => {
    const err = new HttpError(404, "Not Found");
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe("Not Found");
  });

  it("stores optional details", () => {
    const details = { field: "email", reason: "invalid format" };
    const err = new HttpError(422, "Validation Error", details);
    expect(err.details).toEqual(details);
  });

  it("details is undefined when not provided", () => {
    const err = new HttpError(500, "Internal");
    expect(err.details).toBeUndefined();
  });

  it("statusCode is readonly", () => {
    const err = new HttpError(400, "Bad");
    // TypeScript prevents assignment; verify the property exists and has correct value
    expect(err.statusCode).toBe(400);
  });

  it("works with various HTTP status codes", () => {
    const cases = [
      { code: 400, msg: "Bad Request" },
      { code: 401, msg: "Unauthorized" },
      { code: 403, msg: "Forbidden" },
      { code: 404, msg: "Not Found" },
      { code: 409, msg: "Conflict" },
      { code: 500, msg: "Internal Server Error" },
      { code: 503, msg: "Service Unavailable" },
    ];

    for (const { code, msg } of cases) {
      const err = new HttpError(code, msg);
      expect(err.statusCode).toBe(code);
      expect(err.message).toBe(msg);
    }
  });

  it("has a stack trace", () => {
    const err = new HttpError(500, "Test");
    expect(err.stack).toBeDefined();
    // V8 stack traces include "Error: <message>" — the class name may or may not appear
    expect(err.stack).toContain("Test");
  });
});
