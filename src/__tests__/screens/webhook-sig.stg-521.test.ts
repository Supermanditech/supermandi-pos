/**
 * STG-521: Webhook signature format validation
 *
 * Verifies that the signature format check rejects invalid formats
 * before attempting HMAC comparison.
 *
 * Test type: UNIT_TEST (logic extraction — no server)
 */

// Extract the validation logic from refundWebhook.ts
function isValidSignatureFormat(signature: unknown): boolean {
  return (
    typeof signature === "string" &&
    signature.length >= 64 &&
    /^[a-f0-9]+$/i.test(signature)
  );
}

describe("STG-521: Webhook signature format validation", () => {
  test("valid hex signature (64 chars)", () => {
    const sig = "a".repeat(64);
    expect(isValidSignatureFormat(sig)).toBe(true);
  });

  test("valid hex signature (longer)", () => {
    const sig = "abcdef0123456789".repeat(8);
    expect(isValidSignatureFormat(sig)).toBe(true);
  });

  test("too short signature rejected", () => {
    expect(isValidSignatureFormat("abc123")).toBe(false);
  });

  test("non-hex characters rejected", () => {
    const sig = "g".repeat(64);
    expect(isValidSignatureFormat(sig)).toBe(false);
  });

  test("empty string rejected", () => {
    expect(isValidSignatureFormat("")).toBe(false);
  });

  test("null rejected", () => {
    expect(isValidSignatureFormat(null)).toBe(false);
  });

  test("undefined rejected", () => {
    expect(isValidSignatureFormat(undefined)).toBe(false);
  });

  test("non-string rejected", () => {
    expect(isValidSignatureFormat(12345)).toBe(false);
  });
});
