/**
 * Deep tests for supplier-portal formatters (lib/formatters.ts)
 * Covers: formatDate, formatDateTime, formatDateShort, formatCurrency, formatRupees
 * Validates: Asia/Kolkata timezone, en-IN locale, INR currency, edge cases
 */
import { formatDate, formatDateTime, formatDateShort, formatCurrency, formatRupees } from '../../lib/formatters';

describe('Date Formatters', () => {
  describe('formatDate', () => {
    it('formats ISO string to "d Mon YYYY"', () => {
      const result = formatDate('2026-02-05T10:30:00Z');
      expect(result).toMatch(/5\s+Feb\s+2026/);
    });

    it('formats Date object', () => {
      const result = formatDate(new Date('2026-12-25T00:00:00Z'));
      expect(result).toMatch(/25\s+Dec\s+2026/);
    });

    it('returns dash for invalid date string', () => {
      expect(formatDate('not-a-date')).toBe('—');
    });

    it('returns dash for invalid Date object', () => {
      expect(formatDate(new Date('invalid'))).toBe('—');
    });
  });

  describe('formatDateTime', () => {
    it('formats with date and time', () => {
      const result = formatDateTime('2026-02-05T10:30:00Z');
      // IST = UTC+5:30, so 10:30 UTC = 4:00 PM IST
      expect(result).toMatch(/5\s+Feb\s+2026/);
      expect(result).toMatch(/[pP][mM]|[aA][mM]/); // Has AM/PM
    });

    it('returns dash for invalid date', () => {
      expect(formatDateTime('invalid')).toBe('—');
    });
  });

  describe('formatDateShort', () => {
    it('formats as "Weekday, d Mon"', () => {
      const result = formatDateShort('2026-02-05T10:30:00Z');
      expect(result).toMatch(/Feb/);
      expect(result).toMatch(/5/);
    });

    it('returns dash for invalid date', () => {
      expect(formatDateShort('xyz')).toBe('—');
    });
  });
});

describe('Currency Formatters', () => {
  describe('formatCurrency (paise to INR)', () => {
    it('converts paise to rupees', () => {
      const result = formatCurrency(12345);
      // 12345 paise = ₹123.45
      expect(result).toMatch(/123\.45/);
    });

    it('handles zero', () => {
      const result = formatCurrency(0);
      expect(result).toMatch(/0\.00/);
    });

    it('handles falsy (null-like) input', () => {
      const result = formatCurrency(undefined as unknown as number);
      expect(result).toMatch(/0\.00/);
    });

    it('formats large amounts with Indian grouping', () => {
      // 10,00,000 paise = ₹10,000.00
      const result = formatCurrency(1000000);
      expect(result).toMatch(/10,000\.00/);
    });

    it('formats lakhs correctly', () => {
      // 1,00,00,000 paise = ₹1,00,000.00
      const result = formatCurrency(10000000);
      expect(result).toMatch(/1,00,000\.00/);
    });
  });

  describe('formatRupees (rupees to INR)', () => {
    it('formats rupee amount directly', () => {
      const result = formatRupees(123.45);
      expect(result).toMatch(/123\.45/);
    });

    it('handles zero', () => {
      const result = formatRupees(0);
      expect(result).toMatch(/0\.00/);
    });

    it('handles falsy input', () => {
      const result = formatRupees(undefined as unknown as number);
      expect(result).toMatch(/0\.00/);
    });

    it('formats with INR symbol', () => {
      const result = formatRupees(1000);
      expect(result).toMatch(/₹/);
    });
  });
});
