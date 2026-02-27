// SuperAdmin — Test refunds API client
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchRefunds, approveRefund, rejectRefund } from '../../api/refunds';

vi.mock('../../api/authToken', () => ({
  getAuthHeaders: vi.fn(() => ({ Authorization: 'Bearer mock-token', 'X-Request-ID': 'test-id' })),
  fetchWithTimeout: vi.fn((url: string, init?: RequestInit) => {
    const mockFetch = (globalThis as any).__mockFetch;
    if (!mockFetch) throw new Error('Mock fetch not set up');
    return mockFetch(url, init);
  }),
}));

describe('refunds API client', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).__mockFetch = mockFetch;
  });

  afterEach(() => {
    delete (globalThis as any).__mockFetch;
  });

  // =========================================================================
  // fetchRefunds
  // =========================================================================

  describe('fetchRefunds', () => {
    it('returns refund list with pagination', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            {
              id: 'ref-1',
              storeId: 'store-1',
              orderId: 'ord-1',
              paymentId: 'pay-1',
              refundAmount: 5000,
              reason: 'Defective',
              status: 'initiated',
              razorpayRefundId: null,
              processedAt: null,
              failureReason: null,
              createdAt: '2024-01-01',
            },
          ],
          pagination: { total: 1, limit: 50, offset: 0 },
        }),
      });

      const result = await fetchRefunds();
      expect(result.data).toHaveLength(1);
      expect(result.data[0].status).toBe('initiated');
      expect(result.total).toBe(1);
    });

    it('passes status filter', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [], pagination: { total: 0, limit: 50, offset: 0 } }),
      });

      await fetchRefunds({ status: 'processing' });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('status=processing');
    });

    it('passes storeId filter', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [], pagination: { total: 0, limit: 50, offset: 0 } }),
      });

      await fetchRefunds({ storeId: 'store-1' });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('storeId=store-1');
    });

    it('passes pagination params', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [], pagination: { total: 0, limit: 10, offset: 20 } }),
      });

      await fetchRefunds({ limit: 10, offset: 20 });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('limit=10');
      expect(calledUrl).toContain('offset=20');
    });

    it('handles no query string when no params', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [], pagination: { total: 0, limit: 50, offset: 0 } }),
      });

      await fetchRefunds();

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('/api/v1/admin/refunds');
    });

    it('includes auth headers', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [], pagination: {} }),
      });

      await fetchRefunds();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer mock-token',
          }),
        })
      );
    });

    it('throws on error response', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });
      await expect(fetchRefunds()).rejects.toThrow('Failed to load refunds. Please try again.');
    });

    it('returns empty data array when data is missing', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      const result = await fetchRefunds();
      expect(result.data).toEqual([]);
    });

    it('uses fallback pagination values', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      });

      const result = await fetchRefunds();
      expect(result.total).toBe(0);
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(0);
    });
  });

  // =========================================================================
  // approveRefund
  // =========================================================================

  describe('approveRefund', () => {
    it('sends POST to approve endpoint', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      await approveRefund('ref-1');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/refunds/ref-1/approve'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('encodes refundId in URL', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      await approveRefund('ref/special');

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('ref%2Fspecial');
    });

    it('includes auth headers', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      await approveRefund('ref-1');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer mock-token',
          }),
        })
      );
    });

    it('throws on error response', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 422 });
      await expect(approveRefund('ref-1')).rejects.toThrow('Failed to approve refund. Please try again.');
    });
  });

  // =========================================================================
  // rejectRefund
  // =========================================================================

  describe('rejectRefund', () => {
    it('sends POST with rejection reason', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      await rejectRefund('ref-1', 'Invalid claim');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/refunds/ref-1/reject'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        })
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.reason).toBe('Invalid claim');
    });

    it('throws on error response', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 400 });
      await expect(rejectRefund('ref-1', 'reason')).rejects.toThrow('Failed to reject refund. Please try again.');
    });
  });
});
