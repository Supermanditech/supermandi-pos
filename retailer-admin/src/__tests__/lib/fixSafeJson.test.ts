/**
 * Phase 10 Testing: FIX-015 safeJson + safeJsonWithError
 * Tests safe JSON parsing helpers that prevent crashes on 500 HTML responses.
 */
import { describe, it, expect } from "vitest";
import { safeJson, safeJsonWithError } from "../../lib/api";

// Helper to create a mock Response
function mockResponse(body: unknown, status = 200, ok = true): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
    headers: new Headers(),
    redirected: false,
    statusText: ok ? "OK" : "Error",
    type: "basic" as ResponseType,
    url: "",
    clone: () => mockResponse(body, status, ok),
    body: null,
    bodyUsed: false,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData()),
    text: () => Promise.resolve(JSON.stringify(body)),
    bytes: () => Promise.resolve(new Uint8Array()),
  } as Response;
}

function mockParseFailResponse(status = 500): Response {
  return {
    ...mockResponse({}, status, false),
    json: () => Promise.reject(new SyntaxError("Unexpected token < in JSON")),
  } as Response;
}

describe("FIX-015: safeJson", () => {
  it("parses valid JSON response", async () => {
    const res = mockResponse({ success: true, data: [1, 2, 3] });
    const result = await safeJson(res);
    expect(result).toEqual({ success: true, data: [1, 2, 3] });
  });

  it("returns null on parse failure (default fallback)", async () => {
    const res = mockParseFailResponse(500);
    const result = await safeJson(res);
    expect(result).toBeNull();
  });

  it("returns custom fallback on parse failure", async () => {
    const res = mockParseFailResponse(500);
    const result = await safeJson(res, { items: [] });
    expect(result).toEqual({ items: [] });
  });

  it("returns empty array fallback", async () => {
    const res = mockParseFailResponse(502);
    const result = await safeJson<string[]>(res, []);
    expect(result).toEqual([]);
  });

  it("handles 200 response with broken JSON body", async () => {
    const res = {
      ...mockResponse({}, 200, true),
      json: () => Promise.reject(new SyntaxError("Bad JSON")),
    } as Response;
    const result = await safeJson(res);
    expect(result).toBeNull();
  });

  it("does not throw — always returns a value", async () => {
    const res = mockParseFailResponse(503);
    await expect(safeJson(res)).resolves.not.toThrow();
  });
});

describe("FIX-015: safeJsonWithError", () => {
  it("returns data on successful response", async () => {
    const res = mockResponse({ id: 1, name: "Store" });
    const result = await safeJsonWithError(res);
    expect(result.data).toEqual({ id: 1, name: "Store" });
    expect(result.error).toBeNull();
  });

  it("returns error from API error response", async () => {
    const res = mockResponse(
      { error: { code: "NOT_FOUND", message: "Store not found" } },
      404,
      false
    );
    const result = await safeJsonWithError(res);
    expect(result.data).toBeNull();
    expect(result.error).toEqual({ code: "NOT_FOUND", message: "Store not found" });
  });

  it("returns fallback error when API returns message without error object", async () => {
    const res = mockResponse({ message: "Invalid request" }, 400, false);
    const result = await safeJsonWithError(res);
    expect(result.data).toBeNull();
    expect(result.error?.code).toBe("API_ERROR");
    expect(result.error?.message).toBe("Invalid request");
  });

  it("returns PARSE_ERROR on 500 with HTML response", async () => {
    const res = mockParseFailResponse(500);
    const result = await safeJsonWithError(res);
    expect(result.data).toBeNull();
    expect(result.error?.code).toBe("PARSE_ERROR");
    expect(result.error?.message).toContain("Server error");
  });

  it("returns PARSE_ERROR with client message on 400 parse failure", async () => {
    const res = mockParseFailResponse(400);
    const result = await safeJsonWithError(res);
    expect(result.data).toBeNull();
    expect(result.error?.code).toBe("PARSE_ERROR");
    expect(result.error?.message).toContain("parse server response");
  });

  it("does not throw — always returns { data, error }", async () => {
    const res = mockParseFailResponse(503);
    const result = await safeJsonWithError(res);
    expect(result).toHaveProperty("data");
    expect(result).toHaveProperty("error");
  });
});
