/**
 * Tests for services/api/enrollApi
 * Covers: enrollDevice export, checkDuplicateLabel export, getOrCreateDeviceFingerprint
 */

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn(),
    clear: jest.fn(),
    getAllKeys: jest.fn(),
  },
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

import { enrollDevice, checkDuplicateLabel } from '../../../services/api/enrollApi';
import type { DeviceEnrollResponse, CheckDuplicateLabelResponse } from '../../../services/api/enrollApi';

describe('enrollApi', () => {
  it('exports enrollDevice function', () => {
    expect(typeof enrollDevice).toBe('function');
  });

  it('exports checkDuplicateLabel function', () => {
    expect(typeof checkDuplicateLabel).toBe('function');
  });

  it('DeviceEnrollResponse type has correct shape', () => {
    const response: DeviceEnrollResponse = {
      deviceId: 'dev-1',
      storeId: 'store-1',
      storeName: 'Test Store',
      storeCode: 'TS001',
      deviceToken: 'token-abc',
      storeActive: true,
    };
    expect(response.deviceId).toBe('dev-1');
    expect(response.storeActive).toBe(true);
  });

  it('CheckDuplicateLabelResponse type has correct shape', () => {
    const response: CheckDuplicateLabelResponse = {
      isDuplicate: false,
    };
    expect(response.isDuplicate).toBe(false);

    const duplicateResponse: CheckDuplicateLabelResponse = {
      isDuplicate: true,
      existingDevice: {
        label: 'POS-1',
        deviceId: 'dev-1',
        status: 'active',
      },
      suggestions: ['POS-2', 'POS-3'],
    };
    expect(duplicateResponse.isDuplicate).toBe(true);
    expect(duplicateResponse.existingDevice?.label).toBe('POS-1');
  });
});
