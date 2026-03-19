/**
 * V3-HARDEN-185: SuperAdmin demand signals API client — mounted wiring tests
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getDemandPressure, getStoreDemandSignals, recomputeDemandSignals } from '../../api/demandSignals';

vi.mock('../../api/authToken', () => ({
  getAuthHeaders: vi.fn(() => ({ Authorization: 'Bearer mock-token', 'X-Request-ID': 'test-id' })),
  fetchWithTimeout: vi.fn((url: string, init?: RequestInit) => {
    const mockFetch = (globalThis as any).__mockFetch;
    if (!mockFetch) throw new Error('Mock fetch not set up');
    return mockFetch(url, init);
  }),
}));

vi.mock('../../api/errorSanitizer', () => ({
  sanitizeErrorMessage: vi.fn((raw: string) => raw),
}));

describe('demand signals API client', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).__mockFetch = mockFetch;
  });

  afterEach(() => {
    delete (globalThis as any).__mockFetch;
  });

  describe('getDemandPressure', () => {
    it('calls correct endpoint and returns pressure data', async () => {
      const mockData = {
        computedAt: '2026-03-20T12:00:00Z',
        totalProducts: 2,
        pressure: [
          { productId: 'p1', productName: 'A', totalStores: 5, storesNeedingReorder: 3, avgDaysOfStock: 2.5, totalPendingInbound: 10 },
        ],
      };
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ success: true, data: mockData }) });

      const result = await getDemandPressure(10);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/demand-signals/pressure?limit=10'),
        expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer mock-token' }) })
      );
      expect(result.pressure).toHaveLength(1);
      expect(result.pressure[0].productId).toBe('p1');
    });

    it('throws on auth failure', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 401, json: () => Promise.resolve({ error: 'Unauthorized' }) });
      await expect(getDemandPressure()).rejects.toThrow('Unauthorized');
    });
  });

  describe('getStoreDemandSignals', () => {
    it('calls store-specific endpoint', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ success: true, data: { storeId: 's1', signals: [] } }) });
      const result = await getStoreDemandSignals('s1');
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/demand-signals/store/s1'), expect.anything());
      expect(result.storeId).toBe('s1');
    });
  });

  describe('recomputeDemandSignals', () => {
    it('sends POST to recompute endpoint', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ success: true }) });
      await recomputeDemandSignals('s1');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/demand-signals/recompute'),
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ storeId: 's1' }) })
      );
    });
  });
});
