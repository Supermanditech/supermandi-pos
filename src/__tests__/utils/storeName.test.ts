/**
 * Tests for utils/storeName
 */
import { formatStoreName } from '../../utils/storeName';

describe('formatStoreName', () => {
  it('returns null for null input', () => {
    expect(formatStoreName(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(formatStoreName(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(formatStoreName('')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(formatStoreName('   ')).toBeNull();
  });

  it('returns null for non-string input', () => {
    expect(formatStoreName(123 as any)).toBeNull();
  });

  it('title-cases single word', () => {
    expect(formatStoreName('hello')).toBe('Hello');
  });

  it('title-cases multiple words', () => {
    expect(formatStoreName('HELLO WORLD')).toBe('Hello World');
  });

  it('replaces Supermandi with SuperMandi', () => {
    expect(formatStoreName('supermandi store')).toBe('SuperMandi Store');
  });

  it('trims whitespace', () => {
    expect(formatStoreName('  hello  ')).toBe('Hello');
  });

  it('handles multiple spaces', () => {
    expect(formatStoreName('hello   world')).toBe('Hello World');
  });

  it('handles mixed case', () => {
    expect(formatStoreName('hElLo WoRlD')).toBe('Hello World');
  });

  it('handles single character', () => {
    expect(formatStoreName('a')).toBe('A');
  });
});
