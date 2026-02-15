/**
 * Tests for services/api/readinessGate helper functions
 * Covers: isFeatureReady, getFeatureBlocker, isCacheStale, clearReadinessCache,
 *         clearFeatureCache, getReadinessState, subscribeToReadiness
 */

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn(), clear: jest.fn(), getAllKeys: jest.fn() },
}));

jest.mock('expo-secure-store', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(false),
  getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn(),
}));

jest.mock('../../../services/deviceSession', () => ({
  getDeviceToken: jest.fn().mockResolvedValue('test-token'),
  getDeviceStoreId: jest.fn().mockResolvedValue('store-1'),
  getDeviceSession: jest.fn().mockResolvedValue(null),
  clearDeviceSession: jest.fn(),
  saveDeviceSession: jest.fn(),
  getDeviceIdFromSession: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../../config/api', () => ({
  API_BASE_URL: 'http://localhost:3000',
}));

import {
  isFeatureReady,
  getFeatureBlocker,
  isCacheStale,
  clearReadinessCache,
  clearFeatureCache,
  getReadinessState,
  subscribeToReadiness,
} from '../../../services/api/readinessGate';

describe('readinessGate', () => {
  beforeEach(() => {
    clearReadinessCache();
  });

  describe('getReadinessState', () => {
    it('returns null when never probed', () => {
      expect(getReadinessState()).toBeNull();
    });
  });

  describe('isCacheStale', () => {
    it('returns true when never probed', () => {
      expect(isCacheStale()).toBe(true);
    });
  });

  describe('clearReadinessCache', () => {
    it('clears cached state', () => {
      clearReadinessCache();
      expect(getReadinessState()).toBeNull();
      expect(isCacheStale()).toBe(true);
    });
  });

  describe('isFeatureReady', () => {
    it('returns false when no cached state', () => {
      expect(isFeatureReady('liveSuppliers')).toBe(false);
      expect(isFeatureReady('stockIn')).toBe(false);
      expect(isFeatureReady('dailySummary')).toBe(false);
    });

    it('returns false for unknown feature', () => {
      expect(isFeatureReady('unknown' as any)).toBe(false);
    });
  });

  describe('getFeatureBlocker', () => {
    it('returns "Backend not probed yet" when no cached state', () => {
      expect(getFeatureBlocker('liveSuppliers')).toBe('Backend not probed yet');
      expect(getFeatureBlocker('stockIn')).toBe('Backend not probed yet');
      expect(getFeatureBlocker('dailySummary')).toBe('Backend not probed yet');
    });

    it('returns "Backend not probed yet" for unknown feature when cache is empty', () => {
      // When cachedState is null, all features (including unknown) return "Backend not probed yet"
      expect(getFeatureBlocker('unknown' as any)).toBe('Backend not probed yet');
    });
  });

  describe('subscribeToReadiness', () => {
    it('returns unsubscribe function', () => {
      const listener = jest.fn();
      const unsubscribe = subscribeToReadiness(listener);
      expect(typeof unsubscribe).toBe('function');
      // No cached state, listener should not be called
      expect(listener).not.toHaveBeenCalled();
      unsubscribe();
    });
  });
});
