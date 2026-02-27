import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NotificationsPage from '../pages/NotificationsPage';

vi.mock('../lib/AuthContext', () => ({
  useAuth: () => ({ token: 'test-token', accessToken: 'test-token' }),
}));

vi.mock('lucide-react', () => ({
  Bell: ({ size, style }: { size: number; style?: object }) => <span style={style} data-size={size}>BellIcon</span>,
  Check: () => <span>CheckIcon</span>,
  CheckCheck: ({ size }: { size: number }) => <span data-size={size}>CheckCheckIcon</span>,
  RefreshCw: ({ size }: { size: number }) => <span data-size={size}>RefreshIcon</span>,
  AlertTriangle: () => <span>AlertIcon</span>,
  Package: () => <span>PackageIcon</span>,
  CreditCard: () => <span>CreditCardIcon</span>,
  Truck: () => <span>TruckIcon</span>,
}));

const mockAuthFetch = vi.fn();
vi.mock('../lib/api', () => ({
  authFetch: (...args: unknown[]) => mockAuthFetch(...args),
  safeJson: (res: { json: () => Promise<unknown> }) => res.json(),
}));

describe('NotificationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders page title', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {}));
    render(<MemoryRouter><NotificationsPage /></MemoryRouter>);
    expect(screen.getByText('Notifications')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {}));
    render(<MemoryRouter><NotificationsPage /></MemoryRouter>);
    expect(screen.getByText('Loading notifications...')).toBeInTheDocument();
  });

  it('shows empty state when no notifications', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [], pagination: { total: 0 } }),
    });
    render(<MemoryRouter><NotificationsPage /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('No notifications yet')).toBeInTheDocument();
    });
  });

  it('renders notification list', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        data: [
          { id: 'n1', title: 'Order Update', body: 'Your order has shipped', type: 'order_status', isRead: false, readAt: null, createdAt: '2026-01-15T10:00:00Z', data: {} },
          { id: 'n2', title: 'Stock Alert', body: 'Low stock on Rice', type: 'stock_alert', isRead: true, readAt: '2026-01-15T11:00:00Z', createdAt: '2026-01-14T10:00:00Z', data: {} },
        ],
        pagination: { total: 2 },
      }),
    });
    render(<MemoryRouter><NotificationsPage /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Order Update')).toBeInTheDocument();
      expect(screen.getByText('Stock Alert')).toBeInTheDocument();
      expect(screen.getByText('Your order has shipped')).toBeInTheDocument();
    });
  });

  it('shows unread count', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        data: [
          { id: 'n1', title: 'Test', body: 'Body', type: 'default', isRead: false, readAt: null, createdAt: '2026-01-15T10:00:00Z', data: {} },
        ],
        pagination: { total: 1 },
      }),
    });
    render(<MemoryRouter><NotificationsPage /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText(/1 unread/)).toBeInTheDocument();
    });
  });

  it('shows mark all read button when unread exist', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        data: [
          { id: 'n1', title: 'Test', body: 'Body', type: 'default', isRead: false, readAt: null, createdAt: '2026-01-15T10:00:00Z', data: {} },
        ],
        pagination: { total: 1 },
      }),
    });
    render(<MemoryRouter><NotificationsPage /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Mark all read')).toBeInTheDocument();
    });
  });

  it('has refresh button', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [], pagination: { total: 0 } }),
    });
    render(<MemoryRouter><NotificationsPage /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Refresh')).toBeInTheDocument();
    });
  });
});
