import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SupplierQueuePage from '../pages/admin/SupplierQueuePage';

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

vi.mock('../lib/formatters', () => ({
  formatDateTime: (d: string) => `formatted:${d}`,
}));

vi.mock('../lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
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
    <MemoryRouter initialEntries={['/s/TEST/admin/supplier-queue']}>
      <Routes>
        <Route path="/s/:storeCode/admin/supplier-queue" element={<SupplierQueuePage />} />
      </Routes>
    </MemoryRouter>
  );
}

function makeResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: () => Promise.resolve(body) };
}

const supplier1 = {
  id: 'sup-1',
  businessName: 'Fresh Farms',
  gstin: '22AAAAA0000A1Z5',
  email: 'fresh@farms.com',
  phone: '9876543210',
  createdAt: '2026-03-01T10:00:00Z',
  productCount: 15,
};

const supplier2 = {
  id: 'sup-2',
  businessName: 'Veggie World',
  gstin: null,
  email: null,
  phone: null,
  createdAt: '2026-03-05T14:00:00Z',
  productCount: 0,
};

type MockConfig = {
  suppliers?: any[];
  listError?: 'fail' | 'network' | '401';
  approveError?: 'fail';
  rejectError?: 'fail';
};

function setupMocks(config: MockConfig = {}) {
  const { suppliers = [], listError, approveError, rejectError } = config;

  mockAuthFetch.mockImplementation((url: string, _token?: string, options?: { method?: string }) => {
    const method = options?.method || 'GET';

    // GET pending
    if (url.includes('/admin/suppliers/pending') && method === 'GET') {
      if (listError === 'network') return Promise.reject(new Error('Network error'));
      if (listError === 'fail') return Promise.resolve(makeResponse({}, false, 500));
      if (listError === '401') return Promise.resolve(makeResponse({}, false, 401));
      return Promise.resolve(makeResponse({ data: suppliers }));
    }

    // POST approve
    if (url.match(/\/suppliers\/[^/]+\/approve/) && method === 'POST') {
      if (approveError === 'fail') return Promise.resolve(makeResponse({ error: 'Approve failed' }, false, 500));
      return Promise.resolve(makeResponse({ success: true }));
    }

    // POST reject
    if (url.match(/\/suppliers\/[^/]+\/reject/) && method === 'POST') {
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
    expect(screen.getByRole('heading', { name: 'Supplier Approval Queue' })).toBeInTheDocument();
  });

  it('shows loading state', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText('Loading pending suppliers...')).toBeInTheDocument();
  });

  it('shows Refresh button', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText('Refresh')).toBeInTheDocument();
  });

  it('fetches pending suppliers on mount', () => {
    setupMocks();
    renderPage();
    const urls = mockAuthFetch.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('/admin/suppliers/pending'))).toBe(true);
  });
});

// ==========================================================================
// 2. Supplier list
// ==========================================================================

describe('supplier list', () => {
  it('shows empty state when no pending suppliers', async () => {
    setupMocks({ suppliers: [] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('No pending supplier approvals.')).toBeInTheDocument();
    });
  });

  it('renders supplier table with data', async () => {
    setupMocks({ suppliers: [supplier1] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Fresh Farms')).toBeInTheDocument();
      expect(screen.getByText('22AAAAA0000A1Z5')).toBeInTheDocument();
      expect(screen.getByText('9876543210')).toBeInTheDocument();
      expect(screen.getByText('fresh@farms.com')).toBeInTheDocument();
    });
  });

  it('shows table headers', async () => {
    setupMocks({ suppliers: [supplier1] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Business Name')).toBeInTheDocument();
      expect(screen.getByText('GSTIN')).toBeInTheDocument();
      expect(screen.getByText('Contact')).toBeInTheDocument();
      expect(screen.getByText('Products')).toBeInTheDocument();
      expect(screen.getByText('Requested')).toBeInTheDocument();
      expect(screen.getByText('Actions')).toBeInTheDocument();
    });
  });

  it('shows product count badge', async () => {
    setupMocks({ suppliers: [supplier1] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('15 products')).toBeInTheDocument();
    });
  });

  it('shows dash for null GSTIN', async () => {
    setupMocks({ suppliers: [supplier2] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Veggie World')).toBeInTheDocument();
    });
    expect(screen.getByText('-')).toBeInTheDocument();
  });

  it('shows pending approvals count', async () => {
    setupMocks({ suppliers: [supplier1, supplier2] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('Pending Approvals')).toBeInTheDocument();
    });
  });

  it('shows formatted date', async () => {
    setupMocks({ suppliers: [supplier1] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('formatted:2026-03-01T10:00:00Z')).toBeInTheDocument();
    });
  });
});

// ==========================================================================
// 3. Approve flow
// ==========================================================================

describe('approve flow', () => {
  it('shows Approve button for each supplier', async () => {
    setupMocks({ suppliers: [supplier1] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Approve')).toBeInTheDocument();
    });
  });

  it('calls approve API on click', async () => {
    setupMocks({ suppliers: [supplier1] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Approve')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Approve'));
    await waitFor(() => {
      const approveCalls = mockAuthFetch.mock.calls.filter(
        (c) => String(c[0]).includes('/approve') && c[2]?.method === 'POST'
      );
      expect(approveCalls.length).toBe(1);
      expect(approveCalls[0][0]).toContain('sup-1');
    });
  });

  it('shows success message after approve', async () => {
    setupMocks({ suppliers: [supplier1] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Approve')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Approve'));
    await waitFor(() => {
      expect(screen.getByText('Supplier approved successfully!')).toBeInTheDocument();
    });
  });

  it('shows error on approve failure', async () => {
    setupMocks({ suppliers: [supplier1], approveError: 'fail' });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Approve')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Approve'));
    await waitFor(() => {
      expect(screen.getByText('Approve failed')).toBeInTheDocument();
    });
  });

  it('re-fetches after successful approve', async () => {
    setupMocks({ suppliers: [supplier1] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Approve')).toBeInTheDocument();
    });
    const before = mockAuthFetch.mock.calls.filter((c) => String(c[0]).includes('/pending')).length;
    fireEvent.click(screen.getByText('Approve'));
    await waitFor(() => {
      const after = mockAuthFetch.mock.calls.filter((c) => String(c[0]).includes('/pending')).length;
      expect(after).toBeGreaterThan(before);
    });
  });
});

// ==========================================================================
// 4. Reject flow
// ==========================================================================

describe('reject flow', () => {
  it('shows Reject button', async () => {
    setupMocks({ suppliers: [supplier1] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Reject')).toBeInTheDocument();
    });
  });

  it('opens reject modal on click', async () => {
    setupMocks({ suppliers: [supplier1] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Reject')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Reject'));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Reject Supplier' })).toBeInTheDocument();
      expect(screen.getByText(/Are you sure you want to reject/)).toBeInTheDocument();
    });
  });

  it('reject modal has reason textarea', async () => {
    setupMocks({ suppliers: [supplier1] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Reject')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Reject'));
    await waitFor(() => {
      expect(screen.getByLabelText('Reason (optional)')).toBeInTheDocument();
    });
  });

  it('calls reject API with reason', async () => {
    setupMocks({ suppliers: [supplier1] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Reject')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Reject'));
    await waitFor(() => {
      expect(screen.getByLabelText('Reason (optional)')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText('Reason (optional)'), { target: { value: 'Incomplete docs' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reject Supplier' }));
    await waitFor(() => {
      const rejectCalls = mockAuthFetch.mock.calls.filter(
        (c) => String(c[0]).includes('/reject') && c[2]?.method === 'POST'
      );
      expect(rejectCalls.length).toBe(1);
    });
  });

  it('shows success message after reject', async () => {
    setupMocks({ suppliers: [supplier1] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Reject')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Reject'));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Reject Supplier' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reject Supplier' }));
    await waitFor(() => {
      expect(screen.getByText('Supplier rejected.')).toBeInTheDocument();
    });
  });

  it('shows error on reject failure', async () => {
    setupMocks({ suppliers: [supplier1], rejectError: 'fail' });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Reject')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Reject'));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Reject Supplier' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reject Supplier' }));
    await waitFor(() => {
      expect(screen.getByText('Reject failed')).toBeInTheDocument();
    });
  });

  it('cancel button closes reject modal', async () => {
    setupMocks({ suppliers: [supplier1] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Reject')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Reject'));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Reject Supplier' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Are you sure you want to reject')).not.toBeInTheDocument();
  });

  it('shows Rejecting... during action', async () => {
    let resolveReject: (v: unknown) => void = () => {};
    setupMocks({ suppliers: [supplier1] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Reject')).toBeInTheDocument();
    });
    // Override reject mock to hang
    mockAuthFetch.mockImplementation((url: string, _t?: string, opts?: { method?: string }) => {
      if (String(url).includes('/reject') && opts?.method === 'POST') {
        return new Promise((r) => { resolveReject = r; });
      }
      return Promise.resolve(makeResponse({ data: [supplier1] }));
    });
    fireEvent.click(screen.getByText('Reject'));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Reject Supplier' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reject Supplier' }));
    await waitFor(() => {
      expect(screen.getByText('Rejecting...')).toBeInTheDocument();
    });
    resolveReject(makeResponse({ success: true }));
  });
});

// ==========================================================================
// 5. Refresh
// ==========================================================================

describe('refresh', () => {
  it('Refresh button re-fetches suppliers', async () => {
    setupMocks({ suppliers: [supplier1] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Fresh Farms')).toBeInTheDocument();
    });
    const before = mockAuthFetch.mock.calls.length;
    fireEvent.click(screen.getByText('Refresh'));
    await waitFor(() => {
      expect(mockAuthFetch.mock.calls.length).toBeGreaterThan(before);
    });
  });

  it('Refresh disabled during loading', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect((screen.getByText('Refresh') as HTMLButtonElement).disabled).toBe(true);
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
      expect(screen.getByText('Failed to load pending suppliers. Please try again.')).toBeInTheDocument();
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
});
