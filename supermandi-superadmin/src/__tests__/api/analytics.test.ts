// SuperAdmin — Test analytics API client
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchAnalyticsOverview,
  fetchAnalyticsDevices,
  fetchAnalyticsProducts,
  fetchAnalyticsPurchases,
  fetchAnalyticsConsumerSales,
  fetchAnalyticsActivity,
  fetchAnalyticsDues,
} from '../../api/analytics';

vi.mock('../../api/authToken', () => ({
  getAuthHeaders: vi.fn(() => ({ Authorization: 'Bearer mock-token', 'X-Request-ID': 'test-id' })),
  fetchWithTimeout: vi.fn((url: string, init?: RequestInit) => {
    const mockFetch = (globalThis as any).__mockFetch;
    if (!mockFetch) throw new Error('Mock fetch not set up');
    return mockFetch(url, init);
  }),
}));

vi.mock('../../api/errorSanitizer', () => ({
  sanitizeErrorMessage: vi.fn((raw: string | null, fallback: string) => raw || fallback),
}));

describe('analytics API client', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).__mockFetch = mockFetch;
  });

  afterEach(() => {
    delete (globalThis as any).__mockFetch;
  });

  // =========================================================================
  // fetchAnalyticsOverview
  // =========================================================================

  describe('fetchAnalyticsOverview', () => {
    it('returns overview data', async () => {
      const mockData = {
        overview: {
          range: { from: '2024-01-01', to: '2024-01-31' },
          sales_total: { pos_minor: 100000, consumer_minor: 50000, total_minor: 150000 },
          collections_total_minor: 120000,
          payment_split_minor: { cash: 60000, upi: 40000, due: 20000 },
          due_outstanding: { total_minor: 20000, buckets: [] },
          new_products_created_count: 5,
          devices: { online: 3, offline: 1, pending_outbox_total: 0 },
          profit: null,
          profit_missing_fields: [],
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockData,
      });

      const result = await fetchAnalyticsOverview({});
      expect(result.overview.sales_total.total_minor).toBe(150000);
    });

    it('passes storeId and date range params', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ overview: {} }),
      });

      await fetchAnalyticsOverview({ storeId: 'store-1', from: '2024-01-01', to: '2024-01-31' });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('storeId=store-1');
      expect(calledUrl).toContain('from=2024-01-01');
      expect(calledUrl).toContain('to=2024-01-31');
    });

    it('calls overview endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ overview: {} }),
      });

      await fetchAnalyticsOverview({});

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/analytics/overview'),
        expect.any(Object)
      );
    });

    it('throws on 401 unauthorized', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({}),
      });

      await expect(fetchAnalyticsOverview({})).rejects.toThrow('Unauthorized');
    });

    it('throws sanitized error on failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'DB timeout' }),
      });

      await expect(fetchAnalyticsOverview({})).rejects.toThrow();
    });

    it('includes auth headers', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ overview: {} }),
      });

      await fetchAnalyticsOverview({});

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
  });

  // =========================================================================
  // fetchAnalyticsDevices
  // =========================================================================

  describe('fetchAnalyticsDevices', () => {
    it('returns devices analytics data', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          devices: [{ device_id: 'dev-1', active: true, sales_count: 10, sales_total_minor: 50000 }],
          total: 1,
          range: { from: '2024-01-01', to: '2024-01-31' },
        }),
      });

      const result = await fetchAnalyticsDevices({});
      expect(result.devices).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('passes params', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ devices: [], total: 0, range: {} }),
      });

      await fetchAnalyticsDevices({ storeId: 'store-1', from: '2024-01-01', to: '2024-01-31' });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('/api/v1/admin/analytics/devices');
      expect(calledUrl).toContain('storeId=store-1');
    });

    it('throws on error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      });

      await expect(fetchAnalyticsDevices({})).rejects.toThrow();
    });
  });

  // =========================================================================
  // fetchAnalyticsProducts
  // =========================================================================

  describe('fetchAnalyticsProducts', () => {
    it('returns products analytics data', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          products: {
            range: { from: '2024-01-01', to: '2024-01-31' },
            top_products: [],
            new_products_created_count: 3,
            new_products_created: [],
            sales_by_group: [],
            group_by: 'category',
            missing_fields: [],
          },
        }),
      });

      const result = await fetchAnalyticsProducts({});
      expect(result.products.new_products_created_count).toBe(3);
    });

    it('passes groupBy param', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ products: {} }),
      });

      await fetchAnalyticsProducts({ groupBy: 'hour' });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('groupBy=hour');
    });

    it('calls products endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ products: {} }),
      });

      await fetchAnalyticsProducts({});

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/analytics/products'),
        expect.any(Object)
      );
    });
  });

  // =========================================================================
  // fetchAnalyticsPurchases
  // =========================================================================

  describe('fetchAnalyticsPurchases', () => {
    it('returns purchases analytics data', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          purchases: {
            range: { from: '2024-01-01', to: '2024-01-31' },
            total_minor: 500000,
            vendor_breakdown: [{ supplier: 'Vendor A', total_minor: 300000 }],
            sku_cost_summary: [],
          },
        }),
      });

      const result = await fetchAnalyticsPurchases({});
      expect(result.purchases.total_minor).toBe(500000);
    });

    it('passes storeId and date params', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ purchases: {} }),
      });

      await fetchAnalyticsPurchases({ storeId: 'store-1', from: '2024-01-01', to: '2024-01-31' });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('/api/v1/admin/analytics/purchases');
      expect(calledUrl).toContain('storeId=store-1');
    });
  });

  // =========================================================================
  // fetchAnalyticsConsumerSales
  // =========================================================================

  describe('fetchAnalyticsConsumerSales', () => {
    it('returns consumer sales data', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          consumer_sales: {
            range: { from: '2024-01-01', to: '2024-01-31' },
            total_minor: 200000,
            payment_split_minor: { cash: 100000, upi: 80000, due: 20000 },
            status_counts: [{ status: 'completed', count: 50 }],
          },
        }),
      });

      const result = await fetchAnalyticsConsumerSales({});
      expect(result.consumer_sales.total_minor).toBe(200000);
    });

    it('calls consumer-sales endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ consumer_sales: {} }),
      });

      await fetchAnalyticsConsumerSales({});

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/admin/analytics/consumer-sales'),
        expect.any(Object)
      );
    });
  });

  // =========================================================================
  // fetchAnalyticsActivity
  // =========================================================================

  describe('fetchAnalyticsActivity', () => {
    it('returns activity data with buckets', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          activity: {
            range: { from: '2024-01-01', to: '2024-01-31' },
            groupBy: 'day',
            buckets: [
              { bucket: '2024-01-01', scans: 100, sales: 50, collections: 30, new_products_created: 2, offline_events_synced: 5 },
            ],
          },
        }),
      });

      const result = await fetchAnalyticsActivity({});
      expect(result.activity.buckets).toHaveLength(1);
      expect(result.activity.buckets[0].scans).toBe(100);
    });

    it('calls activity endpoint with params', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ activity: {} }),
      });

      await fetchAnalyticsActivity({ storeId: 'store-1', from: '2024-01-01', to: '2024-01-31' });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('/api/v1/admin/analytics/activity');
      expect(calledUrl).toContain('storeId=store-1');
    });
  });

  // =========================================================================
  // fetchAnalyticsDues
  // =========================================================================

  describe('fetchAnalyticsDues', () => {
    it('returns dues data with aging', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          dues: {
            range: { from: '2024-01-01', to: '2024-01-31' },
            outstanding_total_minor: 50000,
            aging: { d0_1: 10000, d2_7: 15000, d8_30: 20000, d30_plus: 5000 },
            dues: [{ sale_id: 's1', customer_name: 'Customer', amount_minor: 5000, created_at: '2024-01-15', age_days: 5 }],
            total: 1,
          },
        }),
      });

      const result = await fetchAnalyticsDues({});
      expect(result.dues.outstanding_total_minor).toBe(50000);
      expect(result.dues.dues).toHaveLength(1);
    });

    it('calls dues endpoint with params', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ dues: {} }),
      });

      await fetchAnalyticsDues({ storeId: 'store-1', from: '2024-01-01', to: '2024-01-31' });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('/api/v1/admin/analytics/dues');
      expect(calledUrl).toContain('storeId=store-1');
    });

    it('throws on error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      });

      await expect(fetchAnalyticsDues({})).rejects.toThrow();
    });
  });
});
