// SuperAdmin — Test audit API client
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchAuditLogs, fetchAuditStats, createAuditLog, logAdminAction, logAdminActionError } from '../../api/audit';

vi.mock('../../api/authToken', () => ({
  getAuthHeaders: vi.fn(() => ({ Authorization: 'Bearer mock-token', 'X-Request-ID': 'test-id' })),
  fetchWithTimeout: vi.fn((url: string, init?: RequestInit) => {
    const mockFetch = (globalThis as any).__mockFetch;
    if (!mockFetch) throw new Error('Mock fetch not set up');
    return mockFetch(url, init);
  }),
}));

vi.mock('../../api/errorSanitizer', () => ({
  parseError: vi.fn(async (res: Response) => `Request failed (${res.status})`),
}));

describe('audit API client', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).__mockFetch = mockFetch;
  });

  afterEach(() => {
    delete (globalThis as any).__mockFetch;
  });

  // =========================================================================
  // fetchAuditLogs
  // =========================================================================

  describe('fetchAuditLogs', () => {
    it('returns audit logs with pagination', async () => {
      const mockResponse = {
        logs: [{ id: 'log-1', action: 'store.create', resource_type: 'store', created_at: '2024-01-01' }],
        total: 1,
        limit: 50,
        offset: 0,
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await fetchAuditLogs();
      expect(result.logs).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('passes filter params', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ logs: [], total: 0, limit: 50, offset: 0 }),
      });

      await fetchAuditLogs({
        action: 'store.create',
        resource_type: 'store',
        from_date: '2024-01-01',
        to_date: '2024-12-31',
        limit: 10,
        offset: 20,
      });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('action=store.create');
      expect(calledUrl).toContain('resource_type=store');
      expect(calledUrl).toContain('from_date=2024-01-01');
      expect(calledUrl).toContain('to_date=2024-12-31');
      expect(calledUrl).toContain('limit=10');
      expect(calledUrl).toContain('offset=20');
    });

    it('includes auth headers', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ logs: [], total: 0, limit: 50, offset: 0 }),
      });

      await fetchAuditLogs();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          cache: 'no-store',
          headers: expect.objectContaining({
            Authorization: 'Bearer mock-token',
            Accept: 'application/json',
          }),
        })
      );
    });

    it('throws on error response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      });

      await expect(fetchAuditLogs()).rejects.toThrow();
    });

    it('calls correct endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ logs: [], total: 0, limit: 50, offset: 0 }),
      });

      await fetchAuditLogs();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/audit'),
        expect.any(Object)
      );
    });
  });

  // =========================================================================
  // fetchAuditStats
  // =========================================================================

  describe('fetchAuditStats', () => {
    it('returns audit stats', async () => {
      const mockStats = {
        actions: [{ action: 'store.create', count: '5' }],
        summary: { total_logs: '100', error_count: '2', unique_actors: '3' },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockStats,
      });

      const result = await fetchAuditStats();
      expect(result.actions).toHaveLength(1);
      expect(result.summary.total_logs).toBe('100');
    });

    it('calls stats endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ actions: [], summary: { total_logs: '0', error_count: '0', unique_actors: '0' } }),
      });

      await fetchAuditStats();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/audit/stats'),
        expect.any(Object)
      );
    });

    it('throws on error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({}),
      });

      await expect(fetchAuditStats()).rejects.toThrow();
    });
  });

  // =========================================================================
  // createAuditLog
  // =========================================================================

  describe('createAuditLog', () => {
    it('sends POST with audit log data', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });

      await createAuditLog({
        action: 'store.suspend',
        resource_type: 'store',
        resource_id: 'store-1',
        request_body: { reason: 'Policy violation' },
        response_status: 200,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/audit'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        })
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.action).toBe('store.suspend');
      expect(body.resource_type).toBe('store');
    });

    it('does not throw on failure (non-blocking)', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });

      // Should not throw
      await createAuditLog({
        action: 'test',
        resource_type: 'test',
      });
    });

    it('does not throw on network error (non-blocking)', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await createAuditLog({
        action: 'test',
        resource_type: 'test',
      });
    });

    it('skips API call when no auth headers (no admin token)', async () => {
      const { getAuthHeaders } = await import('../../api/authToken');
      (getAuthHeaders as ReturnType<typeof vi.fn>).mockReturnValueOnce({});

      await createAuditLog({
        action: 'test',
        resource_type: 'test',
      });

      // Should not have called fetch since there are no auth headers
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // logAdminAction
  // =========================================================================

  describe('logAdminAction', () => {
    it('calls createAuditLog with correct fields', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });

      logAdminAction('store.create', 'store', 'store-1', { name: 'Test' });

      // Wait for async createAuditLog
      await vi.waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.action).toBe('store.create');
      expect(body.resource_type).toBe('store');
      expect(body.resource_id).toBe('store-1');
      expect(body.response_status).toBe(200);
      expect(body.request_body).toEqual({ name: 'Test' });
    });

    it('handles missing optional params', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });

      logAdminAction('user.login', 'auth');

      await vi.waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.resource_id).toBeNull();
      expect(body.request_body).toBeNull();
    });
  });

  // =========================================================================
  // logAdminActionError
  // =========================================================================

  describe('logAdminActionError', () => {
    it('calls createAuditLog with error fields', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });

      logAdminActionError('store.create', 'store', 'store-1', 'DB connection failed');

      await vi.waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.action).toBe('store.create');
      expect(body.resource_type).toBe('store');
      expect(body.response_status).toBe(500);
      expect(body.error_message).toBe('DB connection failed');
    });

    it('uses default error message when not provided', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });

      logAdminActionError('test', 'test');

      await vi.waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.error_message).toBe('Unknown error');
    });
  });
});
