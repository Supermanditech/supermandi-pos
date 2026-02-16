/**
 * TEST-016: main backend — email OTP & reset token unit tests
 * Tests cryptographic OTP generation, hashing, and timing-safe verification.
 */

import {
  generateSecureOTP,
  hashOTP,
  verifyOTPHash,
  generateSecureResetToken,
  hashResetToken,
  verifyResetTokenHash,
} from '../src/services/emailService';

describe('Email OTP & Reset Tokens', () => {
  // =========================================================================
  // OTP GENERATION
  // =========================================================================
  describe('generateSecureOTP', () => {
    it('generates a 6-digit string', () => {
      const otp = generateSecureOTP();
      expect(otp).toMatch(/^\d{6}$/);
    });

    it('generates values in range [100000, 999999]', () => {
      // Run 100 times to check range
      for (let i = 0; i < 100; i++) {
        const otp = generateSecureOTP();
        const num = parseInt(otp, 10);
        expect(num).toBeGreaterThanOrEqual(100000);
        expect(num).toBeLessThanOrEqual(999999);
      }
    });

    it('generates different OTPs (not deterministic)', () => {
      const otps = new Set<string>();
      for (let i = 0; i < 20; i++) {
        otps.add(generateSecureOTP());
      }
      // Should have at least 10 unique OTPs out of 20
      expect(otps.size).toBeGreaterThanOrEqual(10);
    });
  });

  // =========================================================================
  // OTP HASHING
  // =========================================================================
  describe('hashOTP', () => {
    it('returns SHA-256 hex hash', () => {
      const hash = hashOTP('123456');
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('is deterministic', () => {
      expect(hashOTP('123456')).toBe(hashOTP('123456'));
    });

    it('different OTPs produce different hashes', () => {
      expect(hashOTP('123456')).not.toBe(hashOTP('654321'));
    });
  });

  // =========================================================================
  // OTP VERIFICATION (timing-safe)
  // =========================================================================
  describe('verifyOTPHash', () => {
    it('returns true for matching OTP', () => {
      const otp = '123456';
      const hash = hashOTP(otp);
      expect(verifyOTPHash(otp, hash)).toBe(true);
    });

    it('returns false for wrong OTP', () => {
      const hash = hashOTP('123456');
      expect(verifyOTPHash('654321', hash)).toBe(false);
    });

    it('returns false for wrong hash length', () => {
      expect(verifyOTPHash('123456', 'short')).toBe(false);
    });
  });

  // =========================================================================
  // RESET TOKEN GENERATION (GO-LIVE-086)
  // =========================================================================
  describe('generateSecureResetToken', () => {
    it('generates 64-char hex string (32 bytes)', () => {
      const token = generateSecureResetToken();
      expect(token).toMatch(/^[0-9a-f]{64}$/);
    });

    it('generates unique tokens', () => {
      const t1 = generateSecureResetToken();
      const t2 = generateSecureResetToken();
      expect(t1).not.toBe(t2);
    });
  });

  // =========================================================================
  // RESET TOKEN HASHING (GO-LIVE-085)
  // =========================================================================
  describe('hashResetToken', () => {
    it('returns SHA-256 hex hash', () => {
      const hash = hashResetToken('test-token');
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  // =========================================================================
  // RESET TOKEN VERIFICATION (timing-safe)
  // =========================================================================
  describe('verifyResetTokenHash', () => {
    it('returns true for matching token', () => {
      const token = generateSecureResetToken();
      const hash = hashResetToken(token);
      expect(verifyResetTokenHash(token, hash)).toBe(true);
    });

    it('returns false for wrong token', () => {
      const hash = hashResetToken('correct-token');
      expect(verifyResetTokenHash('wrong-token', hash)).toBe(false);
    });

    it('returns false for mismatched lengths', () => {
      expect(verifyResetTokenHash('abc', 'def')).toBe(false);
    });
  });
});
