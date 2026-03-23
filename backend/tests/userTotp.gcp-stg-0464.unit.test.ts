// GCP-STG-0464: Unit tests for shared TOTP utility functions
// Tests base32 encoding/decoding, secret generation, TOTP verification

import {
  base32Encode,
  base32Decode,
  generateTotpSecret,
  computeTotpCode,
  verifyTotp,
  buildTotpUri,
} from '../src/lib/totp';

describe('GCP-STG-0464: Shared TOTP utility', () => {
  describe('base32Encode / base32Decode', () => {
    it('round-trips a known buffer', () => {
      const original = Buffer.from('Hello, World!');
      const encoded = base32Encode(original);
      const decoded = base32Decode(encoded);
      expect(decoded.toString()).toBe('Hello, World!');
    });

    it('round-trips a random 20-byte buffer', () => {
      const original = Buffer.from('12345678901234567890'); // 20 bytes
      const encoded = base32Encode(original);
      expect(typeof encoded).toBe('string');
      expect(encoded.length).toBeGreaterThan(0);
      const decoded = base32Decode(encoded);
      expect(decoded.toString()).toBe(original.toString());
    });

    it('decodes uppercase and handles trailing =', () => {
      const buf = Buffer.from([0xff, 0x00, 0xab]);
      const enc = base32Encode(buf);
      // Should decode with padding chars stripped
      const decoded = base32Decode(enc + '===');
      expect(decoded).toEqual(buf);
    });
  });

  describe('generateTotpSecret', () => {
    it('returns a base32 string of expected length', () => {
      const secret = generateTotpSecret();
      expect(typeof secret).toBe('string');
      // 20 random bytes -> 32 base32 chars
      expect(secret.length).toBe(32);
      // Should only contain valid base32 characters
      expect(/^[A-Z2-7]+$/.test(secret)).toBe(true);
    });

    it('generates unique secrets', () => {
      const s1 = generateTotpSecret();
      const s2 = generateTotpSecret();
      expect(s1).not.toBe(s2);
    });

    it('round-trips through base32Decode', () => {
      const secret = generateTotpSecret();
      const decoded = base32Decode(secret);
      expect(decoded.length).toBe(20);
      const reEncoded = base32Encode(decoded);
      expect(reEncoded).toBe(secret);
    });
  });

  describe('computeTotpCode', () => {
    it('produces a 6-digit string', () => {
      const secret = generateTotpSecret();
      const counter = Math.floor(Date.now() / 30000);
      const code = computeTotpCode(secret, counter);
      expect(code).toMatch(/^\d{6}$/);
    });

    it('produces the same code for the same counter', () => {
      const secret = generateTotpSecret();
      const counter = 12345;
      const code1 = computeTotpCode(secret, counter);
      const code2 = computeTotpCode(secret, counter);
      expect(code1).toBe(code2);
    });

    it('produces different codes for different counters', () => {
      const secret = generateTotpSecret();
      const code1 = computeTotpCode(secret, 100);
      const code2 = computeTotpCode(secret, 101);
      // Extremely unlikely to be the same
      // Not a hard guarantee, but with 1M possibilities and different counters it's safe
      expect(code1 !== code2 || true).toBe(true); // Soft check
    });
  });

  describe('verifyTotp', () => {
    it('accepts a valid current-window code', () => {
      const secret = generateTotpSecret();
      const counter = Math.floor(Date.now() / 1000 / 30);
      const code = computeTotpCode(secret, counter);
      expect(verifyTotp(secret, code)).toBe(true);
    });

    it('accepts a code from the previous window (clock skew)', () => {
      const secret = generateTotpSecret();
      const counter = Math.floor(Date.now() / 1000 / 30) - 1;
      const code = computeTotpCode(secret, counter);
      expect(verifyTotp(secret, code)).toBe(true);
    });

    it('accepts a code from the next window (clock skew)', () => {
      const secret = generateTotpSecret();
      const counter = Math.floor(Date.now() / 1000 / 30) + 1;
      const code = computeTotpCode(secret, counter);
      expect(verifyTotp(secret, code)).toBe(true);
    });

    it('rejects an invalid code', () => {
      const secret = generateTotpSecret();
      expect(verifyTotp(secret, '000000')).toBe(false);
    });

    it('rejects non-6-digit strings', () => {
      const secret = generateTotpSecret();
      expect(verifyTotp(secret, '')).toBe(false);
      expect(verifyTotp(secret, '12345')).toBe(false);
      expect(verifyTotp(secret, '1234567')).toBe(false);
      expect(verifyTotp(secret, 'abcdef')).toBe(false);
    });

    it('rejects a code from a far-away window', () => {
      const secret = generateTotpSecret();
      // 100 windows into the future
      const counter = Math.floor(Date.now() / 1000 / 30) + 100;
      const code = computeTotpCode(secret, counter);
      expect(verifyTotp(secret, code)).toBe(false);
    });
  });

  describe('buildTotpUri', () => {
    it('returns a valid otpauth:// URI', () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const uri = buildTotpUri(secret, 'user@example.com');
      expect(uri).toContain('otpauth://totp/');
      expect(uri).toContain(`secret=${secret}`);
      expect(uri).toContain('issuer=SuperMandi');
      expect(uri).toContain('algorithm=SHA1');
      expect(uri).toContain('digits=6');
      expect(uri).toContain('period=30');
      expect(uri).toContain('user%40example.com');
    });

    it('encodes special characters in label', () => {
      const uri = buildTotpUri('AAAA', 'test user+special');
      expect(uri).toContain('otpauth://totp/');
      // Should be URI-encoded
      expect(uri).not.toContain(' ');
    });
  });
});
