/**
 * STG-116: formatMoney null/undefined safety + Indian lakh formatting
 */

import { formatMoney } from '../../utils/money';

describe('STG-116: formatMoney null/undefined safety', () => {
  it('should return em dash for null', () => {
    expect(formatMoney(null)).toBe('—');
  });

  it('should return em dash for undefined', () => {
    expect(formatMoney(undefined)).toBe('—');
  });

  it('should format zero correctly', () => {
    const result = formatMoney(0);
    expect(result).toMatch(/₹.*0/);
  });

  it('should format NaN as zero', () => {
    const result = formatMoney(NaN);
    expect(result).toMatch(/₹.*0/);
  });
});

describe('STG-116: Indian lakh formatting', () => {
  it('should format amounts under 1000 without grouping', () => {
    const result = formatMoney(99900); // ₹999.00
    expect(result).toMatch(/999/);
  });

  it('should format lakh amounts with Indian grouping', () => {
    const result = formatMoney(10000000); // ₹1,00,000.00 (1 lakh)
    // Intl or manual grouping should produce Indian format
    expect(result).toMatch(/1[,.]00[,.]000/);
  });

  it('should format crore amounts with Indian grouping', () => {
    const result = formatMoney(1000000000); // ₹1,00,00,000.00 (1 crore)
    expect(result).toMatch(/1[,.]00[,.]00[,.]000/);
  });

  it('should handle negative amounts', () => {
    const result = formatMoney(-50000); // -₹500.00
    expect(result).toContain('500');
    // Should have negative sign somewhere
    expect(result).toMatch(/-/);
  });
});
