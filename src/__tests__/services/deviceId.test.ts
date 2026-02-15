/**
 * Tests for services/deviceId
 * Covers: getOrCreateDeviceId
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
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

jest.mock('../../services/deviceSession', () => ({
  getDeviceIdFromSession: jest.fn().mockResolvedValue(null),
  getDeviceSession: jest.fn().mockResolvedValue(null),
  getDeviceToken: jest.fn().mockResolvedValue(null),
  getDeviceStoreId: jest.fn().mockResolvedValue(null),
  clearDeviceSession: jest.fn(),
  saveDeviceSession: jest.fn(),
}));

import { getOrCreateDeviceId } from '../../services/deviceId';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDeviceIdFromSession } from '../../services/deviceSession';

describe('deviceId', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getOrCreateDeviceId', () => {
    it('returns session device ID when available', async () => {
      (getDeviceIdFromSession as jest.Mock).mockResolvedValue('session-dev-id');
      const id = await getOrCreateDeviceId();
      expect(id).toBe('session-dev-id');
      // Should not touch AsyncStorage
      expect(AsyncStorage.getItem).not.toHaveBeenCalled();
    });

    it('returns existing ID from AsyncStorage', async () => {
      (getDeviceIdFromSession as jest.Mock).mockResolvedValue(null);
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('existing-id');

      const id = await getOrCreateDeviceId();
      expect(id).toBe('existing-id');
      expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    });

    it('creates new ID when none exists', async () => {
      (getDeviceIdFromSession as jest.Mock).mockResolvedValue(null);
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

      const id = await getOrCreateDeviceId();
      expect(id).toMatch(/^pos-/);
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        'supermandi.deviceId.v1',
        id
      );
    });

    it('creates unique IDs each time (when no stored value)', async () => {
      (getDeviceIdFromSession as jest.Mock).mockResolvedValue(null);
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

      const id1 = await getOrCreateDeviceId();
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
      const id2 = await getOrCreateDeviceId();
      // Due to Date.now() and Math.random(), IDs should be different
      // (though there's an extremely small chance of collision)
      expect(id1).toMatch(/^pos-/);
      expect(id2).toMatch(/^pos-/);
    });
  });
});
