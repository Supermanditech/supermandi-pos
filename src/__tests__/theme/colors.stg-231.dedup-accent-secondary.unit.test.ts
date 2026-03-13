/**
 * STG-231: Deduplicate accent/secondary — secondary aliases accent
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { lightColors, darkColors } from '../../theme/colors';

describe('STG-231: accent/secondary deduplication', () => {
  it('should have secondary equal to accent in light palette', () => {
    expect(lightColors.secondary).toBe(lightColors.accent);
    expect(lightColors.secondaryDark).toBe(lightColors.accentDark);
    expect(lightColors.secondaryLight).toBe(lightColors.accentLight);
  });

  it('should have secondary equal to accent in dark palette', () => {
    expect(darkColors.secondary).toBe(darkColors.accent);
    expect(darkColors.secondaryDark).toBe(darkColors.accentDark);
    expect(darkColors.secondaryLight).toBe(darkColors.accentLight);
  });

  it('should mark secondary as deprecated in source', () => {
    const source = readFileSync(
      join(__dirname, '..', '..', 'theme', 'colors.ts'),
      'utf-8'
    );
    expect(source).toContain('@deprecated');
    expect(source).toContain('alias of accent');
  });

  it('should not use colors.secondary fallback in SellTile', () => {
    const source = readFileSync(
      join(__dirname, '..', '..', 'components', 'sell', 'SellTile.tsx'),
      'utf-8'
    );
    expect(source).not.toContain('colors.secondary');
  });
});
