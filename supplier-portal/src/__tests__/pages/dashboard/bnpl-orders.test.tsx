import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import BnplOrdersPage from '../../../app/(dashboard)/bnpl-orders/page';

// Configurable useQuery mock
let mockQueryData: any = null;
let mockQueryLoading = false;
let mockQueryError = false;
const mockRefetch = jest.fn();

jest.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: mockQueryData,
    isLoading: mockQueryLoading,
    isError: mockQueryError,
    refetch: mockRefetch,
  }),
}));

// Mock formatters
jest.mock('../../../lib/formatters', () => ({
  formatCurrency: (val: number) => `₹${(val / 100).toFixed(2)}`,
  formatDate: (val: string) => new Date(val).toLocaleDateString(),
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
jest.mock('lucide-react', () => {
  const React = require('react');
  const mockIcon = (name: string) => (props: any) =>
    React.createElement('svg', { 'data-testid': `icon-${name}`, ...props });
  return {
    ShieldCheck: mockIcon('ShieldCheck'),
    Package: mockIcon('Package'),
    Banknote: mockIcon('Banknote'),
    AlertTriangle: mockIcon('AlertTriangle'),
    CheckCircle2: mockIcon('CheckCircle2'),
    Activity: mockIcon('Activity'),
  };
});

// Mock API
jest.mock('../../../lib/api', () => ({
  apiFetch: jest.fn(),
}));

// Sample data
const sampleSummary = {
  totalOrders: 10,
  activeOrders: 3,
  outstandingMinor: 500000,
  totalFinancedMinor: 2500000,
  totalRepaidMinor: 2000000,
};

const sampleOrder = {
  drawdownId: 'dd-001',
  purchaseOrderId: 'po-001',
  principalMinor: 250000,
  paidAmountMinor: 100000,
  outstandingMinor: 150000,
  dueDate: '2026-04-01T00:00:00Z',
  status: 'active',
  providerId: 'prov-001',
  providerName: 'FinCorp',
  storeName: 'SuperMart Store',
  storeCode: 'SM-001',
  paymentGuaranteed: true,
  createdAt: '2026-03-01T00:00:00Z',
};

const sampleOrderPaid = {
  ...sampleOrder,
  drawdownId: 'dd-002',
  status: 'paid',
  outstandingMinor: 0,
  paymentGuaranteed: false,
};

function renderWithData(orders: any[] = [], summary = sampleSummary, total?: number) {
  mockQueryData = { orders, summary, total: total ?? orders.length };
  return render(<BnplOrdersPage />);
}

describe('BnplOrdersPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryData = null;
    mockQueryLoading = false;
    mockQueryError = false;
  });

  // ── Header & Breadcrumb ───────────────────────────────────────

  it('renders page heading', () => {
    render(<BnplOrdersPage />);
    expect(screen.getByRole('heading', { name: 'BNPL-Backed Orders', level: 1 })).toBeInTheDocument();
  });

  it('renders subtitle', () => {
    render(<BnplOrdersPage />);
    expect(screen.getByText(/Orders financed through credit providers/)).toBeInTheDocument();
  });

  it('renders breadcrumb', () => {
    render(<BnplOrdersPage />);
    const breadcrumb = screen.getByTestId('breadcrumb');
    expect(breadcrumb).toHaveTextContent('Dashboard');
    expect(breadcrumb).toHaveTextContent('BNPL Orders');
  });

  // ── Summary Cards ─────────────────────────────────────────────

  it('renders Total Financed card', () => {
    renderWithData([sampleOrder]);
    expect(screen.getByText('Total Financed')).toBeInTheDocument();
    expect(screen.getByText('₹25000.00')).toBeInTheDocument();
  });

  it('renders Outstanding card', () => {
    renderWithData([sampleOrder]);
    // "Outstanding" appears in both summary card and table header
    const outstandingElements = screen.getAllByText('Outstanding');
    expect(outstandingElements.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('₹5000.00')).toBeInTheDocument();
  });

  it('renders Repaid card', () => {
    renderWithData([sampleOrder]);
    expect(screen.getByText('Repaid')).toBeInTheDocument();
    expect(screen.getByText('₹20000.00')).toBeInTheDocument();
  });

  it('renders Active Orders card', () => {
    renderWithData([sampleOrder]);
    expect(screen.getByText('Active Orders')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  // ── Status Filter ─────────────────────────────────────────────

  it('renders filter tabs with ARIA tablist', () => {
    render(<BnplOrdersPage />);
    expect(screen.getByRole('tablist', { name: /BNPL order status filter/ })).toBeInTheDocument();
  });

  it('renders All, Active, Overdue, Paid filter tabs', () => {
    render(<BnplOrdersPage />);
    expect(screen.getByRole('tab', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Active' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Overdue' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Paid' })).toBeInTheDocument();
  });

  it('defaults to All filter selected', () => {
    render(<BnplOrdersPage />);
    expect(screen.getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'true');
  });

  it('changes filter on tab click', () => {
    render(<BnplOrdersPage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Active' }));
    expect(screen.getByRole('tab', { name: 'Active' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'false');
  });

  // ── Loading State ─────────────────────────────────────────────

  it('renders loading skeleton when loading', () => {
    mockQueryLoading = true;
    const { container } = render(<BnplOrdersPage />);
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThanOrEqual(1);
  });

  // ── Error State ───────────────────────────────────────────────

  it('renders error message when query fails', () => {
    mockQueryError = true;
    render(<BnplOrdersPage />);
    expect(screen.getByText(/Failed to load BNPL orders/)).toBeInTheDocument();
  });

  it('renders Retry button on error', () => {
    mockQueryError = true;
    render(<BnplOrdersPage />);
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('calls refetch on Retry click', () => {
    mockQueryError = true;
    render(<BnplOrdersPage />);
    fireEvent.click(screen.getByText('Retry'));
    expect(mockRefetch).toHaveBeenCalled();
  });

  // ── Empty State ───────────────────────────────────────────────

  it('renders empty state when no orders', () => {
    renderWithData([]);
    expect(screen.getByText('No BNPL orders')).toBeInTheDocument();
  });

  // ── Orders Table ──────────────────────────────────────────────

  it('renders table with column headers', () => {
    renderWithData([sampleOrder]);
    expect(screen.getByText('Store')).toBeInTheDocument();
    expect(screen.getByText('Provider')).toBeInTheDocument();
    expect(screen.getByText('Amount')).toBeInTheDocument();
    expect(screen.getByText('Due Date')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Guaranteed')).toBeInTheDocument();
  });

  it('renders store name and code', () => {
    renderWithData([sampleOrder]);
    expect(screen.getByText('SuperMart Store')).toBeInTheDocument();
    expect(screen.getByText('SM-001')).toBeInTheDocument();
  });

  it('renders provider name', () => {
    renderWithData([sampleOrder]);
    expect(screen.getByText('FinCorp')).toBeInTheDocument();
  });

  it('renders formatted principal amount', () => {
    renderWithData([sampleOrder]);
    expect(screen.getByText('₹2500.00')).toBeInTheDocument();
  });

  it('renders status badge', () => {
    renderWithData([sampleOrder]);
    // "Active" appears in both filter tab and status badge
    const activeElements = screen.getAllByText('Active');
    expect(activeElements.length).toBeGreaterThanOrEqual(2);
  });

  it('renders Paid status badge', () => {
    renderWithData([sampleOrderPaid]);
    // "Paid" appears in filter tab AND status badge
    const paidElements = screen.getAllByText('Paid');
    expect(paidElements.length).toBeGreaterThanOrEqual(2);
  });

  it('renders payment guaranteed Yes with shield icon', () => {
    renderWithData([sampleOrder]);
    expect(screen.getByText('Yes')).toBeInTheDocument();
    expect(screen.getByTestId('icon-ShieldCheck')).toBeInTheDocument();
  });

  it('renders Internal for non-guaranteed', () => {
    renderWithData([sampleOrderPaid]);
    expect(screen.getByText('Internal')).toBeInTheDocument();
  });

  it('renders table with ARIA label', () => {
    renderWithData([sampleOrder]);
    expect(screen.getByRole('table', { name: 'BNPL Orders' })).toBeInTheDocument();
  });

  // ── Pagination ────────────────────────────────────────────────

  it('does not show pagination for single page', () => {
    renderWithData([sampleOrder], sampleSummary, 1);
    expect(screen.queryByText('Previous')).not.toBeInTheDocument();
  });

  it('shows pagination when total exceeds page size', () => {
    renderWithData([sampleOrder], sampleSummary, 25);
    expect(screen.getByText('Previous')).toBeInTheDocument();
    expect(screen.getByText('Next')).toBeInTheDocument();
  });

  it('shows page info with total', () => {
    renderWithData([sampleOrder], sampleSummary, 25);
    expect(screen.getByText(/Page 1 of 2.*25 orders/)).toBeInTheDocument();
  });

  it('disables Previous on first page', () => {
    renderWithData([sampleOrder], sampleSummary, 25);
    expect(screen.getByText('Previous')).toBeDisabled();
  });

  // ── Edge Cases ────────────────────────────────────────────────

  it('renders multiple orders', () => {
    renderWithData([sampleOrder, sampleOrderPaid]);
    // Both rows have same store name
    const storeElements = screen.getAllByText('SuperMart Store');
    expect(storeElements).toHaveLength(2);
  });
});
