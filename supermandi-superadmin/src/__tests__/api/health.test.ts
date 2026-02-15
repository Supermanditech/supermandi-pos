// SuperAdmin — Test health API client
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchHealth } from '../../api/health';
import type { HealthResponse } from '../../api/health';

// Mock the authToken module
vi.mock('../../api/authToken', () => ({
  getAuthHeaders: vi.fn(() => ({ Authorization: 'Bearer mock-token', 'X-Request-ID': 'test-id' })),
  fetchWithTimeout: vi.fn((url: string, init?: RequestInit) => {
    const mockFetch = (globalThis as any).__mockFetch;
    if (!mockFetch) {
      throw new Error('Mock fetch not set up');
    }
    return mockFetch(url, init);
  }),
}));

describe('health API client', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).__mockFetch = mockFetch;
  });

  afterEach(() => {
    delete (globalThis as any).__mockFetch;
  });

  describe('fetchHealth', () => {
    it('returns health data on success', async () => {
      const mockHealthData = {
        status: 'ok',
        timestamp: '2024-01-15T10:30:00Z',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockHealthData,
      });

      const result = await fetchHealth();

      expect(result).toEqual({ status: 'ok' });
      expect(result.status).toBe('ok');
    });

    it('calls correct endpoint with auth headers', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ status: 'ok' }),
      });

      await fetchHealth();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/health'),
        expect.objectContaining({
          method: 'GET',
          cache: 'no-store',
          headers: expect.objectContaining({
            Accept: 'application/json',
            Authorization: 'Bearer mock-token',
          }),
        })
      );
    });

    it('includes Accept header', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ status: 'ok' }),
      });

      await fetchHealth();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Accept: 'application/json',
          }),
        })
      );
    });

    it('sets cache to no-store', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ status: 'ok' }),
      });

      await fetchHealth();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          cache: 'no-store',
        })
      );
    });

    it('throws error on 401 unauthorized', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Unauthorized' }),
      });

      await expect(fetchHealth()).rejects.toThrow('Session expired or unauthorized');
    });

    it('throws error on 500 server error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Internal error' }),
      });

      await expect(fetchHealth()).rejects.toThrow('Health check failed (500)');
    });

    it('throws error on 503 service unavailable', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ error: 'Service unavailable' }),
      });

      await expect(fetchHealth()).rejects.toThrow('Health check failed (503)');
    });

    it('throws error on network failure', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(fetchHealth()).rejects.toThrow('Network error');
    });

    it('throws error on timeout', async () => {
      mockFetch.mockRejectedValue(new Error('Request timeout'));

      await expect(fetchHealth()).rejects.toThrow('Request timeout');
    });

    it('throws error on invalid JSON response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      await expect(fetchHealth()).rejects.toThrow('Invalid JSON');
    });

    it('throws error when response has no status field', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      await expect(fetchHealth()).rejects.toThrow('Invalid health response');
    });

    it('throws error when response is null', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => null,
      });

      await expect(fetchHealth()).rejects.toThrow('Invalid health response');
    });

    it('throws error when response is not an object', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => 'string response',
      });

      await expect(fetchHealth()).rejects.toThrow('Invalid health response');
    });

    it('handles different status values', async () => {
      const statuses = ['ok', 'healthy', 'degraded', 'unhealthy'];

      for (const status of statuses) {
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({ status }),
        });

        const result = await fetchHealth();
        expect(result.status).toBe(status);
      }
    });

    it('converts non-string status to string', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ status: 200 }),
      });

      const result = await fetchHealth();
      expect(result.status).toBe('200');
      expect(typeof result.status).toBe('string');
    });

    it('handles boolean status', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ status: true }),
      });

      const result = await fetchHealth();
      expect(result.status).toBe('true');
    });

    it('handles extra fields in response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'ok',
          timestamp: '2024-01-15T10:30:00Z',
          uptime: 86400,
          version: 'abc123',
        }),
      });

      const result = await fetchHealth();
      expect(result.status).toBe('ok');
      // Only status field is guaranteed in HealthResponse type
      expect(result).toHaveProperty('status');
    });

    it('uses GET method', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ status: 'ok' }),
      });

      await fetchHealth();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'GET',
        })
      );
    });

    it('throws specific error for 401 status', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Token expired' }),
      });

      try {
        await fetchHealth();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('Session expired');
        expect((error as Error).message).toContain('log in again');
      }
    });

    it('includes status code in non-401 error messages', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: 'Not found' }),
      });

      try {
        await fetchHealth();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('404');
      }
    });

    it('makes request to admin health endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ status: 'ok' }),
      });

      await fetchHealth();

      const callUrl = mockFetch.mock.calls[0][0];
      expect(callUrl).toContain('/api/v1/admin/health');
    });
  });
});
