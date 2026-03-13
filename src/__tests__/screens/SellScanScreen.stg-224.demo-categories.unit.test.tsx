/**
 * STG-224: DEMO_CATEGORIES must not be used as fallback in production
 *
 * Validates that:
 * - CategoryRail uses DEMO_CATEGORIES only when __DEV__ is true
 * - SellScanScreen uses DEMO_CATEGORIES only when __DEV__ is true
 * - Production fallback is empty array (not demo data)
 */

import { readFileSync } from 'fs';
import { join } from 'path';

describe('STG-224: Demo categories production guard', () => {
  const categoryRailPath = join(__dirname, '..', '..', 'components', 'sell', 'CategoryRail.tsx');
  const sellScanPath = join(__dirname, '..', '..', 'screens', 'SellScanScreen.tsx');
  const categorySource = readFileSync(categoryRailPath, 'utf-8');
  const sellScanSource = readFileSync(sellScanPath, 'utf-8');

  describe('CategoryRail.tsx', () => {
    it('should gate DEMO_CATEGORIES fallback behind __DEV__', () => {
      // The displayCategories logic should use __DEV__ before falling back to DEMO_CATEGORIES
      const pattern = /__DEV__\s*\?\s*DEMO_CATEGORIES\s*:\s*\[\]/;
      expect(pattern.test(categorySource)).toBe(true);
    });

    it('should NOT have unconditional DEMO_CATEGORIES fallback in display logic', () => {
      // Should NOT have `? categories : DEMO_CATEGORIES` without __DEV__ guard
      const unconditional = /categories\s*:\s*DEMO_CATEGORIES(?!\s*:\s*\[\])/;
      // Find lines with displayCategories assignment
      const lines = categorySource.split('\n').filter(l => l.includes('displayCategories'));
      for (const line of lines) {
        // Each displayCategories line that uses DEMO_CATEGORIES must also have __DEV__
        if (line.includes('DEMO_CATEGORIES')) {
          expect(line).toContain('__DEV__');
        }
      }
    });
  });

  describe('SellScanScreen.tsx', () => {
    it('should gate DEMO_CATEGORIES fallback behind __DEV__', () => {
      const pattern = /__DEV__\s*\?\s*DEMO_CATEGORIES\s*:\s*\[\]/;
      expect(pattern.test(sellScanSource)).toBe(true);
    });

    it('should NOT have unconditional DEMO_CATEGORIES fallback', () => {
      const lines = sellScanSource.split('\n').filter(l => l.includes('displayCategories'));
      for (const line of lines) {
        if (line.includes('DEMO_CATEGORIES')) {
          expect(line).toContain('__DEV__');
        }
      }
    });
  });
});
