import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import EarningsPage from '../../../app/(dashboard)/earnings/page';

// Mock next/link
jest.mock('next/link', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ href, children, ...props }: any) =>
      React.createElement('a', { href, ...props }, children),
  };
});

// Mock react-query
jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    if (queryKey[0] === 'payout-summary') {
      return {
        data: {
          totalRevenuePaise: 50000000,
          availableBalancePaise: 1000000,
          totalPaidPaise: 40000000,
          totalPendingPaise: 500000,
          totalProcessingPaise: 200000,
          completedPayouts: 12,
          pendingPayouts: 2,
          grossSalesPaise: 0,
        },
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      };
    }
    if (queryKey[0] === 'payouts') {
      return { data: { data: [], pagination: { total: 0, totalPages: 1 } }, isLoading: false, isError: false, refetch: jest.fn() };
    }
    if (queryKey[0] === 'kyc-status') {
      return { data: { payoutReady: true } };
    }
    if (queryKey[0] === 'payout-orders') {
      return { data: [], isLoading: false };
    }
    return { data: null };
  },
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
  Wallet: () => null,
}));

// Mock API - only used for type imports
jest.mock('../../../lib/api', () => ({
  getPayouts: jest.fn(),
  getPayoutSummary: jest.fn(),
  getKycStatus: jest.fn(),
  getPayoutOrders: jest.fn(),
}));

describe('EarningsPage', () => {
  it('renders the page heading', () => {
    render(<EarningsPage />);
    expect(screen.getByText('Earnings & Payouts')).toBeInTheDocument();
  });

  it('renders subtitle', () => {
    render(<EarningsPage />);
    expect(screen.getByText(/Track your earnings and view payout history/)).toBeInTheDocument();
  });

  it('renders summary cards', () => {
    render(<EarningsPage />);
    expect(screen.getByText('Total Revenue')).toBeInTheDocument();
    expect(screen.getByText('Available Balance')).toBeInTheDocument();
    expect(screen.getByText('Total Paid Out')).toBeInTheDocument();
    expect(screen.getByText('Pending Payouts')).toBeInTheDocument();
  });

  it('renders completed payouts count', () => {
    render(<EarningsPage />);
    expect(screen.getByText('12 payouts')).toBeInTheDocument();
  });

  it('renders Payout History section', () => {
    render(<EarningsPage />);
    expect(screen.getByText('Payout History')).toBeInTheDocument();
  });

  it('renders empty state when no payouts', () => {
    render(<EarningsPage />);
    expect(screen.getByText('No payouts yet')).toBeInTheDocument();
  });

  it('renders payout information box', () => {
    render(<EarningsPage />);
    expect(screen.getByText('Payout Information')).toBeInTheDocument();
    expect(screen.getByText(/processed weekly on Mondays/)).toBeInTheDocument();
  });

  it('renders breadcrumb', () => {
    render(<EarningsPage />);
    expect(screen.getByTestId('breadcrumb')).toBeInTheDocument();
  });
});
