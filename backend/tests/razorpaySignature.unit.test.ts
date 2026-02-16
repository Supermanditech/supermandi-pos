/**
 * TEST-018: payment-service — Razorpay signature verification unit tests
 * Tests timing-safe HMAC verification, edge cases, and format validation.
 */

import crypto from 'crypto';

// Mock config before importing
jest.mock('../services/payment-service/src/config', () => ({
  config: {
    razorpay: {
      keyId: 'rzp_test_1234567890',
      keySecret: 'test_secret_key_for_hmac_verification',
      accountNumber: '2323230012345678',
    },
  },
}));

import { verifyPaymentSignature } from '../services/payment-service/src/services/razorpayClient';

describe('Razorpay Payment Signature Verification', () => {
  const TEST_SECRET = 'test_secret_key_for_hmac_verification';

  function generateValidSignature(orderId: string, paymentId: string): string {
    return crypto
      .createHmac('sha256', TEST_SECRET)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');
  }

  // =========================================================================
  // VALID SIGNATURES
  // =========================================================================
  describe('valid signatures', () => {
    it('verifies correct signature', () => {
      const orderId = 'order_1234567890';
      const paymentId = 'pay_abcdef123456';
      const signature = generateValidSignature(orderId, paymentId);

      expect(
        verifyPaymentSignature({ orderId, paymentId, signature })
      ).toBe(true);
    });

    it('verifies with different order/payment IDs', () => {
      const orderId = 'order_XYZABC';
      const paymentId = 'pay_MNOPQR';
      const signature = generateValidSignature(orderId, paymentId);

      expect(
        verifyPaymentSignature({ orderId, paymentId, signature })
      ).toBe(true);
    });
  });

  // =========================================================================
  // INVALID SIGNATURES
  // =========================================================================
  describe('invalid signatures', () => {
    it('rejects wrong signature', () => {
      expect(
        verifyPaymentSignature({
          orderId: 'order_123',
          paymentId: 'pay_456',
          signature: 'definitely_not_a_valid_signature',
        })
      ).toBe(false);
    });

    it('rejects signature for different order', () => {
      const signature = generateValidSignature('order_AAA', 'pay_BBB');

      expect(
        verifyPaymentSignature({
          orderId: 'order_DIFFERENT',
          paymentId: 'pay_BBB',
          signature,
        })
      ).toBe(false);
    });

    it('rejects signature for different payment', () => {
      const signature = generateValidSignature('order_AAA', 'pay_BBB');

      expect(
        verifyPaymentSignature({
          orderId: 'order_AAA',
          paymentId: 'pay_DIFFERENT',
          signature,
        })
      ).toBe(false);
    });

    it('rejects empty signature', () => {
      expect(
        verifyPaymentSignature({
          orderId: 'order_123',
          paymentId: 'pay_456',
          signature: '',
        })
      ).toBe(false);
    });
  });

  // =========================================================================
  // TIMING ATTACK RESISTANCE (T-253)
  // =========================================================================
  describe('timing-safe comparison (T-253)', () => {
    it('uses constant-time comparison (different lengths return false)', () => {
      // A signature that's shorter than expected should return false
      // without timing leakage
      const orderId = 'order_123';
      const paymentId = 'pay_456';
      const validSig = generateValidSignature(orderId, paymentId);

      // Truncated signature
      expect(
        verifyPaymentSignature({
          orderId,
          paymentId,
          signature: validSig.slice(0, 10),
        })
      ).toBe(false);

      // Extended signature
      expect(
        verifyPaymentSignature({
          orderId,
          paymentId,
          signature: validSig + 'extra',
        })
      ).toBe(false);
    });
  });

  // =========================================================================
  // FORMAT
  // =========================================================================
  describe('HMAC format', () => {
    it('signature is orderId|paymentId HMAC-SHA256', () => {
      const orderId = 'order_test';
      const paymentId = 'pay_test';

      const expected = crypto
        .createHmac('sha256', TEST_SECRET)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      expect(
        verifyPaymentSignature({ orderId, paymentId, signature: expected })
      ).toBe(true);
    });

    it('pipe separator is required (no other separator works)', () => {
      const orderId = 'order_test';
      const paymentId = 'pay_test';

      // Wrong separator
      const wrongSig = crypto
        .createHmac('sha256', TEST_SECRET)
        .update(`${orderId}:${paymentId}`)
        .digest('hex');

      expect(
        verifyPaymentSignature({ orderId, paymentId, signature: wrongSig })
      ).toBe(false);
    });
  });
});
