import { render, screen, fireEvent, act } from '@testing-library/react';
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

// Configurable useQuery mock
let mockQueryData: Record<string, any> = {};
let mockQueryStates: Record<string, { isLoading?: boolean; isError?: boolean }> = {};
const mockRefetchSummary = jest.fn();
const mockRefetchPayouts = jest.fn();
const mockRefetchOrders = jest.fn();

jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    const key = queryKey[0];
    const states = mockQueryStates[key] || {};
    if (key === 'payout-summary') {
      return {
        data: mockQueryData['payout-summary'] ?? null,
        isLoading: states.isLoading ?? false,
        isError: states.isError ?? false,
        refetch: mockRefetchSummary,
      };
    }
    if (key === 'payouts') {
      return {
        data: mockQueryData.payouts ?? { data: [], pagination: { total: 0, totalPages: 1 } },
        isLoading: states.isLoading ?? false,
        isError: states.isError ?? false,
        refetch: mockRefetchPayouts,
      };
    }
    if (key === 'kyc-status') {
      return { data: mockQueryData['kyc-status'] ?? { payoutReady: true } };
    }
    if (key === 'payout-orders') {
      return {
        data: mockQueryData['payout-orders'] ?? [],
        isLoading: states.isLoading ?? false,
        isError: states.isError ?? false,
        refetch: mockRefetchOrders,
      };
    }
    return { data: null };
  },
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
  Wallet: () => null,
  AlertTriangle: () => null,
}));

// Mock API
jest.mock('../../../lib/api', () => ({
  getPayouts: jest.fn(),
  getPayoutSummary: jest.fn(),
  getKycStatus: jest.fn(),
  getPayoutOrders: jest.fn(),
}));

// Sample data
const sampleSummary = {
  totalRevenuePaise: 50000000,
  availableBalancePaise: 1000000,
  totalPaidPaise: 40000000,
  totalPendingPaise: 500000,
  totalProcessingPaise: 200000,
  completedPayouts: 12,
  pendingPayouts: 2,
  grossSalesPaise: 0,
};

const samplePayout = {
  id: 'payout-001',
  referenceId: 'PAY-REF-001',
  amountPaise: 2500000,
  status: 'completed',
  initiatedAt: '2026-03-05T10:00:00Z',
  paymentGatewayRef: 'UTR123456',
  failureReason: null,
  bankAccount: {
    accountName: 'Test Supplier',
    accountNumber: '****5678',
    ifsc: 'HDFC0001234',
  },
};

describe('EarningsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryData = {
      'payout-summary': sampleSummary,
      'kyc-status': { payoutReady: true },
    };
    mockQueryStates = {};
  });

  // ── Initial Render ──────────────────────────────────────────

  it('renders page heading', () => {
    render(<EarningsPage />);
    expect(screen.getByText('Earnings & Payouts')).toBeInTheDocument();
  });

  it('renders subtitle', () => {
    render(<EarningsPage />);
    expect(screen.getByText(/Track your earnings and view payout history/)).toBeInTheDocument();
  });

  it('renders breadcrumb with Dashboard and Earnings', () => {
    render(<EarningsPage />);
    const breadcrumb = screen.getByTestId('breadcrumb');
    expect(breadcrumb).toHaveTextContent('Dashboard');
    expect(breadcrumb).toHaveTextContent('Earnings');
  });

  // ── Summary Cards ───────────────────────────────────────────

  it('renders 4 summary cards', () => {
    render(<EarningsPage />);
    expect(screen.getByText('Total Revenue')).toBeInTheDocument();
    expect(screen.getByText('Available Balance')).toBeInTheDocument();
    expect(screen.getByText('Total Paid Out')).toBeInTheDocument();
    expect(screen.getByText('Pending Payouts')).toBeInTheDocument();
  });

  it('renders formatted total revenue', () => {
    render(<EarningsPage />);
    expect(screen.getByText('₹500000.00')).toBeInTheDocument();
  });

  it('renders formatted available balance', () => {
    render(<EarningsPage />);
    expect(screen.getByText('₹10000.00')).toBeInTheDocument();
  });

  it('renders formatted total paid out', () => {
    render(<EarningsPage />);
    expect(screen.getByText('₹400000.00')).toBeInTheDocument();
  });

  it('renders formatted pending payouts (pending + processing)', () => {
    render(<EarningsPage />);
    // 500000 + 200000 = 700000 paise = ₹7000.00
    expect(screen.getByText('₹7000.00')).toBeInTheDocument();
  });

  it('renders completed payouts count', () => {
    render(<EarningsPage />);
    expect(screen.getByText('12 payouts')).toBeInTheDocument();
  });

  it('renders pending payouts count', () => {
    render(<EarningsPage />);
    expect(screen.getByText('2 pending')).toBeInTheDocument();
  });

  // ── Summary Loading ─────────────────────────────────────────

  it('renders loading skeleton when summary loading', () => {
    mockQueryData['payout-summary'] = null;
    mockQueryStates['payout-summary'] = { isLoading: true };
    render(<EarningsPage />);
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThanOrEqual(4);
  });

  // ── Summary Error ───────────────────────────────────────────

  it('renders summary error state', () => {
    mockQueryStates['payout-summary'] = { isError: true };
    render(<EarningsPage />);
    expect(screen.getByText('Failed to load earnings summary')).toBeInTheDocument();
  });

  it('shows Retry button on summary error', () => {
    mockQueryStates['payout-summary'] = { isError: true };
    render(<EarningsPage />);
    const retryBtns = screen.getAllByText('Retry');
    expect(retryBtns.length).toBeGreaterThanOrEqual(1);
  });

  // ── KYC Warning ─────────────────────────────────────────────

  it('shows KYC warning when payoutReady is false', () => {
    mockQueryData['kyc-status'] = { payoutReady: false };
    render(<EarningsPage />);
    expect(screen.getByText('Complete KYC to Receive Payouts')).toBeInTheDocument();
    expect(screen.getByText(/complete your KYC verification/)).toBeInTheDocument();
  });

  it('shows Complete KYC Now link pointing to /kyc', () => {
    mockQueryData['kyc-status'] = { payoutReady: false };
    render(<EarningsPage />);
    const link = screen.getByText('Complete KYC Now');
    expect(link).toHaveAttribute('href', '/kyc');
  });

  it('does not show KYC warning when payoutReady is true', () => {
    render(<EarningsPage />);
    expect(screen.queryByText('Complete KYC to Receive Payouts')).not.toBeInTheDocument();
  });

  // ── Payout History Empty State ──────────────────────────────

  it('renders Payout History section', () => {
    render(<EarningsPage />);
    expect(screen.getByText('Payout History')).toBeInTheDocument();
  });

  it('renders empty state when no payouts', () => {
    render(<EarningsPage />);
    expect(screen.getByText('No payouts yet')).toBeInTheDocument();
    expect(screen.getByText(/Payouts are processed weekly for delivered orders/)).toBeInTheDocument();
  });

  // ── Payout History Loading ──────────────────────────────────

  it('renders loading spinner when payouts loading', () => {
    mockQueryStates.payouts = { isLoading: true };
    render(<EarningsPage />);
    const spinners = document.querySelectorAll('.animate-spin');
    expect(spinners.length).toBeGreaterThanOrEqual(1);
  });

  // ── Payout History Error ────────────────────────────────────

  it('renders payouts error state', () => {
    mockQueryStates.payouts = { isError: true };
    render(<EarningsPage />);
    expect(screen.getByText('Failed to load payout history')).toBeInTheDocument();
  });

  it('shows Retry button on payouts error', () => {
    mockQueryStates.payouts = { isError: true };
    render(<EarningsPage />);
    // Find Retry within payout history section
    const retryBtns = screen.getAllByText('Retry');
    expect(retryBtns.length).toBeGreaterThanOrEqual(1);
  });

  // ── Payout History Table ────────────────────────────────────

  it('renders payout table with data', () => {
    mockQueryData.payouts = { data: [samplePayout], pagination: { total: 1, totalPages: 1 } };
    render(<EarningsPage />);
    expect(screen.getByText('Date')).toBeInTheDocument();
    expect(screen.getByText('Reference')).toBeInTheDocument();
    expect(screen.getByText('Bank Account')).toBeInTheDocument();
    expect(screen.getByText('Amount')).toBeInTheDocument();
  });

  it('renders payout reference ID', () => {
    mockQueryData.payouts = { data: [samplePayout], pagination: { total: 1, totalPages: 1 } };
    render(<EarningsPage />);
    expect(screen.getByText('PAY-REF-001')).toBeInTheDocument();
  });

  it('renders payout UTR reference', () => {
    mockQueryData.payouts = { data: [samplePayout], pagination: { total: 1, totalPages: 1 } };
    render(<EarningsPage />);
    expect(screen.getByText('UTR: UTR123456')).toBeInTheDocument();
  });

  it('renders payout bank account info', () => {
    mockQueryData.payouts = { data: [samplePayout], pagination: { total: 1, totalPages: 1 } };
    render(<EarningsPage />);
    expect(screen.getByText('Test Supplier')).toBeInTheDocument();
    expect(screen.getByText('****5678 | HDFC0001234')).toBeInTheDocument();
  });

  it('renders payout amount formatted', () => {
    mockQueryData.payouts = { data: [samplePayout], pagination: { total: 1, totalPages: 1 } };
    render(<EarningsPage />);
    // Amount appears in both desktop table and mobile card
    const amounts = screen.getAllByText('₹25000.00');
    expect(amounts.length).toBeGreaterThanOrEqual(1);
  });

  it('renders status badge for completed payout', () => {
    mockQueryData.payouts = { data: [samplePayout], pagination: { total: 1, totalPages: 1 } };
    render(<EarningsPage />);
    // Status badge appears in both desktop and mobile layouts
    const badges = screen.getAllByText('Completed');
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  it('renders failure reason for failed payout', () => {
    const failedPayout = { ...samplePayout, status: 'failed', failureReason: 'Bank rejected' };
    mockQueryData.payouts = { data: [failedPayout], pagination: { total: 1, totalPages: 1 } };
    render(<EarningsPage />);
    const badges = screen.getAllByText('Failed');
    expect(badges.length).toBeGreaterThanOrEqual(1);
    // Failure reason shown in both desktop and mobile
    const reasons = screen.getAllByText('Bank rejected');
    expect(reasons.length).toBeGreaterThanOrEqual(1);
  });

  // ── Payout Information Box ──────────────────────────────────

  it('renders payout information box', () => {
    render(<EarningsPage />);
    expect(screen.getByText('Payout Information')).toBeInTheDocument();
    expect(screen.getByText(/processed weekly on Mondays/)).toBeInTheDocument();
  });

  it('renders minimum payout amount', () => {
    render(<EarningsPage />);
    expect(screen.getByText(/₹100.00/)).toBeInTheDocument();
  });

  it('renders credit timeline info', () => {
    render(<EarningsPage />);
    expect(screen.getByText(/credited within 2-3 business days/)).toBeInTheDocument();
  });

  it('renders bank verification reminder', () => {
    render(<EarningsPage />);
    expect(screen.getByText(/bank details are verified/)).toBeInTheDocument();
  });

  // ── Commission Breakdown ────────────────────────────────────

  it('does not show commission breakdown when grossSalesPaise is 0', () => {
    render(<EarningsPage />);
    expect(screen.queryByText('Commission Breakdown')).not.toBeInTheDocument();
  });

  it('shows commission breakdown when grossSalesPaise > 0', () => {
    mockQueryData['payout-summary'] = {
      ...sampleSummary,
      grossSalesPaise: 6000000,
      platformFeePaise: 600000,
      netEarningsPaise: 5400000,
      avgCommissionPercent: 10,
    };
    render(<EarningsPage />);
    expect(screen.getByText('Commission Breakdown')).toBeInTheDocument();
    expect(screen.getByText('Gross Sales')).toBeInTheDocument();
    expect(screen.getByText('Platform Fee')).toBeInTheDocument();
    expect(screen.getByText('Net Earnings')).toBeInTheDocument();
    expect(screen.getByText('Commission Rate')).toBeInTheDocument();
  });

  // ── Edge Cases ──────────────────────────────────────────────

  it('handles null summary gracefully (no cards rendered)', () => {
    mockQueryData['payout-summary'] = null;
    render(<EarningsPage />);
    expect(screen.queryByText('Total Revenue')).not.toBeInTheDocument();
  });

  it('handles pending payout status', () => {
    const pendingPayout = { ...samplePayout, status: 'pending', paymentGatewayRef: null };
    mockQueryData.payouts = { data: [pendingPayout], pagination: { total: 1, totalPages: 1 } };
    render(<EarningsPage />);
    // Badge appears in both desktop and mobile
    const badges = screen.getAllByText('Pending');
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  it('handles processing payout status', () => {
    const processingPayout = { ...samplePayout, status: 'processing', paymentGatewayRef: null };
    mockQueryData.payouts = { data: [processingPayout], pagination: { total: 1, totalPages: 1 } };
    render(<EarningsPage />);
    const badges = screen.getAllByText('Processing');
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });
});
