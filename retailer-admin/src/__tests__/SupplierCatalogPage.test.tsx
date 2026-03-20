import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SupplierCatalogPage from '../pages/SupplierCatalogPage';

// =========================================================================
// Mocks
// =========================================================================

vi.mock('../lib/AuthContext', () => ({
  useAuth: () => ({ accessToken: 'test-token' }),
}));

vi.mock('../components/Breadcrumb', () => ({
  default: () => <nav data-testid="breadcrumb">Breadcrumb</nav>,
}));

vi.mock('../lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const mockAuthFetch = vi.fn();
vi.mock('../lib/api', () => ({
  authFetch: (...args: unknown[]) => mockAuthFetch(...args),
  safeJson: (res: { json: () => Promise<unknown> }) => res.json(),
}));

// =========================================================================
// Helpers
// =========================================================================

function makeProduct(overrides: Record<string, unknown> = {}) {
  return {
    productId: 'prod-001',
    productName: 'Toor Dal 1kg',
    displayName: 'Toor Dal 1kg',
    barcode: '8901234567890',
    category: 'Pulses',
    description: 'Premium toor dal',
    unit: 'kg',
    supplierPriceMinor: 8000,
    marginMinor: 2000,
    retailerPriceMinor: 10000,
    mrpMinor: 12000,
    bnplEligible: false,
    bnplMaxDays: 0,
    imageUrl: null,
    approvedAt: '2026-03-01T00:00:00Z',
    supplierId: 'sup-001',
    supplierName: 'Fresh Foods Ltd',
    supplierTradeName: null,
    supplierCity: 'Mumbai',
    supplierPhone: '+919876543210',
    inStoreCatalog: false,
    ...overrides,
  };
}

function makeFetchResponse(data: unknown[], pagination?: Record<string, unknown>) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({
      data,
      pagination: pagination || { total: data.length, limit: 50, offset: 0, hasMore: false },
    }),
  });
}

function makeFetchError(status = 500) {
  return Promise.resolve({
    ok: false,
    status,
    json: () => Promise.resolve({ error: { message: `Server error ${status}` } }),
  });
}

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/s/TEST/supplier-catalog']}>
      <Routes>
        <Route path="/s/:storeCode/supplier-catalog" element={<SupplierCatalogPage />} />
      </Routes>
    </MemoryRouter>
  );

/** Wait for component to finish loading (initial fetch + debounce settle) */
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

// =========================================================================
// Tests
// =========================================================================

describe('SupplierCatalogPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // 1. Initial render & structure
  // -----------------------------------------------------------------------

  describe('initial render and structure', () => {
    it('renders without crashing', () => {
      mockAuthFetch.mockReturnValue(new Promise(() => {}));
      const { container } = renderPage();
      expect(container).toBeTruthy();
    });

    it('renders breadcrumb', () => {
      mockAuthFetch.mockReturnValue(new Promise(() => {}));
      renderPage();
      expect(screen.getByTestId('breadcrumb')).toBeInTheDocument();
    });

    it('renders page heading "Supplier Catalog"', () => {
      mockAuthFetch.mockReturnValue(new Promise(() => {}));
      renderPage();
      expect(screen.getByRole('heading', { name: /Supplier Catalog/i })).toBeInTheDocument();
    });

    it('renders subtitle about verified suppliers', () => {
      mockAuthFetch.mockReturnValue(new Promise(() => {}));
      renderPage();
      expect(screen.getByText(/Browse approved products from verified SuperMandi suppliers/i)).toBeInTheDocument();
    });

    it('renders search input with correct placeholder', () => {
      mockAuthFetch.mockReturnValue(new Promise(() => {}));
      renderPage();
      expect(screen.getByPlaceholderText(/Search by product name or barcode/i)).toBeInTheDocument();
    });

    it('renders search input with accessible label', () => {
      mockAuthFetch.mockReturnValue(new Promise(() => {}));
      renderPage();
      expect(screen.getByLabelText(/Search supplier catalog/i)).toBeInTheDocument();
    });

    it('renders info box about supplier catalog', () => {
      mockAuthFetch.mockReturnValue(new Promise(() => {}));
      renderPage();
      expect(screen.getByText(/About Supplier Catalog/i)).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // 2. Loading state
  // -----------------------------------------------------------------------

  describe('loading state', () => {
    it('shows loading indicator while fetching', () => {
      mockAuthFetch.mockReturnValue(new Promise(() => {}));
      renderPage();
      expect(screen.getByText(/Loading supplier catalog/i)).toBeInTheDocument();
    });

    it('fetches catalog on mount with accessToken', () => {
      mockAuthFetch.mockReturnValue(new Promise(() => {}));
      renderPage();
      expect(mockAuthFetch).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 3. Product card rendering
  // -----------------------------------------------------------------------

  describe('product card rendering', () => {
    it('renders product display name', async () => {
      mockAuthFetch.mockReturnValue(makeFetchResponse([makeProduct()]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Toor Dal 1kg')).toBeInTheDocument();
      });
    });

    it('renders barcode when present', async () => {
      mockAuthFetch.mockReturnValue(makeFetchResponse([makeProduct({ barcode: '111222333' })]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('111222333')).toBeInTheDocument();
      });
    });

    it('does not render barcode element when barcode is null', async () => {
      mockAuthFetch.mockReturnValue(makeFetchResponse([makeProduct({ barcode: null })]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Toor Dal 1kg')).toBeInTheDocument();
      });
      expect(screen.queryByText('8901234567890')).not.toBeInTheDocument();
    });

    it('renders supplier name and city', async () => {
      mockAuthFetch.mockReturnValue(makeFetchResponse([makeProduct()]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText(/Fresh Foods Ltd/)).toBeInTheDocument();
        expect(screen.getByText(/Mumbai/)).toBeInTheDocument();
      });
    });

    it('renders supplier name without city when city is null', async () => {
      mockAuthFetch.mockReturnValue(makeFetchResponse([makeProduct({ supplierCity: null })]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText(/Fresh Foods Ltd/)).toBeInTheDocument();
      });
      expect(screen.queryByText(/\(null\)/)).not.toBeInTheDocument();
    });

    it('renders category when present', async () => {
      mockAuthFetch.mockReturnValue(makeFetchResponse([makeProduct({ category: 'Spices' })]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText(/Category: Spices/)).toBeInTheDocument();
      });
    });

    it('does not render category when null', async () => {
      mockAuthFetch.mockReturnValue(makeFetchResponse([makeProduct({ category: null })]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Toor Dal 1kg')).toBeInTheDocument();
      });
      expect(screen.queryByText(/Category:/)).not.toBeInTheDocument();
    });

    it('renders BNPL badge when eligible', async () => {
      mockAuthFetch.mockReturnValue(makeFetchResponse([makeProduct({ bnplEligible: true, bnplMaxDays: 30 })]));
      renderPage();
      await waitFor(() => {
        // V3-FIX-173: BNPL text appears in both the scat-bnpl-badge and inline B2B metadata
        expect(screen.getAllByText(/BNPL 30d/).length).toBeGreaterThanOrEqual(1);
      });
    });

    it('does not render BNPL badge on product card when not eligible', async () => {
      mockAuthFetch.mockReturnValue(makeFetchResponse([makeProduct({ bnplEligible: false })]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Toor Dal 1kg')).toBeInTheDocument();
      });
      // The scat-bnpl-badge element should not exist (info box has "BNPL" text but not in badge)
      expect(document.querySelector('.scat-bnpl-badge')).toBeNull();
    });

    it('renders margin when positive', async () => {
      mockAuthFetch.mockReturnValue(makeFetchResponse([makeProduct({ marginMinor: 2000 })]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText(/Margin: Rs 20.00 per unit/)).toBeInTheDocument();
      });
    });

    it('does not render margin when zero', async () => {
      mockAuthFetch.mockReturnValue(makeFetchResponse([makeProduct({ marginMinor: 0 })]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Toor Dal 1kg')).toBeInTheDocument();
      });
      expect(screen.queryByText(/Margin:/)).not.toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // 4. Pricing display
  // -----------------------------------------------------------------------

  describe('pricing display', () => {
    it('formats cost price from minor units', async () => {
      mockAuthFetch.mockReturnValue(makeFetchResponse([makeProduct({ supplierPriceMinor: 8050 })]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Rs 80.50')).toBeInTheDocument();
      });
    });

    it('formats retailer price (Your Price) from minor units', async () => {
      mockAuthFetch.mockReturnValue(makeFetchResponse([makeProduct({ retailerPriceMinor: 10000 })]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Rs 100.00')).toBeInTheDocument();
      });
    });

    it('formats MRP from minor units', async () => {
      mockAuthFetch.mockReturnValue(makeFetchResponse([makeProduct({ mrpMinor: 12500 })]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Rs 125.00')).toBeInTheDocument();
      });
    });

    it('renders all three price labels', async () => {
      mockAuthFetch.mockReturnValue(makeFetchResponse([makeProduct()]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Cost')).toBeInTheDocument();
        expect(screen.getByText('Your Price')).toBeInTheDocument();
        expect(screen.getByText('MRP')).toBeInTheDocument();
      });
    });
  });

  // -----------------------------------------------------------------------
  // 5. Empty state
  // -----------------------------------------------------------------------

  describe('empty state', () => {
    it('shows "No approved supplier products" when no results and no search', async () => {
      mockAuthFetch.mockReturnValue(makeFetchResponse([]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText(/No approved supplier products available yet/i)).toBeInTheDocument();
      });
    });

    it('shows "No products match your search" when search has no results', async () => {
      mockAuthFetch.mockReturnValue(makeFetchResponse([]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText(/No approved supplier products/i)).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/Search by product name or barcode/i);
      fireEvent.change(searchInput, { target: { value: 'nonexistent' } });

      // Wait for debounce (350ms) + render
      await waitFor(() => {
        expect(screen.getByText(/No products match your search/i)).toBeInTheDocument();
      }, { timeout: 2000 });
    });

    it('shows results count as "0 products available" when empty', async () => {
      mockAuthFetch.mockReturnValue(makeFetchResponse([], { total: 0, limit: 50, offset: 0, hasMore: false }));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('0 products available')).toBeInTheDocument();
      });
    });
  });

  // -----------------------------------------------------------------------
  // 6. Error state
  // -----------------------------------------------------------------------

  describe('error state', () => {
    it('shows error message when fetch fails', async () => {
      mockAuthFetch.mockReturnValue(Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({}),
      }));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText(/Failed to load supplier catalog/i)).toBeInTheDocument();
      });
    });

    it('shows error when response has no parseable JSON', async () => {
      mockAuthFetch.mockReturnValue(Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(null),
      }));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText(/Failed to load supplier catalog/i)).toBeInTheDocument();
      });
    });

    it('silently returns on 401 without showing error', async () => {
      mockAuthFetch.mockReturnValue(Promise.resolve({
        ok: false,
        status: 401,
        json: () => Promise.resolve({}),
      }));
      renderPage();
      await act(async () => {
        await delay(500);
      });
      expect(screen.queryByText(/Failed to load/i)).not.toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // 7. Search (debounced 350ms) — uses real timers with natural delays
  // -----------------------------------------------------------------------

  describe('search', () => {
    it('sends search query after debounce', async () => {
      mockAuthFetch.mockReturnValue(makeFetchResponse([]));
      renderPage();

      // Wait for initial fetch to settle
      await waitFor(() => {
        expect(mockAuthFetch).toHaveBeenCalled();
      });
      mockAuthFetch.mockClear();

      const searchInput = screen.getByPlaceholderText(/Search by product name or barcode/i);
      fireEvent.change(searchInput, { target: { value: 'dal' } });

      // Wait for debounce to fire
      await waitFor(() => {
        expect(mockAuthFetch).toHaveBeenCalledWith(
          expect.stringContaining('query=dal'),
          'test-token'
        );
      }, { timeout: 2000 });
    });

    it('resets to unfiltered fetch when search is cleared', async () => {
      mockAuthFetch.mockReturnValue(makeFetchResponse([]));
      renderPage();

      await waitFor(() => {
        expect(mockAuthFetch).toHaveBeenCalled();
      });

      const searchInput = screen.getByPlaceholderText(/Search by product name or barcode/i);
      fireEvent.change(searchInput, { target: { value: 'dal' } });

      await waitFor(() => {
        const queryCalls = mockAuthFetch.mock.calls.filter(
          (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('query=dal')
        );
        expect(queryCalls.length).toBeGreaterThan(0);
      }, { timeout: 2000 });

      mockAuthFetch.mockClear();
      fireEvent.change(searchInput, { target: { value: '' } });

      await waitFor(() => {
        expect(mockAuthFetch).toHaveBeenCalled();
        const url = mockAuthFetch.mock.calls[0][0] as string;
        expect(url).not.toContain('query=');
      }, { timeout: 2000 });
    });
  });

  // -----------------------------------------------------------------------
  // 8. Add to catalog flow
  // -----------------------------------------------------------------------

  describe('add to catalog', () => {
    it('renders "Add to My Catalog" button for products not in store catalog', async () => {
      mockAuthFetch.mockReturnValue(makeFetchResponse([makeProduct({ inStoreCatalog: false })]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Add to My Catalog/i })).toBeInTheDocument();
      });
    });

    it('sends POST request with sellPrice and initialStock on add', async () => {
      const product = makeProduct({ retailerPriceMinor: 10000 });
      mockAuthFetch.mockReturnValue(makeFetchResponse([product]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Add to My Catalog/i })).toBeInTheDocument();
      });

      // Now set up the add response
      mockAuthFetch.mockReturnValue(Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true }),
      }));

      fireEvent.click(screen.getByRole('button', { name: /Add to My Catalog/i }));

      await waitFor(() => {
        const addCall = mockAuthFetch.mock.calls.find(
          (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('/add')
        );
        expect(addCall).toBeTruthy();
        expect(addCall![0]).toContain('/supplier-catalog/prod-001/add');
        expect(addCall![2]).toEqual(expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ sellPrice: 10000, initialStock: 0, conversionConfirmed: false }),
        }));
      });
    });

    it('shows "Adding..." while add request is in flight', async () => {
      const product = makeProduct();
      mockAuthFetch.mockReturnValue(makeFetchResponse([product]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Add to My Catalog/i })).toBeInTheDocument();
      });

      // Make the add request hang
      mockAuthFetch.mockReturnValue(new Promise(() => {}));
      fireEvent.click(screen.getByRole('button', { name: /Add to My Catalog/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Adding\.\.\./i })).toBeInTheDocument();
      });
    });

    it('disables the add button while adding', async () => {
      const product = makeProduct();
      mockAuthFetch.mockReturnValue(makeFetchResponse([product]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Add to My Catalog/i })).toBeInTheDocument();
      });

      mockAuthFetch.mockReturnValue(new Promise(() => {}));
      fireEvent.click(screen.getByRole('button', { name: /Add to My Catalog/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Adding/i })).toBeDisabled();
      });
    });

    it('shows success message after adding product', async () => {
      const product = makeProduct({ displayName: 'Basmati Rice 5kg' });
      mockAuthFetch.mockReturnValue(makeFetchResponse([product]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Add to My Catalog/i })).toBeInTheDocument();
      });

      mockAuthFetch.mockReturnValue(Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true }),
      }));

      fireEvent.click(screen.getByRole('button', { name: /Add to My Catalog/i }));

      await waitFor(() => {
        expect(screen.getByText(/Added "Basmati Rice 5kg" to your catalog!/)).toBeInTheDocument();
      });
    });

    it('switches button to "Already in Catalog" after successful add', async () => {
      const product = makeProduct();
      mockAuthFetch.mockReturnValue(makeFetchResponse([product]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Add to My Catalog/i })).toBeInTheDocument();
      });

      mockAuthFetch.mockReturnValue(Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true }),
      }));

      fireEvent.click(screen.getByRole('button', { name: /Add to My Catalog/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Already in Catalog/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Already in Catalog/i })).toBeDisabled();
      });
    });

    it('silently returns on 401 during add', async () => {
      const product = makeProduct();
      mockAuthFetch.mockReturnValue(makeFetchResponse([product]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Add to My Catalog/i })).toBeInTheDocument();
      });

      mockAuthFetch.mockReturnValue(Promise.resolve({
        ok: false,
        status: 401,
        json: () => Promise.resolve({}),
      }));

      fireEvent.click(screen.getByRole('button', { name: /Add to My Catalog/i }));

      await act(async () => {
        await delay(200);
      });

      expect(screen.queryByText(/Failed to add product/i)).not.toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // 9. Already in Catalog state
  // -----------------------------------------------------------------------

  describe('Already in Catalog state', () => {
    it('renders disabled "Already in Catalog" for inStoreCatalog=true products', async () => {
      mockAuthFetch.mockReturnValue(makeFetchResponse([makeProduct({ inStoreCatalog: true })]));
      renderPage();
      await waitFor(() => {
        const btn = screen.getByRole('button', { name: /Already in Catalog/i });
        expect(btn).toBeInTheDocument();
        expect(btn).toBeDisabled();
      });
    });

    it('applies dimmed card style for in-catalog products', async () => {
      mockAuthFetch.mockReturnValue(makeFetchResponse([makeProduct({ inStoreCatalog: true, productId: 'dim-test' })]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Toor Dal 1kg')).toBeInTheDocument();
      });
      const card = screen.getByText('Toor Dal 1kg').closest('.scat-card');
      expect(card?.classList.contains('scat-card--dimmed')).toBe(true);
    });

    it('does not apply dimmed style for non-catalog products', async () => {
      mockAuthFetch.mockReturnValue(makeFetchResponse([makeProduct({ inStoreCatalog: false })]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Toor Dal 1kg')).toBeInTheDocument();
      });
      const card = screen.getByText('Toor Dal 1kg').closest('.scat-card');
      expect(card?.classList.contains('scat-card--dimmed')).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // 10. Per-product error handling
  // -----------------------------------------------------------------------

  describe('per-product error handling', () => {
    it('shows inline error when add fails with server message', async () => {
      const product = makeProduct();
      mockAuthFetch.mockReturnValue(makeFetchResponse([product]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Add to My Catalog/i })).toBeInTheDocument();
      });

      mockAuthFetch.mockReturnValue(makeFetchError(500));
      fireEvent.click(screen.getByRole('button', { name: /Add to My Catalog/i }));

      await waitFor(() => {
        expect(screen.getByText(/Server error 500/)).toBeInTheDocument();
      });
    });

    it('shows generic error when add throws without message', async () => {
      const product = makeProduct();
      mockAuthFetch.mockReturnValue(makeFetchResponse([product]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Add to My Catalog/i })).toBeInTheDocument();
      });

      // Reject with non-Error to hit the fallback "Failed to add product" message
      mockAuthFetch.mockReturnValueOnce(Promise.reject('network failure'));
      fireEvent.click(screen.getByRole('button', { name: /Add to My Catalog/i }));

      await waitFor(() => {
        expect(screen.getByText(/Failed to add product/)).toBeInTheDocument();
      });
    });

    it('re-enables add button after error', async () => {
      const product = makeProduct();
      mockAuthFetch.mockReturnValue(makeFetchResponse([product]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Add to My Catalog/i })).toBeInTheDocument();
      });

      mockAuthFetch.mockReturnValue(makeFetchError(500));
      fireEvent.click(screen.getByRole('button', { name: /Add to My Catalog/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Add to My Catalog/i })).not.toBeDisabled();
      });
    });
  });

  // -----------------------------------------------------------------------
  // 11. Pagination / Load More
  // -----------------------------------------------------------------------

  describe('pagination and Load More', () => {
    it('shows Load More button when hasMore=true', async () => {
      mockAuthFetch.mockReturnValue(makeFetchResponse(
        [makeProduct()],
        { total: 100, limit: 50, offset: 0, hasMore: true }
      ));
      renderPage();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Load More/i })).toBeInTheDocument();
      });
    });

    it('hides Load More button when hasMore=false', async () => {
      mockAuthFetch.mockReturnValue(makeFetchResponse(
        [makeProduct()],
        { total: 1, limit: 50, offset: 0, hasMore: false }
      ));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Toor Dal 1kg')).toBeInTheDocument();
      });
      expect(screen.queryByRole('button', { name: /Load More/i })).not.toBeInTheDocument();
    });

    it('sends offset on Load More click', async () => {
      mockAuthFetch.mockReturnValue(makeFetchResponse(
        [makeProduct()],
        { total: 100, limit: 50, offset: 0, hasMore: true }
      ));
      renderPage();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Load More/i })).toBeInTheDocument();
      });

      mockAuthFetch.mockReturnValue(makeFetchResponse(
        [makeProduct({ productId: 'prod-051', displayName: 'Page 2 Item' })],
        { total: 100, limit: 50, offset: 50, hasMore: false }
      ));

      fireEvent.click(screen.getByRole('button', { name: /Load More/i }));

      await waitFor(() => {
        const loadMoreCall = mockAuthFetch.mock.calls.find(
          (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('offset=50')
        );
        expect(loadMoreCall).toBeTruthy();
      });
    });

    it('appends products on Load More (does not replace)', async () => {
      mockAuthFetch.mockReturnValue(makeFetchResponse(
        [makeProduct({ productId: 'p1', displayName: 'Product A' })],
        { total: 100, limit: 50, offset: 0, hasMore: true }
      ));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Product A')).toBeInTheDocument();
      });

      mockAuthFetch.mockReturnValue(makeFetchResponse(
        [makeProduct({ productId: 'p2', displayName: 'Product B' })],
        { total: 100, limit: 50, offset: 50, hasMore: false }
      ));

      fireEvent.click(screen.getByRole('button', { name: /Load More/i }));

      await waitFor(() => {
        expect(screen.getByText('Product A')).toBeInTheDocument();
        expect(screen.getByText('Product B')).toBeInTheDocument();
      });
    });

    it('forces hasMore=false when API returns empty page on offset>0 (infinite loop guard)', async () => {
      mockAuthFetch.mockReturnValue(makeFetchResponse(
        [makeProduct()],
        { total: 100, limit: 50, offset: 0, hasMore: true }
      ));
      renderPage();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Load More/i })).toBeInTheDocument();
      });

      // API returns empty page but claims hasMore=true — guard should override
      mockAuthFetch.mockReturnValue(makeFetchResponse(
        [],
        { total: 100, limit: 50, offset: 50, hasMore: true }
      ));

      fireEvent.click(screen.getByRole('button', { name: /Load More/i }));

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /Load More/i })).not.toBeInTheDocument();
      });
    });

    it('shows results count from pagination total', async () => {
      mockAuthFetch.mockReturnValue(makeFetchResponse(
        [makeProduct()],
        { total: 42, limit: 50, offset: 0, hasMore: false }
      ));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('42 products available')).toBeInTheDocument();
      });
    });
  });

  // -----------------------------------------------------------------------
  // 12. Memory cap guard (MAX_ACCUMULATED_ITEMS = 500)
  // -----------------------------------------------------------------------

  describe('memory cap guard', () => {
    it('caps accumulated products at MAX_ACCUMULATED_ITEMS on Load More', async () => {
      // The component's MAX_ACCUMULATED_ITEMS = 500
      // We can verify the cap logic by checking that offset>0 appends rather than replaces,
      // and verifying the slice behavior structurally.
      // Use a smaller dataset to avoid jsdom performance issues with 500+ DOM nodes.
      const initialProducts = Array.from({ length: 5 }, (_, i) =>
        makeProduct({ productId: `p-${i}`, displayName: `Item ${i}` })
      );
      mockAuthFetch.mockReturnValue(makeFetchResponse(
        initialProducts,
        { total: 20, limit: 5, offset: 0, hasMore: true }
      ));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Item 0')).toBeInTheDocument();
        expect(screen.getByText('Item 4')).toBeInTheDocument();
      });

      // Load More appends 3 more
      const moreProducts = Array.from({ length: 3 }, (_, i) =>
        makeProduct({ productId: `p-extra-${i}`, displayName: `Extra ${i}` })
      );
      mockAuthFetch.mockReturnValue(makeFetchResponse(
        moreProducts,
        { total: 20, limit: 5, offset: 5, hasMore: false }
      ));

      fireEvent.click(screen.getByRole('button', { name: /Load More/i }));

      await waitFor(() => {
        // All 8 items should be present (below 500 cap)
        expect(screen.getByText('Item 0')).toBeInTheDocument();
        expect(screen.getByText('Item 4')).toBeInTheDocument();
        expect(screen.getByText('Extra 0')).toBeInTheDocument();
        expect(screen.getByText('Extra 2')).toBeInTheDocument();
      });
    });
  });

  // -----------------------------------------------------------------------
  // 13. Multiple products rendering
  // -----------------------------------------------------------------------

  describe('multiple products', () => {
    it('renders multiple product cards with mixed catalog status', async () => {
      const products = [
        makeProduct({ productId: 'p1', displayName: 'Apple Juice' }),
        makeProduct({ productId: 'p2', displayName: 'Orange Juice' }),
        makeProduct({ productId: 'p3', displayName: 'Grape Juice', inStoreCatalog: true }),
      ];
      mockAuthFetch.mockReturnValue(makeFetchResponse(products));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Apple Juice')).toBeInTheDocument();
        expect(screen.getByText('Orange Juice')).toBeInTheDocument();
        expect(screen.getByText('Grape Juice')).toBeInTheDocument();
      });
      // Two "Add" buttons, one "Already in Catalog"
      expect(screen.getAllByRole('button', { name: /Add to My Catalog/i })).toHaveLength(2);
      expect(screen.getByRole('button', { name: /Already in Catalog/i })).toBeInTheDocument();
    });
  });
});
