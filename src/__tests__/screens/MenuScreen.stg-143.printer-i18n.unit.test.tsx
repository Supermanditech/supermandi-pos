/**
 * STG-143: menu.printerReady and menu.testPrint must exist in both locales
 */

import { readFileSync } from 'fs';
import { join } from 'path';

describe('STG-143: Printer i18n keys', () => {
  const en = JSON.parse(readFileSync(join(__dirname, '..', '..', 'i18n', 'locales', 'en.json'), 'utf-8'));
  const hi = JSON.parse(readFileSync(join(__dirname, '..', '..', 'i18n', 'locales', 'hi.json'), 'utf-8'));

  const requiredKeys = ['printerReady', 'printerUnavailable', 'testPrint', 'printerOk', 'testPrintSuccess', 'printerError', 'testPrintFailed'];

  for (const key of requiredKeys) {
    it(`should have menu.${key} in en.json`, () => {
      expect(en.menu[key]).toBeTruthy();
    });

    it(`should have menu.${key} in hi.json`, () => {
      expect(hi.menu[key]).toBeTruthy();
    });
  }

  it('should use inline fallbacks in MenuScreen code', () => {
    const source = readFileSync(join(__dirname, '..', '..', 'screens', 'MenuScreen.tsx'), 'utf-8');
    expect(source).toContain("t('menu.printerReady'");
    expect(source).toContain("t('menu.testPrint'");
  });
});
