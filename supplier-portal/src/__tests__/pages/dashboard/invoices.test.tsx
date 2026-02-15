import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import InvoicesPage from '../../../app/(dashboard)/invoices/page';

// Mock react-query
jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    if (queryKey[0] === 'supplier-invoices') {
      return { data: { data: [], total: 0 }, isLoading: false, isError: false, refetch: jest.fn() };
    }
    if (queryKey[0] === 'supplier-invoice-detail') {
      return { data: null, isLoading: false };
    }
    return { data: null };
  },
}));

// Mock formatters
jest.mock('../../../lib/formatters', () => ({
  formatCurrency: (val: number) => `Rs. ${(val / 100).toFixed(2)}`,
  formatDate: (val: string) => new Date(val).toLocaleDateString(),
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
  FileText: () => null,
}));

// Mock API
jest.mock('../../../lib/api', () => ({
  getSupplierInvoices: jest.fn(),
  getSupplierInvoiceDetail: jest.fn(),
}));

describe('InvoicesPage', () => {
  it('renders the page heading', () => {
    render(<InvoicesPage />);
    expect(screen.getByText('Invoices')).toBeInTheDocument();
  });

  it('renders subtitle', () => {
    render(<InvoicesPage />);
    expect(screen.getByText(/View invoices for your sales and commissions/)).toBeInTheDocument();
  });

  it('renders status filter dropdown', () => {
    render(<InvoicesPage />);
    const select = screen.getByDisplayValue('All Statuses');
    expect(select).toBeInTheDocument();
  });

  it('renders invoice count', () => {
    render(<InvoicesPage />);
    expect(screen.getByText('0 invoices')).toBeInTheDocument();
  });

  it('renders empty state when no invoices', () => {
    render(<InvoicesPage />);
    expect(screen.getByText('No invoices yet')).toBeInTheDocument();
  });

  it('renders breadcrumb', () => {
    render(<InvoicesPage />);
    expect(screen.getByTestId('breadcrumb')).toBeInTheDocument();
  });
});
