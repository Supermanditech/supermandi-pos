// SuperAdmin — Test maintenance API client
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchMaintenanceStatus, toggleMaintenanceMode } from '../../api/maintenance';

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

describe('maintenance API client', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).__mockFetch = mockFetch;
  });

  afterEach(() => {
    delete (globalThis as any).__mockFetch;
  });

  // =========================================================================
  // fetchMaintenanceStatus
  // =========================================================================

  describe('fetchMaintenanceStatus', () => {
    it('returns maintenance status when API responds OK', async () => {
      const mockData = {
        maintenance: { enabled: false, message: null, updated_at: null },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockData,
      });

      const result = await fetchMaintenanceStatus();
      expect(result.enabled).toBe(false);
      expect(result.message).toBeNull();
    });

    it('returns enabled status with message', async () => {
      const mockData = {
        maintenance: {
          enabled: true,
          message: 'Scheduled maintenance',
          updated_at: '2024-01-15T10:30:00Z',
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockData,
      });

      const result = await fetchMaintenanceStatus();
      expect(result.enabled).toBe(true);
      expect(result.message).toBe('Scheduled maintenance');
      expect(result.updated_at).toBe('2024-01-15T10:30:00Z');
    });

    it('throws on non-OK response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Internal error' }),
      });

      await expect(fetchMaintenanceStatus()).rejects.toThrow('Request failed (500)');
    });

    it('throws on invalid response shape', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      await expect(fetchMaintenanceStatus()).rejects.toThrow('Invalid maintenance response');
    });

    it('sends correct headers', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ maintenance: { enabled: false, message: null, updated_at: null } }),
      });

      await fetchMaintenanceStatus();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain('/api/v1/admin/system/maintenance');
      expect(opts.method).toBe('GET');
      expect(opts.headers.Authorization).toBe('Bearer mock-token');
    });
  });

  // =========================================================================
  // toggleMaintenanceMode
  // =========================================================================

  describe('toggleMaintenanceMode', () => {
    it('enables maintenance mode', async () => {
      const mockData = {
        maintenance: {
          enabled: true,
          message: 'Down for updates',
          updated_at: '2024-01-15T10:30:00Z',
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockData,
      });

      const result = await toggleMaintenanceMode(true, 'Down for updates');
      expect(result.enabled).toBe(true);
      expect(result.message).toBe('Down for updates');
    });

    it('disables maintenance mode', async () => {
      const mockData = {
        maintenance: { enabled: false, message: null, updated_at: '2024-01-15T11:00:00Z' },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockData,
      });

      const result = await toggleMaintenanceMode(false);
      expect(result.enabled).toBe(false);
    });

    it('sends correct POST body with message', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ maintenance: { enabled: true, message: 'test', updated_at: null } }),
      });

      await toggleMaintenanceMode(true, 'test');

      const [, opts] = mockFetch.mock.calls[0];
      expect(opts.method).toBe('POST');
      const body = JSON.parse(opts.body as string);
      expect(body.enabled).toBe(true);
      expect(body.message).toBe('test');
    });

    it('sends POST body without message when not provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ maintenance: { enabled: false, message: null, updated_at: null } }),
      });

      await toggleMaintenanceMode(false);

      const [, opts] = mockFetch.mock.calls[0];
      const body = JSON.parse(opts.body as string);
      expect(body.enabled).toBe(false);
      expect(body.message).toBeUndefined();
    });

    it('throws on non-OK response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ error: 'permission_denied' }),
      });

      await expect(toggleMaintenanceMode(true)).rejects.toThrow('Request failed (403)');
    });

    it('throws on invalid response shape', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      await expect(toggleMaintenanceMode(true)).rejects.toThrow('Invalid maintenance response');
    });
  });
});
