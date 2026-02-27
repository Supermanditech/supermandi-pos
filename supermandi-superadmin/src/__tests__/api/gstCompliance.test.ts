// SuperAdmin — Test gstCompliance API client
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchGstSummary, exportGstr1, fetchGstStoresOverview } from '../../api/gstCompliance';

vi.mock('../../api/authToken', () => ({
  getAuthHeaders: vi.fn(() => ({ Authorization: 'Bearer mock-token', 'X-Request-ID': 'test-id' })),
  fetchWithTimeout: vi.fn((url: string, init?: RequestInit) => {
    const mockFetch = (globalThis as any).__mockFetch;
    if (!mockFetch) throw new Error('Mock fetch not set up');
    return mockFetch(url, init);
  }),
}));

describe('gstCompliance API client', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).__mockFetch = mockFetch;
  });

  afterEach(() => {
    delete (globalThis as any).__mockFetch;
  });

  // =========================================================================
  // fetchGstSummary
  // =========================================================================

  describe('fetchGstSummary', () => {
    it('returns GST summary for a store', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            storeId: 'store-1',
            month: '2024-01',
            totalTaxable: 500000,
            cgst: 25000,
            sgst: 25000,
            igst: 0,
            cess: 0,
            totalTax: 50000,
            totalInvoices: 10,
            stateBreakdown: [],
            supplierBreakdown: [],
          },
        }),
      });

      const result = await fetchGstSummary('store-1', '2024-01');
      expect(result.storeId).toBe('store-1');
      expect(result.totalSales).toBe(500000);
      expect(result.cgstCollected).toBe(25000);
      expect(result.sgstCollected).toBe(25000);
      expect(result.totalTaxCollected).toBe(50000);
      expect(result.invoiceCount).toBe(10);
    });

    it('parses month param into ?month=M&year=YYYY', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: {} }),
      });

      await fetchGstSummary('store-1', '2024-06');

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('month=6');
      expect(calledUrl).toContain('year=2024');
    });

    it('handles no month param', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: {} }),
      });

      await fetchGstSummary('store-1');

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).not.toContain('month=');
    });

    it('calls correct endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: {} }),
      });

      await fetchGstSummary('store-1');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/gst/summary/store-1'),
        expect.any(Object)
      );
    });

    it('handles direct response (no data wrapper)', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          storeId: 'store-1',
          totalTaxable: 100000,
          totalTax: 18000,
          totalInvoices: 5,
        }),
      });

      const result = await fetchGstSummary('store-1');
      expect(result.totalSales).toBe(100000);
      expect(result.totalTaxCollected).toBe(18000);
    });

    it('returns default zero values for missing fields', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: {} }),
      });

      const result = await fetchGstSummary('store-1');
      expect(result.totalSales).toBe(0);
      expect(result.cgstCollected).toBe(0);
      expect(result.sgstCollected).toBe(0);
      expect(result.igstCollected).toBe(0);
      expect(result.cessCollected).toBe(0);
      expect(result.totalTaxCollected).toBe(0);
      expect(result.invoiceCount).toBe(0);
      expect(result.totalPurchases).toBe(0);
      expect(result.inputCgst).toBe(0);
      expect(result.inputSgst).toBe(0);
      expect(result.inputIgst).toBe(0);
      expect(result.inputCess).toBe(0);
      expect(result.totalInputCredit).toBe(0);
    });

    it('throws on error', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });
      await expect(fetchGstSummary('store-1')).rejects.toThrow('Failed to load GST summary');
    });

    it('encodes storeId in URL', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: {} }),
      });

      await fetchGstSummary('store/special');

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('store%2Fspecial');
    });
  });

  // =========================================================================
  // exportGstr1
  // =========================================================================

  describe('exportGstr1', () => {
    it('returns blob from export endpoint', async () => {
      const mockBlob = new Blob(['CSV content'], { type: 'text/csv' });
      mockFetch.mockResolvedValue({
        ok: true,
        blob: async () => mockBlob,
      });

      const result = await exportGstr1('store-1', '2024-06');
      expect(result).toBeInstanceOf(Blob);
    });

    it('calls export endpoint with month params', async () => {
      const mockBlob = new Blob(['data']);
      mockFetch.mockResolvedValue({
        ok: true,
        blob: async () => mockBlob,
      });

      await exportGstr1('store-1', '2024-12');

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('/api/v1/admin/gst/summary/store-1/export');
      expect(calledUrl).toContain('month=12');
      expect(calledUrl).toContain('year=2024');
    });

    it('handles no month param', async () => {
      const mockBlob = new Blob(['data']);
      mockFetch.mockResolvedValue({
        ok: true,
        blob: async () => mockBlob,
      });

      await exportGstr1('store-1');

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('/export');
      expect(calledUrl).not.toContain('month=');
    });

    it('throws on error', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404 });
      await expect(exportGstr1('store-1')).rejects.toThrow('No GST data available for export in this period');
    });

    it('includes auth headers', async () => {
      const mockBlob = new Blob(['data']);
      mockFetch.mockResolvedValue({
        ok: true,
        blob: async () => mockBlob,
      });

      await exportGstr1('store-1');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer mock-token',
          }),
        })
      );
    });
  });

  // =========================================================================
  // fetchGstStoresOverview
  // =========================================================================

  describe('fetchGstStoresOverview', () => {
    it('returns stores overview with totals', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          stores: [
            {
              storeId: 'store-1',
              storeName: 'Test Store',
              storeCode: 'TS01',
              gstin: '12ABCDE',
              totalTaxable: 500000,
              totalTax: 50000,
              totalInvoices: 10,
              generatedAt: '2024-01-15',
            },
          ],
          totals: { totalTaxable: 500000, totalTax: 50000, totalInvoices: 10 },
          filingDeadline: '2024-02-11',
        }),
      });

      const result = await fetchGstStoresOverview('2024-01');
      expect(result.stores).toHaveLength(1);
      expect(result.stores[0].storeName).toBe('Test Store');
      expect(result.stores[0].totalSales).toBe(500000);
      expect(result.stores[0].totalTax).toBe(50000);
      expect(result.totals.totalSales).toBe(500000);
      expect(result.filingDeadline).toBe('2024-02-11');
    });

    it('calls stores-overview endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ stores: [], totals: {}, filingDeadline: '' }),
      });

      await fetchGstStoresOverview();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/gst/stores-overview'),
        expect.any(Object)
      );
    });

    it('passes month params', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ stores: [], totals: {}, filingDeadline: '' }),
      });

      await fetchGstStoresOverview('2024-03');

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('month=3');
      expect(calledUrl).toContain('year=2024');
    });

    it('handles data wrapper', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            stores: [{ storeId: 's1', storeName: 'S1', storeCode: 'SC1', totalTaxable: 100, totalTax: 18, totalInvoices: 1 }],
            totals: { totalTaxable: 100, totalTax: 18, totalInvoices: 1 },
            filingDeadline: '2024-02-11',
          },
        }),
      });

      const result = await fetchGstStoresOverview();
      expect(result.stores).toHaveLength(1);
    });

    it('returns empty stores when none present', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      const result = await fetchGstStoresOverview();
      expect(result.stores).toEqual([]);
    });

    it('throws on error', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });
      await expect(fetchGstStoresOverview()).rejects.toThrow('Failed to load GST stores overview');
    });
  });
});
