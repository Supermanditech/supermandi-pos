import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NotificationsPage from '../pages/NotificationsPage';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let mockAccessToken: string | null = 'test-token';

vi.mock('../lib/AuthContext', () => ({
  useAuth: () => ({ token: mockAccessToken, accessToken: mockAccessToken }),
}));

vi.mock('lucide-react', () => ({
  Bell: ({ size }: { size: number }) => <span data-testid="icon-bell" data-size={size}>BellIcon</span>,
  Check: () => <span>CheckIcon</span>,
  CheckCheck: ({ size }: { size: number }) => <span data-size={size}>CheckCheckIcon</span>,
  RefreshCw: ({ size }: { size: number }) => <span data-size={size}>RefreshIcon</span>,
  AlertTriangle: () => <span data-testid="icon-alert">AlertIcon</span>,
  Package: () => <span data-testid="icon-package">PackageIcon</span>,
  CreditCard: () => <span data-testid="icon-credit">CreditCardIcon</span>,
  Truck: () => <span data-testid="icon-truck">TruckIcon</span>,
}));

vi.mock('../lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
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
      <NotificationsPage />
    </MemoryRouter>
  );
}

function makeResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: () => Promise.resolve(body) };
}

type MockConfig = {
  notifications?: any[];
  total?: number;
  listError?: 'fail' | 'network' | '401';
  markReadError?: 'fail' | 'network';
  markAllReadError?: 'fail' | 'network';
};

function setupMocks(config: MockConfig = {}) {
  const {
    notifications = [],
    total = notifications.length,
    listError,
    markReadError,
    markAllReadError,
  } = config;

  mockAuthFetch.mockImplementation((url: string, _token?: string, options?: { method?: string }) => {
    const method = options?.method || 'GET';

    // GET /notifications
    if (url.startsWith('/api/v1/retailer-admin/notifications?') && method === 'GET') {
      if (listError === 'network') return Promise.reject(new Error('Network error'));
      if (listError === 'fail') return Promise.resolve(makeResponse({}, false, 500));
      if (listError === '401') return Promise.resolve(makeResponse({}, false, 401));
      return Promise.resolve(makeResponse({ data: notifications, pagination: { total } }));
    }

    // PUT /notifications/read-all
    if (url === '/api/v1/retailer-admin/notifications/read-all' && method === 'PUT') {
      if (markAllReadError === 'network') return Promise.reject(new Error('Mark all failed'));
      if (markAllReadError === 'fail') return Promise.resolve(makeResponse({}, false, 500));
      return Promise.resolve(makeResponse({ success: true }));
    }

    // PUT /notifications/:id/read
    const readMatch = url.match(/\/notifications\/([^/]+)\/read$/);
    if (readMatch && method === 'PUT') {
      if (markReadError === 'network') return Promise.reject(new Error('Mark read failed'));
      if (markReadError === 'fail') return Promise.resolve(makeResponse({}, false, 500));
      return Promise.resolve(makeResponse({ success: true }));
    }

    return Promise.resolve(makeResponse({}));
  });
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const notifUnread = {
  id: 'n1',
  title: 'Order Update',
  body: 'Your order has shipped',
  type: 'order_status',
  isRead: false,
  readAt: null,
  createdAt: '2026-03-10T08:00:00Z',
  data: {},
};

const notifRead = {
  id: 'n2',
  title: 'Stock Alert',
  body: 'Low stock on Rice',
  type: 'stock_alert',
  isRead: true,
  readAt: '2026-03-10T09:00:00Z',
  createdAt: '2026-03-10T07:00:00Z',
  data: {},
};

const notifGrn = {
  id: 'n3',
  title: 'GRN Mismatch',
  body: 'Qty mismatch on PO-123',
  type: 'grn_mismatch',
  isRead: false,
  readAt: null,
  createdAt: '2026-03-10T06:00:00Z',
  data: {},
};

const notifPayment = {
  id: 'n4',
  title: 'Payment Due',
  body: 'Invoice overdue',
  type: 'payment_reminder',
  isRead: false,
  readAt: null,
  createdAt: '2026-03-10T05:00:00Z',
  data: {},
};

const notifDefault = {
  id: 'n5',
  title: 'General',
  body: 'System update',
  type: 'unknown_type',
  isRead: true,
  readAt: '2026-03-10T04:00:00Z',
  createdAt: '2026-03-10T03:00:00Z',
  data: {},
};

const notifGrnExcess = {
  id: 'n6',
  title: 'GRN Excess',
  body: 'Excess qty on PO-456',
  type: 'grn_excess',
  isRead: false,
  readAt: null,
  createdAt: '2026-03-10T02:00:00Z',
  data: {},
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockAccessToken = 'test-token';
  mockAuthFetch.mockReset();
});

// ==========================================================================
// 1. Auth guard
// ==========================================================================

describe('auth guard', () => {
  it('shows Loading... when accessToken is missing and skips fetch', () => {
    mockAccessToken = null;
    renderPage();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(mockAuthFetch).not.toHaveBeenCalled();
  });
});

// ==========================================================================
// 2. Initial render & loading
// ==========================================================================

describe('initial render', () => {
  it('renders page title "Notifications"', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText('Notifications')).toBeInTheDocument();
  });

  it('shows loading indicator while fetching', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText('Loading notifications...')).toBeInTheDocument();
  });

  it('calls notifications API on mount with default pagination', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(mockAuthFetch).toHaveBeenCalledWith(
      '/api/v1/retailer-admin/notifications?limit=20&offset=0',
      'test-token'
    );
  });

  it('shows subtitle with total count', async () => {
    setupMocks({ notifications: [notifUnread, notifRead], total: 2 });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/2 total/)).toBeInTheDocument();
    });
  });

  it('shows unread count in subtitle when unread exist', async () => {
    setupMocks({ notifications: [notifUnread, notifRead] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/1 unread/)).toBeInTheDocument();
    });
  });

  it('does not show unread count when all are read', async () => {
    setupMocks({ notifications: [notifRead] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/1 total/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/unread/)).not.toBeInTheDocument();
  });
});

// ==========================================================================
// 3. Empty state
// ==========================================================================

describe('empty state', () => {
  it('shows empty state with bell icon when no notifications', async () => {
    setupMocks({ notifications: [] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('No notifications yet')).toBeInTheDocument();
    });
    expect(screen.getByText("You'll see order updates, stock alerts, and payment reminders here.")).toBeInTheDocument();
  });

  it('does not show empty state when error is present', async () => {
    setupMocks({ listError: 'network' });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Failed to load notifications. Please try again.')).toBeInTheDocument();
    });
    expect(screen.queryByText('No notifications yet')).not.toBeInTheDocument();
  });
});

// ==========================================================================
// 4. Notification list rendering
// ==========================================================================

describe('notification list', () => {
  it('renders notification cards with title, body, and timestamp', async () => {
    setupMocks({ notifications: [notifUnread, notifRead] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Order Update')).toBeInTheDocument();
      expect(screen.getByText('Stock Alert')).toBeInTheDocument();
      expect(screen.getByText('Your order has shipped')).toBeInTheDocument();
      expect(screen.getByText('Low stock on Rice')).toBeInTheDocument();
    });
  });

  it('unread notifications have unread class and dot', async () => {
    setupMocks({ notifications: [notifUnread] });
    const { container } = renderPage();
    await waitFor(() => {
      expect(screen.getByText('Order Update')).toBeInTheDocument();
    });
    expect(container.querySelector('.notif-card--unread')).toBeTruthy();
    expect(container.querySelector('.notif-unread-dot')).toBeTruthy();
    expect(container.querySelector('.notif-card-title--unread')).toBeTruthy();
  });

  it('read notifications have no unread class or dot', async () => {
    setupMocks({ notifications: [notifRead] });
    const { container } = renderPage();
    await waitFor(() => {
      expect(screen.getByText('Stock Alert')).toBeInTheDocument();
    });
    expect(container.querySelector('.notif-card--unread')).toBeFalsy();
    expect(container.querySelector('.notif-unread-dot')).toBeFalsy();
  });

  it('renders type-specific icons: Truck for order_status', async () => {
    setupMocks({ notifications: [notifUnread] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('icon-truck')).toBeInTheDocument();
    });
  });

  it('renders type-specific icons: Package for stock_alert', async () => {
    setupMocks({ notifications: [notifRead] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('icon-package')).toBeInTheDocument();
    });
  });

  it('renders type-specific icons: AlertTriangle for grn_mismatch', async () => {
    setupMocks({ notifications: [notifGrn] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('icon-alert')).toBeInTheDocument();
    });
  });

  it('renders type-specific icons: AlertTriangle for grn_excess', async () => {
    setupMocks({ notifications: [notifGrnExcess] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('icon-alert')).toBeInTheDocument();
    });
  });

  it('renders type-specific icons: CreditCard for payment_reminder', async () => {
    setupMocks({ notifications: [notifPayment] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('icon-credit')).toBeInTheDocument();
    });
  });

  it('renders default Bell icon for unknown type', async () => {
    setupMocks({ notifications: [notifDefault] });
    renderPage();
    await waitFor(() => {
      const bells = screen.getAllByTestId('icon-bell');
      // One bell in header area (empty state icon) or card icon
      expect(bells.length).toBeGreaterThanOrEqual(1);
    });
  });
});

// ==========================================================================
// 5. Mark as read
// ==========================================================================

describe('mark as read', () => {
  it('clicking unread notification calls PUT /notifications/:id/read', async () => {
    setupMocks({ notifications: [notifUnread] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Order Update')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Order Update'));
    await waitFor(() => {
      const calls = mockAuthFetch.mock.calls.filter(
        (c) => String(c[0]).includes(`/notifications/${notifUnread.id}/read`) && c[2]?.method === 'PUT'
      );
      expect(calls.length).toBe(1);
    });
  });

  it('optimistically updates notification to read state', async () => {
    setupMocks({ notifications: [notifUnread] });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('.notif-card--unread')).toBeTruthy();
    });
    fireEvent.click(screen.getByText('Order Update'));
    await waitFor(() => {
      expect(container.querySelector('.notif-card--unread')).toBeFalsy();
    });
  });

  it('keyboard Enter on unread card triggers markAsRead', async () => {
    setupMocks({ notifications: [notifUnread] });
    const { container } = renderPage();
    await waitFor(() => {
      expect(screen.getByText('Order Update')).toBeInTheDocument();
    });
    const card = container.querySelector('.notif-card--unread')!;
    fireEvent.keyDown(card, { key: 'Enter' });
    await waitFor(() => {
      const calls = mockAuthFetch.mock.calls.filter(
        (c) => String(c[0]).includes(`/notifications/${notifUnread.id}/read`)
      );
      expect(calls.length).toBe(1);
    });
  });

  it('keyboard Space on unread card triggers markAsRead', async () => {
    setupMocks({ notifications: [notifUnread] });
    const { container } = renderPage();
    await waitFor(() => {
      expect(screen.getByText('Order Update')).toBeInTheDocument();
    });
    const card = container.querySelector('.notif-card--unread')!;
    fireEvent.keyDown(card, { key: ' ' });
    await waitFor(() => {
      const calls = mockAuthFetch.mock.calls.filter(
        (c) => String(c[0]).includes(`/notifications/${notifUnread.id}/read`)
      );
      expect(calls.length).toBe(1);
    });
  });

  it('clicking already-read notification does not call markAsRead', async () => {
    setupMocks({ notifications: [notifRead] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Stock Alert')).toBeInTheDocument();
    });
    mockAuthFetch.mockClear();
    fireEvent.click(screen.getByText('Stock Alert'));
    // No PUT call should be made
    const readCalls = mockAuthFetch.mock.calls.filter(
      (c) => String(c[0]).includes('/read') && c[2]?.method === 'PUT'
    );
    expect(readCalls.length).toBe(0);
  });

  it('shows error when mark-as-read API fails', async () => {
    setupMocks({ notifications: [notifUnread], markReadError: 'fail' });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Order Update')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Order Update'));
    await waitFor(() => {
      expect(screen.getByText('Failed to mark notification as read')).toBeInTheDocument();
    });
  });

  it('clears stale error before markAsRead call (STG-757)', async () => {
    // First trigger an error
    setupMocks({ notifications: [notifUnread, notifGrn], markReadError: 'fail' });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Order Update')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Order Update'));
    await waitFor(() => {
      expect(screen.getByText('Failed to mark notification as read')).toBeInTheDocument();
    });
    // Now set up success for the second click
    mockAuthFetch.mockImplementation((url: string, _token?: string, options?: { method?: string }) => {
      if (String(url).includes('/read') && options?.method === 'PUT') {
        return Promise.resolve(makeResponse({ success: true }));
      }
      return Promise.resolve(makeResponse({ data: [notifUnread, notifGrn], pagination: { total: 2 } }));
    });
    fireEvent.click(screen.getByText('GRN Mismatch'));
    await waitFor(() => {
      expect(screen.queryByText('Failed to mark notification as read')).not.toBeInTheDocument();
    });
  });
});

// ==========================================================================
// 6. Mark all as read
// ==========================================================================

describe('mark all as read', () => {
  it('shows "Mark all read" button only when unread exist', async () => {
    setupMocks({ notifications: [notifUnread] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Mark all read')).toBeInTheDocument();
    });
  });

  it('hides "Mark all read" button when all are read', async () => {
    setupMocks({ notifications: [notifRead] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Stock Alert')).toBeInTheDocument();
    });
    expect(screen.queryByText('Mark all read')).not.toBeInTheDocument();
  });

  it('clicking "Mark all read" calls PUT /notifications/read-all', async () => {
    setupMocks({ notifications: [notifUnread, notifGrn] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Mark all read')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText('Mark all notifications as read'));
    await waitFor(() => {
      const calls = mockAuthFetch.mock.calls.filter(
        (c) => String(c[0]) === '/api/v1/retailer-admin/notifications/read-all' && c[2]?.method === 'PUT'
      );
      expect(calls.length).toBe(1);
    });
  });

  it('optimistically updates all cards to read state', async () => {
    setupMocks({ notifications: [notifUnread, notifGrn] });
    const { container } = renderPage();
    await waitFor(() => {
      const unreadCards = container.querySelectorAll('.notif-card--unread');
      expect(unreadCards.length).toBe(2);
    });
    fireEvent.click(screen.getByLabelText('Mark all notifications as read'));
    await waitFor(() => {
      expect(container.querySelector('.notif-card--unread')).toBeFalsy();
    });
  });

  it('shows error when mark-all API fails', async () => {
    setupMocks({ notifications: [notifUnread], markAllReadError: 'fail' });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Mark all read')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText('Mark all notifications as read'));
    await waitFor(() => {
      expect(screen.getByText('Failed to mark all as read')).toBeInTheDocument();
    });
  });

  it('clears stale error before markAllAsRead call', async () => {
    setupMocks({ notifications: [notifUnread], markAllReadError: 'fail' });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Mark all read')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText('Mark all notifications as read'));
    await waitFor(() => {
      expect(screen.getByText('Failed to mark all as read')).toBeInTheDocument();
    });
    // Now set success
    mockAuthFetch.mockImplementation((url: string, _token?: string, options?: { method?: string }) => {
      if (String(url).includes('/read-all') && options?.method === 'PUT') {
        return Promise.resolve(makeResponse({ success: true }));
      }
      return Promise.resolve(makeResponse({ data: [notifUnread], pagination: { total: 1 } }));
    });
    fireEvent.click(screen.getByLabelText('Mark all notifications as read'));
    await waitFor(() => {
      expect(screen.queryByText('Failed to mark all as read')).not.toBeInTheDocument();
    });
  });
});

// ==========================================================================
// 7. Refresh
// ==========================================================================

describe('refresh', () => {
  it('shows "Refresh" button after loading completes', async () => {
    setupMocks({ notifications: [] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Refresh')).toBeInTheDocument();
    });
  });

  it('shows "Loading..." text on refresh button during fetch', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    // During loading, the refresh button shows "Loading..."
    const btn = screen.getByLabelText('Refresh notifications list');
    expect(btn).toBeDisabled();
  });

  it('clicking refresh re-fetches notifications', async () => {
    setupMocks({ notifications: [notifUnread] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Order Update')).toBeInTheDocument();
    });
    const fetchCountBefore = mockAuthFetch.mock.calls.filter(
      (c) => String(c[0]).includes('/notifications?')
    ).length;
    fireEvent.click(screen.getByLabelText('Refresh notifications list'));
    await waitFor(() => {
      const fetchCountAfter = mockAuthFetch.mock.calls.filter(
        (c) => String(c[0]).includes('/notifications?')
      ).length;
      expect(fetchCountAfter).toBeGreaterThan(fetchCountBefore);
    });
  });

  it('refresh button is disabled during loading', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    const btn = screen.getByLabelText('Refresh notifications list') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});

// ==========================================================================
// 8. Pagination
// ==========================================================================

describe('pagination', () => {
  it('shows pagination when total > limit (20)', async () => {
    setupMocks({ notifications: Array.from({ length: 20 }, (_, i) => ({
      ...notifRead,
      id: `n-${i}`,
      title: `Notif ${i}`,
    })), total: 50 });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Previous')).toBeInTheDocument();
      expect(screen.getByText('Next')).toBeInTheDocument();
    });
  });

  it('does not show pagination when total <= limit', async () => {
    setupMocks({ notifications: [notifUnread], total: 1 });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Order Update')).toBeInTheDocument();
    });
    expect(screen.queryByText('Previous')).not.toBeInTheDocument();
    expect(screen.queryByText('Next')).not.toBeInTheDocument();
  });

  it('Previous button is disabled on first page', async () => {
    setupMocks({ notifications: Array.from({ length: 5 }, (_, i) => ({
      ...notifRead,
      id: `n-${i}`,
    })), total: 25 });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Previous')).toBeInTheDocument();
    });
    const prevBtn = screen.getByLabelText('Previous page of notifications') as HTMLButtonElement;
    expect(prevBtn.disabled).toBe(true);
  });

  it('Next button is disabled on last page', async () => {
    // Total=25, limit=20: first page shows Next enabled, click it
    // Then on page 2 (offset=20, only 5 left), Next should be disabled
    setupMocks({ notifications: Array.from({ length: 20 }, (_, i) => ({
      ...notifRead,
      id: `n-${i}`,
      title: `Notif ${i}`,
    })), total: 25 });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Next')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText('Next page of notifications'));
    await waitFor(() => {
      const nextBtn = screen.getByLabelText('Next page of notifications') as HTMLButtonElement;
      expect(nextBtn.disabled).toBe(true);
    });
  });

  it('shows page info text with offset range', async () => {
    setupMocks({ notifications: Array.from({ length: 20 }, (_, i) => ({
      ...notifRead,
      id: `n-${i}`,
      title: `Notif ${i}`,
    })), total: 50 });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/1–20 of 50/)).toBeInTheDocument();
    });
  });

  it('clicking Next updates offset and re-fetches', async () => {
    setupMocks({ notifications: Array.from({ length: 20 }, (_, i) => ({
      ...notifRead,
      id: `n-${i}`,
      title: `Notif ${i}`,
    })), total: 50 });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Next')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText('Next page of notifications'));
    await waitFor(() => {
      const calls = mockAuthFetch.mock.calls.filter(
        (c) => String(c[0]).includes('offset=20')
      );
      expect(calls.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('clicking Previous after Next goes back to offset=0', async () => {
    setupMocks({ notifications: Array.from({ length: 20 }, (_, i) => ({
      ...notifRead,
      id: `n-${i}`,
      title: `Notif ${i}`,
    })), total: 50 });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Next')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText('Next page of notifications'));
    await waitFor(() => {
      const prevBtn = screen.getByLabelText('Previous page of notifications') as HTMLButtonElement;
      expect(prevBtn.disabled).toBe(false);
    });
    fireEvent.click(screen.getByLabelText('Previous page of notifications'));
    await waitFor(() => {
      const calls = mockAuthFetch.mock.calls.filter(
        (c) => String(c[0]).includes('offset=0')
      );
      expect(calls.length).toBeGreaterThanOrEqual(2); // initial + after prev click
    });
  });
});

// ==========================================================================
// 9. Error handling
// ==========================================================================

describe('error handling', () => {
  it('shows error bar on API failure', async () => {
    setupMocks({ listError: 'fail' });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Failed to load notifications. Please try again.')).toBeInTheDocument();
    });
  });

  it('shows error bar on network failure', async () => {
    setupMocks({ listError: 'network' });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Failed to load notifications. Please try again.')).toBeInTheDocument();
    });
  });

  it('silently returns on 401 without setting error', async () => {
    setupMocks({ listError: '401' });
    renderPage();
    // Wait for loading to finish
    await waitFor(() => {
      expect(screen.queryByText('Loading notifications...')).not.toBeInTheDocument();
    });
    expect(screen.queryByText(/Failed/)).not.toBeInTheDocument();
  });

  it('retry button clears error and re-fetches', async () => {
    setupMocks({ listError: 'network' });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Failed to load notifications. Please try again.')).toBeInTheDocument();
    });
    // Now set up success for retry
    setupMocks({ notifications: [notifUnread] });
    fireEvent.click(screen.getByLabelText('Retry loading notifications'));
    await waitFor(() => {
      expect(screen.queryByText('Failed to load notifications. Please try again.')).not.toBeInTheDocument();
      expect(screen.getByText('Order Update')).toBeInTheDocument();
    });
  });
});

// ==========================================================================
// 10. Edge cases
// ==========================================================================

describe('edge cases', () => {
  it('handles null/missing data in API response gracefully', async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(null));
    renderPage();
    await waitFor(() => {
      expect(screen.queryByText('Loading notifications...')).not.toBeInTheDocument();
    });
    // Should show empty state (data falls back to [])
    expect(screen.getByText('No notifications yet')).toBeInTheDocument();
  });

  it('handles missing pagination in response', async () => {
    mockAuthFetch.mockResolvedValue(makeResponse({ data: [notifRead] }));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Stock Alert')).toBeInTheDocument();
    });
    // total defaults to 0, no crash
    expect(screen.getByText(/0 total/)).toBeInTheDocument();
  });

  it('mixed read and unread notifications show correct count', async () => {
    setupMocks({ notifications: [notifUnread, notifRead, notifGrn, notifPayment] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/3 unread/)).toBeInTheDocument();
    });
  });

  it('notification with grn_excess type gets AlertTriangle icon', async () => {
    setupMocks({ notifications: [notifGrnExcess] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('icon-alert')).toBeInTheDocument();
    });
  });
});
