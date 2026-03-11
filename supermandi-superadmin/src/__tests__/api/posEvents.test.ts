// SuperAdmin — Test posEvents API client
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.stubEnv('VITE_API_BASE_URL', 'https://api.test.com');

vi.mock('../../api/authToken', () => ({
  getAuthHeaders: () => ({ Authorization: 'Bearer test-token', 'X-Request-ID': 'uuid' }),
  fetchWithTimeout: vi.fn(),
  hasValidSession: () => true,
}));

describe('posEvents module', () => {
  let mod: typeof import('../../api/posEvents');
  let authMock: { fetchWithTimeout: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.resetModules();
    mod = await import('../../api/posEvents');
    authMock = (await import('../../api/authToken')) as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchPosEvents', () => {
    it('fetches and transforms events array', async () => {
      const raw = [
        { id: 'e1', deviceId: 'd1', storeId: 's1', eventType: 'SALE', payload: { amount: 100 }, createdAt: '2026-01-01T00:00:00Z' },
        { id: 'e2', deviceId: 'd2', storeId: 's2', eventType: 'SCAN', payload: null, createdAt: '2026-01-02T00:00:00Z' },
      ];
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: true,
        json: async () => raw,
      });

      const result = await mod.fetchPosEvents({ limit: 100 });
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('e1');
      expect(result[0].eventType).toBe('SALE');
    });

    it('filters out items without id or createdAt', async () => {
      const raw = [
        { id: '', deviceId: 'd1', storeId: 's1', eventType: 'SALE', payload: null, createdAt: '2026-01-01' },
        { id: 'e2', deviceId: 'd2', storeId: 's2', eventType: 'SCAN', payload: null, createdAt: '' },
        { id: 'e3', deviceId: 'd3', storeId: 's3', eventType: 'SYNC', payload: null, createdAt: '2026-01-03' },
      ];
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: true,
        json: async () => raw,
      });

      const result = await mod.fetchPosEvents({ limit: 100 });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('e3');
    });

    it('clamps limit between 1 and 1000', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: true,
        json: async () => [],
      });

      await mod.fetchPosEvents({ limit: 5000 });
      const url = authMock.fetchWithTimeout.mock.calls[0][0] as string;
      expect(url).toContain('limit=1000');
    });

    it('includes optional query params', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: true,
        json: async () => [],
      });

      await mod.fetchPosEvents({ limit: 50, storeId: 's1', deviceId: 'd1', eventType: 'SALE' });
      const url = authMock.fetchWithTimeout.mock.calls[0][0] as string;
      expect(url).toContain('storeId=s1');
      expect(url).toContain('deviceId=d1');
      expect(url).toContain('eventType=SALE');
    });

    it('throws on 401', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({}),
      });

      await expect(mod.fetchPosEvents({ limit: 100 })).rejects.toThrow('Session expired');
    });

    it('throws on non-401 error with detail', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Server down' }),
      });

      await expect(mod.fetchPosEvents({ limit: 100 })).rejects.toThrow('Failed to fetch POS events (500): Server down');
    });

    it('throws when response is not an array', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      });

      await expect(mod.fetchPosEvents({ limit: 100 })).rejects.toThrow('Invalid POS events response');
    });

    it('clamps limit lower bound to 1', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: true,
        json: async () => [],
      });

      await mod.fetchPosEvents({ limit: -5 });
      const url = authMock.fetchWithTimeout.mock.calls[0][0] as string;
      expect(url).toContain('limit=1');
    });

    it('throws on non-401 error without detail', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => { throw new Error('parse error'); },
      });

      await expect(mod.fetchPosEvents({ limit: 100 })).rejects.toThrow('Failed to fetch POS events (503)');
    });

    it('omits empty optional query params', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: true,
        json: async () => [],
      });

      await mod.fetchPosEvents({ limit: 50, storeId: '', deviceId: '  ', eventType: undefined });
      const url = authMock.fetchWithTimeout.mock.calls[0][0] as string;
      expect(url).not.toContain('storeId');
      expect(url).not.toContain('deviceId');
      expect(url).not.toContain('eventType');
    });

    it('coerces missing fields to empty strings', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: true,
        json: async () => [{ id: 'e1', createdAt: '2026-01-01' }],
      });

      const result = await mod.fetchPosEvents({ limit: 100 });
      expect(result).toHaveLength(1);
      expect(result[0].deviceId).toBe('');
      expect(result[0].storeId).toBe('');
      expect(result[0].eventType).toBe('');
    });

    it('sends auth headers with request', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: true,
        json: async () => [],
      });

      await mod.fetchPosEvents({ limit: 100 });
      const opts = authMock.fetchWithTimeout.mock.calls[0][1] as RequestInit;
      expect((opts.headers as Record<string, string>)['Authorization']).toBe('Bearer test-token');
    });

    it('uses GET method and no-store cache', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: true,
        json: async () => [],
      });

      await mod.fetchPosEvents({ limit: 100 });
      const opts = authMock.fetchWithTimeout.mock.calls[0][1] as RequestInit;
      expect(opts.method).toBe('GET');
      expect(opts.cache).toBe('no-store');
    });
  });

  // Placed last: this test re-mocks hasValidSession so it must not run before other tests
  describe('pre-flight auth check', () => {
    it('throws when session is not valid', async () => {
      vi.resetModules();
      vi.doMock('../../api/authToken', () => ({
        getAuthHeaders: () => ({ Authorization: 'Bearer test-token' }),
        fetchWithTimeout: vi.fn(),
        hasValidSession: () => false,
      }));
      const mod2 = await import('../../api/posEvents');
      await expect(mod2.fetchPosEvents({ limit: 100 })).rejects.toThrow('Not authenticated');
    });
  });
});
