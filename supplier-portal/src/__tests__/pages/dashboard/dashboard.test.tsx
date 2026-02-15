import { render, screen } from '@testing-library/react';
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

// Mock auth context
jest.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    supplier: { businessName: 'Test Supplier Co' },
  }),
}));

// Mock react-query
const mockStats = {
  totalProducts: 42,
  pendingProducts: 5,
  approvedProducts: 37,
  totalOrders: 15,
  pendingOrders: 3,
  totalRevenue: 150000,
  newOrdersCount: 2,
};

jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    if (queryKey[0] === 'dashboard-stats') {
      return { data: mockStats, isLoading: false, isError: false, refetch: jest.fn() };
    }
    if (queryKey[0] === 'recent-orders') {
      return { data: { data: [], pagination: { total: 0 } } };
    }
    if (queryKey[0] === 'products') {
      return { data: { data: [], pagination: { total: 0 } } };
    }
    return { data: null };
  },
}));

// Mock formatters
jest.mock('../../../lib/formatters', () => ({
  formatCurrency: (val: number) => `Rs. ${(val / 100).toFixed(2)}`,
}));

// Mock Breadcrumb
jest.mock('../../../components/Breadcrumb', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ items }: any) =>
      React.createElement('nav', { 'data-testid': 'breadcrumb' }, items.map((i: any) => i.label).join(' > ')),
  };
});

describe('DashboardPage', () => {
  it('renders welcome message with business name', () => {
    render(<DashboardPage />);
    expect(screen.getByText(/Welcome, Test Supplier Co/)).toBeInTheDocument();
  });

  it('renders stat cards', () => {
    render(<DashboardPage />);
    expect(screen.getByText('Total Products')).toBeInTheDocument();
    expect(screen.getByText('Pending Approval')).toBeInTheDocument();
    expect(screen.getByText('Active Orders')).toBeInTheDocument();
    expect(screen.getByText('Total Revenue')).toBeInTheDocument();
  });

  it('renders stat values from API', () => {
    render(<DashboardPage />);
    expect(screen.getByText('42')).toBeInTheDocument(); // totalProducts
    expect(screen.getByText('5')).toBeInTheDocument(); // pendingProducts
    expect(screen.getByText('3')).toBeInTheDocument(); // pendingOrders
  });

  it('renders Quick Actions section', () => {
    render(<DashboardPage />);
    expect(screen.getByText('Quick Actions')).toBeInTheDocument();
    expect(screen.getByText('Add Product')).toBeInTheDocument();
    expect(screen.getByText('Upload CSV')).toBeInTheDocument();
    expect(screen.getByText('View Orders')).toBeInTheDocument();
  });

  it('renders Recent Orders section', () => {
    render(<DashboardPage />);
    expect(screen.getByText('Recent Orders')).toBeInTheDocument();
    expect(screen.getByText('View All →')).toBeInTheDocument();
  });

  it('shows empty orders message when no orders', () => {
    render(<DashboardPage />);
    expect(screen.getByText('No orders yet.')).toBeInTheDocument();
  });

  it('shows pending products warning when products are pending', () => {
    render(<DashboardPage />);
    expect(screen.getByText(/5 products pending approval/)).toBeInTheDocument();
    expect(screen.getByText(/not visible to retailers/)).toBeInTheDocument();
  });

  it('renders breadcrumb navigation', () => {
    render(<DashboardPage />);
    expect(screen.getByTestId('breadcrumb')).toBeInTheDocument();
  });

  it('renders subtitle text', () => {
    render(<DashboardPage />);
    expect(screen.getByText(/what's happening with your products and orders/)).toBeInTheDocument();
  });
});
