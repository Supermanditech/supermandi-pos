import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the api module before importing store functions
vi.mock('../../lib/api', () => ({
  authFetch: vi.fn(),
  safeJson: vi.fn(),
  API_GATEWAY_BASE: 'http://localhost:3000',
}));

import {
  fetchStore,
  fetchProducts,
  fetchInventory,
  fetchDailySummary,
  fetchSalesAnalytics,
  fetchCategories,
  fetchSuppliers,
  fetchSearch,
  createSupplier,
  updateSupplier,
  deleteSupplier,
} from '../../api/store';
import { authFetch, safeJson } from '../../lib/api';

const mockedAuthFetch = vi.mocked(authFetch);
const mockedSafeJson = vi.mocked(safeJson);

function mockOkResponse(data: unknown) {
  const res = { ok: true, status: 200 } as Response;
  mockedAuthFetch.mockResolvedValue(res);
  mockedSafeJson.mockResolvedValue(data as any);
  return res;
}

function mockErrorResponse(status: number) {
  const res = { ok: false, status } as Response;
  mockedAuthFetch.mockResolvedValue(res);
  mockedSafeJson.mockResolvedValue(null as any);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── fetchStore ───────────────────────────────────────────────────────────

describe('fetchStore', () => {
  it('returns store data on success', async () => {
    const storeData = { success: true, data: { id: 's1', code: 'STORE1', name: 'My Store' } };
    mockOkResponse(storeData);

    const result = await fetchStore('token');
    expect(result).toEqual(storeData);
    expect(mockedAuthFetch).toHaveBeenCalledWith(
      expect.stringContaining('/store'),
      'token'
    );
  });

  it('throws Unauthorized on 401', async () => {
    const res = { ok: false, status: 401 } as Response;
    mockedAuthFetch.mockResolvedValue(res);

    await expect(fetchStore('bad-token')).rejects.toThrow('Unauthorized');
  });

  it('throws on non-ok response', async () => {
    mockErrorResponse(500);

    await expect(fetchStore('token')).rejects.toThrow('Failed to fetch store');
  });

  it('throws when safeJson returns null', async () => {
    const res = { ok: true, status: 200 } as Response;
    mockedAuthFetch.mockResolvedValue(res);
    mockedSafeJson.mockResolvedValue(null);

    await expect(fetchStore('token')).rejects.toThrow('Invalid response from server');
  });
});

// ── fetchProducts ────────────────────────────────────────────────────────

describe('fetchProducts', () => {
  it('returns products on success', async () => {
    const data = { success: true, data: [{ id: 'p1', name: 'Product 1' }] };
    mockOkResponse(data);

    const result = await fetchProducts('token');
    expect(result.data).toHaveLength(1);
    expect(mockedAuthFetch).toHaveBeenCalledWith(
      expect.stringContaining('/products'),
      'token'
    );
  });

  it('throws on 401', async () => {
    const res = { ok: false, status: 401 } as Response;
    mockedAuthFetch.mockResolvedValue(res);

    await expect(fetchProducts('token')).rejects.toThrow('Unauthorized');
  });

  it('throws on server error', async () => {
    mockErrorResponse(500);
    await expect(fetchProducts('token')).rejects.toThrow('Failed to fetch products');
  });
});

// ── fetchInventory ───────────────────────────────────────────────────────

describe('fetchInventory', () => {
  it('returns inventory with totals', async () => {
    const data = {
      success: true,
      data: [{ productId: 'p1', productName: 'Item', totalStockQty: 10, totalPurchaseValue: 5000, totalSellRevenue: 7000 }],
      totals: { totalProducts: 1, totalStockQty: 10, totalPurchaseValue: 5000, totalSellRevenue: 7000 },
    };
    mockOkResponse(data);

    const result = await fetchInventory('token');
    expect(result.data).toHaveLength(1);
    expect(result.totals?.totalProducts).toBe(1);
  });

  it('throws on 401', async () => {
    const res = { ok: false, status: 401 } as Response;
    mockedAuthFetch.mockResolvedValue(res);
    await expect(fetchInventory('token')).rejects.toThrow('Unauthorized');
  });

  it('throws on failure', async () => {
    mockErrorResponse(500);
    await expect(fetchInventory('token')).rejects.toThrow('Failed to fetch inventory');
  });

  it('throws when safeJson returns null', async () => {
    const res = { ok: true, status: 200 } as Response;
    mockedAuthFetch.mockResolvedValue(res);
    mockedSafeJson.mockResolvedValue(null);
    await expect(fetchInventory('token')).rejects.toThrow('Invalid response');
  });
});

// ── fetchDailySummary ────────────────────────────────────────────────────

describe('fetchDailySummary', () => {
  it('returns daily summary', async () => {
    const data = {
      success: true,
      data: {
        date: '2026-02-16',
        totalSales: 5000,
        totalBills: 10,
        averageBillValue: 500,
        paymentBreakdown: { cash: 3000, upi: 2000, card: 0, credit: 0 },
        itemsSold: 25,
        topSellingItems: [],
      },
    };
    mockOkResponse(data);

    const result = await fetchDailySummary('token');
    expect(result.data.totalSales).toBe(5000);
  });

  it('passes date parameter in URL', async () => {
    mockOkResponse({ success: true, data: {} });
    await fetchDailySummary('token', '2026-02-15');
    expect(mockedAuthFetch).toHaveBeenCalledWith(
      expect.stringContaining('date=2026-02-15'),
      'token'
    );
  });

  it('does not include date param when not provided', async () => {
    mockOkResponse({ success: true, data: {} });
    await fetchDailySummary('token');
    expect(mockedAuthFetch).toHaveBeenCalledWith(
      expect.not.stringContaining('date='),
      'token'
    );
  });

  it('throws on 401', async () => {
    const res = { ok: false, status: 401 } as Response;
    mockedAuthFetch.mockResolvedValue(res);
    await expect(fetchDailySummary('token')).rejects.toThrow('Unauthorized');
  });

  it('throws on failure', async () => {
    mockErrorResponse(500);
    await expect(fetchDailySummary('token')).rejects.toThrow('Failed to fetch daily summary');
  });
});

// ── fetchSalesAnalytics ──────────────────────────────────────────────────

describe('fetchSalesAnalytics', () => {
  it('returns analytics data', async () => {
    const data = {
      success: true,
      data: {
        from: '2026-02-01',
        to: '2026-02-16',
        totals: { totalSales: 50000, totalBills: 100, averageBillValue: 500 },
        paymentBreakdown: { cash: 30000, upi: 15000, credit: 5000 },
        daily: [],
        topProducts: [],
      },
    };
    mockOkResponse(data);

    const result = await fetchSalesAnalytics('token', '2026-02-01', '2026-02-16');
    expect(result.data.totals.totalSales).toBe(50000);
  });

  it('passes from/to parameters', async () => {
    mockOkResponse({ success: true, data: {} });
    await fetchSalesAnalytics('token', '2026-01-01', '2026-01-31');
    expect(mockedAuthFetch).toHaveBeenCalledWith(
      expect.stringMatching(/from=2026-01-01.*to=2026-01-31/),
      'token'
    );
  });

  it('works without date params', async () => {
    mockOkResponse({ success: true, data: {} });
    await fetchSalesAnalytics('token');
    const url = mockedAuthFetch.mock.calls[0][0] as string;
    expect(url).toContain('/analytics/sales');
    expect(url).not.toContain('?');
  });

  it('throws on 401', async () => {
    const res = { ok: false, status: 401 } as Response;
    mockedAuthFetch.mockResolvedValue(res);
    await expect(fetchSalesAnalytics('token')).rejects.toThrow('Unauthorized');
  });
});

// ── fetchCategories ──────────────────────────────────────────────────────

describe('fetchCategories', () => {
  it('returns categories list', async () => {
    const data = {
      success: true,
      data: [
        { id: 'c1', labelEn: 'Staples', sortOrder: 1, productCount: 5, stockValue: 10000 },
        { id: 'c0', labelEn: 'All', sortOrder: 0, productCount: 50, stockValue: 100000 },
      ],
    };
    mockOkResponse(data);

    const result = await fetchCategories('token');
    // NOTE: fetchCategories itself does NOT filter sortOrder=0; that's done in DashboardPage
    expect(result.data).toHaveLength(2);
  });

  it('throws on 401', async () => {
    const res = { ok: false, status: 401 } as Response;
    mockedAuthFetch.mockResolvedValue(res);
    await expect(fetchCategories('token')).rejects.toThrow('Unauthorized');
  });

  it('throws on failure', async () => {
    mockErrorResponse(500);
    await expect(fetchCategories('token')).rejects.toThrow('Failed to fetch categories');
  });
});

// ── fetchSuppliers ───────────────────────────────────────────────────────

describe('fetchSuppliers', () => {
  it('returns suppliers list', async () => {
    const data = {
      success: true,
      data: [
        { id: 's1', businessName: 'Supplier A', verificationStatus: 'verified', isSupermandi: true, name: 'A' },
      ],
    };
    mockOkResponse(data);

    const result = await fetchSuppliers('token');
    expect(result.data).toHaveLength(1);
    expect(result.data[0].businessName).toBe('Supplier A');
  });

  it('throws on 401', async () => {
    const res = { ok: false, status: 401 } as Response;
    mockedAuthFetch.mockResolvedValue(res);
    await expect(fetchSuppliers('token')).rejects.toThrow('Unauthorized');
  });

  it('throws on server error', async () => {
    mockErrorResponse(500);
    await expect(fetchSuppliers('token')).rejects.toThrow('Failed to fetch suppliers');
  });
});

// ── fetchSearch ──────────────────────────────────────────────────────────

describe('fetchSearch', () => {
  it('sends search query encoded in URL', async () => {
    const data = {
      success: true,
      data: { products: [], suppliers: [], barcodes: [] },
    };
    mockOkResponse(data);

    await fetchSearch('token', 'rice 5kg', 10);
    expect(mockedAuthFetch).toHaveBeenCalledWith(
      expect.stringContaining('q=rice%205kg'),
      'token'
    );
  });

  it('passes limit parameter', async () => {
    mockOkResponse({ success: true, data: { products: [], suppliers: [], barcodes: [] } });
    await fetchSearch('token', 'test', 20);
    expect(mockedAuthFetch).toHaveBeenCalledWith(
      expect.stringContaining('limit=20'),
      'token'
    );
  });

  it('defaults limit to 10', async () => {
    mockOkResponse({ success: true, data: { products: [], suppliers: [], barcodes: [] } });
    await fetchSearch('token', 'test');
    expect(mockedAuthFetch).toHaveBeenCalledWith(
      expect.stringContaining('limit=10'),
      'token'
    );
  });

  it('throws on 401', async () => {
    const res = { ok: false, status: 401 } as Response;
    mockedAuthFetch.mockResolvedValue(res);
    await expect(fetchSearch('token', 'query')).rejects.toThrow('Unauthorized');
  });

  it('throws on failure', async () => {
    mockErrorResponse(500);
    await expect(fetchSearch('token', 'query')).rejects.toThrow('Search failed');
  });
});

// ── createSupplier ───────────────────────────────────────────────────────

describe('createSupplier', () => {
  it('sends POST with supplier data', async () => {
    const res = { ok: true, status: 201 } as Response;
    mockedAuthFetch.mockResolvedValue(res);
    mockedSafeJson.mockResolvedValue({ success: true, data: { id: 'sup-1' } });

    const result = await createSupplier('token', { businessName: 'New Supplier' });
    expect(result.data.id).toBe('sup-1');

    expect(mockedAuthFetch).toHaveBeenCalledWith(
      expect.stringContaining('/suppliers'),
      'token',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('New Supplier'),
      })
    );
  });

  it('throws on 401', async () => {
    const res = { ok: false, status: 401 } as Response;
    mockedAuthFetch.mockResolvedValue(res);
    await expect(createSupplier('token', { businessName: 'X' })).rejects.toThrow('Unauthorized');
  });

  it('throws with error message from response', async () => {
    const res = { ok: false, status: 422 } as Response;
    mockedAuthFetch.mockResolvedValue(res);
    mockedSafeJson.mockResolvedValue({ message: 'Duplicate GSTIN' });

    await expect(createSupplier('token', { businessName: 'X' })).rejects.toThrow('Duplicate GSTIN');
  });

  it('throws generic message when no error message', async () => {
    const res = { ok: false, status: 500 } as Response;
    mockedAuthFetch.mockResolvedValue(res);
    mockedSafeJson.mockResolvedValue({});

    await expect(createSupplier('token', { businessName: 'X' })).rejects.toThrow('Failed to create supplier');
  });
});

// ── updateSupplier ───────────────────────────────────────────────────────

describe('updateSupplier', () => {
  it('sends PATCH with partial supplier data', async () => {
    const res = { ok: true, status: 200 } as Response;
    mockedAuthFetch.mockResolvedValue(res);
    mockedSafeJson.mockResolvedValue({ success: true, data: { id: 'sup-1' } });

    const result = await updateSupplier('token', 'sup-1', { primaryPhone: '9876543210' });
    expect(result.data.id).toBe('sup-1');

    expect(mockedAuthFetch).toHaveBeenCalledWith(
      expect.stringContaining('/suppliers/sup-1'),
      'token',
      expect.objectContaining({ method: 'PATCH' })
    );
  });

  it('throws on 401', async () => {
    const res = { ok: false, status: 401 } as Response;
    mockedAuthFetch.mockResolvedValue(res);
    await expect(updateSupplier('token', 'id', {})).rejects.toThrow('Unauthorized');
  });

  it('throws error message from response', async () => {
    const res = { ok: false, status: 400 } as Response;
    mockedAuthFetch.mockResolvedValue(res);
    mockedSafeJson.mockResolvedValue({ message: 'Invalid phone' });

    await expect(updateSupplier('token', 'id', {})).rejects.toThrow('Invalid phone');
  });
});

// ── deleteSupplier ───────────────────────────────────────────────────────

describe('deleteSupplier', () => {
  it('sends DELETE request', async () => {
    const res = { ok: true, status: 200 } as Response;
    mockedAuthFetch.mockResolvedValue(res);
    mockedSafeJson.mockResolvedValue({ success: true, data: { success: true } });

    const result = await deleteSupplier('token', 'sup-1');
    expect(result.data.success).toBe(true);

    expect(mockedAuthFetch).toHaveBeenCalledWith(
      expect.stringContaining('/suppliers/sup-1'),
      'token',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('throws on 401', async () => {
    const res = { ok: false, status: 401 } as Response;
    mockedAuthFetch.mockResolvedValue(res);
    await expect(deleteSupplier('token', 'id')).rejects.toThrow('Unauthorized');
  });

  it('throws on failure', async () => {
    const res = { ok: false, status: 500 } as Response;
    mockedAuthFetch.mockResolvedValue(res);
    mockedSafeJson.mockResolvedValue({});

    await expect(deleteSupplier('token', 'id')).rejects.toThrow('Failed to delete supplier');
  });
});
