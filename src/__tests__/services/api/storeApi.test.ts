/**
 * Tests for services/api/storeApi
 * Covers: fetchStoreStatus export, StoreStatusResponse type
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

jest.mock('../../../services/deviceSession', () => ({
  clearDeviceSession: jest.fn(),
  getDeviceToken: jest.fn().mockResolvedValue(null),
  getDeviceSession: jest.fn().mockResolvedValue(null),
  saveDeviceSession: jest.fn(),
  getDeviceStoreId: jest.fn().mockResolvedValue(null),
  getDeviceIdFromSession: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../../stores/staffSessionStore', () => ({
  useStaffSessionStore: { getState: () => ({ session: null }) },
}));

jest.mock('../../../i18n', () => ({ language: 'en' }));

jest.mock('../../../config/api', () => ({
  API_BASE_URL: 'http://localhost:3000',
}));

jest.mock('../../../services/api/storage', () => ({
  getAuthToken: jest.fn().mockResolvedValue(null),
  setAuthToken: jest.fn(),
  clearAuthToken: jest.fn(),
}));

import { fetchStoreStatus } from '../../../services/api/storeApi';
import { ApiError } from '../../../services/api/apiClient';
import type { StoreStatusResponse } from '../../../services/api/storeApi';

describe('storeApi', () => {
  it('exports fetchStoreStatus function', () => {
    expect(typeof fetchStoreStatus).toBe('function');
  });

  it('throws when no storeId and no device session', async () => {
    await expect(fetchStoreStatus()).rejects.toThrow();
  });

  it('StoreStatusResponse type has correct shape', () => {
    const response: StoreStatusResponse = {
      storeId: 'store-1',
      active: true,
      name: 'Test Store',
    };
    expect(response.storeId).toBe('store-1');
    expect(response.active).toBe(true);
  });
});
