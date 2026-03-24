/**
 * V3-BE-013: Pure helpers for POS staff PIN authentication.
 * Extracted from routes/v1/pos/staff.ts for testability.
 * Both the route handler and tests import from here — single source of truth.
 */

import crypto from "crypto";

/** Max failed PIN attempts before lockout */
export const PIN_RATE_LIMIT_MAX = 5;

/** Lockout window in milliseconds (15 minutes) */
export const PIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

/** PIN format: 4-6 digits only */
export const PIN_FORMAT_REGEX = /^\d{4,6}$/;

/**
 * Compute store-scoped PIN lookup hash.
 * SHA-256 of "storeId:pin" — used for PIN-only auth without phone number.
 */
export function pinLookupHash(pin: string, storeId: string): string {
  return crypto.createHash("sha256").update(`${storeId}:${pin}`).digest("hex");
}

/**
 * Validate PIN format: 4-6 digits.
 */
export function isValidPinFormat(pin: string): boolean {
  return PIN_FORMAT_REGEX.test(pin);
}

/**
 * Determine whether to lock the account after a failed attempt.
 * Returns the lockout expiry Date if threshold reached, null otherwise.
 */
export function computeLockout(
  failedCount: number
): { locked: true; lockUntil: Date } | { locked: false } {
  if (failedCount >= PIN_RATE_LIMIT_MAX) {
    return {
      locked: true,
      lockUntil: new Date(Date.now() + PIN_RATE_LIMIT_WINDOW_MS),
    };
  }
  return { locked: false };
}

/**
 * Check whether an account is currently locked.
 */
export function isAccountLocked(lockedUntil: Date | string | null): boolean {
  if (!lockedUntil) return false;
  const until = typeof lockedUntil === "string" ? new Date(lockedUntil) : lockedUntil;
  return until > new Date();
}

/**
 * GCP-STG-0549: Check if a PIN is too weak (sequential, repeated digits, common patterns).
 * Returns true if the PIN should be rejected.
 */
export function isWeakPin(pin: string): boolean {
  // All same digits (0000, 1111, ..., 999999)
  if (/^(\d)\1+$/.test(pin)) return true;

  // Sequential ascending (1234, 12345, 123456, 3456, etc.)
  const digits = pin.split("").map(Number);
  let allAsc = true;
  let allDesc = true;
  for (let i = 1; i < digits.length; i++) {
    if (digits[i] !== digits[i - 1] + 1) allAsc = false;
    if (digits[i] !== digits[i - 1] - 1) allDesc = false;
  }
  if (allAsc || allDesc) return true;

  return false;
}
