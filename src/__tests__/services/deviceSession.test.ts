/**
 * Tests for services/deviceSession
 * Covers: normalizeSession, getDeviceSession, saveDeviceSession, clearDeviceSession,
 *         getDeviceToken, getDeviceStoreId, getDeviceIdFromSession, getCachedSession, isCacheLoaded
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
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

// We need to reimport on each test to reset module-level state
beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
});

describe('deviceSession', () => {
  describe('getDeviceSession', () => {
    it('returns null when no session stored', async () => {
      const { getDeviceSession } = require('../../services/deviceSession');
      const session = await getDeviceSession();
      expect(session).toBeNull();
    });

    it('loads session from AsyncStorage when SecureStore unavailable', async () => {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      const sessionData = {
        deviceId: 'dev-1',
        storeId: 'store-1',
        deviceToken: 'token-abc',
      };
      AsyncStorage.getItem.mockResolvedValue(JSON.stringify(sessionData));

      const { getDeviceSession } = require('../../services/deviceSession');
      const session = await getDeviceSession();
      expect(session).toEqual({
        deviceId: 'dev-1',
        storeId: 'store-1',
        deviceToken: 'token-abc',
        deviceType: null,
      });
    });

    it('loads session from SecureStore when available', async () => {
      const SecureStore = require('expo-secure-store');
      SecureStore.isAvailableAsync.mockResolvedValue(true);

      const sessionData = {
        deviceId: 'dev-1',
        storeId: 'store-1',
        deviceToken: 'token-abc',
        deviceType: 'POS',
      };
      SecureStore.getItemAsync.mockResolvedValue(JSON.stringify(sessionData));

      const { getDeviceSession } = require('../../services/deviceSession');
      const session = await getDeviceSession();
      expect(session).toEqual({
        deviceId: 'dev-1',
        storeId: 'store-1',
        deviceToken: 'token-abc',
        deviceType: 'POS',
      });
    });

    it('returns cached value on subsequent calls', async () => {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      const sessionData = {
        deviceId: 'dev-1',
        storeId: 'store-1',
        deviceToken: 'token-abc',
      };
      AsyncStorage.getItem.mockResolvedValue(JSON.stringify(sessionData));

      const { getDeviceSession } = require('../../services/deviceSession');
      await getDeviceSession();
      await getDeviceSession();
      // AsyncStorage.getItem should only be called once (cached after first call)
      expect(AsyncStorage.getItem).toHaveBeenCalledTimes(1);
    });
  });

  describe('saveDeviceSession', () => {
    it('saves to AsyncStorage when SecureStore unavailable', async () => {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      const { saveDeviceSession } = require('../../services/deviceSession');

      const session = {
        deviceId: 'dev-1',
        storeId: 'store-1',
        deviceToken: 'token-abc',
      };
      await saveDeviceSession(session);
      expect(AsyncStorage.setItem).toHaveBeenCalled();
    });

    it('saves to SecureStore when available', async () => {
      const SecureStore = require('expo-secure-store');
      SecureStore.isAvailableAsync.mockResolvedValue(true);

      const { saveDeviceSession } = require('../../services/deviceSession');
      const session = {
        deviceId: 'dev-1',
        storeId: 'store-1',
        deviceToken: 'token-abc',
      };
      await saveDeviceSession(session);
      expect(SecureStore.setItemAsync).toHaveBeenCalled();
    });
  });

  describe('clearDeviceSession', () => {
    it('clears from AsyncStorage', async () => {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      const { clearDeviceSession } = require('../../services/deviceSession');
      await clearDeviceSession();
      expect(AsyncStorage.removeItem).toHaveBeenCalled();
    });

    it('clears from SecureStore when available', async () => {
      const SecureStore = require('expo-secure-store');
      SecureStore.isAvailableAsync.mockResolvedValue(true);

      const { clearDeviceSession } = require('../../services/deviceSession');
      await clearDeviceSession();
      expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
    });
  });

  describe('getDeviceToken', () => {
    it('returns null when no session', async () => {
      const { getDeviceToken } = require('../../services/deviceSession');
      const token = await getDeviceToken();
      expect(token).toBeNull();
    });

    it('returns token from session', async () => {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      AsyncStorage.getItem.mockResolvedValue(JSON.stringify({
        deviceId: 'dev-1', storeId: 'store-1', deviceToken: 'my-token',
      }));

      const { getDeviceToken } = require('../../services/deviceSession');
      const token = await getDeviceToken();
      expect(token).toBe('my-token');
    });
  });

  describe('getDeviceStoreId', () => {
    it('returns null when no session', async () => {
      const { getDeviceStoreId } = require('../../services/deviceSession');
      const storeId = await getDeviceStoreId();
      expect(storeId).toBeNull();
    });

    it('returns storeId from session', async () => {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      AsyncStorage.getItem.mockResolvedValue(JSON.stringify({
        deviceId: 'dev-1', storeId: 'store-123', deviceToken: 'tok',
      }));

      const { getDeviceStoreId } = require('../../services/deviceSession');
      const storeId = await getDeviceStoreId();
      expect(storeId).toBe('store-123');
    });
  });

  describe('getDeviceIdFromSession', () => {
    it('returns null when no session', async () => {
      const { getDeviceIdFromSession } = require('../../services/deviceSession');
      const deviceId = await getDeviceIdFromSession();
      expect(deviceId).toBeNull();
    });
  });

  describe('getCachedSession', () => {
    it('returns null before loading', () => {
      const { getCachedSession } = require('../../services/deviceSession');
      expect(getCachedSession()).toBeNull();
    });
  });

  describe('isCacheLoaded', () => {
    it('returns false before loading', () => {
      const { isCacheLoaded } = require('../../services/deviceSession');
      expect(isCacheLoaded()).toBe(false);
    });

    it('returns true after loading', async () => {
      const { getDeviceSession, isCacheLoaded } = require('../../services/deviceSession');
      await getDeviceSession();
      expect(isCacheLoaded()).toBe(true);
    });
  });

  describe('normalizeSession edge cases', () => {
    it('returns null for empty deviceId', async () => {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      AsyncStorage.getItem.mockResolvedValue(JSON.stringify({
        deviceId: '', storeId: 'store-1', deviceToken: 'tok',
      }));

      const { getDeviceSession } = require('../../services/deviceSession');
      const session = await getDeviceSession();
      expect(session).toBeNull();
    });

    it('returns null for missing deviceToken', async () => {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      AsyncStorage.getItem.mockResolvedValue(JSON.stringify({
        deviceId: 'dev-1', storeId: 'store-1',
      }));

      const { getDeviceSession } = require('../../services/deviceSession');
      const session = await getDeviceSession();
      expect(session).toBeNull();
    });

    it('trims whitespace from fields', async () => {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      AsyncStorage.getItem.mockResolvedValue(JSON.stringify({
        deviceId: '  dev-1  ', storeId: '  store-1  ', deviceToken: '  tok  ',
      }));

      const { getDeviceSession } = require('../../services/deviceSession');
      const session = await getDeviceSession();
      expect(session?.deviceId).toBe('dev-1');
      expect(session?.storeId).toBe('store-1');
      expect(session?.deviceToken).toBe('tok');
    });
  });
});
