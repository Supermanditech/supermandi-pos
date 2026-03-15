/**
 * STG-543: formatMoney — show .00 consistently for round amounts
 * (Supersedes STG-117 which stripped .00)
 */

import { formatMoney } from '../../utils/money';

describe('STG-543: formatMoney shows .00 consistently', () => {
  it('should show .00 on round amounts', () => {
    const result = formatMoney(50000); // ₹500.00
    expect(result).toContain('.00');
    expect(result).toMatch(/500/);
  });

  it('should keep decimals on non-round amounts', () => {
    const result = formatMoney(50050); // ₹500.50
    expect(result).toContain('.50');
  });

  it('should show .00 on zero', () => {
    const result = formatMoney(0);
    expect(result).toContain('.00');
  });

  it('should show .00 on large round amounts', () => {
    const result = formatMoney(10000000); // ₹1,00,000.00
    expect(result).toContain('.00');
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
