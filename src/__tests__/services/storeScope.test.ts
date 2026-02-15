/**
 * Deep tests for POS storeScope service
 * Covers: normalizeStoreScope, buildStoreScopedKey (sanitization, fallback)
 */

// Must mock AsyncStorage + dependencies before importing storeScope
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
}));

jest.mock('expo-secure-store', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(false),
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

import { normalizeStoreScope, buildStoreScopedKey } from '../../services/storeScope';

describe('storeScope', () => {
  describe('normalizeStoreScope', () => {
    it('returns store ID as-is when alphanumeric', () => {
      expect(normalizeStoreScope('store-001')).toBe('store-001');
    });

    it('sanitizes special characters to underscores', () => {
      expect(normalizeStoreScope('store@#$001')).toBe('store___001');
    });

    it('returns "unassigned" for null', () => {
      expect(normalizeStoreScope(null)).toBe('unassigned');
    });

    it('returns "unassigned" for undefined', () => {
      expect(normalizeStoreScope(undefined)).toBe('unassigned');
    });

    it('returns "unassigned" for empty string', () => {
      expect(normalizeStoreScope('')).toBe('unassigned');
    });

    it('returns "unassigned" for whitespace-only', () => {
      expect(normalizeStoreScope('   ')).toBe('unassigned');
    });

    it('trims whitespace before sanitizing', () => {
      expect(normalizeStoreScope('  abc  ')).toBe('abc');
    });

    it('preserves underscores and hyphens', () => {
      expect(normalizeStoreScope('my_store-123')).toBe('my_store-123');
    });
  });

  describe('buildStoreScopedKey', () => {
    it('builds scoped key with store ID', () => {
      expect(buildStoreScopedKey('mykey', 'store-001')).toBe('mykey.store-001');
    });

    it('uses unassigned when storeId is null', () => {
      expect(buildStoreScopedKey('mykey', null)).toBe('mykey.unassigned');
    });

    it('uses unassigned when storeId is undefined', () => {
      expect(buildStoreScopedKey('mykey')).toBe('mykey.unassigned');
    });

    it('sanitizes special chars in storeId', () => {
      expect(buildStoreScopedKey('cache', 'store!@#')).toBe('cache.store___');
    });
  });
});
