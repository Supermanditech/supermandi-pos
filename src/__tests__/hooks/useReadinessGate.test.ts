/**
 * Tests for useReadinessGate re-exported pure functions
 */

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn(), clear: jest.fn(), getAllKeys: jest.fn() },
}));

jest.mock('expo-secure-store', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(false),
  getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn(),
}));

jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn().mockResolvedValue({ isConnected: true }),
  addEventListener: jest.fn(),
}));

jest.mock('../../services/api/readinessGate', () => ({
  probeReadiness: jest.fn(),
  getReadinessState: jest.fn().mockReturnValue(null),
  isCacheStale: jest.fn().mockReturnValue(true),
  isFeatureReady: jest.fn().mockReturnValue(false),
  getFeatureBlocker: jest.fn().mockReturnValue('not probed'),
  clearFeatureCache: jest.fn(),
  subscribeToReadiness: jest.fn().mockReturnValue(() => {}),
}));

import {
  isFeatureReady,
  getFeatureBlocker,
  clearFeatureCache,
  probeReadiness,
} from '../../hooks/useReadinessGate';

describe('useReadinessGate re-exports', () => {
  it('re-exports isFeatureReady', () => {
    expect(typeof isFeatureReady).toBe('function');
  });

  it('re-exports getFeatureBlocker', () => {
    expect(typeof getFeatureBlocker).toBe('function');
  });

  it('re-exports clearFeatureCache', () => {
    expect(typeof clearFeatureCache).toBe('function');
  });

  it('re-exports probeReadiness', () => {
    expect(typeof probeReadiness).toBe('function');
  });
});
