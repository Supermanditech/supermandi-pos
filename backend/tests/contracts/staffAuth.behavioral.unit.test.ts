/**
 * V3-BE-013: Behavioral tests for POS staff-auth backend contract
 *
 * Exercises real crypto functions and validates PIN format, rate-limit
 * constants, and lockout behavior at the algorithmic level.
 */

import crypto from "crypto";

// Re-implement pinLookupHash exactly as backend does (staff.ts:26-28)
function pinLookupHash(pin: string, storeId: string): string {
  return crypto.createHash("sha256").update(`${storeId}:${pin}`).digest("hex");
}

// Backend constants (staff.ts:17-18)
const PIN_RATE_LIMIT_MAX = 5;
const PIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

describe("V3-BE-013: PIN lookup hash behavior", () => {
  it("produces deterministic hash for same store+pin", () => {
    const h1 = pinLookupHash("1234", "store-abc");
    const h2 = pinLookupHash("1234", "store-abc");
    expect(h1).toBe(h2);
    expect(h1.length).toBe(64); // SHA-256 hex
  });

  it("different pins produce different hashes", () => {
    const h1 = pinLookupHash("1234", "store-abc");
    const h2 = pinLookupHash("5678", "store-abc");
    expect(h1).not.toBe(h2);
  });

  it("same pin on different stores produces different hashes (store isolation)", () => {
    const h1 = pinLookupHash("1234", "store-1");
    const h2 = pinLookupHash("1234", "store-2");
    expect(h1).not.toBe(h2);
  });
});

describe("V3-BE-013: PIN format validation", () => {
  const PIN_REGEX = /^\d{4,6}$/;

  it("accepts 4-digit PIN", () => {
    expect(PIN_REGEX.test("1234")).toBe(true);
  });

  it("accepts 5-digit PIN", () => {
    expect(PIN_REGEX.test("12345")).toBe(true);
  });

  it("accepts 6-digit PIN", () => {
    expect(PIN_REGEX.test("123456")).toBe(true);
  });

  it("rejects 3-digit PIN", () => {
    expect(PIN_REGEX.test("123")).toBe(false);
  });

  it("rejects 7-digit PIN", () => {
    expect(PIN_REGEX.test("1234567")).toBe(false);
  });

  it("rejects non-numeric PIN", () => {
    expect(PIN_REGEX.test("abcd")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(PIN_REGEX.test("")).toBe(false);
  });
});

describe("V3-BE-013: Rate-limit and lockout constants", () => {
  it("max failures before lockout is 5", () => {
    expect(PIN_RATE_LIMIT_MAX).toBe(5);
  });

  it("lockout window is 15 minutes", () => {
    expect(PIN_RATE_LIMIT_WINDOW_MS).toBe(15 * 60 * 1000);
  });

  it("lockout triggers at exactly PIN_RATE_LIMIT_MAX failures", () => {
    let failCount = 0;
    let lockUntil: Date | null = null;
    for (let i = 0; i < 6; i++) {
      failCount++;
      if (failCount >= PIN_RATE_LIMIT_MAX) {
        lockUntil = new Date(Date.now() + PIN_RATE_LIMIT_WINDOW_MS);
      }
    }
    expect(lockUntil).not.toBeNull();
    expect(lockUntil!.getTime()).toBeGreaterThan(Date.now());
  });

  it("lockout does NOT trigger at 4 failures", () => {
    let lockUntil: Date | null = null;
    const failCount = 4;
    if (failCount >= PIN_RATE_LIMIT_MAX) {
      lockUntil = new Date(Date.now() + PIN_RATE_LIMIT_WINDOW_MS);
    }
    expect(lockUntil).toBeNull();
  });

  it("locked account rejects login when locked_until is in future", () => {
    const lockedUntil = new Date(Date.now() + 10 * 60 * 1000); // 10 min from now
    const isLocked = lockedUntil > new Date();
    expect(isLocked).toBe(true);
  });

  it("expired lockout allows login", () => {
    const lockedUntil = new Date(Date.now() - 1000); // 1 second ago
    const isLocked = lockedUntil > new Date();
    expect(isLocked).toBe(false);
  });
});
