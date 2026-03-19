/**
 * V3-FIX-187: Supplier allocation API client — mounted wiring tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const { listAllocations, getAllocation, updateAllocationStatus } = await import('../../lib/demandAllocations');

describe('supplier allocations API client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listAllocations', () => {
    it('calls correct endpoint with credentials', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: [], pagination: { total: 0 } }),
      });

      const result = await listAllocations({ status: 'triggered', limit: 10 });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/supplier/allocations?status=triggered&limit=10'),
        expect.objectContaining({ credentials: 'include' })
      );
      expect(result.allocations).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('throws on 401', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false, status: 401,
        json: () => Promise.resolve({ error: 'Unauthorized' }),
      });
      await expect(listAllocations()).rejects.toThrow('Unauthorized');
    });
  });

  describe('getAllocation', () => {
    it('fetches single allocation by ID', async () => {
      const allocation = { id: 'alloc-1', status: 'triggered', storeId: 's1' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: allocation }),
      });

      const result = await getAllocation('alloc-1');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/allocations/alloc-1'),
        expect.anything()
      );
      expect(result.id).toBe('alloc-1');
    });
  });

  describe('updateAllocationStatus', () => {
    it('sends PATCH with status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: { id: 'alloc-1', status: 'accepted' } }),
      });

      const result = await updateAllocationStatus('alloc-1', 'accepted');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/allocations/alloc-1/status'),
        expect.objectContaining({ method: 'PATCH' })
      );
      expect(result.status).toBe('accepted');
    });

    it('throws on 409 conflict', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false, status: 409,
        json: () => Promise.resolve({ error: 'Invalid transition' }),
      });
      await expect(updateAllocationStatus('alloc-1', 'accepted')).rejects.toThrow('Invalid transition');
    });
  });
});
