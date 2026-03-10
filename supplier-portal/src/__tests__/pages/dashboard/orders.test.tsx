import { render, screen, fireEvent, act } from '@testing-library/react';
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

// Configurable useQuery mock
let mockQueryData: Record<string, any> = {};
let mockQueryStates: Record<string, { isLoading?: boolean; isError?: boolean }> = {};
const mockRefetch = jest.fn();
const mockInvalidateQueries = jest.fn();

// Configurable useMutation mock
let mutationCallbackMap: Record<string, { onSuccess?: Function; onError?: Function }> = {};
let mutationPendingMap: Record<string, boolean> = {};
let mutationCallIndex = 0;
const mutationNames = ['updateStatus', 'shipment', 'itemStatus', 'addNote', 'delivery'];

jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    const key = queryKey[0];
    const states = mockQueryStates[key] || {};
    if (key === 'orders') {
      return {
        data: mockQueryData.orders ?? { data: [], pagination: { total: 0, totalPages: 1 } },
        isLoading: states.isLoading ?? false,
        isError: states.isError ?? false,
        refetch: mockRefetch,
      };
    }
    if (key === 'orderNotes') {
      return { data: mockQueryData.orderNotes ?? [], isLoading: false, refetch: jest.fn() };
    }
    if (key === 'orderDetail') {
      return { data: mockQueryData.orderDetail ?? null };
    }
    if (key === 'orderEvents') {
      return { data: mockQueryData.orderEvents ?? [] };
    }
    return { data: null };
  },
  useMutation: (opts: any) => {
    const idx = mutationCallIndex++;
    const name = mutationNames[idx % mutationNames.length] || `mutation_${idx}`;
    mutationCallbackMap[name] = { onSuccess: opts.onSuccess, onError: opts.onError };
    return {
      mutate: jest.fn(),
      isPending: mutationPendingMap[name] ?? false,
    };
  },
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
  }),
}));

// Mock formatters
jest.mock('../../../lib/formatters', () => ({
  formatCurrency: (val: number) => `₹${(val / 100).toFixed(2)}`,
  formatDateTime: (val: string) => new Date(val).toLocaleDateString(),
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

// Mock auth
let mockIsAuthenticated = true;
jest.mock('../../../lib/auth', () => ({
  useAuth: () => ({ isAuthenticated: mockIsAuthenticated }),
}));

// Mock reconnectingEventSource
jest.mock('../../../lib/reconnectingEventSource', () => ({
  ReconnectingEventSource: jest.fn().mockImplementation(() => ({
    addEventListener: jest.fn(),
    close: jest.fn(),
  })),
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

// Sample test data
const sampleOrder = {
  id: 'order-abc12345-def6-7890',
  storeName: 'SuperMart Store',
  status: 'submitted',
  totalAmount: 150000, // paise
  createdAt: '2026-03-10T10:00:00Z',
  orderType: 'standard',
  items: [
    { id: 'item1', productName: 'Rice 5kg', quantity: 10, price: 45000, status: 'pending' },
    { id: 'item2', productName: 'Dal 1kg', quantity: 5, price: 15000, status: 'pending' },
  ],
};

const sampleReorder = {
  ...sampleOrder,
  id: 'reorder-abc12345-def6-7890',
  orderType: 'reorder',
  status: 'confirmed',
};

function renderWithOrders(orders: any[] = [], pagination?: any) {
  mockQueryData.orders = {
    data: orders,
    pagination: pagination || { total: orders.length, totalPages: 1 },
  };
  return render(<OrdersPage />);
}

describe('OrdersPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryData = {};
    mockQueryStates = {};
    mutationCallbackMap = {};
    mutationPendingMap = {};
    mutationCallIndex = 0;
    mockIsAuthenticated = true;
  });

  // ── Initial Render ──────────────────────────────────────────

  it('renders page heading', () => {
    render(<OrdersPage />);
    expect(screen.getByRole('heading', { name: 'Orders', level: 1 })).toBeInTheDocument();
  });

  it('renders subtitle', () => {
    render(<OrdersPage />);
    expect(screen.getByText(/Manage incoming orders from retailers/)).toBeInTheDocument();
  });

  it('renders breadcrumb with Dashboard and Orders', () => {
    render(<OrdersPage />);
    const breadcrumb = screen.getByTestId('breadcrumb');
    expect(breadcrumb).toHaveTextContent('Dashboard');
    expect(breadcrumb).toHaveTextContent('Orders');
  });

  // ── Status Filter Tabs ──────────────────────────────────────

  it('renders all status filter buttons', () => {
    render(<OrdersPage />);
    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('Submitted')).toBeInTheDocument();
    expect(screen.getByText('Confirmed')).toBeInTheDocument();
    expect(screen.getByText('Shipped')).toBeInTheDocument();
    expect(screen.getByText('Partially Received')).toBeInTheDocument();
    expect(screen.getByText('Delivered')).toBeInTheDocument();
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
  });

  it('renders status filter as tablist with ARIA roles', () => {
    render(<OrdersPage />);
    expect(screen.getByRole('tablist', { name: 'Order status filter' })).toBeInTheDocument();
    const allTab = screen.getByRole('tab', { name: /All/ });
    expect(allTab).toHaveAttribute('aria-selected', 'true');
  });

  it('switches active status filter on tab click', () => {
    render(<OrdersPage />);
    fireEvent.click(screen.getByText('Confirmed'));
    const confirmedTab = screen.getByRole('tab', { name: /Confirmed/ });
    expect(confirmedTab).toHaveAttribute('aria-selected', 'true');
  });

  it('shows status count badges', () => {
    renderWithOrders([sampleOrder, { ...sampleOrder, id: 'order-2', status: 'confirmed' }]);
    // Each filter tab shows a count badge (0 for most)
    const tabs = screen.getAllByRole('tab');
    expect(tabs.length).toBe(8); // all, draft, submitted, confirmed, shipped, partial_received, delivered, cancelled
  });

  // ── Empty State ─────────────────────────────────────────────

  it('renders empty state when no orders', () => {
    render(<OrdersPage />);
    expect(screen.getByText('No orders yet')).toBeInTheDocument();
    expect(screen.getByText(/Orders will appear here when retailers place orders/)).toBeInTheDocument();
  });

  it('renders empty-state component with data-testid', () => {
    render(<OrdersPage />);
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
  });

  // ── Loading State ───────────────────────────────────────────

  it('renders loading skeleton when isLoading', () => {
    mockQueryStates.orders = { isLoading: true };
    render(<OrdersPage />);
    expect(screen.getByRole('status', { name: 'Loading orders' })).toBeInTheDocument();
  });

  it('shows 5 skeleton rows during loading', () => {
    mockQueryStates.orders = { isLoading: true };
    render(<OrdersPage />);
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThanOrEqual(5);
  });

  // ── Error State ─────────────────────────────────────────────

  it('renders error state when isError', () => {
    mockQueryStates.orders = { isError: true };
    render(<OrdersPage />);
    expect(screen.getByText('Failed to load orders')).toBeInTheDocument();
    expect(screen.getByText(/Please check your connection/)).toBeInTheDocument();
  });

  it('shows Retry button on error', () => {
    mockQueryStates.orders = { isError: true };
    render(<OrdersPage />);
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('calls refetch on Retry button click', () => {
    mockQueryStates.orders = { isError: true };
    render(<OrdersPage />);
    fireEvent.click(screen.getByText('Retry'));
    expect(mockRefetch).toHaveBeenCalled();
  });

  // ── Orders Table ────────────────────────────────────────────

  it('renders table headers when orders present', () => {
    renderWithOrders([sampleOrder]);
    expect(screen.getByText('Order ID')).toBeInTheDocument();
    expect(screen.getByText('Store')).toBeInTheDocument();
    expect(screen.getByText('Items')).toBeInTheDocument();
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Date')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
  });

  it('renders order row with truncated ID', () => {
    renderWithOrders([sampleOrder]);
    // ID is sliced to first 8 chars + "..."
    expect(screen.getByText('order-ab...')).toBeInTheDocument();
  });

  it('renders order store name', () => {
    renderWithOrders([sampleOrder]);
    expect(screen.getByText('SuperMart Store')).toBeInTheDocument();
  });

  it('renders order items count', () => {
    renderWithOrders([sampleOrder]);
    expect(screen.getByText('2 items')).toBeInTheDocument();
  });

  it('renders order total amount formatted', () => {
    renderWithOrders([sampleOrder]);
    expect(screen.getByText('₹1500.00')).toBeInTheDocument();
  });

  it('renders order status badge', () => {
    renderWithOrders([sampleOrder]);
    expect(screen.getByText('submitted')).toBeInTheDocument();
  });

  it('renders order date formatted', () => {
    renderWithOrders([sampleOrder]);
    // formatDateTime mock returns toLocaleDateString()
    const formatted = new Date('2026-03-10T10:00:00Z').toLocaleDateString();
    expect(screen.getByText(formatted)).toBeInTheDocument();
  });

  it('renders View Details button for each order', () => {
    renderWithOrders([sampleOrder]);
    expect(screen.getByText('View Details')).toBeInTheDocument();
  });

  it('renders multiple order rows', () => {
    renderWithOrders([
      sampleOrder,
      { ...sampleOrder, id: 'order-xyz98765-ghi0-1234', storeName: 'Another Store' },
    ]);
    expect(screen.getByText('SuperMart Store')).toBeInTheDocument();
    expect(screen.getByText('Another Store')).toBeInTheDocument();
  });

  // ── Reorder Badge ───────────────────────────────────────────

  it('shows Reorder badge for reorder type orders', () => {
    renderWithOrders([sampleReorder]);
    expect(screen.getByText('Reorder')).toBeInTheDocument();
  });

  it('does not show Reorder badge for standard orders', () => {
    renderWithOrders([sampleOrder]);
    expect(screen.queryByText('Reorder')).not.toBeInTheDocument();
  });

  // ── Status Filtering ────────────────────────────────────────

  it('filters orders by status when tab clicked', () => {
    renderWithOrders([
      sampleOrder, // submitted
      { ...sampleOrder, id: 'order-2-confirmed', status: 'confirmed', storeName: 'Filtered Store' },
    ]);
    // Both visible initially (All filter)
    expect(screen.getByText('SuperMart Store')).toBeInTheDocument();
    expect(screen.getByText('Filtered Store')).toBeInTheDocument();

    // Click Submitted tab — client-side filter
    fireEvent.click(screen.getByText('Submitted'));
    // Only submitted order should be visible
    expect(screen.getByText('SuperMart Store')).toBeInTheDocument();
    expect(screen.queryByText('Filtered Store')).not.toBeInTheDocument();
  });

  // ── Pagination ──────────────────────────────────────────────

  it('shows pagination when totalPages > 1', () => {
    renderWithOrders([sampleOrder], { total: 40, totalPages: 2 });
    expect(screen.getByText(/Page 1 of 2/)).toBeInTheDocument();
  });

  it('does not show pagination when totalPages is 1', () => {
    renderWithOrders([sampleOrder], { total: 1, totalPages: 1 });
    expect(screen.queryByText(/Page \d+ of \d+/)).not.toBeInTheDocument();
  });

  // ── Order Detail Modal ──────────────────────────────────────

  it('opens order detail on View Details click', () => {
    renderWithOrders([sampleOrder]);
    fireEvent.click(screen.getByText('View Details'));
    // Modal should show order item details
    expect(screen.getByText('Rice 5kg')).toBeInTheDocument();
    expect(screen.getByText('Dal 1kg')).toBeInTheDocument();
  });

  // ── markOrdersRead on mount ─────────────────────────────────

  it('calls markOrdersRead on mount', () => {
    const { markOrdersRead } = jest.requireMock('../../../lib/api');
    render(<OrdersPage />);
    expect(markOrdersRead).toHaveBeenCalled();
  });

  // ── SSE Connection State ────────────────────────────────────

  it('does not crash when getOrderStreamUrl returns null', () => {
    render(<OrdersPage />);
    // Should render normally without SSE
    expect(screen.getByRole('heading', { name: 'Orders', level: 1 })).toBeInTheDocument();
  });

  // ── Edge Cases ──────────────────────────────────────────────

  it('handles order with empty items array', () => {
    renderWithOrders([{ ...sampleOrder, items: [] }]);
    expect(screen.getByText('0 items')).toBeInTheDocument();
  });

  it('handles order with single item', () => {
    renderWithOrders([{ ...sampleOrder, items: [sampleOrder.items[0]] }]);
    expect(screen.getByText('1 items')).toBeInTheDocument();
  });

  it('handles order with zero total amount', () => {
    renderWithOrders([{ ...sampleOrder, totalAmount: 0 }]);
    expect(screen.getByText('₹0.00')).toBeInTheDocument();
  });

  it('handles cancelled order status', () => {
    renderWithOrders([{ ...sampleOrder, status: 'cancelled' }]);
    expect(screen.getByText('cancelled')).toBeInTheDocument();
  });

  it('handles delivered order status', () => {
    renderWithOrders([{ ...sampleOrder, status: 'delivered' }]);
    expect(screen.getByText('delivered')).toBeInTheDocument();
  });

  it('handles shipped order status', () => {
    renderWithOrders([{ ...sampleOrder, status: 'shipped' }]);
    expect(screen.getByText('shipped')).toBeInTheDocument();
  });
});
