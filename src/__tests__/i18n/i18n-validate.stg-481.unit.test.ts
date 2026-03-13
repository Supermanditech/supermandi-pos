/**
 * STG-481: i18n key parity validator
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('STG-481: i18n key parity validator', () => {
  it('should have the validator script', () => {
    const script = readFileSync(
      join(__dirname, '..', '..', '..', 'scripts', 'i18n-validate.js'),
      'utf-8'
    );
    expect(script).toContain('flattenKeys');
    expect(script).toContain('en.json');
    expect(script).toContain('hi.json');
  });

  it('should pass parity check (exit 0)', () => {
    const result = execSync('node scripts/i18n-validate.js', {
      cwd: join(__dirname, '..', '..', '..'),
      encoding: 'utf-8',
    });
    expect(result).toContain('parity check passed');
  });

  it('should have i18n:validate script in package.json', () => {
    const pkg = JSON.parse(
      readFileSync(join(__dirname, '..', '..', '..', 'package.json'), 'utf-8')
    );
    expect(pkg.scripts['i18n:validate']).toBe('node scripts/i18n-validate.js');
  });
});
