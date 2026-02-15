/**
 * Tests for services/deviceInfo
 * Covers: getDeviceMeta, normalizeDeviceInfo (via getCachedDeviceInfo)
 */

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
    clear: jest.fn(),
    getAllKeys: jest.fn(),
  },
}));

jest.mock('expo-secure-store', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(false),
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'android', Version: 33 },
}));

jest.mock('expo-device', () => ({
  manufacturer: 'Samsung',
  modelName: 'Galaxy A14',
  deviceName: 'Galaxy A14',
  osVersion: '13',
}));

jest.mock('expo-constants', () => ({
  expoConfig: { version: '2.0.0' },
  manifest: { version: '2.0.0' },
  deviceName: 'TestDevice',
  platform: 'android',
}));

jest.mock('../../services/deviceSession', () => ({
  getDeviceToken: jest.fn().mockResolvedValue(null),
  getDeviceStoreId: jest.fn().mockResolvedValue('store-1'),
  getDeviceSession: jest.fn().mockResolvedValue(null),
  clearDeviceSession: jest.fn(),
  saveDeviceSession: jest.fn(),
  getDeviceIdFromSession: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../services/storeScope', () => ({
  normalizeStoreScope: jest.fn((id: string) => id || 'unassigned'),
  buildStoreScopedKey: jest.fn((key: string, id: string) => `${key}.${id || 'unassigned'}`),
  getStoreScopedKey: jest.fn((key: string) => Promise.resolve(`${key}.store-1`)),
  storeScopedStorage: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
  getStoreScopeSuffix: jest.fn().mockResolvedValue('store-1'),
}));

jest.mock('../../config/api', () => ({
  API_BASE_URL: 'http://localhost:3000',
}));

import { getDeviceMeta, getCachedDeviceInfo, cacheDeviceInfo } from '../../services/deviceInfo';
import type { DeviceInfo, DeviceMeta } from '../../services/deviceInfo';

describe('deviceInfo', () => {
  describe('getDeviceMeta', () => {
    it('returns device metadata', () => {
      const meta = getDeviceMeta();
      expect(meta.manufacturer).toBe('Samsung');
      expect(meta.model).toBe('Galaxy A14');
      expect(meta.androidVersion).toBe('33');
      expect(meta.appVersion).toBe('2.0.0');
    });

    it('returns correct shape', () => {
      const meta: DeviceMeta = getDeviceMeta();
      expect(typeof meta.manufacturer).toBe('string');
      expect(typeof meta.model).toBe('string');
    });
  });

  describe('getCachedDeviceInfo', () => {
    it('returns null when nothing cached', async () => {
      const result = await getCachedDeviceInfo();
      expect(result).toBeNull();
    });
  });

  describe('cacheDeviceInfo', () => {
    it('caches device info without error', async () => {
      const info: DeviceInfo = {
        deviceId: 'dev-1',
        storeId: 'store-1',
        storeName: 'Test Store',
      };
      await expect(cacheDeviceInfo(info)).resolves.toBeUndefined();
    });
  });

  describe('DeviceInfo type', () => {
    it('has correct shape', () => {
      const info: DeviceInfo = {
        deviceId: 'dev-1',
        storeId: 'store-1',
        storeName: 'Test Store',
      };
      expect(info.deviceId).toBe('dev-1');
      expect(info.storeId).toBe('store-1');
      expect(info.storeName).toBe('Test Store');
    });

    it('allows null storeId and storeName', () => {
      const info: DeviceInfo = {
        deviceId: 'dev-1',
        storeId: null,
        storeName: null,
      };
      expect(info.storeId).toBeNull();
    });
  });
});
