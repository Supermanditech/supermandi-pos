// SuperAdmin — Test catalog API client (SA-P2-006)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchCategories,
  fetchProducts,
  overrideProductCategory,
} from '../../api/catalog';

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

describe('catalog API client', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).__mockFetch = mockFetch;
  });

  afterEach(() => {
    delete (globalThis as any).__mockFetch;
  });

  // =========================================================================
  // fetchCategories
  // =========================================================================

  describe('fetchCategories', () => {
    it('returns categories on success', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: [
            { category: 'Grocery', productCount: 42 },
            { category: 'Dairy', productCount: 15 },
          ],
          count: 2,
        }),
      });

      const result = await fetchCategories();
      expect(result).toHaveLength(2);
      expect(result[0].category).toBe('Grocery');
      expect(result[0].productCount).toBe(42);
    });

    it('returns empty array when data is null', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: null }),
      });

      const result = await fetchCategories();
      expect(result).toEqual([]);
    });

    it('throws on non-ok response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Internal error' }),
      });

      await expect(fetchCategories()).rejects.toThrow('Request failed (500)');
    });
  });

  // =========================================================================
  // fetchProducts
  // =========================================================================

  describe('fetchProducts', () => {
    it('returns paginated products', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: [
            {
              id: 'p1',
              name: 'Tata Salt',
              displayName: 'Tata Salt',
              originalCategory: 'Grocery',
              editedCategory: null,
              currentCategory: 'Grocery',
              brand: 'Tata',
              barcode: '8901030000000',
              supplierSku: 'TS-001',
              purchasePrice: 2300,
              mrp: 2700,
              approvalStatus: 'approved',
              supplierId: 's1',
              supplierName: 'Tata',
              createdAt: '2024-01-01',
              updatedAt: '2024-01-01',
            },
          ],
          pagination: { page: 1, limit: 50, total: 1, hasMore: false },
          filters: { search: null, category: null },
        }),
      });

      const result = await fetchProducts();
      expect(result.data).toHaveLength(1);
      expect(result.data[0].name).toBe('Tata Salt');
      expect(result.pagination.total).toBe(1);
    });

    it('passes query parameters', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: [],
          pagination: { page: 2, limit: 10, total: 0, hasMore: false },
          filters: { search: 'salt', category: 'Grocery' },
        }),
      });

      await fetchProducts({ page: 2, limit: 10, q: 'salt', category: 'Grocery' });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('page=2');
      expect(calledUrl).toContain('limit=10');
      expect(calledUrl).toContain('q=salt');
      expect(calledUrl).toContain('category=Grocery');
    });

    it('throws on non-ok response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ error: 'Forbidden' }),
      });

      await expect(fetchProducts()).rejects.toThrow('Request failed (403)');
    });

    it('returns default pagination when missing', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: [],
        }),
      });

      const result = await fetchProducts();
      expect(result.pagination).toEqual({ page: 1, limit: 50, total: 0, hasMore: false });
      expect(result.filters).toEqual({ search: null, category: null });
    });
  });

  // =========================================================================
  // overrideProductCategory
  // =========================================================================

  describe('overrideProductCategory', () => {
    it('sends PATCH with category in body', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            id: 'p1',
            name: 'Tata Salt',
            displayName: 'Tata Salt',
            originalCategory: 'Grocery',
            editedCategory: 'Staples',
            currentCategory: 'Staples',
          },
          change: {
            from: 'Grocery',
            to: 'Staples',
            overrideCleared: false,
          },
        }),
      });

      const result = await overrideProductCategory('p1', 'Staples');

      // Verify PATCH method
      const callInit = mockFetch.mock.calls[0][1];
      expect(callInit.method).toBe('PATCH');
      expect(JSON.parse(callInit.body)).toEqual({ category: 'Staples' });

      // Verify result
      expect(result.data.editedCategory).toBe('Staples');
      expect(result.change.from).toBe('Grocery');
      expect(result.change.to).toBe('Staples');
      expect(result.change.overrideCleared).toBe(false);
    });

    it('sends null to clear override', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            id: 'p1',
            name: 'Tata Salt',
            displayName: 'Tata Salt',
            originalCategory: 'Grocery',
            editedCategory: null,
            currentCategory: 'Grocery',
          },
          change: {
            from: 'Staples',
            to: 'Grocery',
            overrideCleared: true,
          },
        }),
      });

      const result = await overrideProductCategory('p1', null);

      const callInit = mockFetch.mock.calls[0][1];
      expect(JSON.parse(callInit.body)).toEqual({ category: null });
      expect(result.change.overrideCleared).toBe(true);
    });

    it('encodes productId in URL', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: { id: 'abc-123' },
          change: { from: null, to: 'Test', overrideCleared: false },
        }),
      });

      await overrideProductCategory('abc-123', 'Test');
      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('/catalog/products/abc-123/category');
    });

    it('throws on non-ok response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: 'Product not found' }),
      });

      await expect(overrideProductCategory('bad-id', 'Test')).rejects.toThrow('Request failed (404)');
    });
  });
});
