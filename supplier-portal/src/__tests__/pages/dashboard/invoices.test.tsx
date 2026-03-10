import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import InvoicesPage from '../../../app/(dashboard)/invoices/page';

// Mock react-hot-toast
jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: Object.assign(jest.fn(), {
    success: jest.fn(),
    error: jest.fn(),
  }),
}));

// Configurable useQuery mock
let mockQueryData: Record<string, any> = {};
let mockQueryStates: Record<string, { isLoading?: boolean; isError?: boolean }> = {};
const mockRefetch = jest.fn();

jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    const key = queryKey[0];
    const states = mockQueryStates[key] || {};
    if (key === 'supplier-invoices') {
      return {
        data: mockQueryData['supplier-invoices'] ?? { data: [], total: 0 },
        isLoading: states.isLoading ?? false,
        isError: states.isError ?? false,
        refetch: mockRefetch,
      };
    }
    if (key === 'supplier-invoice-detail') {
      return {
        data: mockQueryData['supplier-invoice-detail'] ?? null,
        isLoading: states.isLoading ?? false,
      };
    }
    return { data: null };
  },
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
jest.mock('lucide-react', () => ({
  FileText: () => null,
}));

// Mock WhatsAppIcon
jest.mock('../../../components/WhatsAppIcon', () => ({
  WhatsAppIcon: () => null,
}));

// Mock API
jest.mock('../../../lib/api', () => ({
  getSupplierInvoices: jest.fn(),
  getSupplierInvoiceDetail: jest.fn(),
  getAuthToken: jest.fn().mockReturnValue('test-token'),
}));

// Sample data
const sampleInvoice = {
  id: 'inv-001',
  invoiceNumber: 'INV/2026/001',
  invoiceDate: '2026-03-01T00:00:00Z',
  buyerName: 'SuperMart Store',
  invoiceType: 'purchase_order',
  totalAmountMinor: 2500000,
  balanceDueMinor: 500000,
  status: 'issued',
};

const sampleInvoicePaid = {
  ...sampleInvoice,
  id: 'inv-002',
  invoiceNumber: 'INV/2026/002',
  status: 'paid',
  balanceDueMinor: 0,
};

function renderWithInvoices(invoices: any[] = [], total?: number) {
  mockQueryData['supplier-invoices'] = {
    data: invoices,
    total: total ?? invoices.length,
  };
  return render(<InvoicesPage />);
}

describe('InvoicesPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryData = {};
    mockQueryStates = {};
  });

  // ── Initial Render ──────────────────────────────────────────

  it('renders page heading', () => {
    render(<InvoicesPage />);
    expect(screen.getByRole('heading', { name: 'Invoices', level: 1 })).toBeInTheDocument();
  });

  it('renders subtitle', () => {
    render(<InvoicesPage />);
    expect(screen.getByText(/View invoices for your sales and commissions/)).toBeInTheDocument();
  });

  it('renders breadcrumb with Dashboard and Invoices', () => {
    render(<InvoicesPage />);
    const breadcrumb = screen.getByTestId('breadcrumb');
    expect(breadcrumb).toHaveTextContent('Dashboard');
    expect(breadcrumb).toHaveTextContent('Invoices');
  });

  // ── Status Filter ───────────────────────────────────────────

  it('renders status filter dropdown', () => {
    render(<InvoicesPage />);
    const select = screen.getByDisplayValue('All Statuses');
    expect(select).toBeInTheDocument();
  });

  it('renders all status filter options', () => {
    render(<InvoicesPage />);
    const select = screen.getByLabelText('Filter by invoice status') as HTMLSelectElement;
    expect(select.options.length).toBe(6); // All + Draft + Issued + Paid + Overdue + Cancelled
  });

  it('changes status filter on selection', () => {
    render(<InvoicesPage />);
    const select = screen.getByLabelText('Filter by invoice status');
    fireEvent.change(select, { target: { value: 'paid' } });
    expect(select).toHaveValue('paid');
  });

  // ── Invoice Count ───────────────────────────────────────────

  it('renders invoice count with plural', () => {
    render(<InvoicesPage />);
    expect(screen.getByText('0 invoices')).toBeInTheDocument();
  });

  it('renders singular invoice count', () => {
    renderWithInvoices([sampleInvoice], 1);
    expect(screen.getByText('1 invoice')).toBeInTheDocument();
  });

  it('renders multiple invoice count', () => {
    renderWithInvoices([sampleInvoice, sampleInvoicePaid], 2);
    expect(screen.getByText('2 invoices')).toBeInTheDocument();
  });

  // ── Empty State ─────────────────────────────────────────────

  it('renders empty state when no invoices', () => {
    render(<InvoicesPage />);
    expect(screen.getByText('No invoices yet')).toBeInTheDocument();
    expect(screen.getByText(/Invoices will appear here once orders are completed/)).toBeInTheDocument();
  });

  // ── Loading State ───────────────────────────────────────────

  it('renders loading skeleton when isLoading', () => {
    mockQueryStates['supplier-invoices'] = { isLoading: true };
    render(<InvoicesPage />);
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThanOrEqual(1);
  });

  // ── Error State ─────────────────────────────────────────────

  it('renders error message when isError', () => {
    mockQueryStates['supplier-invoices'] = { isError: true };
    render(<InvoicesPage />);
    expect(screen.getByText(/Failed to load invoices/)).toBeInTheDocument();
  });

  it('shows Retry link on error', () => {
    mockQueryStates['supplier-invoices'] = { isError: true };
    render(<InvoicesPage />);
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('calls refetch on Retry click', () => {
    mockQueryStates['supplier-invoices'] = { isError: true };
    render(<InvoicesPage />);
    fireEvent.click(screen.getByText('Retry'));
    expect(mockRefetch).toHaveBeenCalled();
  });

  // ── Invoice Table ───────────────────────────────────────────

  it('renders table with column headers', () => {
    renderWithInvoices([sampleInvoice]);
    expect(screen.getByText('Invoice #')).toBeInTheDocument();
    expect(screen.getByText('Date')).toBeInTheDocument();
    expect(screen.getByText('Buyer')).toBeInTheDocument();
    expect(screen.getByText('Type')).toBeInTheDocument();
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('Balance')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
  });

  it('renders invoice number', () => {
    renderWithInvoices([sampleInvoice]);
    expect(screen.getByText('INV/2026/001')).toBeInTheDocument();
  });

  it('renders buyer name', () => {
    renderWithInvoices([sampleInvoice]);
    expect(screen.getByText('SuperMart Store')).toBeInTheDocument();
  });

  it('renders invoice type with underscores replaced', () => {
    renderWithInvoices([sampleInvoice]);
    expect(screen.getByText('purchase order')).toBeInTheDocument();
  });

  it('renders formatted total amount', () => {
    renderWithInvoices([sampleInvoice]);
    expect(screen.getByText('₹25000.00')).toBeInTheDocument();
  });

  it('renders formatted balance due', () => {
    renderWithInvoices([sampleInvoice]);
    expect(screen.getByText('₹5000.00')).toBeInTheDocument();
  });

  it('renders status badge uppercase', () => {
    renderWithInvoices([sampleInvoice]);
    expect(screen.getByText('ISSUED')).toBeInTheDocument();
  });

  it('renders View and PDF action buttons', () => {
    renderWithInvoices([sampleInvoice]);
    expect(screen.getByText('View')).toBeInTheDocument();
    expect(screen.getByText('PDF')).toBeInTheDocument();
  });

  it('renders PDF button with aria-label', () => {
    renderWithInvoices([sampleInvoice]);
    expect(screen.getByLabelText('Download PDF for invoice INV/2026/001')).toBeInTheDocument();
  });

  it('renders multiple invoice rows', () => {
    renderWithInvoices([sampleInvoice, sampleInvoicePaid]);
    expect(screen.getByText('INV/2026/001')).toBeInTheDocument();
    expect(screen.getByText('INV/2026/002')).toBeInTheDocument();
  });

  // ── Status Variants ─────────────────────────────────────────

  it('renders PAID status badge', () => {
    renderWithInvoices([sampleInvoicePaid]);
    expect(screen.getByText('PAID')).toBeInTheDocument();
  });

  it('renders OVERDUE status badge', () => {
    renderWithInvoices([{ ...sampleInvoice, status: 'overdue' }]);
    expect(screen.getByText('OVERDUE')).toBeInTheDocument();
  });

  it('renders DRAFT status badge', () => {
    renderWithInvoices([{ ...sampleInvoice, status: 'draft' }]);
    expect(screen.getByText('DRAFT')).toBeInTheDocument();
  });

  it('renders CANCELLED status badge', () => {
    renderWithInvoices([{ ...sampleInvoice, status: 'cancelled' }]);
    expect(screen.getByText('CANCELLED')).toBeInTheDocument();
  });

  // ── Balance Color ───────────────────────────────────────────

  it('applies red color for positive balance due', () => {
    renderWithInvoices([sampleInvoice]);
    const balanceCell = screen.getByText('₹5000.00');
    expect(balanceCell.className).toContain('text-red-600');
  });

  it('applies green color for zero balance', () => {
    renderWithInvoices([sampleInvoicePaid]);
    const balanceCell = screen.getByText('₹0.00');
    expect(balanceCell.className).toContain('text-green-600');
  });

  // ── Pagination ──────────────────────────────────────────────

  it('does not show pagination when only 1 page', () => {
    renderWithInvoices([sampleInvoice], 1);
    expect(screen.queryByText(/Page \d+ of \d+/)).not.toBeInTheDocument();
  });

  it('shows pagination when total exceeds page limit', () => {
    renderWithInvoices([sampleInvoice], 25); // 25 total, 20 per page = 2 pages
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
  });

  it('renders Prev and Next buttons', () => {
    renderWithInvoices([sampleInvoice], 25);
    expect(screen.getByLabelText('Go to previous page')).toBeInTheDocument();
    expect(screen.getByLabelText('Go to next page')).toBeInTheDocument();
  });

  it('disables Prev button on first page', () => {
    renderWithInvoices([sampleInvoice], 25);
    expect(screen.getByLabelText('Go to previous page')).toBeDisabled();
  });

  // ── Edge Cases ──────────────────────────────────────────────

  it('handles invoice with zero total amount', () => {
    renderWithInvoices([{ ...sampleInvoice, totalAmountMinor: 0 }]);
    expect(screen.getByText('₹0.00')).toBeInTheDocument();
  });
});
