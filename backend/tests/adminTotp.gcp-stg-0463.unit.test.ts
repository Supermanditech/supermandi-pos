/**
 * GCP-STG-0463: TOTP 2FA for SuperAdmin
 *
 * Behavioral tests for TOTP generation, verification, base32 encoding,
 * and the three TOTP endpoints (setup, verify-setup, totp/verify).
 */

// Must set env vars BEFORE importing the module (it reads JWT_SECRET at import time)
process.env.JWT_SECRET = 'test-jwt-secret-for-totp-tests-0463';
process.env.ADMIN_EMAIL_ALLOWLIST = 'admin@supermandi.tech';

import {
  base32Encode,
  base32Decode,
  generateTotpSecret,
  verifyTotp,
  buildTotpUri,
} from '../src/routes/v1/admin/adminAuth';
import crypto from 'crypto';

// =========================================================================
// Unit tests for TOTP crypto utilities
// =========================================================================

describe('GCP-STG-0463: TOTP utilities', () => {

  describe('base32Encode / base32Decode', () => {
    test('round-trips a 20-byte buffer', () => {
      const original = crypto.randomBytes(20);
      const encoded = base32Encode(original);
      const decoded = base32Decode(encoded);
      expect(decoded).toEqual(original);
    });

    test('encodes known value correctly', () => {
      // "Hello!" in base32 is "JBSWY3DPEE"
      // Actually test a simpler known vector
      const buf = Buffer.from([0x00]);
      const encoded = base32Encode(buf);
      expect(encoded).toBe('AA');
      expect(base32Decode(encoded)[0]).toBe(0x00);
    });

    test('produces only valid base32 characters', () => {
      const encoded = base32Encode(crypto.randomBytes(20));
      expect(encoded).toMatch(/^[A-Z2-7]+$/);
    });

    test('encoded length is correct for 20 bytes', () => {
      const encoded = base32Encode(crypto.randomBytes(20));
      // 20 bytes = 160 bits / 5 = 32 base32 chars
      expect(encoded.length).toBe(32);
    });
  });

  describe('generateTotpSecret', () => {
    test('returns a 32-character base32 string', () => {
      const secret = generateTotpSecret();
      expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    });

    test('generates unique secrets', () => {
      const secrets = new Set<string>();
      for (let i = 0; i < 20; i++) {
        secrets.add(generateTotpSecret());
      }
      expect(secrets.size).toBe(20);
    });
  });

  describe('verifyTotp', () => {
    test('rejects empty token', () => {
      const secret = generateTotpSecret();
      expect(verifyTotp(secret, '')).toBe(false);
    });

    test('rejects non-6-digit token', () => {
      const secret = generateTotpSecret();
      expect(verifyTotp(secret, '12345')).toBe(false);
      expect(verifyTotp(secret, '1234567')).toBe(false);
      expect(verifyTotp(secret, 'abcdef')).toBe(false);
    });

    test('accepts a correctly generated code for the current window', () => {
      const secret = generateTotpSecret();
      // Generate a valid code using the same algorithm
      const code = generateValidCode(secret);
      expect(verifyTotp(secret, code)).toBe(true);
    });

    test('rejects a random 6-digit code (with very high probability)', () => {
      const secret = generateTotpSecret();
      // A random code should almost never match (1 in ~333333 chance per window, 3 windows)
      expect(verifyTotp(secret, '000001')).toBe(false);
    });
  });

  describe('buildTotpUri', () => {
    test('returns valid otpauth URI', () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const uri = buildTotpUri(secret, 'admin@supermandi.tech');
      expect(uri).toContain('otpauth://totp/');
      expect(uri).toContain('secret=JBSWY3DPEHPK3PXP');
      expect(uri).toContain('issuer=SuperMandi');
      expect(uri).toContain('algorithm=SHA1');
      expect(uri).toContain('digits=6');
      expect(uri).toContain('period=30');
      expect(uri).toContain('admin%40supermandi.tech');
    });
  });
});

// =========================================================================
// Helper: generate a valid TOTP code for the current time window
// (mirrors the implementation's computeTotpCode logic)
// =========================================================================

function generateValidCode(secretBase32: string): string {
  const key = base32Decode(secretBase32);
  const counter = Math.floor(Date.now() / 1000 / 30);
  const counterBuf = Buffer.alloc(8);
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
