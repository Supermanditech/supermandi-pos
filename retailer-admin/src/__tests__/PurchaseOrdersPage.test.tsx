import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PurchaseOrdersPage from '../pages/PurchaseOrdersPage';

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

vi.mock('../components/EmptyState', () => ({
  default: ({ title, description }: { title: string; description: string }) => (
    <div data-testid="empty-state"><h3>{title}</h3><p>{description}</p></div>
  ),
}));

vi.mock('../components/Modal', () => ({
  default: ({ isOpen, title, children }: { isOpen: boolean; title: string; children: React.ReactNode }) =>
    isOpen ? <div data-testid="modal"><h3>{title}</h3>{children}</div> : null,
}));

vi.mock('../components/WhatsAppIcon', () => ({
  WhatsAppIcon: () => <span data-testid="whatsapp-icon">WA</span>,
}));

vi.mock('../hooks/useUrlState', () => ({
  useUrlState: (_key: string, defaultValue: string = '') => {
    const { useState } = require('react');
    return useState(defaultValue);
  },
}));

vi.mock('lucide-react', () => ({
  Truck: () => <span data-testid="icon-truck">TruckIcon</span>,
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
    <MemoryRouter initialEntries={['/s/TEST/purchase-orders']}>
      <Routes>
        <Route path="/s/:storeCode/purchase-orders" element={<PurchaseOrdersPage />} />
      </Routes>
    </MemoryRouter>
  );
}

function makeResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: () => Promise.resolve(body) };
}

const po1 = {
  id: 'po-1', poNumber: 'PO-001', supplierId: 's1', supplierName: 'Fresh Farms',
  orderDate: '2026-01-15', totalMinor: 500000, status: 'submitted',
  itemsCount: 5, createdAt: '2026-01-15',
};

const po2 = {
  id: 'po-2', poNumber: 'PO-002', supplierId: 's2', supplierName: 'Veggie World',
  orderDate: '2026-01-20', expectedDeliveryDate: '2026-01-25',
  totalMinor: 120000, status: 'delivered', itemsCount: 3, createdAt: '2026-01-20',
};

const poCancelled = {
  id: 'po-3', poNumber: 'PO-003', supplierId: 's1', supplierName: 'Fresh Farms',
  orderDate: '2026-02-01', totalMinor: 0, status: 'cancelled',
  itemsCount: 0, createdAt: '2026-02-01',
};

const poPartial = {
  id: 'po-4', poNumber: 'PO-004', supplierId: 's3', supplierName: 'Daily Dairy',
  orderDate: '2026-02-10', totalMinor: 75000, status: 'partial_received',
  itemsCount: 2, createdAt: '2026-02-10',
};

const poDetailWithItems = {
  ...po1,
  supplierPhone: '9876543210',
  notes: 'Deliver before noon',
  items: [
    { id: 'li-1', productName: 'Rice 5kg', barcode: '1234567890', quantity: 10, unit: 'bags', unitPriceMinor: 25000, totalMinor: 250000 },
    { id: 'li-2', productName: 'Dal 1kg', quantity: 5, unit: 'packs', unitPriceMinor: 10000, totalMinor: 50000 },
  ],
};

const poDetailNoPhone = {
  ...po2,
  items: [
    { id: 'li-3', productName: 'Tomato', quantity: 20, unit: 'kg', unitPriceMinor: 4000, totalMinor: 80000 },
  ],
};

type MockConfig = {
  orders?: any[];
  total?: number;
  listError?: 'fail' | 'network' | '401';
  detail?: any;
  detailError?: 'fail' | 'network';
};

function setupMocks(config: MockConfig = {}) {
  const {
    orders = [],
    total,
    listError,
    detail = poDetailWithItems,
    detailError,
  } = config;

  mockAuthFetch.mockImplementation((url: string) => {
    // GET list
    if (url.includes('/purchase-orders?')) {
      if (listError === 'network') return Promise.reject(new Error('Network error'));
      if (listError === 'fail') return Promise.resolve(makeResponse({}, false, 500));
      if (listError === '401') return Promise.resolve(makeResponse({}, false, 401));
      return Promise.resolve(makeResponse({ success: true, data: orders, total: total ?? orders.length }));
    }
    // GET detail /purchase-orders/:id
    const detailMatch = url.match(/\/purchase-orders\/([^?]+)$/);
    if (detailMatch) {
      if (detailError === 'network') return Promise.reject(new Error('Network error'));
      if (detailError === 'fail') return Promise.resolve(makeResponse({}, false, 500));
      return Promise.resolve(makeResponse({ success: true, data: detail }));
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
  it('renders breadcrumb and page title', async () => {
    setupMocks();
    renderPage();
    expect(screen.getByTestId('breadcrumb')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Purchase Orders' })).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText('Loading purchase orders...')).toBeInTheDocument();
  });

  it('shows status filter and search input', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByLabelText('Filter purchase orders by status')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search by supplier name...')).toBeInTheDocument();
  });

  it('fetches orders on mount', () => {
    setupMocks();
    renderPage();
    const urls = mockAuthFetch.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('/purchase-orders?'))).toBe(true);
  });
});

// ==========================================================================
// 2. Order list
// ==========================================================================

describe('order list', () => {
  it('shows empty state when no orders', async () => {
    setupMocks({ orders: [] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('No purchase orders yet')).toBeInTheDocument();
    });
  });

  it('renders orders table with data', async () => {
    setupMocks({ orders: [po1, po2] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('PO-001')).toBeInTheDocument();
      expect(screen.getByText('Fresh Farms')).toBeInTheDocument();
      expect(screen.getByText('PO-002')).toBeInTheDocument();
      expect(screen.getByText('Veggie World')).toBeInTheDocument();
    });
  });

  it('shows table headers', async () => {
    setupMocks({ orders: [po1] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('PO #')).toBeInTheDocument();
      expect(screen.getByText('Supplier')).toBeInTheDocument();
      expect(screen.getByText('Order Date')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
    });
  });

  it('formats currency (paise to INR)', async () => {
    setupMocks({ orders: [po1] });
    renderPage();
    await waitFor(() => {
      // 500000 paise = ₹5,000.00
      expect(screen.getByText(/5,000\.00/)).toBeInTheDocument();
    });
  });

  it('shows status badge text with formatted status', async () => {
    setupMocks({ orders: [poPartial] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Partial Received')).toBeInTheDocument();
    });
  });

  it('shows items count', async () => {
    setupMocks({ orders: [po1] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('5')).toBeInTheDocument();
    });
  });

  it('shows View button for each order', async () => {
    setupMocks({ orders: [po1] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('View')).toBeInTheDocument();
    });
  });

  it('shows order count text', async () => {
    setupMocks({ orders: [po1, po2], total: 2 });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('2 orders')).toBeInTheDocument();
    });
  });

  it('shows singular "order" for count of 1', async () => {
    setupMocks({ orders: [po1], total: 1 });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('1 order')).toBeInTheDocument();
    });
  });

  it('shows dash for missing expected delivery date', async () => {
    // po1 has no expectedDeliveryDate
    setupMocks({ orders: [po1] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('PO-001')).toBeInTheDocument();
    });
    // The Expected Delivery column should show '-'
    const dashes = screen.getAllByText('-');
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });
});

// ==========================================================================
// 3. Filters
// ==========================================================================

describe('filters', () => {
  it('filter dropdown has all status options', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    const select = screen.getByLabelText('Filter purchase orders by status');
    expect(select).toBeInTheDocument();
    // Check options exist
    expect(screen.getByDisplayValue('All Statuses')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('Confirmed')).toBeInTheDocument();
    expect(screen.getByText('Shipped')).toBeInTheDocument();
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
  });

  it('changing status filter re-fetches orders', async () => {
    setupMocks({ orders: [po1] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('PO-001')).toBeInTheDocument();
    });
    const before = mockAuthFetch.mock.calls.length;
    fireEvent.change(screen.getByLabelText('Filter purchase orders by status'), { target: { value: 'delivered' } });
    await waitFor(() => {
      expect(mockAuthFetch.mock.calls.length).toBeGreaterThan(before);
    });
  });

  it('search input re-fetches on change', async () => {
    setupMocks({ orders: [po1] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('PO-001')).toBeInTheDocument();
    });
    const before = mockAuthFetch.mock.calls.length;
    fireEvent.change(screen.getByPlaceholderText('Search by supplier name...'), { target: { value: 'Fresh' } });
    await waitFor(() => {
      expect(mockAuthFetch.mock.calls.length).toBeGreaterThan(before);
    });
  });

  it('shows different empty state message when filters active', async () => {
    setupMocks({ orders: [] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('No purchase orders yet')).toBeInTheDocument();
    });
    // Change filter to trigger "no matching" message
    fireEvent.change(screen.getByLabelText('Filter purchase orders by status'), { target: { value: 'shipped' } });
    await waitFor(() => {
      expect(screen.getByText('No matching purchase orders')).toBeInTheDocument();
    });
  });
});

// ==========================================================================
// 4. Pagination
// ==========================================================================

describe('pagination', () => {
  it('shows pagination when total > limit', async () => {
    setupMocks({ orders: [po1], total: 25 });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Prev')).toBeInTheDocument();
      expect(screen.getByText('Next')).toBeInTheDocument();
      expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    });
  });

  it('hides pagination when total <= limit', async () => {
    setupMocks({ orders: [po1], total: 5 });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('PO-001')).toBeInTheDocument();
    });
    expect(screen.queryByText('Prev')).not.toBeInTheDocument();
  });

  it('Prev disabled on first page', async () => {
    setupMocks({ orders: [po1], total: 25 });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Prev')).toBeInTheDocument();
    });
    expect((screen.getByText('Prev') as HTMLButtonElement).disabled).toBe(true);
  });

  it('Next navigates to page 2', async () => {
    setupMocks({ orders: [po1], total: 25 });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Next')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => {
      expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
    });
  });

  it('Next disabled on last page', async () => {
    setupMocks({ orders: [po1], total: 25 });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Next')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => {
      expect((screen.getByText('Next') as HTMLButtonElement).disabled).toBe(true);
    });
  });
});

// ==========================================================================
// 5. Detail modal
// ==========================================================================

describe('detail modal', () => {
  it('opens modal on row click', async () => {
    setupMocks({ orders: [po1] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('PO-001')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('PO-001'));
    await waitFor(() => {
      expect(screen.getByTestId('modal')).toBeInTheDocument();
    });
  });

  it('opens modal on View button click', async () => {
    setupMocks({ orders: [po1] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('View')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('View'));
    await waitFor(() => {
      expect(screen.getByTestId('modal')).toBeInTheDocument();
    });
  });

  it('shows PO detail data in modal', async () => {
    setupMocks({ orders: [po1], detail: poDetailWithItems });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('PO-001')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('View'));
    await waitFor(() => {
      expect(screen.getByText(/PO: PO-001/)).toBeInTheDocument();
      expect(screen.getByText('Deliver before noon')).toBeInTheDocument();
    });
  });

  it('shows line items table in modal', async () => {
    setupMocks({ orders: [po1], detail: poDetailWithItems });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('PO-001')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('View'));
    await waitFor(() => {
      expect(screen.getByText('Line Items')).toBeInTheDocument();
      expect(screen.getByText('Rice 5kg')).toBeInTheDocument();
      expect(screen.getByText('Dal 1kg')).toBeInTheDocument();
      expect(screen.getByText('(1234567890)')).toBeInTheDocument();
    });
  });

  it('shows WhatsApp button when supplier has phone', async () => {
    setupMocks({ orders: [po1], detail: poDetailWithItems });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('PO-001')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('View'));
    await waitFor(() => {
      expect(screen.getByText('WhatsApp Follow-up')).toBeInTheDocument();
    });
  });

  it('hides WhatsApp button when no phone', async () => {
    setupMocks({ orders: [po2], detail: poDetailNoPhone });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('PO-002')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('PO-002'));
    await waitFor(() => {
      expect(screen.getByTestId('modal')).toBeInTheDocument();
      expect(screen.getByText('Tomato')).toBeInTheDocument();
    });
    expect(screen.queryByText('WhatsApp Follow-up')).not.toBeInTheDocument();
  });

  it('shows detail loading state', async () => {
    setupMocks({ orders: [po1] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('PO-001')).toBeInTheDocument();
    });
    // Make detail request hang
    mockAuthFetch.mockImplementation((url: string) => {
      if (String(url).match(/\/purchase-orders\/[^?]+$/)) return new Promise(() => {});
      return Promise.resolve(makeResponse({ success: true, data: [po1], total: 1 }));
    });
    fireEvent.click(screen.getByText('View'));
    await waitFor(() => {
      expect(screen.getByText('Loading purchase order details...')).toBeInTheDocument();
    });
  });

  it('shows error in modal on detail fetch failure', async () => {
    setupMocks({ orders: [po1], detailError: 'fail' });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('PO-001')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('View'));
    await waitFor(() => {
      expect(screen.getByText('Failed to load PO detail')).toBeInTheDocument();
      expect(screen.getByText('Please try again.')).toBeInTheDocument();
    });
  });
});

// ==========================================================================
// 6. Error handling
// ==========================================================================

describe('error handling', () => {
  it('shows error with retry button on list failure', async () => {
    setupMocks({ listError: 'fail' });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Failed to load purchase orders/)).toBeInTheDocument();
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });
  });

  it('shows network error message', async () => {
    setupMocks({ listError: 'network' });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('retry button re-fetches orders', async () => {
    setupMocks({ listError: 'fail' });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });
    const before = mockAuthFetch.mock.calls.length;
    fireEvent.click(screen.getByText('Retry'));
    await waitFor(() => {
      expect(mockAuthFetch.mock.calls.length).toBeGreaterThan(before);
    });
  });

  it('401 silently returns without error', async () => {
    setupMocks({ listError: '401' });
    renderPage();
    // Wait for fetch to complete
    await waitFor(() => {
      expect(mockAuthFetch).toHaveBeenCalled();
    });
    // Should not show any error
    expect(screen.queryByText(/Failed/)).not.toBeInTheDocument();
  });
});

// ==========================================================================
// 7. Edge cases
// ==========================================================================

describe('edge cases', () => {
  it('handles all status types', async () => {
    setupMocks({ orders: [po1, po2, poCancelled, poPartial] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Submitted')).toBeInTheDocument();
      expect(screen.getByText('Delivered')).toBeInTheDocument();
      expect(screen.getByText('Cancelled')).toBeInTheDocument();
      expect(screen.getByText('Partial Received')).toBeInTheDocument();
    });
  });

  it('shows 0 orders count', async () => {
    setupMocks({ orders: [], total: 0 });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('0 orders')).toBeInTheDocument();
    });
  });
});
