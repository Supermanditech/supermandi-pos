import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import NotificationsPage from '../../../app/(dashboard)/notifications/page';

// Mock react-hot-toast
jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: Object.assign(jest.fn(), {
    success: jest.fn(),
    error: jest.fn(),
  }),
}));

// Mock Breadcrumb
jest.mock('../../../components/Breadcrumb', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ items }: any) =>
      React.createElement('nav', { 'data-testid': 'breadcrumb' },
        items.map((item: any, i: number) =>
          React.createElement('span', { key: i }, item.label)
        )
      ),
  };
});

// Mock formatters
jest.mock('../../../lib/formatters', () => ({
  formatDateTime: (val: string) => new Date(val).toLocaleString(),
}));

// Mock lucide-react
jest.mock('lucide-react', () => {
  const React = require('react');
  const mockIcon = (name: string) => (props: any) =>
    React.createElement('svg', { 'data-testid': `icon-${name}`, ...props });
  return {
    Bell: mockIcon('Bell'),
    Check: mockIcon('Check'),
    CheckCheck: mockIcon('CheckCheck'),
    RefreshCw: mockIcon('RefreshCw'),
    Truck: mockIcon('Truck'),
    Package: mockIcon('Package'),
    AlertTriangle: mockIcon('AlertTriangle'),
  };
});

// Mock fetch for notifications API
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn().mockReturnValue('test-token'),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Sample data
const sampleNotification = {
  id: 'notif-001',
  title: 'New Order Received',
  body: 'Order #ORD-123 has been submitted by SuperMart Store.',
  data: {},
  type: 'order_status',
  isRead: false,
  createdAt: '2026-03-10T10:00:00Z',
};

const sampleNotificationRead = {
  id: 'notif-002',
  title: 'Delivery Confirmed',
  body: 'Delivery for order #ORD-456 has been confirmed.',
  data: {},
  type: 'delivery_update',
  isRead: true,
  createdAt: '2026-03-09T08:00:00Z',
};

const sampleNotificationGRN = {
  id: 'notif-003',
  title: 'GRN Mismatch',
  body: 'Quantity mismatch detected in order #ORD-789.',
  data: {},
  type: 'grn_mismatch',
  isRead: false,
  createdAt: '2026-03-08T12:00:00Z',
};

function mockFetchWithData(notifications: any[] = [], total?: number) {
  // apiFetch unwraps response.data (line 275: data.data ?? data), so we must
  // nest the payload inside a `data` wrapper so the page receives { data: [...], pagination: {...} }
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({
      data: {
        data: notifications,
        pagination: { total: total ?? notifications.length },
      },
    }),
  });
}

describe('NotificationsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchWithData([]);
  });

  // ── Header & Breadcrumb ───────────────────────────────────────

  it('renders page heading', async () => {
    render(<NotificationsPage />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Notifications', level: 1 })).toBeInTheDocument();
    });
  });

  it('renders breadcrumb with Dashboard and Notifications', async () => {
    render(<NotificationsPage />);
    await waitFor(() => {
      const breadcrumb = screen.getByTestId('breadcrumb');
      expect(breadcrumb).toHaveTextContent('Dashboard');
      expect(breadcrumb).toHaveTextContent('Notifications');
    });
  });

  it('renders Refresh button', async () => {
    render(<NotificationsPage />);
    await waitFor(() => {
      expect(screen.getByText('Refresh')).toBeInTheDocument();
    });
  });

  // ── Total & Unread Count ──────────────────────────────────────

  it('shows total count for empty list', async () => {
    render(<NotificationsPage />);
    await waitFor(() => {
      expect(screen.getByText(/0 total/)).toBeInTheDocument();
    });
  });

  it('shows total count with notifications', async () => {
    mockFetchWithData([sampleNotification, sampleNotificationRead], 2);
    render(<NotificationsPage />);
    await waitFor(() => {
      expect(screen.getByText(/2 total/)).toBeInTheDocument();
    });
  });

  it('shows unread count when unread notifications exist', async () => {
    mockFetchWithData([sampleNotification, sampleNotificationRead], 2);
    render(<NotificationsPage />);
    await waitFor(() => {
      expect(screen.getByText(/1 unread/)).toBeInTheDocument();
    });
  });

  it('does not show unread count when all are read', async () => {
    mockFetchWithData([sampleNotificationRead], 1);
    render(<NotificationsPage />);
    await waitFor(() => {
      expect(screen.getByText(/1 total/)).toBeInTheDocument();
      expect(screen.queryByText(/unread/)).not.toBeInTheDocument();
    });
  });

  // ── Empty State ───────────────────────────────────────────────

  it('shows empty state when no notifications', async () => {
    render(<NotificationsPage />);
    await waitFor(() => {
      expect(screen.getByText('No notifications yet')).toBeInTheDocument();
    });
  });

  it('shows empty state description', async () => {
    render(<NotificationsPage />);
    await waitFor(() => {
      expect(screen.getByText(/order updates and delivery alerts/)).toBeInTheDocument();
    });
  });

  // ── Loading State ─────────────────────────────────────────────

  it('renders loading skeleton initially', () => {
    mockFetch.mockImplementation(() => new Promise(() => {}));
    const { container } = render(<NotificationsPage />);
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  // ── Error State ───────────────────────────────────────────────

  it('renders error message when fetch fails', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));
    render(<NotificationsPage />);
    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('shows Retry button on error', async () => {
    mockFetch.mockRejectedValue(new Error('Server error'));
    render(<NotificationsPage />);
    await waitFor(() => {
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });
  });

  // ── Notification List ─────────────────────────────────────────

  it('renders notification titles', async () => {
    mockFetchWithData([sampleNotification, sampleNotificationRead], 2);
    render(<NotificationsPage />);
    await waitFor(() => {
      expect(screen.getByText('New Order Received')).toBeInTheDocument();
      expect(screen.getByText('Delivery Confirmed')).toBeInTheDocument();
    });
  });

  it('renders notification body text', async () => {
    mockFetchWithData([sampleNotification], 1);
    render(<NotificationsPage />);
    await waitFor(() => {
      expect(screen.getByText(/Order #ORD-123 has been submitted/)).toBeInTheDocument();
    });
  });

  it('renders formatted date', async () => {
    mockFetchWithData([sampleNotification], 1);
    render(<NotificationsPage />);
    const expected = new Date('2026-03-10T10:00:00Z').toLocaleString();
    await waitFor(() => {
      expect(screen.getByText(expected)).toBeInTheDocument();
    });
  });

  // ── Notification Type Icons ───────────────────────────────────

  it('renders Truck icon for order_status type', async () => {
    mockFetchWithData([sampleNotification], 1);
    render(<NotificationsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('icon-Truck')).toBeInTheDocument();
    });
  });

  it('renders Package icon for delivery_update type', async () => {
    mockFetchWithData([sampleNotificationRead], 1);
    render(<NotificationsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('icon-Package')).toBeInTheDocument();
    });
  });

  it('renders AlertTriangle icon for grn_mismatch type', async () => {
    mockFetchWithData([sampleNotificationGRN], 1);
    render(<NotificationsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('icon-AlertTriangle')).toBeInTheDocument();
    });
  });

  it('renders Bell icon for unknown type', async () => {
    mockFetchWithData([{ ...sampleNotification, type: 'unknown_type' }], 1);
    render(<NotificationsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('icon-Bell')).toBeInTheDocument();
    });
  });

  // ── Unread Indicator ──────────────────────────────────────────

  it('shows unread dot for unread notifications', async () => {
    mockFetchWithData([sampleNotification], 1);
    const { container } = render(<NotificationsPage />);
    await waitFor(() => {
      expect(screen.getByText('New Order Received')).toBeInTheDocument();
    });
    // Unread dot: green circle
    expect(container.querySelector('.bg-green-500.rounded-full')).toBeInTheDocument();
  });

  it('does not show unread dot for read notifications', async () => {
    mockFetchWithData([sampleNotificationRead], 1);
    const { container } = render(<NotificationsPage />);
    await waitFor(() => {
      expect(screen.getByText('Delivery Confirmed')).toBeInTheDocument();
    });
    expect(container.querySelector('.bg-green-500.rounded-full')).not.toBeInTheDocument();
  });

  // ── Mark All Read Button ──────────────────────────────────────

  it('shows Mark all read button when unread exist', async () => {
    mockFetchWithData([sampleNotification], 1);
    render(<NotificationsPage />);
    await waitFor(() => {
      expect(screen.getByText('Mark all read')).toBeInTheDocument();
    });
  });

  it('hides Mark all read button when all are read', async () => {
    mockFetchWithData([sampleNotificationRead], 1);
    render(<NotificationsPage />);
    await waitFor(() => {
      expect(screen.getByText('Delivery Confirmed')).toBeInTheDocument();
    });
    expect(screen.queryByText('Mark all read')).not.toBeInTheDocument();
  });

  // ── Pagination ────────────────────────────────────────────────

  it('does not show pagination when total fits one page', async () => {
    mockFetchWithData([sampleNotification], 1);
    render(<NotificationsPage />);
    await waitFor(() => {
      expect(screen.getByText('New Order Received')).toBeInTheDocument();
    });
    expect(screen.queryByText('Previous')).not.toBeInTheDocument();
    expect(screen.queryByText('Next')).not.toBeInTheDocument();
  });

  it('shows pagination when total exceeds limit', async () => {
    mockFetchWithData([sampleNotification], 25);
    render(<NotificationsPage />);
    await waitFor(() => {
      expect(screen.getByText('Previous')).toBeInTheDocument();
      expect(screen.getByText('Next')).toBeInTheDocument();
    });
  });

  it('shows pagination range text', async () => {
    mockFetchWithData([sampleNotification], 25);
    render(<NotificationsPage />);
    await waitFor(() => {
      expect(screen.getByText(/1–20 of 25/)).toBeInTheDocument();
    });
  });

  it('disables Previous button on first page', async () => {
    mockFetchWithData([sampleNotification], 25);
    render(<NotificationsPage />);
    await waitFor(() => {
      expect(screen.getByText('Previous')).toBeDisabled();
    });
  });

  // ── Refresh ───────────────────────────────────────────────────

  it('calls fetch again on Refresh click', async () => {
    render(<NotificationsPage />);
    await waitFor(() => {
      expect(screen.getByText('Refresh')).toBeInTheDocument();
    });
    // Clear the initial fetch call count
    const initialCallCount = mockFetch.mock.calls.length;
    await act(async () => {
      fireEvent.click(screen.getByText('Refresh'));
    });
    expect(mockFetch.mock.calls.length).toBeGreaterThan(initialCallCount);
  });

  // ── Edge Cases ────────────────────────────────────────────────

  it('handles multiple notification types together', async () => {
    mockFetchWithData([sampleNotification, sampleNotificationRead, sampleNotificationGRN], 3);
    render(<NotificationsPage />);
    await waitFor(() => {
      expect(screen.getByText('New Order Received')).toBeInTheDocument();
      expect(screen.getByText('Delivery Confirmed')).toBeInTheDocument();
      expect(screen.getByText('GRN Mismatch')).toBeInTheDocument();
    });
  });
});
