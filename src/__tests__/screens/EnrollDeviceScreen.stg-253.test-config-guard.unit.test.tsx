/**
 * STG-253: TEST_STORE_CONFIG must not leak into production builds
 *
 * Validates that:
 * - TEST_STORE_CONFIG is null when __DEV__ is false
 * - EXPO_PUBLIC_TEST_PHONE is not in app.json
 * - EnrollDeviceScreen usage is behind __DEV__ guard
 */

import { readFileSync } from 'fs';
import { join } from 'path';

describe('STG-253: TEST_STORE_CONFIG production guard', () => {
  it('should return null when __DEV__ is false in api.ts', () => {
    const apiSource = readFileSync(join(__dirname, '..', '..', 'config', 'api.ts'), 'utf-8');
    // TEST_STORE_CONFIG must use __DEV__ ternary with null fallback
    expect(apiSource).toMatch(/TEST_STORE_CONFIG\s*=\s*__DEV__[\s\S]*?\?\s*\{[\s\S]*?\}\s*:\s*null/);
  });

  it('should not have EXPO_PUBLIC_TEST_PHONE in app.json', () => {
    const appJson = readFileSync(join(__dirname, '..', '..', '..', 'app.json'), 'utf-8');
    expect(appJson).not.toContain('EXPO_PUBLIC_TEST_PHONE');
    expect(appJson).not.toContain('EXPO_PUBLIC_TEST_PIN');
  });

  it('should only use TEST_STORE_CONFIG inside __DEV__ block in EnrollDeviceScreen', () => {
    const source = readFileSync(join(__dirname, '..', '..', 'screens', 'EnrollDeviceScreen.tsx'), 'utf-8');
    const jsxSection = source.substring(source.indexOf('return ('));

    // Find all TEST_STORE_CONFIG usages in JSX
    const testConfigIndex = jsxSection.indexOf('TEST_STORE_CONFIG');
    expect(testConfigIndex).toBeGreaterThan(-1);

    // The __DEV__ guard should appear before any TEST_STORE_CONFIG usage
    const pattern = /\{__DEV__\s*&&\s*\([^]*?TEST_STORE_CONFIG/;
    expect(pattern.test(jsxSection)).toBe(true);
  });
});
