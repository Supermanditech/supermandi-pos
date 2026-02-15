/**
 * Deep tests for POS upiIntent + storeName utilities
 * Covers: buildUpiIntent edge cases (null/missing VPA, amount conversion,
 * URL encoding, transaction ID, custom note, store name formatting)
 */
import { buildUpiIntent } from '../../utils/upiIntent';
import { formatStoreName } from '../../utils/storeName';

describe('formatStoreName', () => {
  it('title-cases store name', () => {
    expect(formatStoreName('test mart')).toBe('Test Mart');
  });

  it('capitalizes SuperMandi specifically', () => {
    expect(formatStoreName('supermandi store')).toBe('SuperMandi Store');
  });

  it('returns null for null/undefined', () => {
    expect(formatStoreName(null)).toBeNull();
    expect(formatStoreName(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(formatStoreName('')).toBeNull();
    expect(formatStoreName('   ')).toBeNull();
  });

  it('handles single word', () => {
    expect(formatStoreName('STORE')).toBe('Store');
  });

  it('handles multiple spaces', () => {
    expect(formatStoreName('super    mart')).toBe('Super Mart');
  });
});

describe('buildUpiIntent', () => {
  const validInput = {
    upiVpa: 'store@upi',
    storeName: 'Test Mart',
    amountMinor: 15000, // ₹150.00
    transactionId: 'txn-123',
  };

  it('builds valid UPI intent URL', () => {
    const result = buildUpiIntent(validInput);
    expect(result).toContain('upi://pay');
    expect(result).toContain('pa=store%40upi');
    expect(result).toContain('am=150.00');
    expect(result).toContain('cu=INR');
    expect(result).toContain('tr=txn-123');
    expect(result).toContain('pn=Test%20Mart');
  });

  it('returns null for null input', () => {
    expect(buildUpiIntent(null as any)).toBeNull();
  });

  it('returns null for empty VPA', () => {
    expect(buildUpiIntent({ ...validInput, upiVpa: '' })).toBeNull();
    expect(buildUpiIntent({ ...validInput, upiVpa: '  ' })).toBeNull();
  });

  it('returns null for null VPA', () => {
    expect(buildUpiIntent({ ...validInput, upiVpa: null })).toBeNull();
  });

  it('returns null for empty transactionId', () => {
    expect(buildUpiIntent({ ...validInput, transactionId: '' })).toBeNull();
  });

  it('converts paise to rupees correctly', () => {
    const result = buildUpiIntent({ ...validInput, amountMinor: 12345 })!;
    expect(result).toContain('am=123.45');
  });

  it('handles zero amount', () => {
    const result = buildUpiIntent({ ...validInput, amountMinor: 0 })!;
    expect(result).toContain('am=0.00');
  });

  it('handles negative amount as zero', () => {
    const result = buildUpiIntent({ ...validInput, amountMinor: -5000 })!;
    expect(result).toContain('am=0.00');
  });

  it('uses default note when not provided', () => {
    const result = buildUpiIntent(validInput)!;
    expect(result).toContain('tn=Supermandi%20POS%20Sale');
  });

  it('uses custom note when provided', () => {
    const result = buildUpiIntent({ ...validInput, note: 'Custom Note' })!;
    expect(result).toContain('tn=Custom%20Note');
  });

  it('uses "SuperMandi Store" as fallback store name', () => {
    const result = buildUpiIntent({ ...validInput, storeName: null })!;
    expect(result).toContain('pn=SuperMandi%20Store');
  });

  it('handles non-finite amountMinor', () => {
    const result = buildUpiIntent({ ...validInput, amountMinor: NaN })!;
    expect(result).toContain('am=0.00');
  });
});
