// SuperAdmin — Test monitoring API client
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchHealthStatus, triggerTokenCleanup } from '../../api/monitoring';
import type { HealthResponse, TokenCleanupResult } from '../../api/monitoring';

// Mock the authToken module
vi.mock('../../api/authToken', () => ({
  getAuthHeaders: vi.fn(() => ({ Authorization: 'Bearer mock-token' })),
  fetchWithTimeout: vi.fn((url: string, init?: RequestInit) => {
    const mockFetch = (globalThis as any).__mockFetch;
    if (!mockFetch) {
      throw new Error('Mock fetch not set up');
    }
    return mockFetch(url, init);
  }),
}));

describe('monitoring API client', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).__mockFetch = mockFetch;
  });

  afterEach(() => {
    delete (globalThis as any).__mockFetch;
  });

  describe('fetchHealthStatus', () => {
    it('returns HealthResponse on success', async () => {
      const mockHealth: HealthResponse = {
        status: 'healthy',
        timestamp: '2024-01-15T10:30:00Z',
        checks: {
          database: { status: 'healthy', latencyMs: 15 },
          redis: { status: 'healthy', latencyMs: 5 },
        },
        uptime: 86400,
        version: 'abc1234',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockHealth,
      });

      const result = await fetchHealthStatus();

      expect(result).toEqual(mockHealth);
      expect(result.status).toBe('healthy');
      expect(result.uptime).toBe(86400);
      expect(result.checks.database.status).toBe('healthy');
    });

    it('handles 503 degraded status with valid JSON', async () => {
      const mockHealth: HealthResponse = {
        status: 'degraded',
        timestamp: '2024-01-15T10:30:00Z',
        checks: {
          database: { status: 'healthy', latencyMs: 15 },
          redis: { status: 'unhealthy', details: 'Connection timeout' },
        },
        uptime: 86400,
        version: 'abc1234',
      };

      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => mockHealth,
      });

      const result = await fetchHealthStatus();

      expect(result).toEqual(mockHealth);
      expect(result.status).toBe('degraded');
      expect(result.checks.redis.status).toBe('unhealthy');
      expect(result.checks.redis.details).toBe('Connection timeout');
    });

    it('includes latency information in health checks', async () => {
      const mockHealth: HealthResponse = {
        status: 'healthy',
        timestamp: '2024-01-15T10:30:00Z',
        checks: {
          database: { status: 'healthy', latencyMs: 25 },
          redis: { status: 'healthy', latencyMs: 8 },
          api: { status: 'healthy', latencyMs: 150 },
        },
        uptime: 3600,
        version: 'def5678',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockHealth,
      });

      const result = await fetchHealthStatus();

      expect(result.checks.database.latencyMs).toBe(25);
      expect(result.checks.redis.latencyMs).toBe(8);
      expect(result.checks.api.latencyMs).toBe(150);
    });

    it('throws on JSON parse error', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      await expect(fetchHealthStatus()).rejects.toThrow('Invalid JSON');
    });

    it('throws on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network timeout'));

      await expect(fetchHealthStatus()).rejects.toThrow('Network timeout');
    });

    it('calls correct endpoint with auth headers', async () => {
      const mockHealth: HealthResponse = {
        status: 'healthy',
        timestamp: '2024-01-15T10:30:00Z',
        checks: {},
        uptime: 100,
        version: 'test',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockHealth,
      });

      await fetchHealthStatus();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/monitoring/health'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer mock-token',
          }),
        })
      );
    });
  });

  describe('triggerTokenCleanup', () => {
    it('returns cleanup counts on success', async () => {
      const mockResult = {
        deactivated: 15,
        deleted: 3,
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResult,
      });

      const result = await triggerTokenCleanup();

      expect(result).toEqual({ deactivated: 15, deleted: 3 });
      expect(result.deactivated).toBe(15);
      expect(result.deleted).toBe(3);
    });

    it('throws on non-200 response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Internal error' }),
      });

      await expect(triggerTokenCleanup()).rejects.toThrow('Token cleanup failed: 500');
    });

    it('throws on 401 unauthorized', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Unauthorized' }),
      });

      await expect(triggerTokenCleanup()).rejects.toThrow('Token cleanup failed: 401');
    });

    it('defaults to 0 for missing counts', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      const result = await triggerTokenCleanup();

      expect(result).toEqual({ deactivated: 0, deleted: 0 });
    });

    it('handles partial response data', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ deactivated: 10 }),
      });

      const result = await triggerTokenCleanup();

      expect(result.deactivated).toBe(10);
      expect(result.deleted).toBe(0);
    });

    it('throws on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Connection refused'));

      await expect(triggerTokenCleanup()).rejects.toThrow('Connection refused');
    });

    it('calls correct endpoint with POST method', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ deactivated: 5, deleted: 1 }),
      });

      await triggerTokenCleanup();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/jobs/token-cleanup'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer mock-token',
          }),
        })
      );
    });

    it('handles zero cleanup counts', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ deactivated: 0, deleted: 0 }),
      });

      const result = await triggerTokenCleanup();

      expect(result.deactivated).toBe(0);
      expect(result.deleted).toBe(0);
    });

    it('handles large cleanup counts', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ deactivated: 1500, deleted: 320 }),
      });

      const result = await triggerTokenCleanup();

      expect(result.deactivated).toBe(1500);
      expect(result.deleted).toBe(320);
    });
  });
});
