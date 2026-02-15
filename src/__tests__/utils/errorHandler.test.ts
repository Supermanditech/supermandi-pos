/**
 * Tests for utils/errorHandler
 * Covers: parseError, NetworkError, showErrorToast, getErrorMessage, getFieldError,
 * requiresReauth, isDeviceBlocked, isRetriable, getDiagnosticString, getDetailedErrorInfo, withRetry
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

import {
  parseError,
  NetworkError,
  showErrorToast,
  getErrorMessage,
  getFieldError,
  requiresReauth,
  isDeviceBlocked,
  isRetriable,
  getDiagnosticString,
  getDetailedErrorInfo,
  withRetry,
  type ParsedApiError,
} from '../../utils/errorHandler';

import { ApiError } from '../../services/api/apiClient';

describe('errorHandler', () => {
  describe('parseError', () => {
    it('parses generic Error', () => {
      const result = parseError(new Error('something'));
      expect(result.message).toBe('something');
      expect(result.isNetworkError).toBe(false);
      expect(result.isAuthError).toBe(false);
      expect(result.status).toBe(0);
    });

    it('parses unknown error', () => {
      const result = parseError('string error');
      expect(result.message).toBe('An unexpected error occurred');
      expect(result.status).toBe(0);
    });

    it('parses null/undefined', () => {
      const result = parseError(null);
      expect(result.message).toBe('An unexpected error occurred');
    });

    it('detects NetworkError', () => {
      const result = parseError(new NetworkError());
      expect(result.isNetworkError).toBe(true);
      expect(result.message).toBe('Network error. Please check your connection.');
    });

    it('detects network-like TypeError', () => {
      const err = new TypeError('Network request failed');
      const result = parseError(err);
      expect(result.isNetworkError).toBe(true);
    });

    it('detects AbortError as timeout', () => {
      const err = new Error('Aborted');
      err.name = 'AbortError';
      const result = parseError(err);
      expect(result.isNetworkError).toBe(true);
      expect(result.message).toContain('timed out');
    });

    it('detects timeout message', () => {
      const err = new Error('Connection timed out');
      const result = parseError(err);
      expect(result.isNetworkError).toBe(true);
      expect(result.message).toContain('timed out');
    });

    it('parses ApiError with status 401', () => {
      const err = new ApiError(401, 'Unauthorized');
      const result = parseError(err);
      expect(result.isAuthError).toBe(true);
      expect(result.status).toBe(401);
    });

    it('parses ApiError with status 404', () => {
      const err = new ApiError(404, 'Not found');
      const result = parseError(err);
      expect(result.isNotFound).toBe(true);
    });

    it('parses ApiError with status 409', () => {
      const err = new ApiError(409, 'Conflict');
      const result = parseError(err);
      expect(result.isConflict).toBe(true);
    });

    it('parses ApiError with status 500', () => {
      const err = new ApiError(500, 'Server error');
      const result = parseError(err);
      expect(result.isServerError).toBe(true);
    });

    it('parses ApiError with field errors', () => {
      const err = new ApiError(400, 'Validation', {
        success: false,
        error: 'Validation',
        details: { email: ['Invalid format'], name: 'Required' },
      });
      const result = parseError(err);
      expect(result.isValidationError).toBe(true);
      expect(result.fieldErrors.email).toBe('Invalid format');
      expect(result.fieldErrors.name).toBe('Required');
    });

    it('parses ApiError with code and requestId', () => {
      const err = new ApiError(400, 'Bad Request', {
        success: false,
        error: 'Bad Request',
        code: 'VALIDATION_ERROR',
        requestId: 'req-123',
      });
      const result = parseError(err);
      expect(result.code).toBe('VALIDATION_ERROR');
      expect(result.requestId).toBe('req-123');
    });

    it('detects offline/dns error patterns', () => {
      const patterns = ['DNS resolution failed', 'ECONNREFUSED', 'socket error', 'no internet'];
      for (const msg of patterns) {
        const result = parseError(new Error(msg));
        expect(result.isNetworkError).toBe(true);
      }
    });
  });

  describe('getErrorMessage', () => {
    it('returns message for known codes', () => {
      expect(getErrorMessage('NOT_FOUND')).toBe('The requested item was not found.');
      expect(getErrorMessage('UNAUTHORIZED')).toBe('Please log in to continue.');
      expect(getErrorMessage('device_unauthorized')).toBe('Device not authorized. Please re-enroll.');
    });

    it('returns null for unknown code', () => {
      expect(getErrorMessage('UNKNOWN_CODE')).toBeNull();
    });

    it('returns null for undefined', () => {
      expect(getErrorMessage(undefined)).toBeNull();
    });
  });

  describe('getFieldError', () => {
    it('returns field error', () => {
      const error: ParsedApiError = {
        message: 'test', status: 400, fieldErrors: { email: 'Invalid' },
        isNetworkError: false, isAuthError: false, isValidationError: true,
        isNotFound: false, isConflict: false, isServerError: false,
      };
      expect(getFieldError(error, 'email')).toBe('Invalid');
    });

    it('returns undefined for missing field', () => {
      const error: ParsedApiError = {
        message: 'test', status: 400, fieldErrors: {},
        isNetworkError: false, isAuthError: false, isValidationError: false,
        isNotFound: false, isConflict: false, isServerError: false,
      };
      expect(getFieldError(error, 'phone')).toBeUndefined();
    });
  });

  describe('requiresReauth', () => {
    it('true for auth error', () => {
      const error: ParsedApiError = {
        message: 'test', status: 401, fieldErrors: {},
        isNetworkError: false, isAuthError: true, isValidationError: false,
        isNotFound: false, isConflict: false, isServerError: false,
      };
      expect(requiresReauth(error)).toBe(true);
    });

    it('true for device_unauthorized code', () => {
      const error: ParsedApiError = {
        message: 'test', status: 0, code: 'device_unauthorized', fieldErrors: {},
        isNetworkError: false, isAuthError: false, isValidationError: false,
        isNotFound: false, isConflict: false, isServerError: false,
      };
      expect(requiresReauth(error)).toBe(true);
    });

    it('false for non-auth error', () => {
      const error: ParsedApiError = {
        message: 'test', status: 400, fieldErrors: {},
        isNetworkError: false, isAuthError: false, isValidationError: true,
        isNotFound: false, isConflict: false, isServerError: false,
      };
      expect(requiresReauth(error)).toBe(false);
    });
  });

  describe('isDeviceBlocked', () => {
    it('true for device_inactive code', () => {
      const error: ParsedApiError = {
        message: 'test', status: 0, code: 'device_inactive', fieldErrors: {},
        isNetworkError: false, isAuthError: false, isValidationError: false,
        isNotFound: false, isConflict: false, isServerError: false,
      };
      expect(isDeviceBlocked(error)).toBe(true);
    });

    it('true for device_inactive message', () => {
      const error: ParsedApiError = {
        message: 'device_inactive', status: 0, fieldErrors: {},
        isNetworkError: false, isAuthError: false, isValidationError: false,
        isNotFound: false, isConflict: false, isServerError: false,
      };
      expect(isDeviceBlocked(error)).toBe(true);
    });

    it('false for other errors', () => {
      const error: ParsedApiError = {
        message: 'test', status: 400, fieldErrors: {},
        isNetworkError: false, isAuthError: false, isValidationError: false,
        isNotFound: false, isConflict: false, isServerError: false,
      };
      expect(isDeviceBlocked(error)).toBe(false);
    });
  });

  describe('isRetriable', () => {
    it('true for network error', () => {
      expect(isRetriable({ isNetworkError: true, isServerError: false, status: 0 } as ParsedApiError)).toBe(true);
    });

    it('true for server error', () => {
      expect(isRetriable({ isNetworkError: false, isServerError: true, status: 500 } as ParsedApiError)).toBe(true);
    });

    it('true for 429 status', () => {
      expect(isRetriable({ isNetworkError: false, isServerError: false, status: 429 } as ParsedApiError)).toBe(true);
    });

    it('false for 400 error', () => {
      expect(isRetriable({ isNetworkError: false, isServerError: false, status: 400 } as ParsedApiError)).toBe(false);
    });
  });

  describe('getDiagnosticString', () => {
    it('formats network error', () => {
      const result = getDiagnosticString({ isNetworkError: true, isAuthError: false, isValidationError: false, isServerError: false, isNotFound: false, isConflict: false, status: 0, message: '', fieldErrors: {} });
      expect(result).toContain('NetworkError');
    });

    it('includes status code', () => {
      const result = getDiagnosticString({ isNetworkError: false, isAuthError: false, isValidationError: false, isServerError: true, isNotFound: false, isConflict: false, status: 500, message: '', fieldErrors: {} });
      expect(result).toContain('HTTP500');
    });

    it('includes error code', () => {
      const result = getDiagnosticString({ isNetworkError: false, isAuthError: false, isValidationError: false, isServerError: false, isNotFound: false, isConflict: false, status: 0, message: '', fieldErrors: {}, code: 'TEST_CODE' });
      expect(result).toContain('TEST_CODE');
    });

    it('includes requestId (truncated)', () => {
      const result = getDiagnosticString({ isNetworkError: false, isAuthError: false, isValidationError: false, isServerError: false, isNotFound: false, isConflict: false, status: 0, message: '', fieldErrors: {}, requestId: '12345678901234' });
      expect(result).toContain('Req:12345678');
    });

    it('returns UnknownError for unclassified error', () => {
      const result = getDiagnosticString({ isNetworkError: false, isAuthError: false, isValidationError: false, isServerError: false, isNotFound: false, isConflict: false, status: 0, message: '', fieldErrors: {} });
      expect(result).toBe('UnknownError');
    });
  });

  describe('getDetailedErrorInfo', () => {
    it('returns formatted string', () => {
      const result = getDetailedErrorInfo(new Error('test'));
      expect(result).toContain('Message: test');
      expect(result).toContain('Type:');
    });
  });

  describe('withRetry', () => {
    it('returns result on first attempt success', async () => {
      const result = await withRetry(() => Promise.resolve(42), { maxRetries: 3, delayMs: 1 });
      expect(result).toBe(42);
    });

    it('retries on retriable error and succeeds', async () => {
      let attempts = 0;
      const fn = () => {
        attempts++;
        if (attempts < 3) throw new NetworkError();
        return Promise.resolve('done');
      };
      const result = await withRetry(fn, { maxRetries: 3, delayMs: 1 });
      expect(result).toBe('done');
      expect(attempts).toBe(3);
    });

    it('throws on non-retriable error without retrying', async () => {
      const fn = () => Promise.reject(new Error('validation'));
      await expect(withRetry(fn, { maxRetries: 3, delayMs: 1 })).rejects.toThrow('validation');
    });

    it('throws after max retries exhausted', async () => {
      const fn = () => Promise.reject(new NetworkError('offline'));
      await expect(withRetry(fn, { maxRetries: 2, delayMs: 1 })).rejects.toThrow();
    });
  });

  describe('showErrorToast', () => {
    it('shows network error message', () => {
      const { showToast } = require('../../utils/showToast');
      showToast.mockClear();
      showErrorToast({
        message: 'fail', status: 0, fieldErrors: {},
        isNetworkError: true, isAuthError: false, isValidationError: false,
        isNotFound: false, isConflict: false, isServerError: false,
      });
      expect(showToast).toHaveBeenCalledWith(expect.stringContaining('Network error'), 'long');
    });

    it('shows server error with status', () => {
      const { showToast } = require('../../utils/showToast');
      showToast.mockClear();
      showErrorToast({
        message: 'fail', status: 500, fieldErrors: {},
        isNetworkError: false, isAuthError: false, isValidationError: false,
        isNotFound: false, isConflict: false, isServerError: true,
      });
      expect(showToast).toHaveBeenCalledWith(expect.stringContaining('500'), 'long');
    });

    it('shows auth error message', () => {
      const { showToast } = require('../../utils/showToast');
      showToast.mockClear();
      showErrorToast({
        message: 'fail', status: 401, fieldErrors: {},
        isNetworkError: false, isAuthError: true, isValidationError: false,
        isNotFound: false, isConflict: false, isServerError: false,
      });
      expect(showToast).toHaveBeenCalledWith(expect.stringContaining('Session expired'), 'long');
    });
  });
});
