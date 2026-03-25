import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CustomersPage from '../pages/CustomersPage';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let mockAccessToken: string | null = 'test-token';

vi.mock('../lib/AuthContext', () => ({
  useAuth: () => ({ accessToken: mockAccessToken }),
}));

vi.mock('../components/Breadcrumb', () => ({
  default: ({ items }: { items: Array<{ label: string; path?: string; onClick?: () => void }> }) => (
    <nav data-testid="breadcrumb">
      {items.map((item, i) => (
        <span key={i}>
          {item.onClick ? <button onClick={item.onClick}>{item.label}</button> : item.path ? <a href={item.path}>{item.label}</a> : item.label}
        </span>
      ))}
    </nav>
  ),
}));

vi.mock('../components/EmptyState', () => ({
  default: ({ title, description }: { title: string; description: string }) => (
    <div data-testid="empty-state"><h3>{title}</h3><p>{description}</p></div>
  ),
}));

vi.mock('../lib/formatters', () => ({
  formatDateTime: (d: string) => `FMT:${d}`,
  formatCurrency: (v: number) => `₹${(v / 100).toFixed(0)}`,
}));

vi.mock('lucide-react', () => ({
  Users: () => <span>UsersIcon</span>,
  RefreshCw: ({ className }: { className?: string }) => <span className={className}>RefreshIcon</span>,
  Search: () => <span>SearchIcon</span>,
  ChevronLeft: () => <span>ChevronLeftIcon</span>,
}));

vi.mock('../components/WhatsAppIcon', () => ({
  WhatsAppIcon: () => <span data-testid="wa-icon">WA</span>,
}));

const mockAuthFetch = vi.fn();
vi.mock('../lib/api', () => ({
  authFetch: (...args: unknown[]) => mockAuthFetch(...args),
  safeJson: (res: { json: () => Promise<unknown> }) => res.json(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPage() {
  return render(
    <MemoryRouter>
      <CustomersPage />
    </MemoryRouter>
  );
}

function makeListResponse(customers: any[], total: number) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ customers, total }),
  };
}

function makeDetailResponse(customer: any, purchases: any[]) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ customer, purchases }),
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const customerA = {
  id: 'c1',
  storeId: 's1',
  name: 'Raju Sharma',
  phone: '9876543210',
  email: 'raju@test.com',
  address: '123 Main St, Delhi',
  creditLimitMinor: 500000,
  totalPurchasesMinor: 1250000,
  creditBalance: 250000,  // GCP-STG-0740: outstanding khata balance
  visitCount: 12,
  lastVisitAt: '2026-03-08T10:00:00Z',
  createdAt: '2026-01-01T00:00:00Z',
};

const customerB = {
  id: 'c2',
  storeId: 's1',
  name: 'Priya Patel',
  phone: '9123456789',
  email: null,
  address: null,
  creditLimitMinor: 0,
  totalPurchasesMinor: 50000,
  creditBalance: 0,  // GCP-STG-0740
  visitCount: 2,
  lastVisitAt: null,
  createdAt: '2026-02-15T00:00:00Z',
};

const purchaseCompleted = {
  saleId: 'sale-001',
  billRef: 'BILL-2026-001',
  totalMinor: 150000,
  paymentMode: 'UPI',
  status: 'completed',
  createdAt: '2026-03-05T14:30:00Z',
};

const purchasePending = {
  saleId: 'sale-002',
  billRef: '',
  totalMinor: 75000,
  paymentMode: 'CASH',
  status: 'pending',
  createdAt: '2026-03-07T09:00:00Z',
};

// ---------------------------------------------------------------------------
// URL-routing mock helper
// ---------------------------------------------------------------------------

/** Routes mock responses by URL pattern. List calls always return the same data. */
function setupMocks(opts: {
  list?: any[];
  total?: number;
  detailCustomer?: any;
  detailPurchases?: any[];
  detailError?: 'fail' | '401' | 'network' | 'null';
  detailHang?: boolean;
}) {
  const { list = [customerA], total = list.length, detailCustomer = customerA, detailPurchases = [], detailError, detailHang } = opts;
  mockAuthFetch.mockImplementation((url: string) => {
    // Detail endpoint
    if (typeof url === 'string' && /\/customers\/[^?]/.test(url) && !url.includes('customers?')) {
      if (detailHang) return new Promise(() => {});
      if (detailError === 'fail') return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
      if (detailError === '401') return Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({}) });
      if (detailError === 'network') return Promise.reject(new Error('Network timeout'));
      if (detailError === 'null') return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(null) });
      return Promise.resolve(makeDetailResponse(detailCustomer, detailPurchases));
    }
    // List endpoint
    return Promise.resolve(makeListResponse(list, total));
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let mockWindowOpen: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockAccessToken = 'test-token';
  mockAuthFetch.mockReset();
  mockWindowOpen = vi.fn();
  vi.stubGlobal('open', mockWindowOpen);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ==========================================================================
// 1. Initial render & loading
// ==========================================================================

describe('initial render', () => {
  it('renders page title with count', async () => {
    setupMocks({ list: [], total: 0 });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Customers (0)')).toBeInTheDocument();
    });
  });

  it('shows loading indicator while fetching', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders breadcrumb with Customers', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    const breadcrumb = screen.getByTestId('breadcrumb');
    expect(breadcrumb).toHaveTextContent('Customers');
  });

  it('renders search input with placeholder and aria-label', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByPlaceholderText('Search name or phone...')).toBeInTheDocument();
    expect(screen.getByLabelText('Search customers by name or phone')).toBeInTheDocument();
  });

  it('calls API on mount with limit=50', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(mockAuthFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/retailer-admin/customers?limit=50'),
      'test-token'
    );
  });

  it('renders Refresh button', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText('Refresh')).toBeInTheDocument();
  });
});

// ==========================================================================
// 2. Customer list
// ==========================================================================

describe('customer list', () => {
  it('renders customer table with data', async () => {
    setupMocks({});
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Raju Sharma')).toBeInTheDocument();
    });
    expect(screen.getByText('9876543210')).toBeInTheDocument();
  });

  it('shows table headers', async () => {
    setupMocks({});
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Name')).toBeInTheDocument();
    });
    expect(screen.getByText('Phone')).toBeInTheDocument();
    expect(screen.getByText('Total Purchases')).toBeInTheDocument();
    expect(screen.getByText('Visits')).toBeInTheDocument();
    expect(screen.getByText('Last Visit')).toBeInTheDocument();
    expect(screen.getByText('Credit Balance')).toBeInTheDocument();
  });

  it('formats currency for purchases and credit balance', async () => {
    setupMocks({});
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('₹12500')).toBeInTheDocument();
      expect(screen.getByText('₹2500')).toBeInTheDocument();
    });
  });

  it('shows visit count', async () => {
    setupMocks({});
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('12')).toBeInTheDocument();
    });
  });

  it('formats lastVisitAt date', async () => {
    setupMocks({});
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('FMT:2026-03-08T10:00:00Z')).toBeInTheDocument();
    });
  });

  it('shows dash for null lastVisitAt', async () => {
    setupMocks({ list: [customerB] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('—')).toBeInTheDocument();
    });
  });

  it('shows customer count in header', async () => {
    setupMocks({ list: [customerA, customerB], total: 42 });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Customers (42)')).toBeInTheDocument();
    });
  });

  it('shows WhatsApp button for customers with phone', async () => {
    setupMocks({});
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Raju Sharma')).toBeInTheDocument();
    });
    const waButtons = screen.getAllByLabelText('Message on WhatsApp');
    expect(waButtons.length).toBeGreaterThanOrEqual(1);
  });

  it('renders multiple customers', async () => {
    setupMocks({ list: [customerA, customerB] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Raju Sharma')).toBeInTheDocument();
      expect(screen.getByText('Priya Patel')).toBeInTheDocument();
    });
  });
});

// ==========================================================================
// 3. Empty state
// ==========================================================================

describe('empty state', () => {
  it('shows empty state when no customers (no search)', async () => {
    setupMocks({ list: [], total: 0 });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('No customers found')).toBeInTheDocument();
    });
    expect(screen.getByText('Customer profiles will appear here when customers are added via POS.')).toBeInTheDocument();
  });

  it('shows search-specific empty state message', async () => {
    // URL-based routing: search with q= returns empty
    mockAuthFetch.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('q=xyz')) {
        return Promise.resolve(makeListResponse([], 0));
      }
      return Promise.resolve(makeListResponse([customerA], 1));
    });

    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Raju Sharma')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search name or phone...');
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'xyz' } });
    });

    // Wait for 300ms debounce + re-render
    await waitFor(() => {
      expect(screen.getByText('No customers matching "xyz".')).toBeInTheDocument();
    }, { timeout: 3000 });
  });
});

// ==========================================================================
// 4. Error handling
// ==========================================================================

describe('error handling', () => {
  it('shows error banner on API failure', async () => {
    mockAuthFetch.mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({}) });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Failed to fetch customers/)).toBeInTheDocument();
    });
  });

  it('shows error on network exception', async () => {
    mockAuthFetch.mockRejectedValue(new Error('Network error'));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('shows error on null json response', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(null),
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Invalid response')).toBeInTheDocument();
    });
  });

  it('silently handles 401 (no error banner)', async () => {
    mockAuthFetch.mockResolvedValue({ ok: false, status: 401, json: () => Promise.resolve({}) });
    renderPage();
    // Wait for loading to finish, then check no error
    await act(async () => { await new Promise(r => setTimeout(r, 500)); });
    expect(screen.queryByText(/Failed/)).not.toBeInTheDocument();
  });
});

// ==========================================================================
// 5. Search & Refresh
// ==========================================================================

describe('search and refresh', () => {
  it('debounced search sends q param after typing', async () => {
    setupMocks({ list: [] });
    renderPage();

    // Wait for initial render
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search name or phone...')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search name or phone...');
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'raj' } });
    });

    // Wait for debounce (300ms)
    await waitFor(() => {
      const calls = mockAuthFetch.mock.calls;
      const hasSearchCall = calls.some((c: any) => typeof c[0] === 'string' && c[0].includes('q=raj'));
      expect(hasSearchCall).toBe(true);
    }, { timeout: 2000 });
  });

  it('Refresh button calls fetchCustomers', async () => {
    setupMocks({});
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Raju Sharma')).toBeInTheDocument();
    });

    const callCountBefore = mockAuthFetch.mock.calls.length;
    fireEvent.click(screen.getByText('Refresh'));

    await waitFor(() => {
      expect(mockAuthFetch.mock.calls.length).toBeGreaterThan(callCountBefore);
    });
  });
});

// ==========================================================================
// 6. WhatsApp (list view)
// ==========================================================================

describe('WhatsApp in list', () => {
  it('opens WhatsApp link on button click', async () => {
    setupMocks({});
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Raju Sharma')).toBeInTheDocument();
    });

    const waButtons = screen.getAllByLabelText('Message on WhatsApp');
    fireEvent.click(waButtons[0]);

    expect(mockWindowOpen).toHaveBeenCalledTimes(1);
    const url = mockWindowOpen.mock.calls[0][0] as string;
    expect(url).toContain('wa.me/91');
    expect(url).toContain('9876543210');
    expect(url).toContain(encodeURIComponent('Hi Raju Sharma'));
  });

  it('WhatsApp click does not open detail view', async () => {
    setupMocks({});
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Raju Sharma')).toBeInTheDocument();
    });

    const waButtons = screen.getAllByLabelText('Message on WhatsApp');
    fireEvent.click(waButtons[0]);

    // Should NOT navigate to detail (no "Back" button)
    expect(screen.queryByText('Back')).not.toBeInTheDocument();
  });
});

// ==========================================================================
// 7. Detail view — navigation
// ==========================================================================

describe('detail view navigation', () => {
  it('clicking customer row opens detail view', async () => {
    setupMocks({});
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Raju Sharma')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Raju Sharma'));

    await waitFor(() => {
      expect(screen.getByText('Back')).toBeInTheDocument();
    });
  });

  it('Back button returns to list view', async () => {
    setupMocks({});
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Raju Sharma')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Raju Sharma'));
    await waitFor(() => {
      expect(screen.getByText('Back')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Back'));

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search name or phone...')).toBeInTheDocument();
    });
  });

  it('breadcrumb shows Customers > CustomerName in detail', async () => {
    setupMocks({});
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Raju Sharma')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Raju Sharma'));
    await waitFor(() => {
      const breadcrumb = screen.getByTestId('breadcrumb');
      expect(breadcrumb).toHaveTextContent('Customers');
      expect(breadcrumb).toHaveTextContent('Raju Sharma');
    });
  });

  it('breadcrumb Customers link navigates back to list', async () => {
    setupMocks({});
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Raju Sharma')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Raju Sharma'));
    await waitFor(() => {
      expect(screen.getByText('Back')).toBeInTheDocument();
    });

    const breadcrumb = screen.getByTestId('breadcrumb');
    const custButton = breadcrumb.querySelector('button');
    expect(custButton).toBeTruthy();
    fireEvent.click(custButton!);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search name or phone...')).toBeInTheDocument();
    });
  });
});

// ==========================================================================
// 8. Detail view — customer info cards
// ==========================================================================

describe('detail view info cards', () => {
  async function openDetail(customer: { id: string; storeId: string; name: string; phone: string; email: string | null; address: string | null; creditLimitMinor: number; totalPurchasesMinor: number; visitCount: number; lastVisitAt: string | null; createdAt: string } = customerA, purchases: any[] = []) {
    setupMocks({ list: [customer], detailCustomer: customer, detailPurchases: purchases });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(customer.name)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText(customer.name));
    await waitFor(() => {
      expect(screen.getByText('Back')).toBeInTheDocument();
    });
  }

  it('shows customer name as heading', async () => {
    await openDetail();
    expect(screen.getByRole('heading', { name: 'Raju Sharma' })).toBeInTheDocument();
  });

  it('shows phone number', async () => {
    await openDetail();
    expect(screen.getByText('Phone')).toBeInTheDocument();
    expect(screen.getByText('9876543210')).toBeInTheDocument();
  });

  it('shows total purchases formatted', async () => {
    await openDetail();
    expect(screen.getByText('Total Purchases')).toBeInTheDocument();
    expect(screen.getByText('₹12500')).toBeInTheDocument();
  });

  it('shows visit count', async () => {
    await openDetail();
    expect(screen.getByText('Visits')).toBeInTheDocument();
  });

  it('shows last visit date when available', async () => {
    await openDetail();
    expect(screen.getByText('Last Visit')).toBeInTheDocument();
    expect(screen.getByText('FMT:2026-03-08T10:00:00Z')).toBeInTheDocument();
  });

  it('shows "Never" for null lastVisitAt', async () => {
    await openDetail(customerB);
    expect(screen.getByText('Never')).toBeInTheDocument();
  });

  it('shows email card when email present', async () => {
    await openDetail();
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('raju@test.com')).toBeInTheDocument();
  });

  it('hides email card when email is null', async () => {
    await openDetail(customerB);
    expect(screen.queryByText('Email')).not.toBeInTheDocument();
  });

  it('shows address card when address present', async () => {
    await openDetail();
    expect(screen.getByText('Address')).toBeInTheDocument();
    expect(screen.getByText('123 Main St, Delhi')).toBeInTheDocument();
  });

  it('hides address card when address is null', async () => {
    await openDetail(customerB);
    expect(screen.queryByText('Address')).not.toBeInTheDocument();
  });

  it('shows credit limit formatted', async () => {
    await openDetail();
    expect(screen.getByText('Credit Limit')).toBeInTheDocument();
    expect(screen.getByText('₹5000')).toBeInTheDocument();
  });

  it('shows WhatsApp button in detail view', async () => {
    await openDetail();
    const waButtons = screen.getAllByLabelText('Message on WhatsApp');
    expect(waButtons.length).toBeGreaterThanOrEqual(1);
  });

  it('WhatsApp in detail opens correct URL', async () => {
    await openDetail();
    const waButton = screen.getAllByLabelText('Message on WhatsApp')[0];
    fireEvent.click(waButton);

    expect(mockWindowOpen).toHaveBeenCalledTimes(1);
    const url = mockWindowOpen.mock.calls[0][0] as string;
    expect(url).toContain('wa.me/91');
    expect(url).toContain('9876543210');
  });
});

// ==========================================================================
// 9. Detail view — purchase history
// ==========================================================================

describe('purchase history', () => {
  async function openDetailWithPurchases(purchases: any[]) {
    setupMocks({ detailPurchases: purchases });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Raju Sharma')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Raju Sharma'));
    await waitFor(() => {
      expect(screen.getByText('Recent Purchases')).toBeInTheDocument();
    });
  }

  it('shows Recent Purchases heading', async () => {
    await openDetailWithPurchases([]);
    expect(screen.getByText('Recent Purchases')).toBeInTheDocument();
  });

  it('shows empty state when no purchases', async () => {
    await openDetailWithPurchases([]);
    expect(screen.getByText('No purchases yet')).toBeInTheDocument();
    expect(screen.getByText('This customer has no recorded purchases.')).toBeInTheDocument();
  });

  it('shows purchase table headers', async () => {
    await openDetailWithPurchases([purchaseCompleted]);
    expect(screen.getByText('Bill Ref')).toBeInTheDocument();
    expect(screen.getByText('Payment')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Date')).toBeInTheDocument();
  });

  it('shows bill ref in code tag', async () => {
    await openDetailWithPurchases([purchaseCompleted]);
    const codeEl = screen.getByText('BILL-2026-001');
    expect(codeEl.tagName).toBe('CODE');
  });

  it('falls back to saleId slice when no billRef', async () => {
    await openDetailWithPurchases([purchasePending]);
    expect(screen.getByText('sale-002')).toBeInTheDocument();
  });

  it('formats purchase amount', async () => {
    await openDetailWithPurchases([purchaseCompleted]);
    // 150000 / 100 = ₹1500
    expect(screen.getByText('₹1500')).toBeInTheDocument();
  });

  it('shows payment mode as badge', async () => {
    await openDetailWithPurchases([purchaseCompleted]);
    expect(screen.getByText('UPI')).toBeInTheDocument();
  });

  it('shows completed status with success badge', async () => {
    await openDetailWithPurchases([purchaseCompleted]);
    const statusBadge = screen.getByText('completed');
    expect(statusBadge).toHaveClass('badge-success');
  });

  it('shows non-completed status with warning badge', async () => {
    await openDetailWithPurchases([purchasePending]);
    const statusBadge = screen.getByText('pending');
    expect(statusBadge).toHaveClass('badge-warning');
  });

  it('formats purchase date', async () => {
    await openDetailWithPurchases([purchaseCompleted]);
    expect(screen.getByText('FMT:2026-03-05T14:30:00Z')).toBeInTheDocument();
  });

  it('shows multiple purchases', async () => {
    await openDetailWithPurchases([purchaseCompleted, purchasePending]);
    expect(screen.getByText('BILL-2026-001')).toBeInTheDocument();
    expect(screen.getByText('sale-002')).toBeInTheDocument();
  });
});

// ==========================================================================
// 10. Detail view — loading and errors
// ==========================================================================

describe('detail loading and errors', () => {
  it('shows loading state while fetching detail', async () => {
    setupMocks({ detailHang: true });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Raju Sharma')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Raju Sharma'));

    await waitFor(() => {
      expect(screen.getByText('Loading purchases...')).toBeInTheDocument();
    });
  });

  it('shows error on detail fetch failure', async () => {
    setupMocks({ detailError: 'fail' });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Raju Sharma')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Raju Sharma'));

    await waitFor(() => {
      expect(screen.getByText(/Failed to fetch customer details/)).toBeInTheDocument();
    });
  });

  it('shows error on detail network exception', async () => {
    setupMocks({ detailError: 'network' });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Raju Sharma')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Raju Sharma'));

    await waitFor(() => {
      expect(screen.getByText('Network timeout')).toBeInTheDocument();
    });
  });

  it('silently handles 401 on detail fetch', async () => {
    setupMocks({ detailError: '401' });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Raju Sharma')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Raju Sharma'));

    await act(async () => { await new Promise(r => setTimeout(r, 200)); });
    expect(screen.queryByText(/Failed/)).not.toBeInTheDocument();
  });

  it('shows error on null detail json', async () => {
    setupMocks({ detailError: 'null' });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Raju Sharma')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Raju Sharma'));

    await waitFor(() => {
      expect(screen.getByText('Invalid response')).toBeInTheDocument();
    });
  });
});

// ==========================================================================
// 11. API call verification
// ==========================================================================

describe('API calls', () => {
  it('list API includes search param when searching', async () => {
    setupMocks({ list: [] });
    renderPage();

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search name or phone...')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search name or phone...');
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'test' } });
    });

    await waitFor(() => {
      const calls = mockAuthFetch.mock.calls;
      const hasSearchCall = calls.some((c: any) => typeof c[0] === 'string' && c[0].includes('q=test'));
      expect(hasSearchCall).toBe(true);
    }, { timeout: 2000 });
  });

  it('detail API calls correct endpoint', async () => {
    setupMocks({});
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Raju Sharma')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Raju Sharma'));

    await waitFor(() => {
      expect(mockAuthFetch).toHaveBeenCalledWith(
        '/api/v1/retailer-admin/customers/c1',
        'test-token'
      );
    });
  });
});
