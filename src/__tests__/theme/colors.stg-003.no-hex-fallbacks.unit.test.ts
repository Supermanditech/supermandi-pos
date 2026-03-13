/**
 * STG-003: No null-coalescing hex color fallbacks in theme consumers
 * All theme tokens are statically defined — ?? "#hex" is unnecessary.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

function getAllTsxFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (entry === 'node_modules' || entry === '__tests__') continue;
    if (statSync(full).isDirectory()) {
      files.push(...getAllTsxFiles(full));
    } else if (full.endsWith('.tsx') || full.endsWith('.ts')) {
      files.push(full);
    }
  }
  return files;
}

describe('STG-003: No hex color fallbacks in theme consumers', () => {
  const srcDir = join(__dirname, '..', '..');
  const pattern = /colors\.\w+\s*\?\?\s*["']#[0-9A-Fa-f]+["']/g;

  it('should have no ?? "#hex" patterns in components/', () => {
    const files = getAllTsxFiles(join(srcDir, 'components'));
    for (const file of files) {
      const source = readFileSync(file, 'utf-8');
      const matches = source.match(pattern);
      expect(matches ?? []).toEqual([]);
    }
  });

  it('should have no ?? "#hex" patterns in screens/', () => {
    const files = getAllTsxFiles(join(srcDir, 'screens'));
    for (const file of files) {
      const source = readFileSync(file, 'utf-8');
      const matches = source.match(pattern);
      expect(matches ?? []).toEqual([]);
    }
  });

  it('should have all required tokens defined in lightColors', () => {
    const { lightColors } = require('../../theme/colors');
    const requiredTokens = [
      'primary', 'primaryDark', 'primaryLight',
      'accent', 'accentDark', 'accentLight',
      'error', 'errorDark', 'errorSoft',
      'success', 'successDark', 'successSoft',
      'warning', 'warningDark', 'warningSoft',
    ];
    for (const token of requiredTokens) {
      expect(lightColors).toHaveProperty(token);
    }
  });
});
