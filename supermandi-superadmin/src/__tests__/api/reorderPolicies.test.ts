// SuperAdmin — Test reorderPolicies API client
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.stubEnv('VITE_API_BASE_URL', 'https://api.test.com');

vi.mock('../../api/authToken', () => ({
  getAuthHeaders: () => ({ Authorization: 'Bearer test-token', 'X-Request-ID': 'uuid' }),
  fetchWithTimeout: vi.fn(),
}));

vi.mock('../../api/errorSanitizer', () => ({
  sanitizeErrorMessage: (raw: string | null, fallback: string) => raw || fallback,
}));

describe('reorderPolicies module', () => {
  let mod: typeof import('../../api/reorderPolicies');
  let authMock: { fetchWithTimeout: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.resetModules();
    mod = await import('../../api/reorderPolicies');
    authMock = (await import('../../api/authToken')) as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =============================================================================
  // fetchReorderPolicies
  // =============================================================================

  describe('fetchReorderPolicies', () => {
    it('fetches policies without params', async () => {
      const mockData = { policies: [], pagination: { total: 0, limit: 50, offset: 0 } };
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: true,
        json: async () => mockData,
      });

      const result = await mod.fetchReorderPolicies();
      expect(result).toEqual(mockData);
      expect(authMock.fetchWithTimeout).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/reorder/policies'),
        expect.any(Object)
      );
    });

    it('includes query params when provided', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: true,
        json: async () => ({ policies: [], pagination: { total: 0, limit: 10, offset: 5 } }),
      });

      await mod.fetchReorderPolicies({ storeId: 's1', enabledOnly: true, limit: 10, offset: 5 });
      const url = authMock.fetchWithTimeout.mock.calls[0][0] as string;
      expect(url).toContain('storeId=s1');
      expect(url).toContain('enabledOnly=true');
      expect(url).toContain('limit=10');
      expect(url).toContain('offset=5');
    });

    it('includes offset=0 when explicitly provided', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: true,
        json: async () => ({ policies: [], pagination: { total: 0, limit: 50, offset: 0 } }),
      });

      await mod.fetchReorderPolicies({ offset: 0 });
      const url = authMock.fetchWithTimeout.mock.calls[0][0] as string;
      expect(url).toContain('offset=0');
    });

    it('throws on 401', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({}),
      });

      await expect(mod.fetchReorderPolicies()).rejects.toThrow('Unauthorized');
    });

    it('throws sanitized error on failure', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'DB error' }),
      });

      await expect(mod.fetchReorderPolicies()).rejects.toThrow('DB error');
    });

    it('uses fallback error when json parse fails', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => { throw new Error('parse error'); },
      });

      await expect(mod.fetchReorderPolicies()).rejects.toThrow('Request failed (500)');
    });

    it('sends auth headers', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: true,
        json: async () => ({ policies: [], pagination: { total: 0, limit: 50, offset: 0 } }),
      });

      await mod.fetchReorderPolicies();
      const opts = authMock.fetchWithTimeout.mock.calls[0][1];
      expect(opts.headers).toEqual(expect.objectContaining({
        Authorization: 'Bearer test-token',
      }));
    });

    it('does not include enabledOnly when false', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: true,
        json: async () => ({ policies: [], pagination: { total: 0, limit: 50, offset: 0 } }),
      });

      await mod.fetchReorderPolicies({ enabledOnly: false });
      const url = authMock.fetchWithTimeout.mock.calls[0][0] as string;
      expect(url).not.toContain('enabledOnly');
    });
  });

  // =============================================================================
  // fetchReorderAuditLog
  // =============================================================================

  describe('fetchReorderAuditLog', () => {
    it('fetches audit log without params', async () => {
      const mockData = { auditLog: [], pagination: { total: 0, limit: 50, offset: 0 } };
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: true,
        json: async () => mockData,
      });

      const result = await mod.fetchReorderAuditLog();
      expect(result).toEqual(mockData);
      expect(authMock.fetchWithTimeout).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/reorder/policies/audit-log'),
        expect.any(Object)
      );
    });

    it('includes query params when provided', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: true,
        json: async () => ({ auditLog: [], pagination: { total: 0, limit: 20, offset: 10 } }),
      });

      await mod.fetchReorderAuditLog({ storeId: 's2', limit: 20, offset: 10 });
      const url = authMock.fetchWithTimeout.mock.calls[0][0] as string;
      expect(url).toContain('storeId=s2');
      expect(url).toContain('limit=20');
      expect(url).toContain('offset=10');
    });

    it('throws on 401', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({}),
      });

      await expect(mod.fetchReorderAuditLog()).rejects.toThrow('Unauthorized');
    });

    it('throws sanitized error on failure', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Internal error' }),
      });

      await expect(mod.fetchReorderAuditLog()).rejects.toThrow('Internal error');
    });

    it('includes offset=0 when explicitly provided', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: true,
        json: async () => ({ auditLog: [], pagination: { total: 0, limit: 50, offset: 0 } }),
      });

      await mod.fetchReorderAuditLog({ offset: 0 });
      const url = authMock.fetchWithTimeout.mock.calls[0][0] as string;
      expect(url).toContain('offset=0');
    });

    it('sends cache no-store header', async () => {
      authMock.fetchWithTimeout.mockResolvedValue({
        ok: true,
        json: async () => ({ auditLog: [], pagination: { total: 0, limit: 50, offset: 0 } }),
      });

      await mod.fetchReorderAuditLog();
      const opts = authMock.fetchWithTimeout.mock.calls[0][1];
      expect(opts.cache).toBe('no-store');
    });
  });
});
