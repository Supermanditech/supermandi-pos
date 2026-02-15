// SuperAdmin — Test grnAlerts API client
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.stubEnv('VITE_API_BASE_URL', 'https://api.test.com');

vi.mock('../../api/authToken', () => ({
  getAuthHeaders: () => ({ Authorization: 'Bearer test-token', 'X-Request-ID': 'uuid' }),
  fetchWithTimeout: vi.fn(),
}));

vi.mock('../../api/errorSanitizer', () => ({
  sanitizeErrorMessage: (raw: string | null, fallback: string) => raw || fallback,
}));

describe('grnAlerts module', () => {
  let mod: typeof import('../../api/grnAlerts');
  let authMock: { fetchWithTimeout: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.resetModules();
    mod = await import('../../api/grnAlerts');
    authMock = (await import('../../api/authToken')) as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchGrnAlerts', () => {
    it('fetches alerts without params', async () => {
      const mockData = { alerts: [], pagination: { total: 0, limit: 50, offset: 0 }, openCount: 0 };
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: true,
        json: async () => mockData,
      });

      const result = await mod.fetchGrnAlerts();
      expect(result).toEqual(mockData);
      expect(authMock.fetchWithTimeout).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/grn/alerts'),
        expect.any(Object)
      );
    });

    it('includes query params when provided', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: true,
        json: async () => ({ alerts: [], pagination: { total: 0, limit: 10, offset: 5 }, openCount: 0 }),
      });

      await mod.fetchGrnAlerts({ status: 'OPEN', storeId: 's1', limit: 10, offset: 5 });
      const url = authMock.fetchWithTimeout.mock.calls[0][0] as string;
      expect(url).toContain('status=OPEN');
      expect(url).toContain('storeId=s1');
      expect(url).toContain('limit=10');
      expect(url).toContain('offset=5');
    });

    it('throws on 401', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({}),
      });

      await expect(mod.fetchGrnAlerts()).rejects.toThrow('Unauthorized');
    });

    it('throws sanitized error on failure', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'DB error' }),
      });

      await expect(mod.fetchGrnAlerts()).rejects.toThrow('DB error');
    });
  });

  describe('updateGrnAlert', () => {
    it('sends PATCH with status and notes', async () => {
      const mockAlert = { id: 'a1', status: 'ACKNOWLEDGED' };
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: true,
        json: async () => ({ alert: mockAlert }),
      });

      const result = await mod.updateGrnAlert('a1', { status: 'ACKNOWLEDGED', notes: 'Checked' });
      expect(result.alert).toEqual(mockAlert);
      expect(authMock.fetchWithTimeout).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/grn/alerts/a1'),
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ status: 'ACKNOWLEDGED', notes: 'Checked' }),
        })
      );
    });

    it('throws on 401', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({}),
      });

      await expect(mod.updateGrnAlert('a1', { status: 'DISMISSED' })).rejects.toThrow('Unauthorized');
    });

    it('throws error message from response', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Invalid status' }),
      });

      await expect(mod.updateGrnAlert('a1', { status: 'ACKNOWLEDGED' })).rejects.toThrow('Invalid status');
    });
  });
});
