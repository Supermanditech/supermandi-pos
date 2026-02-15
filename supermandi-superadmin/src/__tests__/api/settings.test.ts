// SuperAdmin — Test settings API client
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.stubEnv('VITE_API_BASE_URL', 'https://api.test.com');

vi.mock('../../api/authToken', () => ({
  getAuthHeaders: () => ({ Authorization: 'Bearer test-token', 'X-Request-ID': 'uuid' }),
  fetchWithTimeout: vi.fn(),
}));

vi.mock('../../api/errorSanitizer', () => ({
  parseError: vi.fn().mockResolvedValue('Request failed'),
}));

describe('settings module', () => {
  let mod: typeof import('../../api/settings');
  let authMock: { fetchWithTimeout: ReturnType<typeof vi.fn> };
  let errorMock: { parseError: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.resetModules();
    mod = await import('../../api/settings');
    authMock = (await import('../../api/authToken')) as any;
    errorMock = (await import('../../api/errorSanitizer')) as any;
    errorMock.parseError.mockResolvedValue('Request failed');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchSettings', () => {
    it('returns settings on success', async () => {
      const mockSettings = {
        version: '1.0.0',
        environment: 'production',
        features: { aiEnabled: true, analyticsEnabled: true },
        database: { connected: true },
      };
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: true,
        json: async () => ({ settings: mockSettings }),
      });

      const result = await mod.fetchSettings();
      expect(result).toEqual(mockSettings);
      expect(authMock.fetchWithTimeout).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/settings'),
        expect.any(Object)
      );
    });

    it('throws when settings field is missing', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      await expect(mod.fetchSettings()).rejects.toThrow('Settings response missing');
    });

    it('throws on API error', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      });

      await expect(mod.fetchSettings()).rejects.toThrow('Request failed');
    });
  });

  describe('fetchSystemStats', () => {
    it('returns stats on success', async () => {
      const mockStats = { totalStores: 10, totalDevices: 25, totalUsers: 50 };
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: true,
        json: async () => ({ stats: mockStats }),
      });

      const result = await mod.fetchSystemStats();
      expect(result).toEqual(mockStats);
      expect(authMock.fetchWithTimeout).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/settings/stats'),
        expect.any(Object)
      );
    });

    it('throws when stats field is missing', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      await expect(mod.fetchSystemStats()).rejects.toThrow('Stats response missing');
    });

    it('throws on API error', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({}),
      });

      await expect(mod.fetchSystemStats()).rejects.toThrow('Request failed');
    });
  });
});
