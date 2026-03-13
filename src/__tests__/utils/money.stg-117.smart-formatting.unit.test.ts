/**
 * STG-117: Smart formatting — drop .00 on round amounts
 */

import { formatMoney } from '../../utils/money';

describe('STG-117: Smart formatting drops .00', () => {
  it('should drop .00 on round amounts', () => {
    const result = formatMoney(50000); // ₹500
    expect(result).not.toContain('.00');
    expect(result).toMatch(/500/);
  });

  it('should keep decimals on non-round amounts', () => {
    const result = formatMoney(50050); // ₹500.50
    expect(result).toContain('.50') ; // or locale equivalent
  });

  it('should drop .00 on zero', () => {
    const result = formatMoney(0);
    expect(result).not.toContain('.00');
  });

  it('should drop .00 on large round amounts', () => {
    const result = formatMoney(10000000); // ₹1,00,000
    expect(result).not.toContain('.00');
  });

  it('should keep .50 on half amounts', () => {
    const result = formatMoney(150); // ₹1.50
    expect(result).toMatch(/1.*\.50/);
  });

  it('should keep .01 on small fractions', () => {
    const result = formatMoney(1); // ₹0.01
    expect(result).toMatch(/0.*\.01/);
  });
});
