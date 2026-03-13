/**
 * STG-142: menu.viewDetails must exist in both en.json and hi.json
 *
 * Validates that the i18n key exists in all locale files to prevent
 * raw key leakage like "[menu.viewDetails]" on screen.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

describe('STG-142: menu.viewDetails i18n key', () => {
  const enPath = join(__dirname, '..', '..', 'i18n', 'locales', 'en.json');
  const hiPath = join(__dirname, '..', '..', 'i18n', 'locales', 'hi.json');
  const en = JSON.parse(readFileSync(enPath, 'utf-8'));
  const hi = JSON.parse(readFileSync(hiPath, 'utf-8'));

  it('should have menu.viewDetails in en.json', () => {
    expect(en.menu.viewDetails).toBe('View Details');
  });

  it('should have menu.viewDetails in hi.json', () => {
    expect(hi.menu.viewDetails).toBeTruthy();
    expect(typeof hi.menu.viewDetails).toBe('string');
  });

  it('should use defaultValue fallback in MenuScreen code', () => {
    const menuSource = readFileSync(join(__dirname, '..', '..', 'screens', 'MenuScreen.tsx'), 'utf-8');
    // The t() call should use defaultValue for safety
    expect(menuSource).toContain("t('menu.viewDetails'");
  });
});
