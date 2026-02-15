import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ReconciliationPage from '../pages/ReconciliationPage';

vi.mock('../lib/AuthContext', () => ({
  useAuth: () => ({ accessToken: 'test-token' }),
}));

vi.mock('../components/Breadcrumb', () => ({
  default: () => <nav data-testid="breadcrumb">Breadcrumb</nav>,
}));

vi.mock('../components/EmptyState', () => ({
  default: ({ title, description }: { title: string; description: string }) => (
    <div data-testid="empty-state"><h3>{title}</h3><p>{description}</p></div>
  ),
}));

vi.mock('lucide-react', () => ({
  IndianRupee: () => <span>RupeeIcon</span>,
  Download: (props: { style?: object }) => <span style={props.style}>DownloadIcon</span>,
  RefreshCw: (props: { style?: object }) => <span style={props.style}>RefreshIcon</span>,
}));

const mockAuthFetch = vi.fn();
vi.mock('../lib/api', () => ({
  authFetch: (...args: unknown[]) => mockAuthFetch(...args),
  safeJson: (res: { json: () => Promise<unknown> }) => res.json(),
}));

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/s/TEST/reconciliation']}>
      <Routes>
        <Route path="/s/:storeCode/reconciliation" element={<ReconciliationPage />} />
      </Routes>
    </MemoryRouter>
  );

describe('ReconciliationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders page title', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText('Payment Reconciliation')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText('Loading reconciliation data...')).toBeInTheDocument();
  });

  it('shows empty state when no data', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true, data: [], summary: null }),
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('No reconciliation data')).toBeInTheDocument();
    });
  });

  it('renders reconciliation rows', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        success: true,
        data: [
          { date: '2026-01-15', upiMinor: 50000, cashMinor: 30000, dueMinor: 10000, refundsMinor: 0, netTotalMinor: 90000 },
        ],
        summary: { totalRevenueMinor: 90000, upiTotalMinor: 50000, cashTotalMinor: 30000, dueTotalMinor: 10000, refundsTotalMinor: 0 },
      }),
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('15/01/2026')).toBeInTheDocument();
      expect(screen.getByText('Total Revenue')).toBeInTheDocument();
    });
  });

  it('has date range pickers', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText('From:')).toBeInTheDocument();
    expect(screen.getByText('To:')).toBeInTheDocument();
  });

  it('has quick date range buttons', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText('Last 7 Days')).toBeInTheDocument();
    expect(screen.getByText('Last 30 Days')).toBeInTheDocument();
  });

  it('has export CSV button', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText('Export CSV')).toBeInTheDocument();
  });

  it('has refresh button', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText('Refresh')).toBeInTheDocument();
  });

  it('shows error with retry', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Failed to load reconciliation/)).toBeInTheDocument();
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });
  });

  it('renders breadcrumb', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByTestId('breadcrumb')).toBeInTheDocument();
  });
});
