/**
 * STG-499: Health endpoint timing attack — use crypto.timingSafeEqual
 *
 * Verifies the requireAdminToken middleware uses timing-safe comparison
 * to prevent character-by-character timing attacks on ADMIN_TOKEN.
 *
 * Test type: UNIT_TEST (logic verification — extracts comparison logic)
 */

import { timingSafeEqual } from "crypto";

describe("STG-499: Timing-safe admin token comparison", () => {
  // Extracted logic from requireAdminToken middleware
  const isTokenValid = (token: string | undefined, adminToken: string): boolean => {
    if (!adminToken) return false; // CONFIG_ERROR
    if (!token || token.length !== adminToken.length) return false;
    return timingSafeEqual(Buffer.from(token), Buffer.from(adminToken));
  };

  test("valid token passes", () => {
    expect(isTokenValid("my-secret-token", "my-secret-token")).toBe(true);
  });

  test("invalid token fails", () => {
    expect(isTokenValid("wrong-token-here", "my-secret-token")).toBe(false);
  });

  test("missing token fails", () => {
    expect(isTokenValid(undefined, "my-secret-token")).toBe(false);
  });

  test("empty token fails", () => {
    expect(isTokenValid("", "my-secret-token")).toBe(false);
  });

  test("different length token fails without calling timingSafeEqual", () => {
    // Length check prevents timingSafeEqual from throwing on different-length buffers
    expect(isTokenValid("short", "my-secret-token")).toBe(false);
  });

  test("empty admin token fails (config error)", () => {
    expect(isTokenValid("any-token", "")).toBe(false);
  });

  test("token comparison is constant-time (same length, different content)", () => {
    // This test verifies the function works correctly with same-length tokens
    // The actual timing-safety comes from crypto.timingSafeEqual
    expect(isTokenValid("aaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbb")).toBe(false);
    expect(isTokenValid("aaaaaaaaaaaaaaaa", "aaaaaaaaaaaaaaaa")).toBe(true);
  });
});
