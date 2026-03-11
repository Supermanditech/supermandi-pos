// SuperAdmin — Test compliance API client
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchComplianceOverview } from '../../api/compliance';

vi.mock('../../api/authToken', () => ({
  getAuthHeaders: vi.fn(() => ({ Authorization: 'Bearer mock-token', 'X-Request-ID': 'test-id' })),
  fetchWithTimeout: vi.fn((url: string, init?: RequestInit) => {
    const mockFetch = (globalThis as any).__mockFetch;
    if (!mockFetch) throw new Error('Mock fetch not set up');
    return mockFetch(url, init);
  }),
}));

describe('compliance API client', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).__mockFetch = mockFetch;
  });

  afterEach(() => {
    delete (globalThis as any).__mockFetch;
  });

  // =========================================================================
  // fetchComplianceOverview
  // =========================================================================

  describe('fetchComplianceOverview', () => {
    it('returns compliance overview with summary and stores', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          summary: {
            totalStores: 10,
            compliantCount: 5,
            nonCompliantCount: 2,
            pendingCount: 3,
          },
          stores: [
            {
              id: 'store-1',
              name: 'Test Store',
              code: 'TS01',
              status: 'ACTIVE',
              kycStatus: 'approved',
              kycComplete: true,
              adminApproved: true,
              deviceBound: true,
              upiComplete: true,
              complianceStatus: 'compliant',
              documents: { total: 3, approved: 3, pending: 0, rejected: 0 },
              createdAt: '2024-01-01',
              updatedAt: '2024-01-15',
            },
          ],
        }),
      });

      const result = await fetchComplianceOverview();
      expect(result.summary.totalStores).toBe(10);
      expect(result.summary.compliantCount).toBe(5);
      expect(result.summary.nonCompliantCount).toBe(2);
      expect(result.summary.pendingCount).toBe(3);
      expect(result.stores).toHaveLength(1);
      expect(result.stores[0].name).toBe('Test Store');
      expect(result.stores[0].complianceStatus).toBe('compliant');
      expect(result.stores[0].kycComplete).toBe(true);
      expect(result.stores[0].adminApproved).toBe(true);
      expect(result.stores[0].documents.approved).toBe(3);
    });

    it('calls correct endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ summary: {}, stores: [] }),
      });

      await fetchComplianceOverview();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/compliance/overview'),
        expect.any(Object)
      );
    });

    it('includes auth headers', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ summary: {}, stores: [] }),
      });

      await fetchComplianceOverview();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer mock-token',
          }),
        })
      );
    });

    it('handles data wrapper', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            summary: { totalStores: 5, compliantCount: 2, nonCompliantCount: 1, pendingCount: 2 },
            stores: [{ id: 's1', name: 'S1', code: 'SC1', complianceStatus: 'pending' }],
          },
        }),
      });

      const result = await fetchComplianceOverview();
      expect(result.summary.totalStores).toBe(5);
      expect(result.stores).toHaveLength(1);
    });

    it('returns default zero values for missing summary fields', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ summary: {}, stores: [] }),
      });

      const result = await fetchComplianceOverview();
      expect(result.summary.totalStores).toBe(0);
      expect(result.summary.compliantCount).toBe(0);
      expect(result.summary.nonCompliantCount).toBe(0);
      expect(result.summary.pendingCount).toBe(0);
    });

    it('returns empty stores when none present', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      const result = await fetchComplianceOverview();
      expect(result.stores).toEqual([]);
    });

    it('defaults boolean fields to false for store entries', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          summary: {},
          stores: [{ id: 's1', name: 'S1' }],
        }),
      });

      const result = await fetchComplianceOverview();
      expect(result.stores[0].kycComplete).toBe(false);
      expect(result.stores[0].adminApproved).toBe(false);
      expect(result.stores[0].deviceBound).toBe(false);
      expect(result.stores[0].upiComplete).toBe(false);
    });

    it('defaults document counts to zero', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          summary: {},
          stores: [{ id: 's1', name: 'S1' }],
        }),
      });

      const result = await fetchComplianceOverview();
      expect(result.stores[0].documents.total).toBe(0);
      expect(result.stores[0].documents.approved).toBe(0);
      expect(result.stores[0].documents.pending).toBe(0);
      expect(result.stores[0].documents.rejected).toBe(0);
    });

    it('throws on 403 with access denied message', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 403 });
      await expect(fetchComplianceOverview()).rejects.toThrow('Access denied');
    });

    it('throws on 500 with generic error message', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });
      await expect(fetchComplianceOverview()).rejects.toThrow('Failed to load compliance overview');
    });

    it('maps non-compliant store correctly', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          summary: { totalStores: 1, compliantCount: 0, nonCompliantCount: 1, pendingCount: 0 },
          stores: [{
            id: 's2',
            name: 'Problem Store',
            code: 'PS01',
            status: 'NEEDS_FIX',
            kycStatus: 'rejected',
            kycComplete: false,
            adminApproved: false,
            complianceStatus: 'non_compliant',
            documents: { total: 2, approved: 0, pending: 0, rejected: 2 },
          }],
        }),
      });

      const result = await fetchComplianceOverview();
      expect(result.stores[0].complianceStatus).toBe('non_compliant');
      expect(result.stores[0].documents.rejected).toBe(2);
    });
  });
});
