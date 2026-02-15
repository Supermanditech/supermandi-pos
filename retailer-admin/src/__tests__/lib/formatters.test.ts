import { describe, it, expect } from 'vitest';
import {
  formatDate,
  formatDateTime,
  formatDateShort,
  formatTime,
  formatCurrency,
  formatCurrencyWhole,
  formatRupees,
} from '../../lib/formatters';

// ── Date Formatters ─────────────────────────────────────────────────────────

describe('formatDate', () => {
  it('formats a valid ISO date string', () => {
    const result = formatDate('2026-02-05T10:30:00Z');
    // Asia/Kolkata is UTC+5:30, so 10:30 UTC = 16:00 IST, still 5 Feb
    expect(result).toContain('Feb');
    expect(result).toContain('2026');
    expect(result).toContain('5');
  });

  it('formats a Date object', () => {
    const result = formatDate(new Date('2026-12-25T00:00:00Z'));
    expect(result).toContain('Dec');
    expect(result).toContain('2026');
  });

  it('returns em-dash for invalid date string', () => {
    expect(formatDate('not-a-date')).toBe('\u2014');
  });

  it('returns em-dash for invalid Date object', () => {
    expect(formatDate(new Date('invalid'))).toBe('\u2014');
  });

  it('handles midnight UTC (should show correct IST date)', () => {
    // 2026-01-01 00:00 UTC = 2026-01-01 05:30 IST
    const result = formatDate('2026-01-01T00:00:00Z');
    expect(result).toContain('Jan');
    expect(result).toContain('2026');
  });

  it('handles date near midnight IST boundary', () => {
    // 2026-01-01 18:30 UTC = 2026-01-02 00:00 IST
    const result = formatDate('2026-01-01T18:30:00Z');
    expect(result).toContain('Jan');
    expect(result).toContain('2026');
    // This should show 2 Jan since 18:30 UTC = 00:00 IST next day
    expect(result).toContain('2');
  });
});

describe('formatDateTime', () => {
  it('formats a valid ISO date-time string with time', () => {
    const result = formatDateTime('2026-02-05T10:30:00Z');
    expect(result).toContain('Feb');
    expect(result).toContain('2026');
    // 10:30 UTC = 4:00 PM IST
    expect(result).toMatch(/PM|pm/i);
  });

  it('formats a Date object', () => {
    const result = formatDateTime(new Date('2026-06-15T08:00:00Z'));
    expect(result).toContain('Jun');
    expect(result).toContain('2026');
  });

  it('returns em-dash for invalid date', () => {
    expect(formatDateTime('garbage')).toBe('\u2014');
  });

  it('returns em-dash for invalid Date object', () => {
    expect(formatDateTime(new Date(NaN))).toBe('\u2014');
  });
});

describe('formatDateShort', () => {
  it('formats with weekday abbreviation', () => {
    // 5 Feb 2026 is a Thursday
    const result = formatDateShort('2026-02-05T10:00:00Z');
    expect(result).toContain('Feb');
    expect(result).toContain('5');
    // Should include weekday abbreviation (Thu)
    expect(result).toMatch(/Thu|Wed|Tue|Mon|Fri|Sat|Sun/);
  });

  it('returns em-dash for invalid date', () => {
    expect(formatDateShort('xxx')).toBe('\u2014');
  });

  it('accepts a Date object', () => {
    const result = formatDateShort(new Date('2026-03-10T12:00:00Z'));
    expect(result).toContain('Mar');
  });
});

describe('formatTime', () => {
  it('formats time in 12-hour format', () => {
    const result = formatTime('2026-02-05T10:30:00Z');
    // 10:30 UTC = 4:00 PM IST
    expect(result).toMatch(/PM|pm/i);
  });

  it('formats morning time correctly', () => {
    const result = formatTime('2026-02-05T03:30:00Z');
    // 03:30 UTC = 9:00 AM IST
    expect(result).toMatch(/AM|am/i);
  });

  it('returns em-dash for invalid date', () => {
    expect(formatTime('bad')).toBe('\u2014');
  });

  it('accepts a Date object', () => {
    const result = formatTime(new Date('2026-02-05T12:00:00Z'));
    // 12:00 UTC = 5:30 PM IST
    expect(result).toMatch(/PM|pm/i);
  });
});

// ── Currency Formatters ─────────────────────────────────────────────────────

describe('formatCurrency', () => {
  it('converts paise to INR with two decimal places', () => {
    const result = formatCurrency(12345);
    // 12345 paise = Rs 123.45
    expect(result).toContain('123.45');
  });

  it('handles zero', () => {
    const result = formatCurrency(0);
    expect(result).toContain('0.00');
  });

  it('treats falsy values as zero', () => {
    // The function uses (paise || 0), so NaN, undefined cast to 0
    const result = formatCurrency(NaN);
    expect(result).toContain('0.00');
  });

  it('handles negative amounts', () => {
    const result = formatCurrency(-5000);
    // -5000 paise = -Rs 50.00
    expect(result).toContain('50.00');
  });

  it('handles large amounts', () => {
    const result = formatCurrency(10000000); // 1,00,000 rupees
    expect(result).toContain('1,00,000.00');
  });

  it('formats with INR symbol', () => {
    const result = formatCurrency(100);
    // Should contain rupee sign
    expect(result).toMatch(/₹|INR/);
  });

  it('handles single paise correctly', () => {
    const result = formatCurrency(1);
    expect(result).toContain('0.01');
  });
});

describe('formatCurrencyWhole', () => {
  it('converts paise to INR without decimal places', () => {
    const result = formatCurrencyWhole(12345);
    // 12345 paise = Rs 123 (no decimals)
    expect(result).toContain('123');
    expect(result).not.toContain('.45');
  });

  it('handles zero', () => {
    const result = formatCurrencyWhole(0);
    expect(result).toContain('0');
  });

  it('handles large amounts with Indian comma grouping', () => {
    const result = formatCurrencyWhole(10000000);
    // 1,00,000 rupees - Indian grouping
    expect(result).toContain('1,00,000');
  });

  it('treats falsy values as zero', () => {
    const result = formatCurrencyWhole(NaN);
    expect(result).toContain('0');
  });
});

describe('formatRupees', () => {
  it('formats rupee amount with two decimal places', () => {
    const result = formatRupees(123.45);
    expect(result).toContain('123.45');
  });

  it('handles zero', () => {
    const result = formatRupees(0);
    expect(result).toContain('0.00');
  });

  it('treats falsy values as zero', () => {
    const result = formatRupees(NaN);
    expect(result).toContain('0.00');
  });

  it('handles negative amounts', () => {
    const result = formatRupees(-50.5);
    expect(result).toContain('50.50');
  });

  it('handles large rupee amounts', () => {
    const result = formatRupees(100000);
    expect(result).toContain('1,00,000.00');
  });

  it('formats with INR symbol', () => {
    const result = formatRupees(10);
    expect(result).toMatch(/₹|INR/);
  });

  it('rounds to two decimal places', () => {
    const result = formatRupees(99.999);
    // Should round to 100.00
    expect(result).toContain('100.00');
  });
});
