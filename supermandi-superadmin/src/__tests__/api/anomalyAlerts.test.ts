// SA-P1-010: SuperAdmin anomalyAlerts API client tests
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.stubEnv('VITE_API_BASE_URL', 'https://api.test.com');

vi.mock('../../api/authToken', () => ({
  getAuthHeaders: () => ({ Authorization: 'Bearer test-token', 'X-Request-ID': 'uuid' }),
  fetchWithTimeout: vi.fn(),
}));

vi.mock('../../api/errorSanitizer', () => ({
  sanitizeErrorMessage: (raw: string | null, fallback: string) => raw || fallback,
}));

describe('anomalyAlerts module', () => {
  let mod: typeof import('../../api/anomalyAlerts');
  let authMock: { fetchWithTimeout: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.resetModules();
    mod = await import('../../api/anomalyAlerts');
    authMock = (await import('../../api/authToken')) as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchAnomalyAlerts', () => {
    it('fetches alerts without params', async () => {
      const mockData = { alerts: [], pagination: { total: 0, limit: 50, offset: 0 } };
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: true,
        json: async () => mockData,
      });

      const result = await mod.fetchAnomalyAlerts();
      expect(result).toEqual(mockData);
      expect(authMock.fetchWithTimeout).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/anomaly-alerts'),
        expect.any(Object),
      );
    });

    it('includes query params when provided', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: true,
        json: async () => ({ alerts: [], pagination: { total: 0, limit: 10, offset: 5 } }),
      });

      await mod.fetchAnomalyAlerts({ severity: 'critical', storeId: 's1', limit: 10, offset: 5 });
      const url = authMock.fetchWithTimeout.mock.calls[0][0] as string;
      expect(url).toContain('severity=critical');
      expect(url).toContain('storeId=s1');
      expect(url).toContain('limit=10');
      expect(url).toContain('offset=5');
    });

    it('handles offset=0 correctly', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: true,
        json: async () => ({ alerts: [], pagination: { total: 0, limit: 50, offset: 0 } }),
      });

      await mod.fetchAnomalyAlerts({ offset: 0 });
      const url = authMock.fetchWithTimeout.mock.calls[0][0] as string;
      expect(url).toContain('offset=0');
    });

    it('throws on 401', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Unauthorized' }),
      });

      await expect(mod.fetchAnomalyAlerts()).rejects.toThrow('Unauthorized');
    });

    it('throws sanitized error on other failures', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'DB error' }),
      });

      await expect(mod.fetchAnomalyAlerts()).rejects.toThrow('DB error');
    });
  });

  describe('acknowledgeAlert', () => {
    it('acknowledges an alert by id', async () => {
      const mockData = { alert: { id: 'abc', isReviewed: true } };
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: true,
        json: async () => mockData,
      });

      const result = await mod.acknowledgeAlert('abc');
      expect(result).toEqual(mockData);
      expect(authMock.fetchWithTimeout).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/anomaly-alerts/abc/acknowledge'),
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('encodes path params', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: true,
        json: async () => ({ alert: { id: 'a/b', isReviewed: true } }),
      });

      await mod.acknowledgeAlert('a/b');
      const url = authMock.fetchWithTimeout.mock.calls[0][0] as string;
      expect(url).toContain('a%2Fb');
    });

    it('throws on 401', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Unauthorized' }),
      });

      await expect(mod.acknowledgeAlert('abc')).rejects.toThrow('Unauthorized');
    });

    it('throws on 404', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: 'Alert not found or already reviewed' }),
      });

      await expect(mod.acknowledgeAlert('missing')).rejects.toThrow('Alert not found');
    });
  });

  describe('fetchAlertSummary', () => {
    it('fetches summary counts', async () => {
      const mockData = { summary: { critical: 2, warning: 5, info: 10, total: 17 } };
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: true,
        json: async () => mockData,
      });

      const result = await mod.fetchAlertSummary();
      expect(result).toEqual(mockData);
      expect(authMock.fetchWithTimeout).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/anomaly-alerts/summary'),
        expect.any(Object),
      );
    });

    it('throws on 401', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Unauthorized' }),
      });

      await expect(mod.fetchAlertSummary()).rejects.toThrow('Unauthorized');
    });
  });
});
