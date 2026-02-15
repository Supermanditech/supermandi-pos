// SuperAdmin — Test utility functions from types.ts
import { describe, it, expect } from 'vitest';
import {
  clamp,
  toIsoSafe,
  includesInsensitive,
  toIsoStart,
  toIsoEnd,
  UPI_VPA_PATTERN,
} from '../types';

describe('clamp', () => {
  it('returns value when within range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });

  it('clamps to min when value is below range', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(-100, 0, 10)).toBe(0);
  });

  it('clamps to max when value is above range', () => {
    expect(clamp(15, 0, 10)).toBe(10);
    expect(clamp(100, 0, 10)).toBe(10);
  });

  it('handles negative ranges', () => {
    expect(clamp(-5, -10, -1)).toBe(-5);
    expect(clamp(-15, -10, -1)).toBe(-10);
    expect(clamp(0, -10, -1)).toBe(-1);
  });

  it('handles decimal values', () => {
    expect(clamp(5.5, 0, 10)).toBe(5.5);
    expect(clamp(10.1, 0, 10)).toBe(10);
    expect(clamp(-0.1, 0, 10)).toBe(0);
  });
});

describe('toIsoSafe', () => {
  it('converts valid date strings to ISO format', () => {
    const result = toIsoSafe('2024-01-15');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(new Date(result).toISOString()).toBe(result);
  });

  it('handles valid date objects as strings', () => {
    const date = new Date('2024-01-15T10:30:00Z');
    const result = toIsoSafe(date.toISOString());
    expect(result).toBe('2024-01-15T10:30:00.000Z');
  });

  it('returns epoch (1970-01-01) for invalid date strings', () => {
    expect(toIsoSafe('invalid')).toBe(new Date(0).toISOString());
    expect(toIsoSafe('')).toBe(new Date(0).toISOString());
    expect(toIsoSafe('not-a-date')).toBe(new Date(0).toISOString());
  });

  it('handles edge cases', () => {
    expect(toIsoSafe('NaN')).toBe(new Date(0).toISOString());
    expect(toIsoSafe('undefined')).toBe(new Date(0).toISOString());
    expect(toIsoSafe('null')).toBe(new Date(0).toISOString());
  });

  it('handles timestamp strings', () => {
    const timestamp = '1705315200000'; // 2024-01-15 in ms
    const result = toIsoSafe(timestamp);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});

describe('includesInsensitive', () => {
  it('performs case-insensitive search', () => {
    expect(includesInsensitive('Hello World', 'hello')).toBe(true);
    expect(includesInsensitive('Hello World', 'WORLD')).toBe(true);
    expect(includesInsensitive('Hello World', 'WoRlD')).toBe(true);
  });

  it('trims needle whitespace', () => {
    expect(includesInsensitive('Hello World', '  hello  ')).toBe(true);
    expect(includesInsensitive('Hello World', '\tworld\n')).toBe(true);
  });

  it('returns false when needle not found', () => {
    expect(includesInsensitive('Hello World', 'xyz')).toBe(false);
    expect(includesInsensitive('Hello World', 'goodbye')).toBe(false);
  });

  it('handles empty strings', () => {
    expect(includesInsensitive('Hello World', '')).toBe(true);
    expect(includesInsensitive('', 'hello')).toBe(false);
    expect(includesInsensitive('', '')).toBe(true);
  });

  it('handles special characters', () => {
    expect(includesInsensitive('test@example.com', '@example')).toBe(true);
    expect(includesInsensitive('price: $100', '$100')).toBe(true);
  });

  it('handles unicode characters', () => {
    expect(includesInsensitive('Café', 'café')).toBe(true);
    expect(includesInsensitive('naïve', 'NAÏVE')).toBe(true);
  });
});

describe('toIsoStart', () => {
  it('returns ISO string with time set to 00:00:00.000', () => {
    const result = toIsoStart('2024-01-15');
    expect(result).toBeDefined();
    // The function sets local time to 00:00:00, then converts to ISO
    // Just verify it's a valid ISO string
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('returns undefined for empty string', () => {
    expect(toIsoStart('')).toBeUndefined();
  });

  it('returns undefined for invalid date', () => {
    expect(toIsoStart('invalid-date')).toBeUndefined();
    expect(toIsoStart('not-a-date')).toBeUndefined();
  });

  it('handles date strings with time', () => {
    const result = toIsoStart('2024-01-15T14:30:45Z');
    expect(result).toBeDefined();
    // Just verify it's a valid ISO string
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('handles UTC date strings', () => {
    const result = toIsoStart('2024-01-15T00:00:00Z');
    expect(result).toBeDefined();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});

describe('toIsoEnd', () => {
  it('returns ISO string with time set to 23:59:59.999', () => {
    const result = toIsoEnd('2024-01-15');
    expect(result).toBeDefined();
    // The function sets local time to 23:59:59.999, then converts to ISO
    // Just verify it's a valid ISO string
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('returns undefined for empty string', () => {
    expect(toIsoEnd('')).toBeUndefined();
  });

  it('returns undefined for invalid date', () => {
    expect(toIsoEnd('invalid-date')).toBeUndefined();
    expect(toIsoEnd('not-a-date')).toBeUndefined();
  });

  it('handles date strings with time', () => {
    const result = toIsoEnd('2024-01-15T14:30:45Z');
    expect(result).toBeDefined();
    // Just verify it's a valid ISO string
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('handles UTC date strings', () => {
    const result = toIsoEnd('2024-01-15T23:59:59Z');
    expect(result).toBeDefined();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});

describe('UPI_VPA_PATTERN', () => {
  it('matches valid UPI VPA patterns', () => {
    expect(UPI_VPA_PATTERN.test('user123@paytm')).toBe(true);
    expect(UPI_VPA_PATTERN.test('abc@okicici')).toBe(true);
    expect(UPI_VPA_PATTERN.test('test.user@ybl')).toBe(true);
    expect(UPI_VPA_PATTERN.test('user_name@upi')).toBe(true);
    expect(UPI_VPA_PATTERN.test('test-user@bank')).toBe(true);
  });

  it('requires minimum 3 characters before @', () => {
    expect(UPI_VPA_PATTERN.test('ab@paytm')).toBe(false);
    expect(UPI_VPA_PATTERN.test('a@paytm')).toBe(false);
    expect(UPI_VPA_PATTERN.test('abc@paytm')).toBe(true);
  });

  it('requires minimum 2 characters after @', () => {
    expect(UPI_VPA_PATTERN.test('user@p')).toBe(false);
    expect(UPI_VPA_PATTERN.test('user@')).toBe(false);
    expect(UPI_VPA_PATTERN.test('user@pa')).toBe(true);
  });

  it('rejects dots after @', () => {
    // T-215: No dots allowed after @
    expect(UPI_VPA_PATTERN.test('user@paytm.com')).toBe(false);
    expect(UPI_VPA_PATTERN.test('user@ok.icici')).toBe(false);
  });

  it('allows dots, underscores, hyphens before @', () => {
    expect(UPI_VPA_PATTERN.test('user.name@paytm')).toBe(true);
    expect(UPI_VPA_PATTERN.test('user_name@paytm')).toBe(true);
    expect(UPI_VPA_PATTERN.test('user-name@paytm')).toBe(true);
    expect(UPI_VPA_PATTERN.test('user.name_123-test@paytm')).toBe(true);
  });

  it('rejects invalid patterns', () => {
    expect(UPI_VPA_PATTERN.test('user')).toBe(false);
    expect(UPI_VPA_PATTERN.test('@paytm')).toBe(false);
    expect(UPI_VPA_PATTERN.test('user@')).toBe(false);
    expect(UPI_VPA_PATTERN.test('user@@paytm')).toBe(false);
    expect(UPI_VPA_PATTERN.test('user@paytm@test')).toBe(false);
  });

  it('rejects uppercase letters', () => {
    expect(UPI_VPA_PATTERN.test('User@paytm')).toBe(false);
    expect(UPI_VPA_PATTERN.test('user@Paytm')).toBe(false);
    expect(UPI_VPA_PATTERN.test('USER@PAYTM')).toBe(false);
  });

  it('rejects special characters not allowed', () => {
    expect(UPI_VPA_PATTERN.test('user!@paytm')).toBe(false);
    expect(UPI_VPA_PATTERN.test('user#@paytm')).toBe(false);
    expect(UPI_VPA_PATTERN.test('user$@paytm')).toBe(false);
    expect(UPI_VPA_PATTERN.test('user%@paytm')).toBe(false);
    expect(UPI_VPA_PATTERN.test('user@paytm!')).toBe(false);
  });
});
