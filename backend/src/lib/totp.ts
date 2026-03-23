// GCP-STG-0464: Shared TOTP 2FA utilities (RFC 6238, HMAC-SHA1, 30-second window)
// Extracted from adminAuth.ts to enable reuse across retailer, supplier, and admin portals.

import crypto from "crypto";

/** Base32 alphabet (RFC 4648) */
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Encode a Buffer to base32 string (RFC 4648).
 * Used to display TOTP secrets to the user for manual entry.
 */
export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let result = '';
  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += BASE32_ALPHABET[(value >>> bits) & 0x1f];
    }
  }
  if (bits > 0) {
    result += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }
  return result;
}

/**
 * Decode a base32 string back to a Buffer.
 */
export function base32Decode(encoded: string): Buffer {
  const cleaned = encoded.replace(/=+$/, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (let i = 0; i < cleaned.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(cleaned[i]);
    if (idx === -1) continue; // skip invalid chars
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 0xff);
    }
  }
  return Buffer.from(bytes);
}

/**
 * Generate a 20-byte random TOTP secret, returned as base32.
 */
export function generateTotpSecret(): string {
  const buffer = crypto.randomBytes(20);
  return base32Encode(buffer);
}

/**
 * Compute TOTP code for a given secret and time counter (RFC 6238 / HMAC-SHA1).
 */
export function computeTotpCode(secretBase32: string, counter: number): string {
  const key = base32Decode(secretBase32);
  // Counter as 8-byte big-endian buffer
  const counterBuf = Buffer.alloc(8);
  // Write as unsigned 64-bit big-endian (top 4 bytes are 0 for reasonable time values)
  counterBuf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBuf.writeUInt32BE(counter >>> 0, 4);

  const hmac = crypto.createHmac('sha1', key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 1000000).padStart(6, '0');
}

/**
 * Verify a TOTP token against a secret. Checks current window and 1 window before/after
 * to account for clock skew (±30 seconds).
 */
export function verifyTotp(secretBase32: string, token: string): boolean {
  if (!token || !/^\d{6}$/.test(token)) return false;
  const now = Math.floor(Date.now() / 1000);
  const step = 30;
  // Check current window, 1 before, and 1 after
  for (let i = -1; i <= 1; i++) {
    const counter = Math.floor((now / step) + i);
    if (computeTotpCode(secretBase32, counter) === token) return true;
  }
  return false;
}

/**
 * Build an otpauth:// URI for QR code generation (Google Authenticator compatible).
 */
export function buildTotpUri(secret: string, label: string): string {
  const issuer = 'SuperMandi';
  const encodedLabel = encodeURIComponent(`${issuer}:${label}`);
  return `otpauth://totp/${encodedLabel}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
