/**
 * Tests for services/api/storage
 * Covers: getAuthToken, setAuthToken, clearAuthToken with SecureStore and AsyncStorage fallback
 */

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn(), clear: jest.fn(), getAllKeys: jest.fn() },
}));

jest.mock('expo-secure-store', () => ({
  isAvailableAsync: jest.fn(),
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { getAuthToken, setAuthToken, clearAuthToken } from '../../../services/api/storage';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('storage', () => {
  describe('getAuthToken', () => {
    it('returns token from SecureStore when available', async () => {
      (SecureStore.isAvailableAsync as jest.Mock).mockResolvedValue(true);
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('secure-token');
      const token = await getAuthToken();
      expect(token).toBe('secure-token');
    });

    it('falls back to AsyncStorage when SecureStore has no token', async () => {
      (SecureStore.isAvailableAsync as jest.Mock).mockResolvedValue(true);
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('async-token');
      const token = await getAuthToken();
      expect(token).toBe('async-token');
    });

    it('migrates token from AsyncStorage to SecureStore', async () => {
      (SecureStore.isAvailableAsync as jest.Mock).mockResolvedValue(true);
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('migrate-token');
      await getAuthToken();
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(expect.any(String), 'migrate-token');
      expect(AsyncStorage.removeItem).toHaveBeenCalled();
    });

    it('returns null when no token anywhere', async () => {
      (SecureStore.isAvailableAsync as jest.Mock).mockResolvedValue(true);
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
      const token = await getAuthToken();
      expect(token).toBeNull();
    });

    it('uses AsyncStorage when SecureStore not available', async () => {
      (SecureStore.isAvailableAsync as jest.Mock).mockResolvedValue(false);
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('fallback-token');
      const token = await getAuthToken();
      expect(token).toBe('fallback-token');
    });
  });

  describe('setAuthToken', () => {
    it('saves to SecureStore when available', async () => {
      (SecureStore.isAvailableAsync as jest.Mock).mockResolvedValue(true);
      await setAuthToken('my-token');
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(expect.any(String), 'my-token');
    });

    it('falls back to AsyncStorage when SecureStore not available', async () => {
      (SecureStore.isAvailableAsync as jest.Mock).mockResolvedValue(false);
      await setAuthToken('my-token');
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(expect.any(String), 'my-token');
    });

    it('falls back to AsyncStorage when SecureStore save fails', async () => {
      (SecureStore.isAvailableAsync as jest.Mock).mockResolvedValue(true);
      (SecureStore.setItemAsync as jest.Mock).mockRejectedValue(new Error('fail'));
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      await setAuthToken('my-token');
      expect(AsyncStorage.setItem).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('clearAuthToken', () => {
    it('clears from both SecureStore and AsyncStorage', async () => {
      (SecureStore.isAvailableAsync as jest.Mock).mockResolvedValue(true);
      await clearAuthToken();
      expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
      expect(AsyncStorage.removeItem).toHaveBeenCalled();
    });

    it('clears AsyncStorage even when SecureStore not available', async () => {
      (SecureStore.isAvailableAsync as jest.Mock).mockResolvedValue(false);
      await clearAuthToken();
      expect(AsyncStorage.removeItem).toHaveBeenCalled();
    });
  });
});
