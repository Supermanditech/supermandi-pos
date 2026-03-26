/**
 * STG-231 + GCP-STG-0773: secondary aliases removed — accent is canonical
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { lightColors, darkColors } from '../../theme/colors';

describe('GCP-STG-0773: secondary color aliases removed', () => {
  it('should NOT have secondary, secondaryDark, secondaryLight in light palette', () => {
    expect('secondary' in lightColors).toBe(false);
    expect('secondaryDark' in lightColors).toBe(false);
    expect('secondaryLight' in lightColors).toBe(false);
  });

  it('should NOT have secondary, secondaryDark, secondaryLight in dark palette', () => {
    expect('secondary' in darkColors).toBe(false);
    expect('secondaryDark' in darkColors).toBe(false);
    expect('secondaryLight' in darkColors).toBe(false);
  });

  it('should have accent colors as canonical', () => {
    expect((lightColors as any).accent).toBeDefined();
    expect((lightColors as any).accentDark).toBeDefined();
    expect((lightColors as any).accentLight).toBeDefined();
  });

  it('should have GCP-STG-0773 removal comment in source', () => {
    const source = readFileSync(
      join(__dirname, '..', '..', 'theme', 'colors.ts'),
      'utf-8'
    );
    expect(source).toContain('GCP-STG-0773');
    expect(source).not.toContain('secondary: "');
  });

  it('should not use colors.secondary in SellTile', () => {
    const source = readFileSync(
      join(__dirname, '..', '..', 'components', 'sell', 'SellTile.tsx'),
      'utf-8'
    );
    expect(source).not.toContain('colors.secondary');
  });
});
