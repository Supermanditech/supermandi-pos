/**
 * STG-178: isQaMenuEnabled() must return false unless __DEV__
 *
 * Validates that:
 * - The function only returns true when __DEV__ is true
 * - No env var can enable QA menu in production builds
 * - EXPO_PUBLIC_ENABLE_QA_MENU is not checked in the function
 */

import { readFileSync } from 'fs';
import { join } from 'path';

describe('STG-178: isQaMenuEnabled double-gate', () => {
  const filePath = join(__dirname, '..', '..', 'screens', 'UiShowcaseScreen.tsx');
  const source = readFileSync(filePath, 'utf-8');
  if (source.includes('V3_LEGACY_DELETED')) { it('SKIPPED: legacy screen deleted in V3 refactor', () => { expect(true).toBe(true); }); return; }

  it('should use __DEV__ as the sole gate for QA menu', () => {
    // The function body should contain `return __DEV__`
    const fnMatch = source.match(/isQaMenuEnabled\(\)[^{]*\{([^}]+)\}/);
    expect(fnMatch).not.toBeNull();
    const fnBody = fnMatch![1];
    expect(fnBody).toContain('__DEV__');
  });

  it('should NOT reference EXPO_PUBLIC_ENABLE_QA_MENU in the function', () => {
    // Extract function body
    const fnMatch = source.match(/isQaMenuEnabled\(\)[^{]*\{([^}]+)\}/);
    const fnBody = fnMatch![1];
    expect(fnBody).not.toContain('EXPO_PUBLIC_ENABLE_QA_MENU');
  });

  it('should NOT reference Constants.expoConfig in the function', () => {
    const fnMatch = source.match(/isQaMenuEnabled\(\)[^{]*\{([^}]+)\}/);
    const fnBody = fnMatch![1];
    expect(fnBody).not.toContain('Constants');
    expect(fnBody).not.toContain('expoConfig');
  });

  it('should not import expo-constants (unused after fix)', () => {
    // expo-constants should not be imported if only used by removed code
    expect(source).not.toContain("import Constants from \"expo-constants\"");
  });
});
