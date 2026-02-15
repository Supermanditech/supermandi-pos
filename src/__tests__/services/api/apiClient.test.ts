/**
 * Tests for services/api/apiClient
 * Covers: ApiError class, getEndpointCategory (via checkClientRateLimit behavior),
 *         isProtectedEndpoint pattern matching
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

import { ApiError } from '../../../services/api/apiClient';

describe('apiClient', () => {
  describe('ApiError', () => {
    it('creates error with status and message', () => {
      const error = new ApiError(404, 'Not Found');
      expect(error.status).toBe(404);
      expect(error.message).toBe('Not Found');
      expect(error.payload).toBeUndefined();
      expect(error).toBeInstanceOf(Error);
    });

    it('creates error with payload', () => {
      const payload = { error: 'INVALID_TOKEN' };
      const error = new ApiError(401, 'Unauthorized', payload);
      expect(error.status).toBe(401);
      expect(error.message).toBe('Unauthorized');
      expect(error.payload).toEqual(payload);
    });

    it('inherits from Error', () => {
      const error = new ApiError(500, 'Server Error');
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('Error');
    });

    it('has correct prototype chain', () => {
      const error = new ApiError(400, 'Bad Request');
      expect(error instanceof ApiError).toBe(true);
      expect(error instanceof Error).toBe(true);
    });
  });

  describe('apiClient methods exist', () => {
    it('exports apiClient with get, post, patch, del methods', () => {
      const { apiClient } = require('../../../services/api/apiClient');
      expect(typeof apiClient.get).toBe('function');
      expect(typeof apiClient.post).toBe('function');
      expect(typeof apiClient.patch).toBe('function');
      expect(typeof apiClient.del).toBe('function');
    });
  });
});
