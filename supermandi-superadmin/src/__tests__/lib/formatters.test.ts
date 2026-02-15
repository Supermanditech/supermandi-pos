// SuperAdmin — Test formatters utility
import { describe, it, expect } from 'vitest';
import { formatDate, formatDateTime, formatCurrency } from '../../lib/formatters';

describe('formatDate', () => {
  it('formats ISO string to readable date', () => {
    const result = formatDate('2026-02-15T10:30:00Z');
    // Should contain day, month abbreviation, and year
    expect(result).toMatch(/\d{1,2}\s\w+\s2026/);
  });

  it('handles Date object', () => {
    const result = formatDate(new Date('2026-06-01T00:00:00Z'));
    expect(result).toMatch(/\d{1,2}\s\w+\s2026/);
  });

  it('returns dash for invalid date string', () => {
    expect(formatDate('not-a-date')).toBe('\u2014');
  });

  it('returns dash for empty string', () => {
    expect(formatDate('')).toBe('\u2014');
  });

  it('uses Asia/Kolkata timezone', () => {
    // 2026-01-15T23:30:00Z = 2026-01-16 05:00 IST
    const result = formatDate('2026-01-15T23:30:00Z');
    // In IST this crosses midnight, so the date should be the 16th
    expect(result).toMatch(/16/);
  });
});

describe('formatDateTime', () => {
  it('formats ISO string to readable date+time', () => {
    const result = formatDateTime('2026-02-15T10:30:00Z');
    // Should contain date AND time portions
    expect(result).toMatch(/\d{1,2}\s\w+\s2026/);
    // Should contain AM or PM
    expect(result).toMatch(/[AP]M/i);
  });

  it('handles Date object', () => {
    const result = formatDateTime(new Date('2026-06-01T12:00:00Z'));
    expect(result).toMatch(/\d{1,2}\s\w+\s2026/);
  });

  it('returns dash for invalid date string', () => {
    expect(formatDateTime('invalid')).toBe('\u2014');
  });

  it('returns dash for empty string', () => {
    expect(formatDateTime('')).toBe('\u2014');
  });
});

describe('formatCurrency', () => {
  it('formats paise to INR (12345 paise = Rs 123.45)', () => {
    const result = formatCurrency(12345);
    // Should contain 123.45 and rupee symbol
    expect(result).toMatch(/123\.45/);
  });

  it('formats zero paise', () => {
    const result = formatCurrency(0);
    expect(result).toMatch(/0\.00/);
  });

  it('handles falsy value (0)', () => {
    const result = formatCurrency(0);
    expect(result).toMatch(/0\.00/);
  });

  it('formats large amount (100000 paise = Rs 1000.00)', () => {
    const result = formatCurrency(100000);
    expect(result).toMatch(/1,000\.00/);
  });

  it('formats small amount (50 paise = Rs 0.50)', () => {
    const result = formatCurrency(50);
    expect(result).toMatch(/0\.50/);
  });

  it('returns INR formatted string', () => {
    const result = formatCurrency(10000);
    // en-IN INR formatting uses rupee symbol
    expect(result).toMatch(/₹|INR|Rs/);
  });
});
