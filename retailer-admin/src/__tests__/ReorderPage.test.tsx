import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ReorderPage from '../pages/ReorderPage';

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

vi.mock('lucide-react', () => ({
  PackageCheck: () => <span data-testid="icon-package-check">PackageCheckIcon</span>,
  RefreshCw: ({ className }: { className?: string }) => <span className={className} data-testid="icon-refresh">RefreshIcon</span>,
  Settings: () => <span data-testid="icon-settings">SettingsIcon</span>,
  AlertTriangle: () => <span data-testid="icon-alert">AlertIcon</span>,
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
    <MemoryRouter initialEntries={['/s/store-1/reorder']}>
      <Routes>
        <Route path="/s/:storeCode/reorder" element={<ReorderPage />} />
      </Routes>
    </MemoryRouter>
  );
}

function makeResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: () => Promise.resolve(body) };
}

const settingsData = {
  reorderEnabled: true,
  requireApproval: true,
  notifyOnLowStock: true,
  autoApproveThreshold: 5000,
  defaultLeadDays: 3,
  updatedAt: '2026-03-10T08:00:00Z',
  storeId: 'store-1',
};

const suggestion1 = {
  storeProductId: 'sp1',
  productId: 'p1',
  productName: 'Rice 5kg',
  category: 'Grocery',
  unit: 'kg',
  currentStock: 2,
  minStock: 10,
  targetStock: 50,
  maxReorderQty: 100,
  purchasePrice: 25000,
  sellPrice: 30000,
};

const suggestion0Stock = {
  storeProductId: 'sp2',
  productId: 'p2',
  productName: 'Sugar 1kg',
  category: null,
  unit: null,
  currentStock: 0,
  minStock: 5,
  targetStock: 20,
  maxReorderQty: null,
  purchasePrice: null,
  sellPrice: null,
};

const pendingReorder1 = {
  id: 'pr1',
  storeId: 'store-1',
  productId: 'p1',
  productName: 'Rice 5kg',
  currentStock: 2,
  minThreshold: 10,
  targetStock: 50,
  suggestedQuantity: 48,
  supplierName: 'Fresh Farms',
  unitPrice: 25000,
  status: 'pending',
  expiresAt: '2026-03-15T00:00:00Z',
  createdAt: '2026-03-10T08:00:00Z',
};

const pendingFulfilled = {
  ...pendingReorder1,
  id: 'pr2',
  status: 'fulfilled',
  productName: 'Dal 1kg',
  supplierName: null,
  unitPrice: null,
};

type MockConfig = {
  suggestions?: any[];
  suggestionsError?: 'fail' | 'network';
  settings?: any;
  settingsError?: 'fail' | 'network' | '401';
  settingsSaveError?: 'fail' | 'network';
  pending?: any[];
  pendingError?: 'fail' | 'network';
};

function setupMocks(config: MockConfig = {}) {
  const {
    suggestions = [],
    suggestionsError,
    settings = settingsData,
    settingsError,
    settingsSaveError,
    pending = [],
    pendingError,
  } = config;

  mockAuthFetch.mockImplementation((url: string, _token?: string, options?: { method?: string; body?: string }) => {
    const method = options?.method || 'GET';

    // GET settings
    if (url.includes('/reorder/settings') && method === 'GET') {
      if (settingsError === 'network') return Promise.reject(new Error('Network error'));
      if (settingsError === 'fail') return Promise.resolve(makeResponse({}, false, 500));
      if (settingsError === '401') return Promise.resolve(makeResponse({}, false, 401));
      return Promise.resolve(makeResponse({ data: settings }));
    }

    // PUT settings
    if (url.includes('/reorder/settings') && method === 'PUT') {
      if (settingsSaveError === 'network') return Promise.reject(new Error('Save failed'));
      if (settingsSaveError === 'fail') return Promise.resolve(makeResponse({}, false, 500));
      return Promise.resolve(makeResponse({ data: settings }));
    }

    // GET suggestions
    if (url.includes('/reorder/suggestions')) {
      if (suggestionsError === 'network') return Promise.reject(new Error('Network error'));
      if (suggestionsError === 'fail') return Promise.resolve(makeResponse({}, false, 500));
      return Promise.resolve(makeResponse({ data: suggestions, total: suggestions.length }));
    }

    // GET pending
    if (url.includes('/reorder/pending')) {
      if (pendingError === 'network') return Promise.reject(new Error('Network error'));
      if (pendingError === 'fail') return Promise.resolve(makeResponse({}, false, 500));
      return Promise.resolve(makeResponse({ data: pending }));
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
// 1. Initial render & breadcrumb
// ==========================================================================

describe('initial render', () => {
  it('renders breadcrumb and page title', async () => {
    setupMocks();
    renderPage();
    expect(screen.getByTestId('breadcrumb')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Reorder Suggestions' })).toBeInTheDocument();
    });
  });

  it('renders 3 tabs: Low Stock, Pending Reorders, Settings', async () => {
    setupMocks();
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Low Stock/ })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Pending Reorders/ })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Settings/ })).toBeInTheDocument();
    });
  });

  it('starts on the suggestions tab', async () => {
    setupMocks();
    renderPage();
    await waitFor(() => {
      const sugTab = screen.getByRole('tab', { name: /Low Stock/ });
      expect(sugTab.getAttribute('aria-selected')).toBe('true');
    });
  });

  it('fetches settings and suggestions on mount', () => {
    setupMocks();
    renderPage();
    const urls = mockAuthFetch.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('/reorder/settings'))).toBe(true);
    expect(urls.some((u) => u.includes('/reorder/suggestions'))).toBe(true);
  });
});

// ==========================================================================
// 2. Suggestions tab
// ==========================================================================

describe('suggestions tab', () => {
  it('shows empty state when no suggestions', async () => {
    setupMocks({ suggestions: [] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('All stocked up!')).toBeInTheDocument();
    });
  });

  it('renders suggestion table with product data', async () => {
    setupMocks({ suggestions: [suggestion1] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Rice 5kg')).toBeInTheDocument();
      expect(screen.getByText('Grocery')).toBeInTheDocument();
    });
  });

  it('shows danger color for zero-stock items', async () => {
    setupMocks({ suggestions: [suggestion0Stock] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Sugar 1kg')).toBeInTheDocument();
      expect(screen.getByText('0')).toBeInTheDocument();
    });
  });

  it('formats currency with rupee symbol', async () => {
    setupMocks({ suggestions: [suggestion1] });
    renderPage();
    await waitFor(() => {
      // purchasePrice=25000 -> 250.00
      expect(screen.getByText(/250\.00/)).toBeInTheDocument();
    });
  });

  it('shows dash for null values (category, maxReorderQty, prices)', async () => {
    setupMocks({ suggestions: [suggestion0Stock] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Sugar 1kg')).toBeInTheDocument();
    });
    // null category, null prices, null maxReorderQty -> dashes
    const cells = screen.getAllByText('\u2014');
    expect(cells.length).toBeGreaterThanOrEqual(3);
  });

  it('shows error banner when suggestions fetch fails', async () => {
    setupMocks({ suggestionsError: 'fail' });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Failed to fetch suggestions')).toBeInTheDocument();
    });
  });

  it('refresh button re-fetches suggestions', async () => {
    setupMocks({ suggestions: [suggestion1] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Rice 5kg')).toBeInTheDocument();
    });
    const before = mockAuthFetch.mock.calls.filter((c) => String(c[0]).includes('/suggestions')).length;
    fireEvent.click(screen.getByLabelText('Refresh reorder suggestions'));
    await waitFor(() => {
      const after = mockAuthFetch.mock.calls.filter((c) => String(c[0]).includes('/suggestions')).length;
      expect(after).toBeGreaterThan(before);
    });
  });

  it('refresh button disabled during loading', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    const btn = screen.getByLabelText('Refresh reorder suggestions') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('shows table headers', async () => {
    setupMocks({ suggestions: [suggestion1] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Product')).toBeInTheDocument();
      expect(screen.getByText('Category')).toBeInTheDocument();
      expect(screen.getByText('Current')).toBeInTheDocument();
      expect(screen.getByText('Min')).toBeInTheDocument();
      expect(screen.getByText('Target')).toBeInTheDocument();
    });
  });
});

// ==========================================================================
// 3. Pending tab
// ==========================================================================

describe('pending tab', () => {
  it('fetches pending reorders when switching to pending tab', async () => {
    setupMocks({ pending: [pendingReorder1] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Pending Reorders/ })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('tab', { name: /Pending Reorders/ }));
    await waitFor(() => {
      const calls = mockAuthFetch.mock.calls.filter((c) => String(c[0]).includes('/pending'));
      expect(calls.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows empty state when no pending reorders', async () => {
    setupMocks({ pending: [] });
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /Pending Reorders/ }));
    await waitFor(() => {
      expect(screen.getByText('No pending reorders')).toBeInTheDocument();
    });
  });

  it('renders pending reorder table with product data', async () => {
    setupMocks({ pending: [pendingReorder1] });
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /Pending Reorders/ }));
    await waitFor(() => {
      expect(screen.getByText('Rice 5kg')).toBeInTheDocument();
      expect(screen.getByText('Fresh Farms')).toBeInTheDocument();
      expect(screen.getByText('48')).toBeInTheDocument();
    });
  });

  it('shows status badge with correct class for pending', async () => {
    setupMocks({ pending: [pendingReorder1] });
    const { container } = renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /Pending Reorders/ }));
    await waitFor(() => {
      const badge = container.querySelector('.badge-warning');
      expect(badge).toBeTruthy();
      expect(badge!.textContent).toBe('pending');
    });
  });

  it('shows status badge with success class for fulfilled', async () => {
    setupMocks({ pending: [pendingFulfilled] });
    const { container } = renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /Pending Reorders/ }));
    await waitFor(() => {
      const badge = container.querySelector('.badge-success');
      expect(badge).toBeTruthy();
    });
  });

  it('shows dash for null supplier and null unitPrice', async () => {
    setupMocks({ pending: [pendingFulfilled] });
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /Pending Reorders/ }));
    await waitFor(() => {
      expect(screen.getByText('Dal 1kg')).toBeInTheDocument();
    });
    const dashes = screen.getAllByText('\u2014');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it('shows pending count in tab label', async () => {
    setupMocks({ pending: [pendingReorder1] });
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /Pending Reorders/ }));
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Pending Reorders \(1\)/ })).toBeInTheDocument();
    });
  });

  it('shows error on pending fetch failure', async () => {
    setupMocks({ pendingError: 'fail' });
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /Pending Reorders/ }));
    await waitFor(() => {
      expect(screen.getByText('Failed to fetch pending')).toBeInTheDocument();
    });
  });

  it('refresh button re-fetches pending list', async () => {
    setupMocks({ pending: [pendingReorder1] });
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /Pending Reorders/ }));
    await waitFor(() => {
      expect(screen.getByText('Rice 5kg')).toBeInTheDocument();
    });
    const before = mockAuthFetch.mock.calls.filter((c) => String(c[0]).includes('/pending')).length;
    fireEvent.click(screen.getByLabelText('Refresh pending reorders'));
    await waitFor(() => {
      const after = mockAuthFetch.mock.calls.filter((c) => String(c[0]).includes('/pending')).length;
      expect(after).toBeGreaterThan(before);
    });
  });

  it('shows loading state for pending tab', () => {
    mockAuthFetch.mockImplementation((url: string) => {
      if (String(url).includes('/pending')) return new Promise(() => {});
      return Promise.resolve(makeResponse({ data: settingsData }));
    });
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /Pending Reorders/ }));
    expect(screen.getByText('Loading pending reorders...')).toBeInTheDocument();
  });
});

// ==========================================================================
// 4. Settings tab
// ==========================================================================

describe('settings tab', () => {
  it('renders settings form with loaded values', async () => {
    setupMocks();
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /Settings/ }));
    await waitFor(() => {
      expect(screen.getByText('Enable reorder suggestions')).toBeInTheDocument();
      expect(screen.getByText('Require approval before creating POs')).toBeInTheDocument();
      expect(screen.getByText('Notify on low stock')).toBeInTheDocument();
    });
  });

  it('shows settings loading state', () => {
    mockAuthFetch.mockImplementation((url: string) => {
      if (String(url).includes('/settings')) return new Promise(() => {});
      return Promise.resolve(makeResponse({ data: [], total: 0 }));
    });
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /Settings/ }));
    expect(screen.getByText('Loading settings...')).toBeInTheDocument();
  });

  it('saves settings on click', async () => {
    setupMocks();
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /Settings/ }));
    await waitFor(() => {
      expect(screen.getByText('Save Settings')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Save Settings'));
    await waitFor(() => {
      const saveCalls = mockAuthFetch.mock.calls.filter(
        (c) => String(c[0]).includes('/reorder/settings') && c[2]?.method === 'PUT'
      );
      expect(saveCalls.length).toBe(1);
    });
  });

  it('shows success message after save', async () => {
    setupMocks();
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /Settings/ }));
    await waitFor(() => {
      expect(screen.getByText('Save Settings')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Save Settings'));
    await waitFor(() => {
      expect(screen.getByText('Reorder settings saved successfully')).toBeInTheDocument();
    });
  });

  it('shows error on save failure', async () => {
    setupMocks({ settingsSaveError: 'fail' });
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /Settings/ }));
    await waitFor(() => {
      expect(screen.getByText('Save Settings')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Save Settings'));
    await waitFor(() => {
      expect(screen.getByText('Failed to save settings')).toBeInTheDocument();
    });
  });

  it('validates lead days range (1-90)', async () => {
    setupMocks();
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /Settings/ }));
    await waitFor(() => {
      expect(screen.getByLabelText(/Default lead time/)).toBeInTheDocument();
    });
    const leadInput = screen.getByLabelText(/Default lead time/) as HTMLInputElement;
    fireEvent.change(leadInput, { target: { value: '0' } });
    fireEvent.click(screen.getByText('Save Settings'));
    await waitFor(() => {
      expect(screen.getByText('Lead days must be between 1 and 90')).toBeInTheDocument();
    });
  });

  it('validates negative auto-approve threshold', async () => {
    setupMocks();
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /Settings/ }));
    await waitFor(() => {
      expect(screen.getByLabelText(/Auto-approve threshold/)).toBeInTheDocument();
    });
    const threshInput = screen.getByLabelText(/Auto-approve threshold/) as HTMLInputElement;
    fireEvent.change(threshInput, { target: { value: '-1' } });
    fireEvent.click(screen.getByText('Save Settings'));
    await waitFor(() => {
      expect(screen.getByText('Auto-approve threshold cannot be negative')).toBeInTheDocument();
    });
  });

  it('shows error on settings fetch failure', async () => {
    setupMocks({ settingsError: 'fail' });
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /Settings/ }));
    await waitFor(() => {
      expect(screen.getByText('Failed to fetch settings')).toBeInTheDocument();
    });
  });

  it('disables inputs during save', async () => {
    let resolveSave: (v: unknown) => void = () => {};
    mockAuthFetch.mockImplementation((url: string, _t?: string, opts?: { method?: string }) => {
      if (String(url).includes('/settings') && opts?.method === 'PUT') {
        return new Promise((r) => { resolveSave = r; });
      }
      if (String(url).includes('/settings')) return Promise.resolve(makeResponse({ data: settingsData }));
      return Promise.resolve(makeResponse({ data: [], total: 0 }));
    });
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /Settings/ }));
    await waitFor(() => {
      expect(screen.getByText('Save Settings')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Save Settings'));
    await waitFor(() => {
      expect(screen.getByText('Saving...')).toBeInTheDocument();
    });
    // All checkboxes should be disabled
    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    checkboxes.forEach((cb) => expect(cb.disabled).toBe(true));
    resolveSave(makeResponse({ data: settingsData }));
  });
});

// ==========================================================================
// 5. Tab switching
// ==========================================================================

describe('tab switching', () => {
  it('switches between all three tabs', async () => {
    setupMocks({ suggestions: [suggestion1], pending: [pendingReorder1] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Rice 5kg')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('tab', { name: /Pending Reorders/ }));
    await waitFor(() => {
      expect(screen.getByText('Fresh Farms')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('tab', { name: /Settings/ }));
    await waitFor(() => {
      expect(screen.getByText('Save Settings')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('tab', { name: /Low Stock/ }));
    await waitFor(() => {
      expect(screen.getByText('Rice 5kg')).toBeInTheDocument();
    });
  });

  it('highlights active tab', async () => {
    setupMocks();
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('.reorder-tab--active')).toBeTruthy();
    });
  });
});

// ==========================================================================
// 6. Edge cases
// ==========================================================================

describe('edge cases', () => {
  it('401 on settings silently returns', async () => {
    setupMocks({ settingsError: '401' });
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /Settings/ }));
    // Should not show error for 401
    await waitFor(() => {
      expect(screen.queryByText(/Failed/)).not.toBeInTheDocument();
    });
  });

  it('handles empty settings data gracefully', async () => {
    setupMocks({ settings: null });
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /Settings/ }));
    await waitFor(() => {
      expect(screen.getByText('Save Settings')).toBeInTheDocument();
    });
    // No crash
  });
});
