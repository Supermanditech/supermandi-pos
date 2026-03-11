// SuperAdmin — Test devices API client
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchDevices, patchDevice, forceReEnrollDevice } from '../../api/devices';

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

describe('devices API client', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).__mockFetch = mockFetch;
  });

  afterEach(() => {
    delete (globalThis as any).__mockFetch;
  });

  // =========================================================================
  // fetchDevices
  // =========================================================================

  describe('fetchDevices', () => {
    it('returns paginated device list', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          devices: [
            { id: 'dev-1', active: true, store_id: 'store-1', last_seen_online: '2024-01-01', last_sync_at: null, pending_outbox_count: 0 },
          ],
          total: 1,
          limit: 50,
          offset: 0,
        }),
      });

      const result = await fetchDevices();
      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('dev-1');
      expect(result.total).toBe(1);
    });

    it('passes storeId query param', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ devices: [], total: 0 }),
      });

      await fetchDevices({ storeId: 'store-1' });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('storeId=store-1');
    });

    it('passes deviceId query param', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ devices: [], total: 0 }),
      });

      await fetchDevices({ deviceId: 'dev-123' });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('deviceId=dev-123');
    });

    it('passes pagination params', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ devices: [], total: 0 }),
      });

      await fetchDevices({ limit: 10, offset: 20 });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('limit=10');
      expect(calledUrl).toContain('offset=20');
    });

    it('trims whitespace from storeId', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ devices: [], total: 0 }),
      });

      await fetchDevices({ storeId: '  store-1  ' });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('storeId=store-1');
    });

    it('does not include empty storeId', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ devices: [], total: 0 }),
      });

      await fetchDevices({ storeId: '   ' });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).not.toContain('storeId');
    });

    it('returns empty items when devices is not array', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      const result = await fetchDevices();
      expect(result.items).toEqual([]);
    });

    it('uses default pagination values when missing', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ devices: [] }),
      });

      const result = await fetchDevices();
      expect(result.total).toBe(0);
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(0);
    });

    it('includes auth headers', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ devices: [], total: 0 }),
      });

      await fetchDevices();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          cache: 'no-store',
          headers: expect.objectContaining({
            Authorization: 'Bearer mock-token',
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

      await expect(fetchDevices()).rejects.toThrow();
    });

    it('handles json parse failure gracefully', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => { throw new Error('Invalid JSON'); },
      });

      const result = await fetchDevices();
      expect(result.items).toEqual([]);
    });
  });

  // =========================================================================
  // patchDevice
  // =========================================================================

  describe('patchDevice', () => {
    it('sends PATCH with device settings', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          device: { id: 'dev-1', label: 'POS Main', active: true, last_seen_online: null, last_sync_at: null, pending_outbox_count: 0 },
        }),
      });

      const result = await patchDevice('dev-1', { label: 'POS Main', deviceType: 'POS' });
      expect(result.label).toBe('POS Main');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/devices/dev-1'),
        expect.objectContaining({
          method: 'PATCH',
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        })
      );
    });

    it('sends printingMode and scanLookupV2Enabled', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          device: { id: 'dev-1', active: true, last_seen_online: null, last_sync_at: null, pending_outbox_count: 0 },
        }),
      });

      await patchDevice('dev-1', { printingMode: 'bluetooth', scanLookupV2Enabled: true });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.printingMode).toBe('bluetooth');
      expect(body.scanLookupV2Enabled).toBe(true);
    });

    it('sends active and resetToken flags', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          device: { id: 'dev-1', active: false, last_seen_online: null, last_sync_at: null, pending_outbox_count: 0 },
        }),
      });

      await patchDevice('dev-1', { active: false, resetToken: true });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.active).toBe(false);
      expect(body.resetToken).toBe(true);
    });

    it('throws when device field is missing from response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      await expect(patchDevice('dev-1', { label: 'Test' })).rejects.toThrow('Device response missing');
    });

    it('throws on error response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({}),
      });

      await expect(patchDevice('dev-1', {})).rejects.toThrow();
    });

    it('encodes deviceId in URL', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          device: { id: 'dev/special', active: true, last_seen_online: null, last_sync_at: null, pending_outbox_count: 0 },
        }),
      });

      await patchDevice('dev/special', { label: 'Test' });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('dev%2Fspecial');
    });
  });

  // =========================================================================
  // SA-P2-001: forceReEnrollDevice
  // =========================================================================

  describe('forceReEnrollDevice', () => {
    it('sends POST to force-re-enroll endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, message: 'Device has been deregistered.' }),
      });

      const result = await forceReEnrollDevice('dev-1');
      expect(result.success).toBe(true);
      expect(result.message).toBe('Device has been deregistered.');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/devices/dev-1/force-re-enroll'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        })
      );
    });

    it('sends reason in request body', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, message: 'Done' }),
      });

      await forceReEnrollDevice('dev-1', 'Device stolen');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.reason).toBe('Device stolen');
    });

    it('sends empty reason when not provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, message: 'Done' }),
      });

      await forceReEnrollDevice('dev-1');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.reason).toBe('');
    });

    it('encodes deviceId in URL', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      await forceReEnrollDevice('dev/special');

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('dev%2Fspecial/force-re-enroll');
    });

    it('throws on error response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({}),
      });

      await expect(forceReEnrollDevice('dev-1')).rejects.toThrow();
    });

    it('returns default message when response has no message', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      const result = await forceReEnrollDevice('dev-1');
      expect(result.message).toBe('Device has been deregistered.');
    });
  });
});
