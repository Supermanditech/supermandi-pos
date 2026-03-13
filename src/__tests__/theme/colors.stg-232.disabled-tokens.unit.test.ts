/**
 * STG-232: Disabled state tokens in both light and dark palettes
 */

import { lightColors, darkColors } from '../../theme/colors';

describe('STG-232: Disabled state design tokens', () => {
  const requiredTokens = ['disabled', 'disabledText', 'disabledBg'] as const;

  it('should have disabled tokens in light palette', () => {
    for (const token of requiredTokens) {
      expect(lightColors).toHaveProperty(token);
      expect(typeof lightColors[token]).toBe('string');
      expect(lightColors[token].length).toBeGreaterThan(0);
    }
  });

  it('should have disabled tokens in dark palette', () => {
    for (const token of requiredTokens) {
      expect(darkColors).toHaveProperty(token);
      expect(typeof darkColors[token]).toBe('string');
      expect(darkColors[token].length).toBeGreaterThan(0);
    }
  });

  it('should have different values for light vs dark disabled tokens', () => {
    // Dark mode tokens should differ from light mode for visual distinction
    expect(darkColors.disabledBg).not.toBe(lightColors.disabledBg);
  });

  it('should have both palettes with same keys (type parity)', () => {
    const lightKeys = Object.keys(lightColors).sort();
    const darkKeys = Object.keys(darkColors).sort();
    expect(lightKeys).toEqual(darkKeys);
  });
});
