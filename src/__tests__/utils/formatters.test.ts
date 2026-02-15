import { minorToMajor, formatMoney } from '../../utils/money';

// Mock i18n to avoid requiring full i18n setup in tests
jest.mock('../../i18n', () => ({
  language: 'en',
}));

describe('minorToMajor', () => {
  it('converts minor units to major units with default fraction digits', () => {
    expect(minorToMajor(10000)).toBe(100.00);
    expect(minorToMajor(5050)).toBe(50.50);
    expect(minorToMajor(123)).toBe(1.23);
  });

  it('handles zero and negative values', () => {
    expect(minorToMajor(0)).toBe(0);
    expect(minorToMajor(-10000)).toBe(-100.00);
  });

  it('handles non-finite values by returning 0', () => {
    expect(minorToMajor(NaN)).toBe(0);
    expect(minorToMajor(Infinity)).toBe(0);
    expect(minorToMajor(-Infinity)).toBe(0);
  });

  it('supports custom fraction digits', () => {
    expect(minorToMajor(10000, 3)).toBe(10);
    expect(minorToMajor(10000, 1)).toBe(1000);
    expect(minorToMajor(10000, 0)).toBe(10000);
  });
});

describe('formatMoney', () => {
  it('formats INR currency with default fraction digits', () => {
    const result = formatMoney(10000, 'INR');
    // Result should contain rupee symbol and formatted number
    expect(result).toContain('100');
  });

  it('formats zero value', () => {
    const result = formatMoney(0, 'INR');
    expect(result).toContain('0');
  });

  it('formats large amounts', () => {
    const result = formatMoney(123456789, 'INR'); // 12,34,567.89 (Indian grouping)
    expect(result).toContain('34,567');
  });

  it('handles non-finite values by formatting as 0', () => {
    expect(formatMoney(NaN, 'INR')).toContain('0');
    expect(formatMoney(Infinity, 'INR')).toContain('0');
  });

  it('supports custom fraction digits', () => {
    const result = formatMoney(10000, 'INR', 0);
    // Should not have decimal places
    expect(result).not.toContain('.');
  });

  it('handles USD currency', () => {
    const result = formatMoney(10000, 'USD');
    expect(result).toContain('100');
  });

  it('uses fallback formatting when Intl is unavailable', () => {
    // Save original Intl
    const originalIntl = global.Intl;

    // Mock Intl to throw error
    Object.defineProperty(global, 'Intl', {
      writable: true,
      value: {
        NumberFormat: function() {
          throw new Error('Not supported');
        }
      }
    });

    const result = formatMoney(10000, 'INR');
    expect(result).toContain('100');

    // Restore Intl
    Object.defineProperty(global, 'Intl', {
      writable: true,
      value: originalIntl
    });
  });

  it('formats negative amounts', () => {
    const result = formatMoney(-10000, 'INR');
    expect(result).toContain('-');
    expect(result).toContain('100');
  });
});
