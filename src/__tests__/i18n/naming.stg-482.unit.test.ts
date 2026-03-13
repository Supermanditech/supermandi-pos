/**
 * STG-482: i18n key naming convention document
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

describe('STG-482: i18n naming convention', () => {
  const namingPath = join(__dirname, '..', '..', 'i18n', 'NAMING.md');

  it('should have NAMING.md in src/i18n/', () => {
    expect(existsSync(namingPath)).toBe(true);
  });

  it('should define key prefixes', () => {
    const content = readFileSync(namingPath, 'utf-8');
    expect(content).toContain('common.*');
    expect(content).toContain('{screen}.*');
    expect(content).toContain('components.*');
  });

  it('should define screen name mapping', () => {
    const content = readFileSync(namingPath, 'utf-8');
    expect(content).toContain('Screen Name Mapping');
    expect(content).toContain('paymentSetup');
    expect(content).toContain('dailyReport');
  });

  it('should reference i18n:validate', () => {
    const content = readFileSync(namingPath, 'utf-8');
    expect(content).toContain('i18n:validate');
  });
});
