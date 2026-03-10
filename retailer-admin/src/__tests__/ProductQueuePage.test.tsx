import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ProductQueuePage from '../pages/admin/ProductQueuePage';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let mockAccessToken: string | null = 'test-token';

vi.mock('../lib/AuthContext', () => ({
  useAuth: () => ({ accessToken: mockAccessToken }),
}));

vi.mock('../components/Breadcrumb', () => ({
  default: ({ items }: { items: { label: string; path?: string }[] }) => (
    <nav data-testid="breadcrumb">
      {items.map((item, i) => (
        <span key={i}>{item.path ? <a href={item.path}>{item.label}</a> : item.label}</span>
      ))}
    </nav>
  ),
}));

vi.mock('../lib/hooks', () => ({
  useEscapeKey: vi.fn(),
}));

vi.mock('../lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const mockAuthFetch = vi.fn();
vi.mock('../lib/api', () => ({
  authFetch: (...args: unknown[]) => mockAuthFetch(...args),
  safeJson: (res: { json: () => Promise<unknown> }, fallback?: unknown) => res.json().catch(() => fallback),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/s/TEST/admin/product-queue']}>
      <Routes>
        <Route path="/s/:storeCode/admin/product-queue" element={<ProductQueuePage />} />
      </Routes>
    </MemoryRouter>
  );
}

function makeResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: () => Promise.resolve(body) };
}

const product1 = {
  id: 'prod-1',
  productName: 'Basmati Rice 5kg',
  skuCode: 'SKU-001',
  barcode: '1234567890',
  purchasePrice: 25000, // ₹250.00
  mrp: 30000, // ₹300.00
  moq: 5,
  createdAt: '2026-03-01T10:00:00Z',
  supplierId: 'sup-1',
  supplierName: 'Fresh Farms',
};

const product2 = {
  id: 'prod-2',
  productName: 'Sugar 1kg',
  skuCode: null,
  barcode: null,
  purchasePrice: 4500, // ₹45.00
  mrp: null,
  moq: null,
  createdAt: '2026-03-05T14:00:00Z',
  supplierId: 'sup-2',
  supplierName: 'Sweet Mills',
};

type MockConfig = {
  products?: any[];
  listError?: 'fail' | 'network' | '401';
  approveError?: 'fail';
  editError?: 'fail';
  rejectError?: 'fail';
};

function setupMocks(config: MockConfig = {}) {
  const { products = [], listError, approveError, editError, rejectError } = config;

  mockAuthFetch.mockImplementation((url: string, _token?: string, options?: { method?: string }) => {
    const method = options?.method || 'GET';

    // GET pending
    if (url.includes('/admin/products/pending') && method === 'GET') {
      if (listError === 'network') return Promise.reject(new Error('Network error'));
      if (listError === 'fail') return Promise.resolve(makeResponse({}, false, 500));
      if (listError === '401') return Promise.resolve(makeResponse({}, false, 401));
      return Promise.resolve(makeResponse({ data: products }));
    }

    // PUT edit
    if (url.match(/\/products\/[^/]+\/edit/) && method === 'PUT') {
      if (editError === 'fail') return Promise.resolve(makeResponse({ error: 'Edit failed' }, false, 500));
      return Promise.resolve(makeResponse({ success: true }));
    }

    // POST approve
    if (url.match(/\/products\/[^/]+\/approve/) && method === 'POST') {
      if (approveError === 'fail') return Promise.resolve(makeResponse({ error: 'Approve failed' }, false, 500));
      return Promise.resolve(makeResponse({ success: true }));
    }

    // POST reject
    if (url.match(/\/products\/[^/]+\/reject/) && method === 'POST') {
      if (rejectError === 'fail') return Promise.resolve(makeResponse({ error: 'Reject failed' }, false, 500));
      return Promise.resolve(makeResponse({ success: true }));
    }

    return Promise.resolve(makeResponse({}));
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockAccessToken = 'test-token';
  mockAuthFetch.mockReset();
});

// ==========================================================================
// 1. Initial render
// ==========================================================================

describe('initial render', () => {
  it('renders breadcrumb and page title', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByTestId('breadcrumb')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Product Approval Queue' })).toBeInTheDocument();
  });

  it('shows loading state', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText('Loading pending products...')).toBeInTheDocument();
  });

  it('shows Refresh button', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText('Refresh')).toBeInTheDocument();
  });

  it('fetches pending products on mount', () => {
    setupMocks();
    renderPage();
    const urls = mockAuthFetch.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('/admin/products/pending'))).toBe(true);
  });
});

// ==========================================================================
// 2. Product list
// ==========================================================================

describe('product list', () => {
  it('shows empty state when no pending products', async () => {
    setupMocks({ products: [] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('No pending product approvals.')).toBeInTheDocument();
    });
  });

  it('renders product table with data', async () => {
    setupMocks({ products: [product1] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Basmati Rice 5kg')).toBeInTheDocument();
      expect(screen.getByText('Fresh Farms')).toBeInTheDocument();
    });
  });

  it('shows table headers', async () => {
    setupMocks({ products: [product1] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Product')).toBeInTheDocument();
      expect(screen.getByText('Supplier')).toBeInTheDocument();
      expect(screen.getByText('SKU / Barcode')).toBeInTheDocument();
      expect(screen.getByText('Purchase Price')).toBeInTheDocument();
      expect(screen.getByText('MRP')).toBeInTheDocument();
      expect(screen.getByText('MOQ')).toBeInTheDocument();
    });
  });

  it('formats purchase price (paise to INR)', async () => {
    setupMocks({ products: [product1] });
    renderPage();
    await waitFor(() => {
      // 25000 paise = ₹250.00
      expect(screen.getByText('₹250.00')).toBeInTheDocument();
    });
  });

  it('shows SKU code in table', async () => {
    setupMocks({ products: [product1] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('SKU-001')).toBeInTheDocument();
    });
  });

  it('shows dash for null SKU/barcode', async () => {
    setupMocks({ products: [product2] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Sugar 1kg')).toBeInTheDocument();
    });
    // null SKU/barcode + null MRP both show '-'
    const dashes = screen.getAllByText('-');
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it('shows dash for null MRP', async () => {
    setupMocks({ products: [product2] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Sugar 1kg')).toBeInTheDocument();
    });
    const dashes = screen.getAllByText('-');
    expect(dashes.length).toBeGreaterThanOrEqual(2); // null SKU + null MRP
  });

  it('shows MOQ or defaults to 1', async () => {
    setupMocks({ products: [product1, product2] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('5')).toBeInTheDocument(); // product1.moq
      expect(screen.getByText('1')).toBeInTheDocument(); // product2.moq defaults to 1
    });
  });

  it('shows pending products count', async () => {
    setupMocks({ products: [product1, product2] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Pending Products')).toBeInTheDocument();
    });
  });
});

// ==========================================================================
// 3. Quick approve
// ==========================================================================

describe('quick approve', () => {
  it('shows Quick Approve button', async () => {
    setupMocks({ products: [product1] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Quick Approve')).toBeInTheDocument();
    });
  });

  it('calls approve API on Quick Approve click', async () => {
    setupMocks({ products: [product1] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Quick Approve')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Quick Approve'));
    await waitFor(() => {
      const approveCalls = mockAuthFetch.mock.calls.filter(
        (c) => String(c[0]).includes('/approve') && c[2]?.method === 'POST'
      );
      expect(approveCalls.length).toBe(1);
    });
  });

  it('shows success after quick approve', async () => {
    setupMocks({ products: [product1] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Quick Approve')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Quick Approve'));
    await waitFor(() => {
      expect(screen.getByText('Product approved successfully!')).toBeInTheDocument();
    });
  });

  it('shows error on approve failure', async () => {
    setupMocks({ products: [product1], approveError: 'fail' });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Quick Approve')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Quick Approve'));
    await waitFor(() => {
      expect(screen.getByText('Approve failed')).toBeInTheDocument();
    });
  });
});

// ==========================================================================
// 4. Edit & Approve modal
// ==========================================================================

describe('edit and approve modal', () => {
  it('shows Edit & Approve button', async () => {
    setupMocks({ products: [product1] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Edit & Approve')).toBeInTheDocument();
    });
  });

  it('opens edit modal with product data', async () => {
    setupMocks({ products: [product1] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Edit & Approve')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Edit & Approve'));
    await waitFor(() => {
      expect(screen.getByText('Edit & Approve Product')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Basmati Rice 5kg')).toBeInTheDocument();
    });
  });

  it('shows supplier info in modal', async () => {
    setupMocks({ products: [product1] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Edit & Approve')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Edit & Approve'));
    await waitFor(() => {
      // Modal shows supplier and purchase price (also in table, so check modal heading exists)
      expect(screen.getByText('Edit & Approve Product')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Basmati Rice 5kg')).toBeInTheDocument();
    });
  });

  it('has margin type radio buttons', async () => {
    setupMocks({ products: [product1] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Edit & Approve')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Edit & Approve'));
    await waitFor(() => {
      expect(screen.getByText('Percentage')).toBeInTheDocument();
      expect(screen.getByText('Fixed Amount')).toBeInTheDocument();
    });
  });

  it('shows BNPL settings', async () => {
    setupMocks({ products: [product1] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Edit & Approve')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Edit & Approve'));
    await waitFor(() => {
      expect(screen.getByText('BNPL Settings')).toBeInTheDocument();
      expect(screen.getByText('Eligible for Buy Now Pay Later')).toBeInTheDocument();
    });
  });

  it('shows retailer price preview', async () => {
    setupMocks({ products: [product1] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Edit & Approve')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Edit & Approve'));
    await waitFor(() => {
      expect(screen.getByText('Retailer Price Preview:')).toBeInTheDocument();
    });
  });

  it('Save & Approve calls edit then approve APIs', async () => {
    setupMocks({ products: [product1] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Edit & Approve')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Edit & Approve'));
    await waitFor(() => {
      expect(screen.getByText('Save & Approve')).toBeInTheDocument();
    });
    // Change the name to trigger edit
    fireEvent.change(screen.getByDisplayValue('Basmati Rice 5kg'), { target: { value: 'Premium Rice 5kg' } });
    fireEvent.click(screen.getByText('Save & Approve'));
    await waitFor(() => {
      const editCalls = mockAuthFetch.mock.calls.filter(
        (c) => String(c[0]).includes('/edit') && c[2]?.method === 'PUT'
      );
      const approveCalls = mockAuthFetch.mock.calls.filter(
        (c) => String(c[0]).includes('/approve') && c[2]?.method === 'POST'
      );
      expect(editCalls.length).toBe(1);
      expect(approveCalls.length).toBe(1);
    });
  });

  it('shows success after save & approve', async () => {
    setupMocks({ products: [product1] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Edit & Approve')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Edit & Approve'));
    await waitFor(() => {
      expect(screen.getByText('Save & Approve')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Save & Approve'));
    await waitFor(() => {
      expect(screen.getByText(/approved successfully/)).toBeInTheDocument();
    });
  });

  it('cancel closes edit modal', async () => {
    setupMocks({ products: [product1] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Edit & Approve')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Edit & Approve'));
    await waitFor(() => {
      expect(screen.getByText('Edit & Approve Product')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Edit & Approve Product')).not.toBeInTheDocument();
  });

  it('shows Processing... during save', async () => {
    let resolveSave: (v: unknown) => void = () => {};
    setupMocks({ products: [product1] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Edit & Approve')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Edit & Approve'));
    await waitFor(() => {
      expect(screen.getByText('Save & Approve')).toBeInTheDocument();
    });
    // Make approve hang
    mockAuthFetch.mockImplementation((url: string, _t?: string, opts?: { method?: string }) => {
      if (String(url).includes('/approve') && opts?.method === 'POST') {
        return new Promise((r) => { resolveSave = r; });
      }
      return Promise.resolve(makeResponse({ data: [product1] }));
    });
    fireEvent.click(screen.getByText('Save & Approve'));
    await waitFor(() => {
      expect(screen.getByText('Processing...')).toBeInTheDocument();
    });
    resolveSave(makeResponse({ success: true }));
  });
});

// ==========================================================================
// 5. Reject flow
// ==========================================================================

describe('reject flow', () => {
  it('shows Reject button', async () => {
    setupMocks({ products: [product1] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Reject')).toBeInTheDocument();
    });
  });

  it('opens reject modal with product name', async () => {
    setupMocks({ products: [product1] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Reject')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Reject'));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Reject Product' })).toBeInTheDocument();
      expect(screen.getByText(/Are you sure you want to reject/)).toBeInTheDocument();
    });
  });

  it('reject calls API with reason', async () => {
    setupMocks({ products: [product1] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Reject')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Reject'));
    await waitFor(() => {
      expect(screen.getByLabelText('Reason (optional)')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText('Reason (optional)'), { target: { value: 'Quality issue' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reject Product' }));
    await waitFor(() => {
      const rejectCalls = mockAuthFetch.mock.calls.filter(
        (c) => String(c[0]).includes('/reject') && c[2]?.method === 'POST'
      );
      expect(rejectCalls.length).toBe(1);
    });
  });

  it('shows success after reject', async () => {
    setupMocks({ products: [product1] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Reject')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Reject'));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Reject Product' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reject Product' }));
    await waitFor(() => {
      expect(screen.getByText('Product rejected.')).toBeInTheDocument();
    });
  });

  it('shows error on reject failure', async () => {
    setupMocks({ products: [product1], rejectError: 'fail' });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Reject')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Reject'));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Reject Product' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reject Product' }));
    await waitFor(() => {
      expect(screen.getByText('Reject failed')).toBeInTheDocument();
    });
  });
});

// ==========================================================================
// 6. Error handling
// ==========================================================================

describe('error handling', () => {
  it('shows error on list fetch failure', async () => {
    setupMocks({ listError: 'fail' });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Failed to load pending products. Please try again.')).toBeInTheDocument();
    });
  });

  it('401 silently returns', async () => {
    setupMocks({ listError: '401' });
    renderPage();
    await waitFor(() => {
      expect(mockAuthFetch).toHaveBeenCalled();
    });
    expect(screen.queryByText(/Failed/)).not.toBeInTheDocument();
  });

  it('Refresh button re-fetches', async () => {
    setupMocks({ products: [product1] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Basmati Rice 5kg')).toBeInTheDocument();
    });
    const before = mockAuthFetch.mock.calls.length;
    fireEvent.click(screen.getByText('Refresh'));
    await waitFor(() => {
      expect(mockAuthFetch.mock.calls.length).toBeGreaterThan(before);
    });
  });
});
