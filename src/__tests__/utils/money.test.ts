/**
 * Deep tests for POS money utility
 * Covers: minorToMajor, formatMoney — INR formatting, Indian grouping (lakhs/crores),
 * edge cases (zero, negative, NaN, large amounts), fallback formatting
 */
import { minorToMajor, formatMoney } from '../../utils/money';

// Mock i18n
jest.mock('../../i18n', () => ({
  __esModule: true,
  default: { language: 'en' },
}));

describe('money utility', () => {
  // ════════════════════════════════════════════════════════════════════
  // minorToMajor
  // ════════════════════════════════════════════════════════════════════

  describe('minorToMajor', () => {
    it('converts paise to rupees (default 2 fraction digits)', () => {
      expect(minorToMajor(15000)).toBe(150);
    });

    it('handles zero', () => {
      expect(minorToMajor(0)).toBe(0);
    });

    it('handles negative values', () => {
      expect(minorToMajor(-5000)).toBe(-50);
    });

    it('returns 0 for NaN', () => {
      expect(minorToMajor(NaN)).toBe(0);
    });

    it('returns 0 for Infinity', () => {
      expect(minorToMajor(Infinity)).toBe(0);
    });

    it('supports custom fraction digits', () => {
      expect(minorToMajor(12345, 3)).toBe(12.345);
    });

    it('handles small amounts', () => {
      expect(minorToMajor(1)).toBe(0.01);
    });

    it('handles large amounts', () => {
      expect(minorToMajor(10000000)).toBe(100000); // 1 lakh
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // formatMoney
  // ════════════════════════════════════════════════════════════════════

  describe('formatMoney', () => {
    it('formats INR with rupee symbol', () => {
      const result = formatMoney(15000);
      expect(result).toMatch(/₹/);
      expect(result).toMatch(/150/);
    });

    it('formats zero as ₹0.00 (STG-543: always show decimals)', () => {
      const result = formatMoney(0);
      expect(result).toMatch(/₹.*0/);
      expect(result).toContain('.00');
    });

    it('formats small amounts', () => {
      const result = formatMoney(50);
      expect(result).toMatch(/0\.50/);
    });

    it('formats amounts in lakhs with Indian grouping', () => {
      // 10,00,000 paise = ₹10,000
      const result = formatMoney(1000000);
      // Should contain 10,000 or 10000 (Indian grouping)
      expect(result).toMatch(/10[,.]000/);
    });

    it('formats negative amounts', () => {
      const result = formatMoney(-5000);
      expect(result).toMatch(/-/);
      expect(result).toMatch(/50/);
    });

    it('handles NaN input gracefully (STG-543: always show decimals)', () => {
      const result = formatMoney(NaN);
      expect(result).toMatch(/₹.*0/);
      expect(result).toContain('.00');
    });

    it('handles string-coerced input', () => {
      const result = formatMoney('15000' as unknown as number);
      expect(result).toMatch(/150/);
    });

    it('defaults to INR currency', () => {
      const result = formatMoney(10000);
      expect(result).toMatch(/₹/);
    });

    it('supports USD currency', () => {
      const result = formatMoney(10000, 'USD');
      // USD should use standard grouping
      expect(result).toMatch(/100/);
    });
  });
});
