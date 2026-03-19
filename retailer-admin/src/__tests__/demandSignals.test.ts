/**
 * V3-HARDEN-185: Retailer demand signals API client — mounted wiring tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the API module
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Must import after mock setup
const { getDemandSignals, getDemandRecommendations } = await import('../lib/demandSignals');

describe('retailer demand signals API client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getDemandSignals', () => {
    it('calls correct endpoint with params', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: { storeId: 's1', totalProducts: 5, signals: [], needsReorderCount: 2, criticalCount: 1, computedAt: '', snapshotVersion: 0 },
        }),
      });

      const result = await getDemandSignals({ needsReorder: true, sortBy: 'velocity', limit: 20 });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/retailer-admin/demand-signals?needsReorder=true&sortBy=velocity&limit=20'),
        expect.objectContaining({ credentials: 'include' })
      );
      expect(result.totalProducts).toBe(5);
    });

    it('throws on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false, status: 500,
        json: () => Promise.resolve({ error: 'Internal error' }),
      });
      await expect(getDemandSignals()).rejects.toThrow('Internal error');
    });
  });

  describe('getDemandRecommendations', () => {
    it('calls recommendations endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: { storeId: 's1', computedAt: '', totalRecommendations: 0, recommendations: [] },
        }),
      });

      const result = await getDemandRecommendations();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/retailer-admin/demand-signals/recommendations'),
        expect.anything()
      );
      expect(result.totalRecommendations).toBe(0);
    });
  });
});
