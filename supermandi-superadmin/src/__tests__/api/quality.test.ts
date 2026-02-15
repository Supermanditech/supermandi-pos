// SuperAdmin — Test quality API client
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.stubEnv('VITE_API_BASE_URL', 'https://api.test.com');

vi.mock('../../api/authToken', () => ({
  getAuthHeaders: () => ({ Authorization: 'Bearer test-token', 'X-Request-ID': 'uuid' }),
  fetchWithTimeout: vi.fn(),
}));

describe('quality module', () => {
  let mod: typeof import('../../api/quality');
  let authMock: { fetchWithTimeout: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.resetModules();
    mod = await import('../../api/quality');
    authMock = (await import('../../api/authToken')) as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchQualityOverview', () => {
    it('returns overview data on success', async () => {
      const mockData = { timestamp: '2026-01-01', system: {}, database: {}, services: [], tools: {}, gcp: {}, topEndpoints: [], gates: { total: 5, categories: {} } };
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: true,
        json: async () => mockData,
      });

      const result = await mod.fetchQualityOverview();
      expect(result).toEqual(mockData);
      expect(authMock.fetchWithTimeout).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/quality/overview'),
        expect.any(Object)
      );
    });

    it('throws on error', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: false,
        status: 500,
      });

      await expect(mod.fetchQualityOverview()).rejects.toThrow('Quality overview failed: 500');
    });
  });

  describe('fetchTestResults', () => {
    it('returns test results on success', async () => {
      const mockData = { lastRun: '2026-01-01', suites: {}, coverage: {} };
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: true,
        json: async () => mockData,
      });

      const result = await mod.fetchTestResults();
      expect(result).toEqual(mockData);
      expect(authMock.fetchWithTimeout).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/quality/test-results'),
        expect.any(Object)
      );
    });

    it('throws on error', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: false,
        status: 503,
      });

      await expect(mod.fetchTestResults()).rejects.toThrow('Test results failed: 503');
    });
  });

  describe('resetMetrics', () => {
    it('sends POST to reset endpoint', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({ ok: true });

      await mod.resetMetrics();
      expect(authMock.fetchWithTimeout).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/quality/metrics/reset'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('throws on error', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: false,
        status: 403,
      });

      await expect(mod.resetMetrics()).rejects.toThrow('Metrics reset failed: 403');
    });
  });
});
