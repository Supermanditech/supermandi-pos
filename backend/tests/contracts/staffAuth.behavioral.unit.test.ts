/**
 * V3-BE-013: Behavioral tests for POS staff-auth backend contract.
 *
 * Imports and executes the REAL canonical helpers from staffAuthHelpers.ts —
 * the same module used by the route handler. No re-implemented logic.
 */

import {
  pinLookupHash,
  isValidPinFormat,
  computeLockout,
  isAccountLocked,
  PIN_RATE_LIMIT_MAX,
  PIN_RATE_LIMIT_WINDOW_MS,
  PIN_FORMAT_REGEX,
} from "../../src/services/staffAuthHelpers";

// ─── pinLookupHash: real crypto execution ───

describe("V3-BE-013: pinLookupHash (imported from staffAuthHelpers)", () => {
  it("produces deterministic hash for same store+pin", () => {
    const h1 = pinLookupHash("1234", "store-abc");
    const h2 = pinLookupHash("1234", "store-abc");
    expect(h1).toBe(h2);
    expect(h1.length).toBe(64);
  });

  it("different pins produce different hashes", () => {
    expect(pinLookupHash("1234", "store-abc")).not.toBe(pinLookupHash("5678", "store-abc"));
  });

  it("same pin on different stores produces different hashes (store isolation)", () => {
    expect(pinLookupHash("1234", "store-1")).not.toBe(pinLookupHash("1234", "store-2"));
  });
});

// ─── isValidPinFormat: real regex execution ───

describe("V3-BE-013: isValidPinFormat (imported from staffAuthHelpers)", () => {
  it("accepts 4-digit PIN", () => { expect(isValidPinFormat("1234")).toBe(true); });
  it("accepts 5-digit PIN", () => { expect(isValidPinFormat("12345")).toBe(true); });
  it("accepts 6-digit PIN", () => { expect(isValidPinFormat("123456")).toBe(true); });
  it("rejects 3-digit PIN", () => { expect(isValidPinFormat("123")).toBe(false); });
  it("rejects 7-digit PIN", () => { expect(isValidPinFormat("1234567")).toBe(false); });
  it("rejects non-numeric PIN", () => { expect(isValidPinFormat("abcd")).toBe(false); });
  it("rejects empty string", () => { expect(isValidPinFormat("")).toBe(false); });
});

// ─── computeLockout: real lockout algorithm ───

describe("V3-BE-013: computeLockout (imported from staffAuthHelpers)", () => {
  it("triggers lockout at exactly 5 failures", () => {
    const result = computeLockout(5);
    expect(result.locked).toBe(true);
    if (result.locked) expect(result.lockUntil.getTime()).toBeGreaterThan(Date.now());
  });

  it("does NOT trigger at 4 failures", () => {
    expect(computeLockout(4).locked).toBe(false);
  });

  it("triggers at 6 failures (above threshold)", () => {
    expect(computeLockout(6).locked).toBe(true);
  });

  it("does NOT trigger at 0 failures", () => {
    expect(computeLockout(0).locked).toBe(false);
  });

  it("lockUntil is ~15 minutes in future", () => {
    const result = computeLockout(5);
    if (result.locked) {
      const delta = result.lockUntil.getTime() - Date.now();
      expect(delta).toBeGreaterThan(PIN_RATE_LIMIT_WINDOW_MS - 1000);
      expect(delta).toBeLessThanOrEqual(PIN_RATE_LIMIT_WINDOW_MS);
    }
  });
});

// ─── isAccountLocked: real lockout check ───

describe("V3-BE-013: isAccountLocked (imported from staffAuthHelpers)", () => {
  it("returns true when locked_until is in the future", () => {
    expect(isAccountLocked(new Date(Date.now() + 600000))).toBe(true);
  });

  it("returns false when locked_until is in the past", () => {
    expect(isAccountLocked(new Date(Date.now() - 1000))).toBe(false);
  });

  it("returns false when locked_until is null", () => {
    expect(isAccountLocked(null)).toBe(false);
  });

  it("handles ISO string date from DB", () => {
    expect(isAccountLocked(new Date(Date.now() + 60000).toISOString())).toBe(true);
  });

  it("handles expired ISO string date", () => {
    expect(isAccountLocked(new Date(Date.now() - 60000).toISOString())).toBe(false);
  });
});

// ─── Constants: canonical values ───

describe("V3-BE-013: canonical constants (imported from staffAuthHelpers)", () => {
  it("PIN_RATE_LIMIT_MAX is 5", () => { expect(PIN_RATE_LIMIT_MAX).toBe(5); });
  it("PIN_RATE_LIMIT_WINDOW_MS is 15 minutes", () => { expect(PIN_RATE_LIMIT_WINDOW_MS).toBe(15 * 60 * 1000); });
  it("PIN_FORMAT_REGEX matches 4-6 digit pattern", () => { expect(PIN_FORMAT_REGEX.source).toBe("^\\d{4,6}$"); });
});
