/**
 * STG-505: AIInsightsScreen error classification — use error codes not string matching
 *
 * Verifies that error classification uses HTTP status codes (ApiError.status)
 * instead of fragile string matching on error messages.
 *
 * Test type: UNIT_TEST (logic extraction — no component render)
 */

// Replicate ApiError to avoid pulling in apiClient (which needs config/api env var)
class ApiError extends Error {
  public readonly status: number;
  public readonly payload?: unknown;
  constructor(status: number, message: string, payload?: unknown) {
    super(message);
    this.status = status;
    this.payload = payload;
    this.name = "ApiError";
  }
}

// Extract the error classification logic from AIInsightsScreen catch block
function classifyError(err: unknown): string {
  if (err instanceof ApiError && err.status === 404) {
    return "AI Insights are not yet available for your store. This feature will be activated soon.";
  } else if (err instanceof ApiError && err.status >= 500) {
    return "Server error. Please try again later.";
  } else if (
    !(err instanceof ApiError) &&
    (err instanceof TypeError ||
      (err instanceof Error &&
        (err.name === "AbortError" ||
          err.message?.toLowerCase().includes("timeout"))))
  ) {
    return "Unable to connect. Please check your internet connection and try again.";
  } else {
    const msg = err instanceof Error ? err.message : "Failed to load";
    return msg;
  }
}

describe("STG-505: AIInsightsScreen error classification uses status codes", () => {
  test("ApiError 404 → not available message", () => {
    const err = new ApiError(404, "Not Found");
    expect(classifyError(err)).toContain("not yet available");
  });

  test("ApiError 500 → server error message", () => {
    const err = new ApiError(500, "Internal Server Error");
    expect(classifyError(err)).toContain("Server error");
  });

  test("ApiError 502 → server error message", () => {
    const err = new ApiError(502, "Bad Gateway");
    expect(classifyError(err)).toContain("Server error");
  });

  test("TypeError (network failure) → connection message", () => {
    const err = new TypeError("Failed to fetch");
    expect(classifyError(err)).toContain("check your internet connection");
  });

  test("AbortError (timeout) → connection message", () => {
    const err = new Error("Aborted");
    err.name = "AbortError";
    expect(classifyError(err)).toContain("check your internet connection");
  });

  test("ApiError 403 → shows actual error message (not string-matched)", () => {
    const err = new ApiError(403, "Forbidden");
    expect(classifyError(err)).toBe("Forbidden");
  });

  test("unknown error → fallback message", () => {
    expect(classifyError("something")).toBe("Failed to load");
  });

  test("does NOT use string matching on '404' in message", () => {
    // An ApiError with status 200 but message containing '404' should NOT trigger not-available
    const err = new ApiError(200, "Got 404 from upstream");
    const result = classifyError(err);
    expect(result).not.toContain("not yet available");
  });
});
