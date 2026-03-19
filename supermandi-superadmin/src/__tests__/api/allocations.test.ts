/**
 * V3-FIX-187: SuperAdmin allocations API client — mounted wiring tests
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getAllocationSummary, getStoreAllocations, transitionAllocation } from '../../api/allocations';

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

describe('allocations API client', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).__mockFetch = mockFetch;
  });

  afterEach(() => {
    delete (globalThis as any).__mockFetch;
  });

  describe('getAllocationSummary', () => {
    it('calls summary endpoint and returns data', async () => {
      const mockData = { total: 15, byStatus: { triggered: 5, accepted: 7, delivered: 3 } };
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ success: true, data: mockData }) });

      const result = await getAllocationSummary();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/allocations/summary'),
        expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer mock-token' }) })
      );
      expect(result.total).toBe(15);
      expect(result.byStatus.triggered).toBe(5);
    });

    it('throws on 403 permission denied', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 403, json: () => Promise.resolve({ error: 'Forbidden' }) });
      await expect(getAllocationSummary()).rejects.toThrow('Forbidden');
    });
  });

  describe('getStoreAllocations', () => {
    it('calls store-specific endpoint with params', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: [], pagination: { total: 0 } }),
      });
      await getStoreAllocations('store-1', { status: 'triggered', limit: 10 });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/allocations/store/store-1?status=triggered&limit=10'),
        expect.anything()
      );
    });
  });

  describe('transitionAllocation', () => {
    it('sends PATCH with status and reason', async () => {
      const updated = { id: 'alloc-1', status: 'accepted' };
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ success: true, data: updated }) });

      const result = await transitionAllocation('alloc-1', 'accepted', 'manual approval');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/allocations/alloc-1/status'),
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ status: 'accepted', reason: 'manual approval' }),
        })
      );
      expect(result.status).toBe('accepted');
    });

    it('throws on 409 invalid transition', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false, status: 409,
        json: () => Promise.resolve({ error: 'Invalid transition: rejected → accepted' }),
      });
      await expect(transitionAllocation('alloc-1', 'accepted')).rejects.toThrow('Invalid transition');
    });
  });
});
