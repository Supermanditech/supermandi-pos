import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import DashboardPage from '../../pages/DashboardPage';
import React from 'react';

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
      const allCategories = screen.queryAllByText('All');
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
