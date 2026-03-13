/**
 * STG-145: BUILD INFO must not leak token, StoreId UUID, or raw API URL
 *
 * Validates that:
 * - Token suffix is replaced with "Authenticated" status indicator
 * - StoreId UUID line is removed (only StoreCode shown)
 * - API URL is masked (no protocol/port visible)
 */

import { readFileSync } from 'fs';
import { join } from 'path';

describe('STG-145: Sensitive data removal from BUILD INFO', () => {
  const menuScreenPath = join(__dirname, '..', '..', 'screens', 'MenuScreen.tsx');
  const source = readFileSync(menuScreenPath, 'utf-8');

  describe('Token display', () => {
    it('should NOT display partial token suffix', () => {
      // The old pattern `Token: ...{devInfo.tokenSuffix}` should not exist
      expect(source).not.toContain('Token: ...{devInfo.tokenSuffix}');
    });

    it('should show authentication status instead of token', () => {
      // Should use "Authenticated" or similar status text
      expect(source).toContain('Authenticated');
    });
  });

  describe('StoreId UUID', () => {
    it('should NOT display StoreId UUID in the device info section', () => {
      // The old pattern `StoreId: {devInfo.storeId` should not be in JSX
      const jsxSection = source.substring(source.indexOf('return ('));
      expect(jsxSection).not.toContain('StoreId: {devInfo.storeId');
    });

    it('should still display StoreCode', () => {
      expect(source).toContain('StoreCode: {devInfo.storeCode');
    });
  });

  describe('API URL masking', () => {
    it('should mask protocol and port from API URL display', () => {
      // API URL should strip protocol and port
      const jsxSection = source.substring(source.indexOf('return ('));
      // Should NOT have raw `API: {API_BASE_URL}` without masking
      expect(jsxSection).not.toMatch(/API: \{API_BASE_URL\}(?![\.\?])/);
    });

    it('should apply URL masking via replace', () => {
      // Should have a replace call to strip protocol/port
      expect(source).toContain("API_BASE_URL?.replace");
    });
  });
});
