import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import DashboardPage from '../../../app/(dashboard)/dashboard/page';

// Mock next/link
jest.mock('next/link', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ href, children, ...props }: any) =>
      React.createElement('a', { href, ...props }, children),
  };
});

// Mock lucide-react icons
jest.mock('lucide-react', () => {
  const React = require('react');
  const icon = (name: string) => (p: any) => React.createElement('span', { 'data-testid': `icon-${name}` });
  return {
    Package: icon('package'),
    Clock: icon('clock'),
    ShoppingCart: icon('cart'),
    DollarSign: icon('dollar'),
    AlertTriangle: icon('alert'),
    FileText: icon('file'),
    Plus: icon('plus'),
    Truck: icon('truck'),
    Timer: icon('timer'),
    CheckCircle: icon('check'),
    Banknote: icon('banknote'),
    TrendingUp: icon('trending'),
  };
});

// Configurable mock state
let mockSupplier: any = { businessName: 'Test Supplier Co', verificationStatus: 'verified' };
jest.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    supplier: mockSupplier,
  }),
}));

// Configurable query returns
let mockStats: any = {
  totalProducts: 42,
  pendingProducts: 5,
  approvedProducts: 37,
  totalOrders: 15,
  pendingOrders: 3,
  totalRevenue: 150000,
};
let mockStatsLoading = false;
let mockStatsError = false;
let mockOrdersData: any[] = [];
let mockOrdersLoading = false;
let mockOrdersError = false;
let mockOrdersPagination: any = { total: 0 };
const mockRefetchStats = jest.fn();
const mockRefetchOrders = jest.fn();
const mockRefetchProducts = jest.fn();

jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    if (queryKey[0] === 'dashboard-stats') {
      return { data: mockStats, isLoading: mockStatsLoading, isError: mockStatsError, refetch: mockRefetchStats };
    }
    if (queryKey[0] === 'recent-orders') {
      return { data: { data: mockOrdersData, pagination: mockOrdersPagination }, isLoading: mockOrdersLoading, isError: mockOrdersError, refetch: mockRefetchOrders };
    }
    if (queryKey[0] === 'products') {
      return { data: { data: [], pagination: { total: 0 } }, isLoading: false, isError: false, refetch: mockRefetchProducts };
    }
    // GCP-STG-0741/0742: fulfillment + settlement dashboard queries
    if (queryKey[0] === 'fulfillment-summary') {
      return { data: { pendingOrders: 3, todayDispatch: 1, overdueOrders: 0, completedThisWeek: 8, avgFulfillmentDays: 2.5 }, isLoading: false, isError: false };
    }
    if (queryKey[0] === 'settlement-summary') {
      return { data: { totalReceivable: 50000, paidThisMonth: 30000, overdueAmount: 5000, agingBuckets: { current: 40000, days30: 5000, days60: 3000, days90plus: 2000 } }, isLoading: false, isError: false };
    }
    return { data: null, isLoading: false, isError: false };
  },
}));

jest.mock('../../../lib/formatters', () => ({
  formatCurrency: (val: number) => `₹${(val / 100).toFixed(2)}`,
}));

jest.mock('../../../components/Breadcrumb', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ items }: any) =>
      React.createElement('nav', { 'data-testid': 'breadcrumb' }, items.map((i: any) => i.label).join(' > ')),
  };
});

describe('DashboardPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSupplier = { businessName: 'Test Supplier Co', verificationStatus: 'verified' };
    mockStats = {
      totalProducts: 42,
      pendingProducts: 5,
      approvedProducts: 37,
      totalOrders: 15,
      pendingOrders: 3,
      totalRevenue: 150000,
    };
    mockStatsLoading = false;
    mockStatsError = false;
    mockOrdersData = [];
    mockOrdersLoading = false;
    mockOrdersError = false;
    mockOrdersPagination = { total: 0 };
  });

  // ── Header & Structure ───────────────────────────────────────

  it('renders welcome message with business name', () => {
    render(<DashboardPage />);
    expect(screen.getByText(/Welcome, Test Supplier Co/)).toBeInTheDocument();
  });

  it('renders subtitle text', () => {
    render(<DashboardPage />);
    expect(screen.getByText(/what's happening with your products and orders/)).toBeInTheDocument();
  });

  it('renders breadcrumb navigation', () => {
    render(<DashboardPage />);
    expect(screen.getByTestId('breadcrumb')).toBeInTheDocument();
  });

  // ── Stat Cards ───────────────────────────────────────────────

  it('renders all 4 stat card titles', () => {
    render(<DashboardPage />);
    expect(screen.getByText('Total Products')).toBeInTheDocument();
    expect(screen.getByText('Pending Approval')).toBeInTheDocument();
    expect(screen.getByText('Active Orders')).toBeInTheDocument();
    expect(screen.getByText('Total Revenue')).toBeInTheDocument();
  });

  it('renders stat values from API data', () => {
    render(<DashboardPage />);
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renders formatted revenue', () => {
    render(<DashboardPage />);
    expect(screen.getByText('₹1500.00')).toBeInTheDocument();
  });

  it('shows loading pulse when stats are loading', () => {
    mockStatsLoading = true;
    mockStats = null;
    render(<DashboardPage />);
    const pulseElements = document.querySelectorAll('.animate-pulse');
    expect(pulseElements.length).toBeGreaterThan(0);
  });

  it('shows em-dash when stat value is null', () => {
    mockStats = { totalProducts: null, pendingProducts: null, approvedProducts: null, totalOrders: null, pendingOrders: null, totalRevenue: null };
    render(<DashboardPage />);
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(4);
  });

  it('stat cards link to correct pages', () => {
    render(<DashboardPage />);
    const productLinks = screen.getAllByRole('link').filter(a => a.getAttribute('href') === '/products');
    expect(productLinks.length).toBeGreaterThanOrEqual(2); // Total Products + Pending Approval
    const orderLinks = screen.getAllByRole('link').filter(a => a.getAttribute('href') === '/orders');
    expect(orderLinks.length).toBeGreaterThanOrEqual(1); // Active Orders
  });

  // ── Stats Error State ────────────────────────────────────────

  it('shows error message when stats fail to load', () => {
    mockStatsError = true;
    render(<DashboardPage />);
    expect(screen.getByText('Failed to load dashboard stats')).toBeInTheDocument();
  });

  it('shows retry button on stats error', () => {
    mockStatsError = true;
    render(<DashboardPage />);
    const retryBtn = screen.getByText('Retry');
    expect(retryBtn).toBeInTheDocument();
  });

  it('calls refetch functions on retry click', () => {
    mockStatsError = true;
    render(<DashboardPage />);
    fireEvent.click(screen.getByText('Retry'));
    expect(mockRefetchStats).toHaveBeenCalled();
    expect(mockRefetchOrders).toHaveBeenCalled();
    expect(mockRefetchProducts).toHaveBeenCalled();
  });

  // ── Pending Products Warning ─────────────────────────────────

  it('shows pending products warning when products are pending', () => {
    render(<DashboardPage />);
    expect(screen.getByText(/5 products pending approval/)).toBeInTheDocument();
    expect(screen.getByText(/not visible to retailers/)).toBeInTheDocument();
  });

  it('shows link to view pending products', () => {
    render(<DashboardPage />);
    expect(screen.getByText('View pending products →')).toBeInTheDocument();
  });

  it('hides pending warning when no pending products', () => {
    mockStats = { ...mockStats, pendingProducts: 0 };
    render(<DashboardPage />);
    expect(screen.queryByText(/pending approval/)).not.toBeInTheDocument();
  });

  it('pluralizes correctly for 1 pending product', () => {
    mockStats = { ...mockStats, pendingProducts: 1 };
    render(<DashboardPage />);
    expect(screen.getByText('1 product pending approval')).toBeInTheDocument();
  });

  // ── Quick Actions ────────────────────────────────────────────

  it('renders Quick Actions section', () => {
    render(<DashboardPage />);
    expect(screen.getByText('Quick Actions')).toBeInTheDocument();
  });

  it('renders Add Product, Upload CSV, View Orders buttons', () => {
    render(<DashboardPage />);
    expect(screen.getByText('Add Product')).toBeInTheDocument();
    expect(screen.getByText('Upload CSV')).toBeInTheDocument();
    expect(screen.getByText('View Orders')).toBeInTheDocument();
  });

  it('enables Add Product and Upload CSV for verified suppliers', () => {
    render(<DashboardPage />);
    const addLink = screen.getByText('Add Product').closest('a');
    expect(addLink).toHaveAttribute('href', '/products?action=add');
    const csvLink = screen.getByText('Upload CSV').closest('a');
    expect(csvLink).toHaveAttribute('href', '/upload');
  });

  it('disables Add Product and Upload CSV for unverified suppliers', () => {
    mockSupplier = { businessName: 'Unverified Co', verificationStatus: 'pending' };
    render(<DashboardPage />);
    const addBtn = screen.getByText('Add Product').closest('button');
    expect(addBtn).toBeDisabled();
    const csvBtn = screen.getByText('Upload CSV').closest('button');
    expect(csvBtn).toBeDisabled();
  });

  it('View Orders is always a link regardless of verification', () => {
    mockSupplier = { businessName: 'Unverified Co', verificationStatus: 'pending' };
    render(<DashboardPage />);
    const ordersLink = screen.getByText('View Orders').closest('a');
    expect(ordersLink).toHaveAttribute('href', '/orders');
  });

  // ── Recent Orders Section ────────────────────────────────────

  it('renders Recent Orders heading', () => {
    render(<DashboardPage />);
    expect(screen.getByText('Recent Orders')).toBeInTheDocument();
  });

  it('shows View All link to orders page', () => {
    render(<DashboardPage />);
    const viewAllLink = screen.getByText('View All →').closest('a');
    expect(viewAllLink).toHaveAttribute('href', '/orders');
  });

  it('shows empty orders message when no orders', () => {
    render(<DashboardPage />);
    expect(screen.getByText('No orders yet.')).toBeInTheDocument();
    expect(screen.getByText(/Orders will appear here/)).toBeInTheDocument();
  });

  it('shows loading spinner when orders are loading', () => {
    mockOrdersLoading = true;
    render(<DashboardPage />);
    expect(screen.getByText('Loading orders...')).toBeInTheDocument();
  });

  it('shows error state when orders fail to load', () => {
    mockOrdersError = true;
    render(<DashboardPage />);
    expect(screen.getByText('Failed to load orders')).toBeInTheDocument();
  });

  it('shows retry button on orders error', () => {
    mockOrdersError = true;
    render(<DashboardPage />);
    // There are 2 Retry elements — one in stats error and one in orders error
    const retryButtons = screen.getAllByText('Retry');
    expect(retryButtons.length).toBeGreaterThanOrEqual(1);
  });

  it('renders orders table with data', () => {
    mockOrdersData = [
      { id: 'order-12345678-abcd', storeName: 'SuperMart', items: [{}, {}, {}], totalAmount: 250000, status: 'delivered' },
      { id: 'order-87654321-dcba', storeName: 'QuickShop', items: [{}], totalAmount: 50000, status: 'submitted' },
    ];
    render(<DashboardPage />);
    // Table headers
    expect(screen.getByText('Order ID')).toBeInTheDocument();
    expect(screen.getByText('Store')).toBeInTheDocument();
    expect(screen.getByText('Items')).toBeInTheDocument();
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    // Row data
    expect(screen.getByText('SuperMart')).toBeInTheDocument();
    expect(screen.getByText('3 items')).toBeInTheDocument();
    expect(screen.getByText('₹2500.00')).toBeInTheDocument();
    expect(screen.getByText('delivered')).toBeInTheDocument();
    expect(screen.getByText('QuickShop')).toBeInTheDocument();
    expect(screen.getByText('1 items')).toBeInTheDocument();
    expect(screen.getByText('submitted')).toBeInTheDocument();
  });

  it('truncates order ID to first 8 characters', () => {
    mockOrdersData = [
      { id: 'abcdefgh-1234-5678-90ab', storeName: 'Store', items: [{}], totalAmount: 10000, status: 'submitted' },
    ];
    render(<DashboardPage />);
    expect(screen.getByText('abcdefgh')).toBeInTheDocument();
  });

  // ── Edge Cases ───────────────────────────────────────────────

  it('handles null supplier gracefully', () => {
    mockSupplier = null;
    render(<DashboardPage />);
    expect(screen.getByText(/Welcome,/)).toBeInTheDocument();
  });

  it('falls back to products pagination total when stats null', () => {
    mockStats = null;
    render(<DashboardPage />);
    // Should show '—' for all stats since products pagination total is 0 and not null but orders total is 0
    expect(screen.getByText('0')).toBeInTheDocument(); // from fallback pagination.total
  });
});
