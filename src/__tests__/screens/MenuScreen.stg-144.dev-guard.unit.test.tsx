/**
 * STG-144: Developer/QA section + BUILD INFO + release footer must be __DEV__-gated
 *
 * Validates that:
 * - QA menu section requires __DEV__ === true (not just showQaMenu flag)
 * - BUILD INFO section is behind __DEV__ guard
 * - Release build footer (SHA/deploy stamp) is behind __DEV__ guard
 * - In production (__DEV__ === false), none of these sections render
 */

import { readFileSync } from 'fs';
import { join } from 'path';

describe('STG-144: __DEV__ guard on developer sections', () => {
  const menuScreenPath = join(__dirname, '..', '..', 'screens', 'MenuScreen.tsx');
  const source = readFileSync(menuScreenPath, 'utf-8');

  describe('QA menu section', () => {
    it('should gate showQaMenu behind __DEV__', () => {
      // The QA section must use `__DEV__ && showQaMenu` — not just `showQaMenu`
      expect(source).toContain('__DEV__ && showQaMenu');
    });

    it('should NOT have unguarded showQaMenu render', () => {
      // Find all `{showQaMenu &&` patterns that are NOT preceded by `__DEV__ &&`
      const unguardedPattern = /\{showQaMenu\s*&&\s*\(/g;
      const allShowQaMenu = source.match(unguardedPattern);
      // There should be zero standalone `{showQaMenu && (` without __DEV__
      expect(allShowQaMenu).toBeNull();
    });
  });

  describe('BUILD INFO section', () => {
    it('should be inside a __DEV__ conditional block', () => {
      // The `{__DEV__ && (` pattern should appear before the Build Info render
      // Use regex to find `{__DEV__ && (` followed eventually by `Build Info`
      const pattern = /\{__DEV__\s*&&\s*\([^]*?Build Info/;
      expect(pattern.test(source)).toBe(true);
    });
  });

  describe('Release build footer', () => {
    it('should be inside a __DEV__ conditional block', () => {
      // The `{__DEV__ && (` pattern should appear before `buildShaLabel` in the JSX
      // Find the JSX return section
      const jsxStart = source.indexOf('return (');
      const jsx = source.substring(jsxStart);

      // Find `{__DEV__ && (` followed by `buildShaLabel` within the same block
      const pattern = /\{__DEV__\s*&&\s*\([^]*?buildShaLabel/;
      expect(pattern.test(jsx)).toBe(true);
    });

    it('should NOT have an unguarded buildShaLabel render', () => {
      // In the JSX, every `buildShaLabel` usage should be inside a __DEV__ block
      const jsxStart = source.indexOf('return (');
      const jsx = source.substring(jsxStart);

      // Split JSX by `{__DEV__ && (` blocks and check that buildShaLabel
      // only appears inside those blocks
      const lines = jsx.split('\n');
      let insideDevBlock = false;
      let devBlockDepth = 0;

      for (const line of lines) {
        if (line.includes('__DEV__') && line.includes('&&')) {
          insideDevBlock = true;
          devBlockDepth = 0;
        }
        if (insideDevBlock) {
          devBlockDepth += (line.match(/\(/g) || []).length;
          devBlockDepth -= (line.match(/\)/g) || []).length;
          if (devBlockDepth <= 0 && insideDevBlock && !line.includes('__DEV__')) {
            insideDevBlock = false;
          }
        }
        if (line.includes('buildShaLabel')) {
          expect(insideDevBlock).toBe(true);
        }
      }
    });
  });

  describe('No sensitive strings in production path', () => {
    it('should have API_BASE_URL display inside __DEV__ block', () => {
      // API_BASE_URL should only appear in JSX inside a __DEV__ block
      const pattern = /\{__DEV__\s*&&\s*\([^]*?API_BASE_URL/;
      expect(pattern.test(source)).toBe(true);
    });
  });
});
