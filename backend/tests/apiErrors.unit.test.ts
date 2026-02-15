// Unit tests for backend/src/lib/apiErrors.ts
import { errorJson } from "../src/lib/apiErrors";

describe("errorJson", () => {
  it("returns object with error.code and error.message", () => {
    const result = errorJson("VALIDATION_ERROR", "Name is required");
    expect(result).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Name is required",
      },
    });
  });

  it("wraps code and message in error envelope", () => {
    const result = errorJson("NOT_FOUND", "Resource not found");
    expect(result.error).toBeDefined();
    expect(result.error.code).toBe("NOT_FOUND");
    expect(result.error.message).toBe("Resource not found");
  });

  it("handles empty strings", () => {
    const result = errorJson("", "");
    expect(result).toEqual({
      error: { code: "", message: "" },
    });
  });

  it("handles special characters in message", () => {
    const result = errorJson("ERR", "Value 'foo' is <invalid> & \"broken\"");
    expect(result.error.message).toBe("Value 'foo' is <invalid> & \"broken\"");
  });

  it("returns a new object each time (no reference sharing)", () => {
    const r1 = errorJson("A", "msg");
    const r2 = errorJson("A", "msg");
    expect(r1).not.toBe(r2);
    expect(r1.error).not.toBe(r2.error);
  });
});
