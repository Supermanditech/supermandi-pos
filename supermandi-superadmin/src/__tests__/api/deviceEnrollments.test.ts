// SuperAdmin — Test deviceEnrollments API client
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.stubEnv('VITE_API_BASE_URL', 'https://api.test.com');

vi.mock('../../api/authToken', () => ({
  getAuthHeaders: () => ({ Authorization: 'Bearer test-token', 'X-Request-ID': 'uuid' }),
  fetchWithTimeout: vi.fn(),
}));

vi.mock('../../api/errorSanitizer', () => ({
  parseError: vi.fn().mockResolvedValue('Request failed'),
}));

describe('deviceEnrollments module', () => {
  let mod: typeof import('../../api/deviceEnrollments');
  let authMock: { fetchWithTimeout: ReturnType<typeof vi.fn> };
  let errorMock: { parseError: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.resetModules();
    mod = await import('../../api/deviceEnrollments');
    authMock = (await import('../../api/authToken')) as any;
    errorMock = (await import('../../api/errorSanitizer')) as any;
    errorMock.parseError.mockResolvedValue('Request failed');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createDeviceEnrollment', () => {
    it('calls POST endpoint with store ID', async () => {
      const mockResponse = { code: 'ABC123', expiresAt: '2026-02-17T00:00:00Z', qrPayload: 'payload-data' };
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const result = await mod.createDeviceEnrollment('store-1');
      expect(result).toEqual(mockResponse);
      expect(authMock.fetchWithTimeout).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/stores/store-1/device-enrollments'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('encodes storeId in URL', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: true,
        json: async () => ({ code: 'X', expiresAt: '', qrPayload: '' }),
      });

      await mod.createDeviceEnrollment('store/special');
      expect(authMock.fetchWithTimeout).toHaveBeenCalledWith(
        expect.stringContaining('store%2Fspecial'),
        expect.any(Object)
      );
    });

    it('throws on error response', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Bad request' }),
      });

      await expect(mod.createDeviceEnrollment('store-1')).rejects.toThrow('Request failed');
    });
  });
});
