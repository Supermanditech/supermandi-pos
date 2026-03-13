/**
 * STG-011: Typography audit for POS-grade readability
 * POS devices: 5-7" screens, arm's length reading distance.
 * Minimum readable size: 14px. Recommended body: 16-18px.
 */

import { typography } from '../../theme/typography';

describe('STG-011: POS-grade typography readability', () => {
  it('should have minimum font size >= 14px for readability', () => {
    for (const [key, style] of Object.entries(typography)) {
      expect(style.fontSize).toBeGreaterThanOrEqual(14);
    }
  });

  it('should have body text >= 16px for POS readability', () => {
    expect(typography.body.fontSize).toBeGreaterThanOrEqual(16);
    expect(typography.bodySmall.fontSize).toBeGreaterThanOrEqual(16);
    expect(typography.bodyLarge.fontSize).toBeGreaterThanOrEqual(18);
  });

  it('should have button text >= 16px for tap targets', () => {
    expect(typography.button.fontSize).toBeGreaterThanOrEqual(16);
  });

  it('should have appropriate line height ratios (1.2x-1.6x)', () => {
    for (const [key, style] of Object.entries(typography)) {
      const ratio = style.lineHeight / style.fontSize;
      expect(ratio).toBeGreaterThanOrEqual(1.2);
      expect(ratio).toBeLessThanOrEqual(1.6);
    }
  });

  it('should have heading hierarchy (h1 > h2 > h3 > h4)', () => {
    expect(typography.h1.fontSize).toBeGreaterThan(typography.h2.fontSize);
    expect(typography.h2.fontSize).toBeGreaterThan(typography.h3.fontSize);
    expect(typography.h3.fontSize).toBeGreaterThan(typography.h4.fontSize);
  });

  it('should have all required text styles', () => {
    const requiredStyles = ['h1', 'h2', 'h3', 'h4', 'body', 'bodyLarge', 'bodySmall', 'button', 'caption', 'label'];
    for (const style of requiredStyles) {
      expect(typography).toHaveProperty(style);
    }
  });
});
