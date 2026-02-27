import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import OrdersPage from '../../../app/(dashboard)/orders/page';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/orders',
  useSearchParams: () => new URLSearchParams(),
}));

// Mock react-hot-toast
jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: Object.assign(jest.fn(), {
    success: jest.fn(),
    error: jest.fn(),
  }),
}));

// Mock useUrlState
jest.mock('../../../hooks/useUrlState', () => ({
  useUrlState: (key: string, defaultVal: string) => {
    const React = require('react');
    return React.useState(defaultVal);
  },
}));

// Mock react-query
const mockInvalidateQueries = jest.fn();
jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    if (queryKey[0] === 'orders') {
      return {
        data: { data: [], pagination: { total: 0, totalPages: 1 } },
        isLoading: false,
      };
    }
    if (queryKey[0] === 'orderNotes') {
      return { data: [], isLoading: false, refetch: jest.fn() };
    }
    if (queryKey[0] === 'orderDetail') {
      return { data: null };
    }
    if (queryKey[0] === 'orderEvents') {
      return { data: [] };
    }
    return { data: null };
  },
  useMutation: () => ({
    mutate: jest.fn(),
    isPending: false,
  }),
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
  }),
}));

// Mock formatters
jest.mock('../../../lib/formatters', () => ({
  formatCurrency: (val: number) => `Rs. ${(val / 100).toFixed(2)}`,
  formatDateTime: (val: string) => new Date(val).toLocaleDateString(),
}));

// Mock Breadcrumb
jest.mock('../../../components/Breadcrumb', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: () => React.createElement('nav', { 'data-testid': 'breadcrumb' }),
  };
});

// Mock EmptyState
jest.mock('../../../components/EmptyState', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ title, description }: any) =>
      React.createElement('div', { 'data-testid': 'empty-state' }, [
        React.createElement('span', { key: 'title' }, title),
        React.createElement('span', { key: 'desc' }, description),
      ]),
  };
});

// Mock lucide-react
jest.mock('lucide-react', () => ({
  ShoppingCart: () => null,
  Repeat: () => null,
}));

// Mock auth (FIX-028: OrdersPage uses useAuth for SSE logout cleanup)
jest.mock('../../../lib/auth', () => ({
  useAuth: () => ({ isAuthenticated: true }),
}));

// Mock reconnectingEventSource (REQ.AUDIT.W4)
jest.mock('../../../lib/reconnectingEventSource', () => ({
  ReconnectingEventSource: jest.fn(),
  SSEConnectionState: { CONNECTING: 0, OPEN: 1, CLOSED: 2 },
}));

// Mock WhatsAppIcon
jest.mock('../../../components/WhatsAppIcon', () => ({
  WhatsAppIcon: () => null,
}));

// Mock API
jest.mock('../../../lib/api', () => ({
  getOrders: jest.fn(),
  updateOrderStatus: jest.fn(),
  updateOrderShipment: jest.fn(),
  updateOrderItemStatus: jest.fn(),
  getOrderNotes: jest.fn(),
  addOrderNote: jest.fn(),
  markOrdersRead: jest.fn().mockResolvedValue({}),
  getOrderDetail: jest.fn(),
  getOrderEvents: jest.fn(),
  getOrderStreamUrl: jest.fn().mockReturnValue(null),
  confirmOrderDelivery: jest.fn(),
}));

// Mock EventSource
class MockEventSource {
  addEventListener = jest.fn();
  close = jest.fn();
  onerror = null;
}
(global as any).EventSource = MockEventSource;

describe('OrdersPage', () => {
  it('renders the page heading', () => {
    render(<OrdersPage />);
    expect(screen.getByText('Orders')).toBeInTheDocument();
  });

  it('renders subtitle', () => {
    render(<OrdersPage />);
    expect(screen.getByText(/Manage incoming orders from retailers/)).toBeInTheDocument();
  });

  it('renders status filter buttons', () => {
    render(<OrdersPage />);
    expect(screen.getByText('All')).toBeInTheDocument();
    // UIUX-XPLAT-001: 'submitted' replaced 'pending' as initial PO status
    expect(screen.getByText('Submitted')).toBeInTheDocument();
    expect(screen.getByText('Confirmed')).toBeInTheDocument();
    expect(screen.getByText('Shipped')).toBeInTheDocument();
    expect(screen.getByText('Delivered')).toBeInTheDocument();
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
  });

  it('renders empty state when no orders', () => {
    render(<OrdersPage />);
    expect(screen.getByText('No orders yet')).toBeInTheDocument();
  });

  it('renders breadcrumb', () => {
    render(<OrdersPage />);
    expect(screen.getByTestId('breadcrumb')).toBeInTheDocument();
  });
});
