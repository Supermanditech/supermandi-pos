/**
 * Tests for useApiError pure functions (withErrorHandling, createErrorHandler)
 * The hook itself requires React rendering; we test the exported utility functions.
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

jest.mock('../../utils/showToast', () => ({
  showToast: jest.fn(),
}));

jest.mock('../../services/deviceSession', () => ({
  clearDeviceSession: jest.fn().mockResolvedValue(undefined),
  getDeviceToken: jest.fn().mockResolvedValue(null),
  getDeviceSession: jest.fn().mockResolvedValue(null),
  getDeviceStoreId: jest.fn().mockResolvedValue(null),
  getDeviceIdFromSession: jest.fn().mockResolvedValue(null),
  saveDeviceSession: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../stores/staffSessionStore', () => ({
  useStaffSessionStore: { getState: () => ({ session: null }) },
}));

jest.mock('../../i18n', () => ({ language: 'en' }));

jest.mock('../../config/api', () => ({
  API_BASE_URL: 'http://localhost:3000',
}));

jest.mock('../../services/api/storage', () => ({
  getAuthToken: jest.fn().mockResolvedValue(null),
  setAuthToken: jest.fn(), clearAuthToken: jest.fn(),
}));

import { withErrorHandling, createErrorHandler } from '../../hooks/useApiError';

describe('useApiError - utility functions', () => {
  describe('withErrorHandling', () => {
    it('returns [result, null] on success', async () => {
      const [result, error] = await withErrorHandling(() => Promise.resolve(42));
      expect(result).toBe(42);
      expect(error).toBeNull();
    });

    it('returns [null, parsedError] on failure', async () => {
      const [result, error] = await withErrorHandling(() => Promise.reject(new Error('test error')));
      expect(result).toBeNull();
      expect(error).not.toBeNull();
      expect(error!.message).toBe('test error');
    });

    it('calls onError callback on failure', async () => {
      const onError = jest.fn();
      await withErrorHandling(() => Promise.reject(new Error('fail')), onError);
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'fail' }));
    });

    it('does not call onError on success', async () => {
      const onError = jest.fn();
      await withErrorHandling(() => Promise.resolve('ok'), onError);
      expect(onError).not.toHaveBeenCalled();
    });
  });

  describe('createErrorHandler', () => {
    it('wrap returns result on success', async () => {
      const handler = createErrorHandler('Test');
      const result = await handler.wrap(() => Promise.resolve('hello'));
      expect(result).toBe('hello');
    });

    it('wrap returns null and shows toast on failure', async () => {
      const { showToast } = require('../../utils/showToast');
      const handler = createErrorHandler('Test');
      const result = await handler.wrap(() => Promise.reject(new Error('oops')));
      expect(result).toBeNull();
      expect(showToast).toHaveBeenCalled();
    });

    it('wrapSilent returns null on failure without toast', async () => {
      const { showToast } = require('../../utils/showToast');
      showToast.mockClear();
      const handler = createErrorHandler('Test');
      const result = await handler.wrapSilent(() => Promise.reject(new Error('silent')));
      expect(result).toBeNull();
      expect(showToast).not.toHaveBeenCalled();
    });

    it('wrapSilent returns result on success', async () => {
      const handler = createErrorHandler('Test');
      const result = await handler.wrapSilent(() => Promise.resolve(99));
      expect(result).toBe(99);
    });
  });
});
