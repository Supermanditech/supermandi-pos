/**
 * STG-233: ink token assigned purpose — high-contrast text
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { lightColors, darkColors } from '../../theme/colors';

describe('STG-233: ink token purpose', () => {
  it('should have ink token defined in both palettes', () => {
    expect(lightColors.ink).toBeDefined();
    expect(darkColors.ink).toBeDefined();
  });

  it('should have dark ink in light mode and light ink in dark mode', () => {
    // Light mode ink should be dark (for contrast)
    expect(lightColors.ink).toMatch(/^#[0-2]/); // starts with low hex = dark
    // Dark mode ink should be light (for contrast)
    expect(darkColors.ink).toMatch(/^#[A-F]/i); // starts with high hex = light
  });

  it('should have purpose comment in source', () => {
    const source = readFileSync(
      join(__dirname, '..', '..', 'theme', 'colors.ts'),
      'utf-8'
    );
    expect(source).toContain('STG-233');
    expect(source).toContain('High-contrast text');
  });
});
