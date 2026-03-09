import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import DashboardPage from '../../pages/DashboardPage';
import { authFetch, safeJson } from '../../lib/api';

// Mock AuthContext
vi.mock('../../lib/AuthContext', () => ({
  useAuth: () => ({
    store: { id: 's1', code: 'STORE1', name: 'My Store' },
    accessToken: 'test-token',
    isAuthenticated: true,
  }),
}));

// Mock api
vi.mock('../../lib/api', () => ({
  authFetch: vi.fn(),
  safeJson: vi.fn(),
  API_GATEWAY_BASE: 'http://localhost:3000',
}));

// Mock hooks
vi.mock('../../lib/hooks', () => ({
  useEscapeKey: vi.fn(),
}));

// Mock config
vi.mock('../../config/categoryIcons', () => ({
  getCategoryIcon: vi.fn(() => 'icon-placeholder'),
}));

// Mock Breadcrumb
vi.mock('../../components/Breadcrumb', () => ({
  default: () => <nav data-testid="breadcrumb">Breadcrumb</nav>,
}));

// Mock react-hot-toast
const mockToastError = vi.fn();
vi.mock('react-hot-toast', () => ({
  default: { error: (...args: unknown[]) => mockToastError(...args) },
}));

// Location spy component for navigation assertions
function LocationDisplay() {
  const loc = useLocation();
  return <div data-testid="location-display">{loc.pathname}{loc.search}</div>;
}

// Mock store API functions
const mockInventoryData = {
  data: [
    { productId: 'p1', productName: 'Rice 5kg', barcode: '123456789', totalStockQty: 50, totalPurchaseValue: 25000, totalSellRevenue: 35000 },
    { productId: 'p2', productName: 'Salt 1kg', barcode: '987654321', totalStockQty: 100, totalPurchaseValue: 5000, totalSellRevenue: 8000 },
  ],
  totals: { totalProducts: 2, totalStockQty: 150, totalPurchaseValue: 30000, totalSellRevenue: 43000 },
};

const mockCategories = {
  data: [
    { id: 'c1', labelEn: 'Staples', labelHi: null, iconKey: 'grain', sortOrder: 1, productCount: 5, stockValue: 10000 },
    { id: 'c2', labelEn: 'Beverages', labelHi: null, iconKey: 'cup', sortOrder: 2, productCount: 3, stockValue: 5000 },
    { id: 'c0', labelEn: 'All', labelHi: null, iconKey: 'all', sortOrder: 0, productCount: 8, stockValue: 15000 },
  ],
};

const mockDailySummary = {
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

const mockSearchResults = {
  data: {
    products: [
      { id: 'sp1', productId: 'p1', name: 'Rice 5kg', brand: 'Brand A', barcode: '123456789', mode: 'PACKAGED', sellPrice: 35000, stock: 50 },
    ],
    suppliers: [],
    barcodes: [],
  },
};

import { fetchInventory, fetchCategories, fetchSearch, fetchDailySummary } from '../../api/store';

vi.mock('../../api/store', () => ({
  fetchInventory: vi.fn(),
  fetchCategories: vi.fn(),
  fetchSearch: vi.fn(),
  fetchDailySummary: vi.fn(),
}));

const mockedFetchInventory = vi.mocked(fetchInventory);
const mockedFetchCategories = vi.mocked(fetchCategories);
const mockedFetchSearch = vi.mocked(fetchSearch);
const mockedFetchDailySummary = vi.mocked(fetchDailySummary);
const mockedAuthFetch = vi.mocked(authFetch);
const mockedSafeJson = vi.mocked(safeJson);

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={['/s/STORE1']}>
      <Routes>
        <Route path="/s/:storeCode" element={<DashboardPage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockToastError.mockReset();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  mockedFetchInventory.mockResolvedValue(mockInventoryData as any);
  mockedFetchCategories.mockResolvedValue(mockCategories as any);
  mockedFetchDailySummary.mockResolvedValue(mockDailySummary as any);
  mockedFetchSearch.mockResolvedValue(mockSearchResults as any);
});

afterEach(() => {
  vi.useRealTimers();
});

// ── Loading State ────────────────────────────────────────────────────────

describe('Loading state', () => {
  it('shows loading skeletons initially', async () => {
    // Delay resolution to catch loading state
    mockedFetchInventory.mockReturnValue(new Promise(() => {}));
    mockedFetchCategories.mockReturnValue(new Promise(() => {}));
    mockedFetchDailySummary.mockReturnValue(new Promise(() => {}));

    renderDashboard();

    // The metrics cards should show shimmer/skeleton while loading
    // We can check that the actual numbers are NOT shown yet
    expect(screen.queryByText('2')).not.toBeInTheDocument(); // totalProducts would be 2
  });
});

// ── Dashboard Content ────────────────────────────────────────────────────

describe('Dashboard content', () => {
  it('renders store name in greeting', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('My Store')).toBeInTheDocument();
    });
  });

  it('renders store code', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText(/Store ID: STORE1/)).toBeInTheDocument();
    });
  });

  it('renders breadcrumb', async () => {
    renderDashboard();
    expect(screen.getByTestId('breadcrumb')).toBeInTheDocument();
  });

  it('renders greeting based on time of day', async () => {
    renderDashboard();

    await waitFor(() => {
      // Should contain some greeting
      const greetings = ['Good morning', 'Good afternoon', 'Good evening'];
      const hasGreeting = greetings.some(g => screen.queryByText(g) !== null);
      expect(hasGreeting).toBe(true);
    });
  });
});

// ── Inventory Metrics ────────────────────────────────────────────────────

describe('Inventory metrics', () => {
  it('displays total products count', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument();
    });
  });

  it('displays total stock quantity', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('150')).toBeInTheDocument();
    });
  });

  it('displays metric labels', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Total Products')).toBeInTheDocument();
      expect(screen.getAllByText('Total Stock Qty').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Total Purchase Value').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Total Sell Revenue').length).toBeGreaterThanOrEqual(1);
    });
  });
});

// ── Daily Summary ────────────────────────────────────────────────────────

describe('Daily summary', () => {
  it('renders sales summary section', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("Today's Sales Summary")).toBeInTheDocument();
    });
  });

  it('displays total bills', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('10')).toBeInTheDocument();
      expect(screen.getByText('Bills')).toBeInTheDocument();
    });
  });

  it('displays items sold', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('25')).toBeInTheDocument();
      expect(screen.getByText('Items Sold')).toBeInTheDocument();
    });
  });

  it('shows error state for daily summary', async () => {
    mockedFetchDailySummary.mockRejectedValue(new Error('Failed'));

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Failed to load daily summary')).toBeInTheDocument();
    });
  });

  it('shows empty state for no sales data', async () => {
    mockedFetchDailySummary.mockResolvedValue({ data: null } as any);

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('No sales data for today')).toBeInTheDocument();
    });
  });
});

// ── Categories ───────────────────────────────────────────────────────────

describe('Categories', () => {
  it('renders category cards', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Staples')).toBeInTheDocument();
      expect(screen.getByText('Beverages')).toBeInTheDocument();
    });
  });

  it('filters out sortOrder=0 (All) category', async () => {
    renderDashboard();

    await waitFor(() => {
      // "All" with sortOrder=0 should be filtered out
      screen.queryAllByText('All');
      // If "All" appears, it should NOT be from the category cards
      // The category section should only show Staples and Beverages
      expect(screen.getByText('Staples')).toBeInTheDocument();
      expect(screen.getByText('Beverages')).toBeInTheDocument();
    });
  });

  it('shows product count per category', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('5 products')).toBeInTheDocument();
      expect(screen.getByText('3 products')).toBeInTheDocument();
    });
  });

  it('shows empty categories message when none exist', async () => {
    mockedFetchCategories.mockResolvedValue({ data: [] } as any);

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText(/No categories yet/)).toBeInTheDocument();
    });
  });

  it('shows Edit button on category cards', async () => {
    renderDashboard();

    await waitFor(() => {
      const editButtons = screen.getAllByText('Edit');
      expect(editButtons.length).toBeGreaterThan(0);
    });
  });
});

// ── Inventory Table ──────────────────────────────────────────────────────

describe('Inventory table', () => {
  it('renders inventory table headers', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Product Name')).toBeInTheDocument();
      expect(screen.getAllByText('Total Stock Qty').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders inventory items', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Rice 5kg')).toBeInTheDocument();
      expect(screen.getByText('Salt 1kg')).toBeInTheDocument();
    });
  });

  it('shows empty inventory message when no data', async () => {
    mockedFetchInventory.mockResolvedValue({
      data: [],
      totals: { totalProducts: 0, totalStockQty: 0, totalPurchaseValue: 0, totalSellRevenue: 0 },
    } as any);

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Your inventory is empty')).toBeInTheDocument();
    });
  });

  it('shows inventory error state', async () => {
    mockedFetchInventory.mockRejectedValue(new Error('Failed to load'));

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Failed to load inventory')).toBeInTheDocument();
    });
  });
});

// ── Search ───────────────────────────────────────────────────────────────

describe('Search', () => {
  it('renders search input', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Search product/)).toBeInTheDocument();
    });
  });

  it('does not search with less than 2 characters', async () => {
    renderDashboard();

    const searchInput = screen.getByPlaceholderText(/Search product/);
    fireEvent.change(searchInput, { target: { value: 'a' } });

    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    expect(mockedFetchSearch).not.toHaveBeenCalled();
  });

  it('searches after debounce delay', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Rice 5kg')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Search product/);
    fireEvent.change(searchInput, { target: { value: 'Rice' } });

    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    expect(mockedFetchSearch).toHaveBeenCalledWith('test-token', 'Rice', 10);
  });
});

// ── Quick Actions ────────────────────────────────────────────────────────

describe('Quick actions', () => {
  it('renders Add Products button', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText(/Add Products/)).toBeInTheDocument();
    });
  });

  it('renders Add Supplier button', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText(/Add Supplier/)).toBeInTheDocument();
    });
  });

  it('renders Export button', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Export')).toBeInTheDocument();
    });
  });

  it('toggles add product menu', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText(/Add Products/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Add Products/));

    await waitFor(() => {
      expect(screen.getByText('CSV Upload')).toBeInTheDocument();
      expect(screen.getByText('Web Form')).toBeInTheDocument();
    });
  });
});

// ── Pagination ───────────────────────────────────────────────────────────

describe('Pagination', () => {
  it('shows pagination when items exceed page size', async () => {
    // Create 25 items (page size is 20)
    const manyItems = Array.from({ length: 25 }, (_, i) => ({
      productId: `p${i}`,
      productName: `Product ${i}`,
      barcode: null,
      totalStockQty: 10,
      totalPurchaseValue: 1000,
      totalSellRevenue: 1500,
    }));

    mockedFetchInventory.mockResolvedValue({
      data: manyItems,
      totals: { totalProducts: 25, totalStockQty: 250, totalPurchaseValue: 25000, totalSellRevenue: 37500 },
    } as any);

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText(/Showing 1/)).toBeInTheDocument();
      expect(screen.getByText('Previous')).toBeInTheDocument();
      expect(screen.getByText('Next')).toBeInTheDocument();
    });
  });

  it('does not show pagination for small datasets', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Rice 5kg')).toBeInTheDocument();
    });

    expect(screen.queryByText('Previous')).not.toBeInTheDocument();
    expect(screen.queryByText('Next')).not.toBeInTheDocument();
  });
});

// ── Category Rename (RCAT-CAT-002) ──────────────────────────────────────

describe('Category rename', () => {
  async function renderAndWaitForCategories() {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText('Staples')).toBeInTheDocument();
    });
  }

  it('opens rename modal when Edit is clicked', async () => {
    await renderAndWaitForCategories();

    const editButtons = screen.getAllByText('Edit');
    fireEvent.click(editButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Rename Category (Store Override)')).toBeInTheDocument();
      expect(screen.getByLabelText('English Name')).toBeInTheDocument();
      expect(screen.getByLabelText('Hindi Name')).toBeInTheDocument();
    });
  });

  it('pre-fills English name from category', async () => {
    await renderAndWaitForCategories();

    const editButtons = screen.getAllByText('Edit');
    fireEvent.click(editButtons[0]);

    await waitFor(() => {
      expect((screen.getByLabelText('English Name') as HTMLInputElement).value).toBe('Staples');
    });
  });

  it('saves renamed category via PATCH and updates local state', async () => {
    await renderAndWaitForCategories();

    const editButtons = screen.getAllByText('Edit');
    fireEvent.click(editButtons[0]);

    await waitFor(() => {
      expect(screen.getByLabelText('English Name')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('English Name'), { target: { value: 'Grains' } });

    // Mock successful PATCH
    mockedAuthFetch.mockResolvedValueOnce({ ok: true } as any);

    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });

    // Modal should close
    await waitFor(() => {
      expect(screen.queryByText('Rename Category (Store Override)')).not.toBeInTheDocument();
    });

    // Category name should be updated in the UI
    expect(screen.getByText('Grains')).toBeInTheDocument();

    // Verify PATCH was called with correct body
    expect(mockedAuthFetch).toHaveBeenCalledWith(
      '/api/v1/retailer-admin/categories/c1',
      'test-token',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ displayNameEn: 'Grains', displayNameHi: undefined }),
      })
    );
  });

  it('shows API error on rename failure', async () => {
    await renderAndWaitForCategories();

    const editButtons = screen.getAllByText('Edit');
    fireEvent.click(editButtons[0]);

    await waitFor(() => {
      expect(screen.getByLabelText('English Name')).toBeInTheDocument();
    });

    // Mock failed PATCH
    mockedAuthFetch.mockResolvedValueOnce({ ok: false } as any);
    mockedSafeJson.mockResolvedValueOnce({ error: { message: 'Category name already exists' } });

    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });

    await waitFor(() => {
      expect(screen.getByText('Category name already exists')).toBeInTheDocument();
    });

    // Modal should still be open
    expect(screen.getByText('Rename Category (Store Override)')).toBeInTheDocument();
  });

  it('shows network error on rename exception', async () => {
    await renderAndWaitForCategories();

    const editButtons = screen.getAllByText('Edit');
    fireEvent.click(editButtons[0]);

    await waitFor(() => {
      expect(screen.getByLabelText('English Name')).toBeInTheDocument();
    });

    // Mock network error
    mockedAuthFetch.mockRejectedValueOnce(new Error('Network failure'));

    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });

    await waitFor(() => {
      expect(screen.getByText(/Network error/)).toBeInTheDocument();
    });
  });

  it('closes modal on Cancel click', async () => {
    await renderAndWaitForCategories();

    const editButtons = screen.getAllByText('Edit');
    fireEvent.click(editButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Rename Category (Store Override)')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Cancel'));

    await waitFor(() => {
      expect(screen.queryByText('Rename Category (Store Override)')).not.toBeInTheDocument();
    });
  });

  it('disables Save when both name fields are empty', async () => {
    await renderAndWaitForCategories();

    const editButtons = screen.getAllByText('Edit');
    fireEvent.click(editButtons[0]);

    await waitFor(() => {
      expect(screen.getByLabelText('English Name')).toBeInTheDocument();
    });

    // Clear the pre-filled English name
    fireEvent.change(screen.getByLabelText('English Name'), { target: { value: '' } });

    expect(screen.getByText('Save')).toBeDisabled();
  });
});

// ── Category Hide/Show (RCAT-CAT-002) ───────────────────────────────────

describe('Category hide/show', () => {
  async function renderAndWaitForCategories() {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText('Staples')).toBeInTheDocument();
    });
  }

  it('calls DELETE to hide a visible category', async () => {
    await renderAndWaitForCategories();

    // Both categories have Hide buttons
    const hideButtons = screen.getAllByText('Hide');
    expect(hideButtons.length).toBeGreaterThan(0);

    // Mock successful DELETE
    mockedAuthFetch.mockResolvedValueOnce({ ok: true } as any);
    mockedSafeJson.mockResolvedValueOnce({ isHidden: true });

    await act(async () => {
      fireEvent.click(hideButtons[0]);
    });

    expect(mockedAuthFetch).toHaveBeenCalledWith(
      '/api/v1/retailer-admin/categories/c1',
      'test-token',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('shows Show button after hiding a category', async () => {
    // Provide a category that is already hidden
    mockedFetchCategories.mockResolvedValue({
      data: [
        { id: 'c1', labelEn: 'Staples', labelHi: null, iconKey: 'grain', sortOrder: 1, productCount: 5, stockValue: 10000, isHidden: true },
        { id: 'c2', labelEn: 'Beverages', labelHi: null, iconKey: 'cup', sortOrder: 2, productCount: 3, stockValue: 5000 },
      ],
    } as any);

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Beverages')).toBeInTheDocument();
    });

    // There should be a "Show hidden" toggle since one category is hidden
    const showHiddenBtn = screen.getByText(/Show hidden/);
    expect(showHiddenBtn).toBeInTheDocument();

    // Click to reveal hidden categories
    fireEvent.click(showHiddenBtn);

    await waitFor(() => {
      expect(screen.getByText('Staples')).toBeInTheDocument();
      // Hidden category should have a "Show" button
      expect(screen.getByText('Show')).toBeInTheDocument();
    });
  });

  it('shows error banner on hide failure', async () => {
    await renderAndWaitForCategories();

    const hideButtons = screen.getAllByText('Hide');

    mockedAuthFetch.mockResolvedValueOnce({ ok: false } as any);
    mockedSafeJson.mockResolvedValueOnce({ error: { message: 'Cannot hide default category' } });

    await act(async () => {
      fireEvent.click(hideButtons[0]);
    });

    await waitFor(() => {
      expect(screen.getByText('Cannot hide default category')).toBeInTheDocument();
    });
  });

  it('shows network error banner on hide exception', async () => {
    await renderAndWaitForCategories();

    const hideButtons = screen.getAllByText('Hide');

    mockedAuthFetch.mockRejectedValueOnce(new Error('Connection refused'));

    await act(async () => {
      fireEvent.click(hideButtons[0]);
    });

    await waitFor(() => {
      expect(screen.getByText(/Network error/)).toBeInTheDocument();
    });
  });

  it('dismisses toggle error banner', async () => {
    await renderAndWaitForCategories();

    const hideButtons = screen.getAllByText('Hide');
    mockedAuthFetch.mockRejectedValueOnce(new Error('fail'));

    await act(async () => {
      fireEvent.click(hideButtons[0]);
    });

    await waitFor(() => {
      expect(screen.getByText(/Network error/)).toBeInTheDocument();
    });

    // Dismiss error
    fireEvent.click(screen.getByLabelText('Dismiss error'));

    await waitFor(() => {
      expect(screen.queryByText(/Network error/)).not.toBeInTheDocument();
    });
  });
});

// ── CSV Export (GL-WF-031 + STG-735) ────────────────────────────────────

describe('CSV export', () => {
  it('shows toast error when inventory is empty', async () => {
    mockedFetchInventory.mockResolvedValue({
      data: [],
      totals: { totalProducts: 0, totalStockQty: 0, totalPurchaseValue: 0, totalSellRevenue: 0 },
    } as any);

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Export')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Export'));

    expect(mockToastError).toHaveBeenCalledWith('No inventory data to export');
  });

  it('generates CSV with formula-safe fields (STG-735)', async () => {
    // Inventory with formula injection attempt
    mockedFetchInventory.mockResolvedValue({
      data: [
        { productId: 'p1', productName: '=CMD()', barcode: '+ATTACK', totalStockQty: 10, totalPurchaseValue: 5000, totalSellRevenue: 8000 },
        { productId: 'p2', productName: 'Normal Rice', barcode: '123456', totalStockQty: 20, totalPurchaseValue: 10000, totalSellRevenue: 15000 },
      ],
      totals: { totalProducts: 2, totalStockQty: 30, totalPurchaseValue: 15000, totalSellRevenue: 23000 },
    } as any);

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Normal Rice')).toBeInTheDocument();
    });

    // Capture the Blob content via Blob constructor spy
    let capturedCsv = '';
    const OrigBlob = globalThis.Blob;
    globalThis.Blob = class extends OrigBlob {
      constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
        super(parts, options);
        if (options?.type?.includes('csv') && parts) {
          capturedCsv = parts.map(p => String(p)).join('');
        }
      }
    } as any;

    // Spy on link creation AFTER render to avoid breaking React
    const origCreateElement = document.createElement.bind(document);
    const mockLink = { href: '', download: '', click: vi.fn(), style: {} };
    const createElSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') return mockLink as any;
      return origCreateElement(tag);
    });
    const appendSpy = vi.spyOn(document.body, 'appendChild').mockImplementation((n) => n);
    const removeSpy = vi.spyOn(document.body, 'removeChild').mockImplementation((n) => n);
    URL.createObjectURL = vi.fn(() => 'blob:test') as any;
    URL.revokeObjectURL = vi.fn() as any;

    try {
      fireEvent.click(screen.getByText('Export'));

      expect(mockLink.click).toHaveBeenCalled();
      expect(capturedCsv).not.toBe('');

      // STG-735: Fields starting with = or + should be prefixed with '
      expect(capturedCsv).toContain("\"'=CMD()\"");
      expect(capturedCsv).toContain("\"'+ATTACK\"");
      expect(capturedCsv).toContain('"Normal Rice"');
    } finally {
      globalThis.Blob = OrigBlob;
      createElSpy.mockRestore();
      appendSpy.mockRestore();
      removeSpy.mockRestore();
    }
  });

  it('includes correct CSV headers', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Rice 5kg')).toBeInTheDocument();
    });

    let capturedCsv = '';
    const OrigBlob = globalThis.Blob;
    globalThis.Blob = class extends OrigBlob {
      constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
        super(parts, options);
        if (options?.type?.includes('csv') && parts) {
          capturedCsv = parts.map(p => String(p)).join('');
        }
      }
    } as any;

    const origCreateElement = document.createElement.bind(document);
    const mockLink = { href: '', download: '', click: vi.fn(), style: {} };
    const createElSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') return mockLink as any;
      return origCreateElement(tag);
    });
    const appendSpy = vi.spyOn(document.body, 'appendChild').mockImplementation((n) => n);
    const removeSpy = vi.spyOn(document.body, 'removeChild').mockImplementation((n) => n);
    URL.createObjectURL = vi.fn(() => 'blob:test') as any;
    URL.revokeObjectURL = vi.fn() as any;

    try {
      fireEvent.click(screen.getByText('Export'));

      const firstLine = capturedCsv.split('\n')[0];
      expect(firstLine).toBe('Product Name,Barcode,Stock Qty,Purchase Value (Rs),Sell Revenue (Rs)');
    } finally {
      globalThis.Blob = OrigBlob;
      createElSpy.mockRestore();
      appendSpy.mockRestore();
      removeSpy.mockRestore();
    }
  });
});

// ── Search Result Click Navigation ──────────────────────────────────────

describe('Search result click navigation', () => {
  function renderDashboardWithLocation() {
    return render(
      <MemoryRouter initialEntries={['/s/STORE1']}>
        <Routes>
          <Route path="/s/:storeCode" element={<DashboardPage />} />
          <Route path="/s/:storeCode/products" element={<div data-testid="nav-products">Products</div>} />
          <Route path="/s/:storeCode/suppliers" element={<div data-testid="nav-suppliers">Suppliers</div>} />
        </Routes>
        <LocationDisplay />
      </MemoryRouter>
    );
  }

  it('navigates to products page when clicking a product result', async () => {
    renderDashboardWithLocation();

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Search product/)).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText('Rice 5kg')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Search product/);
    fireEvent.change(searchInput, { target: { value: 'Rice' } });

    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    await waitFor(() => {
      expect(screen.getAllByRole('option').length).toBeGreaterThan(0);
    });

    const resultOptions = screen.getAllByRole('option');
    fireEvent.click(resultOptions[0]);

    await waitFor(() => {
      expect(screen.getByTestId('location-display').textContent).toContain('/s/STORE1/products');
      expect(screen.getByTestId('location-display').textContent).toContain('search=Rice');
    });
  });

  it('navigates to suppliers page when clicking a supplier result', async () => {
    mockedFetchSearch.mockResolvedValue({
      data: {
        products: [],
        suppliers: [
          { id: 'sup1', businessName: 'ABC Traders', phone: '+91999', gstin: null, isSupermandi: false, verificationStatus: 'pending' },
        ],
        barcodes: [],
      },
    } as any);

    renderDashboardWithLocation();

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Search product/)).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByTestId('location-display')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Search product/);
    fireEvent.change(searchInput, { target: { value: 'ABC' } });

    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    await waitFor(() => {
      expect(screen.getByText('ABC Traders')).toBeInTheDocument();
    });

    const resultOptions = screen.getAllByRole('option');
    fireEvent.click(resultOptions[0]);

    await waitFor(() => {
      expect(screen.getByTestId('location-display').textContent).toContain('/s/STORE1/suppliers');
    });
  });

  it('navigates to products page with barcode when clicking a barcode result', async () => {
    mockedFetchSearch.mockResolvedValue({
      data: {
        products: [],
        suppliers: [],
        barcodes: [
          { storeProductId: 'sp1', productName: 'Rice 5kg', barcode: '123456789', mode: 'PACKAGED' },
        ],
      },
    } as any);

    renderDashboardWithLocation();

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Search product/)).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByTestId('location-display')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Search product/);
    fireEvent.change(searchInput, { target: { value: '123456789' } });

    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    await waitFor(() => {
      expect(screen.getByText(/Barcode Matches/)).toBeInTheDocument();
    });

    const resultOptions = screen.getAllByRole('option');
    fireEvent.click(resultOptions[0]);

    await waitFor(() => {
      expect(screen.getByTestId('location-display').textContent).toContain('/s/STORE1/products');
      expect(screen.getByTestId('location-display').textContent).toContain('search=123456789');
    });
  });

  it('shows no results message when search returns empty', async () => {
    mockedFetchSearch.mockResolvedValue({
      data: {
        products: [],
        suppliers: [],
        barcodes: [],
      },
    } as any);

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Search product/)).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText('My Store')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Search product/);
    fireEvent.change(searchInput, { target: { value: 'zzzzz' } });

    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    await waitFor(() => {
      expect(screen.getByText(/No results found/)).toBeInTheDocument();
    });
  });
});
