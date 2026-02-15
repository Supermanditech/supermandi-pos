// SuperAdmin — Test featureFlags API client
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchGlobalFlags,
  toggleGlobalFlag,
  fetchStoreFeatureFlags,
  setStoreOverride,
  removeStoreOverride,
  bulkSetOverride,
} from '../../api/featureFlags';

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

describe('featureFlags API client', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).__mockFetch = mockFetch;
  });

  afterEach(() => {
    delete (globalThis as any).__mockFetch;
  });

  // =========================================================================
  // fetchGlobalFlags
  // =========================================================================

  describe('fetchGlobalFlags', () => {
    it('returns global feature flags', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          flags: [
            { flag_key: 'scan_v2', enabled: true, description: 'V2 scan', updated_at: '2024-01-01' },
            { flag_key: 'bnpl', enabled: false, description: 'Buy now pay later', updated_at: '2024-01-01' },
          ],
        }),
      });

      const result = await fetchGlobalFlags();
      expect(result).toHaveLength(2);
      expect(result[0].flag_key).toBe('scan_v2');
      expect(result[0].enabled).toBe(true);
    });

    it('returns empty array when flags is undefined', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      const result = await fetchGlobalFlags();
      expect(result).toEqual([]);
    });

    it('calls feature-flags endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ flags: [] }),
      });

      await fetchGlobalFlags();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/feature-flags'),
        expect.objectContaining({
          cache: 'no-store',
          headers: expect.objectContaining({
            Authorization: 'Bearer mock-token',
          }),
        })
      );
    });

    it('throws on error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      });

      await expect(fetchGlobalFlags()).rejects.toThrow();
    });

    it('handles json parse failure gracefully', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => { throw new Error('Bad JSON'); },
      });

      const result = await fetchGlobalFlags();
      expect(result).toEqual([]);
    });
  });

  // =========================================================================
  // toggleGlobalFlag
  // =========================================================================

  describe('toggleGlobalFlag', () => {
    it('sends PATCH with enabled state', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          flag: { flag_key: 'scan_v2', enabled: true, description: 'V2 scan', updated_at: '2024-01-01' },
        }),
      });

      const result = await toggleGlobalFlag('scan_v2', true);
      expect(result.enabled).toBe(true);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/feature-flags/scan_v2'),
        expect.objectContaining({ method: 'PATCH' })
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.enabled).toBe(true);
    });

    it('sends payloadJson when provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          flag: { flag_key: 'minAppVersion', enabled: true, payload_json: { version: '1.2.0' }, description: null, updated_at: '2024-01-01' },
        }),
      });

      await toggleGlobalFlag('minAppVersion', true, { version: '1.2.0' });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.payloadJson).toEqual({ version: '1.2.0' });
    });

    it('omits payloadJson when not provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          flag: { flag_key: 'test', enabled: false, description: null, updated_at: '2024-01-01' },
        }),
      });

      await toggleGlobalFlag('test', false);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.payloadJson).toBeUndefined();
    });

    it('throws when flag is missing from response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      await expect(toggleGlobalFlag('test', true)).rejects.toThrow('Flag response missing');
    });

    it('throws on error response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({}),
      });

      await expect(toggleGlobalFlag('nonexistent', true)).rejects.toThrow();
    });

    it('encodes flag key in URL', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          flag: { flag_key: 'flag/special', enabled: true, description: null, updated_at: '2024-01-01' },
        }),
      });

      await toggleGlobalFlag('flag/special', true);

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('flag%2Fspecial');
    });
  });

  // =========================================================================
  // fetchStoreFeatureFlags
  // =========================================================================

  describe('fetchStoreFeatureFlags', () => {
    it('returns store-level feature flags', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          flags: [
            { flag_key: 'scan_v2', global_enabled: true, store_override: null, effective: true },
            { flag_key: 'bnpl', global_enabled: true, store_override: false, effective: false },
          ],
        }),
      });

      const result = await fetchStoreFeatureFlags('store-1');
      expect(result).toHaveLength(2);
      expect(result[1].store_override).toBe(false);
      expect(result[1].effective).toBe(false);
    });

    it('calls correct store endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ flags: [] }),
      });

      await fetchStoreFeatureFlags('store-1');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/stores/store-1/feature-flags'),
        expect.any(Object)
      );
    });

    it('returns empty array when flags undefined', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      const result = await fetchStoreFeatureFlags('store-1');
      expect(result).toEqual([]);
    });

    it('throws on error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({}),
      });

      await expect(fetchStoreFeatureFlags('nonexistent')).rejects.toThrow();
    });
  });

  // =========================================================================
  // setStoreOverride
  // =========================================================================

  describe('setStoreOverride', () => {
    it('sends PATCH with enabled value', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });

      await setStoreOverride('store-1', 'scan_v2', true);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/stores/store-1/feature-flags/scan_v2'),
        expect.objectContaining({ method: 'PATCH' })
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.enabled).toBe(true);
    });

    it('throws on error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({}),
      });

      await expect(setStoreOverride('store-1', 'flag', true)).rejects.toThrow();
    });
  });

  // =========================================================================
  // removeStoreOverride
  // =========================================================================

  describe('removeStoreOverride', () => {
    it('sends DELETE request', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });

      await removeStoreOverride('store-1', 'scan_v2');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/stores/store-1/feature-flags/scan_v2'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('throws on error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({}),
      });

      await expect(removeStoreOverride('store-1', 'flag')).rejects.toThrow();
    });
  });

  // =========================================================================
  // bulkSetOverride
  // =========================================================================

  describe('bulkSetOverride', () => {
    it('sends POST with storeIds, flagKey, and enabled', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ updated: 5 }),
      });

      const result = await bulkSetOverride(['store-1', 'store-2', 'store-3'], 'scan_v2', true);
      expect(result.updated).toBe(5);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/feature-flags/bulk'),
        expect.objectContaining({ method: 'POST' })
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.storeIds).toEqual(['store-1', 'store-2', 'store-3']);
      expect(body.flagKey).toBe('scan_v2');
      expect(body.enabled).toBe(true);
    });

    it('returns default updated=0 when missing', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      const result = await bulkSetOverride(['store-1'], 'flag', false);
      expect(result.updated).toBe(0);
    });

    it('throws on error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      });

      await expect(bulkSetOverride(['store-1'], 'flag', true)).rejects.toThrow();
    });
  });
});
