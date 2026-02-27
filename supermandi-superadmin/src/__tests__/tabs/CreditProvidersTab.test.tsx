// SuperAdmin — Test CreditProvidersTab component
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { CreditProvidersTab } from '../../tabs/CreditProvidersTab';

// Mock authToken and errorSanitizer (used by local apiFetch)
const mockFetchWithTimeout = vi.fn();

vi.mock('../../api/authToken', () => ({
  getAuthHeaders: () => ({ Authorization: 'Bearer test' }),
  fetchWithTimeout: (...args: unknown[]) => mockFetchWithTimeout(...args),
}));

vi.mock('../../api/errorSanitizer', () => ({
  parseError: vi.fn(async () => 'API Error'),
}));

const mockProviders = [
  {
    id: 'cfg-1', provider_id: 'prov-a', provider_name: 'FinCo',
    mode: 'live', is_active: true, priority: 1,
    min_amount_minor: 100000, max_amount_minor: 5000000,
  },
  {
    id: 'cfg-2', provider_id: 'prov-b', provider_name: 'LendCorp',
    mode: 'sandbox', is_active: false, priority: 2,
    min_amount_minor: 50000, max_amount_minor: 2000000,
  },
];

const mockStats = [
  {
    provider_id: 'prov-a', total_drawdowns: '120', active: '45', overdue: '3',
    paid: '72', defaulted: '0', total_disbursed_minor: '15000000',
    outstanding_minor: '5000000', total_repaid_minor: '10000000',
  },
];

const mockHealth = [
  { providerId: 'prov-a', status: 'healthy' as const, latencyMs: 120, lastChecked: '2026-01-15T10:00:00Z', approvalRate: 85 },
  { providerId: 'prov-b', status: 'degraded' as const, latencyMs: 450, lastChecked: '2026-01-15T10:00:00Z' },
];

function okResponse(data: unknown) {
  return { ok: true, json: () => Promise.resolve(data) };
}

describe('CreditProvidersTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 3 parallel fetches: providers, dashboard, health
    mockFetchWithTimeout
      .mockResolvedValueOnce(okResponse({ providers: mockProviders }))
      .mockResolvedValueOnce(okResponse({ providerStats: mockStats }))
      .mockResolvedValueOnce(okResponse({ providers: mockHealth }));
  });

  it('shows loading state initially', () => {
    mockFetchWithTimeout.mockReset();
    mockFetchWithTimeout.mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve(okResponse({ providers: [] })), 100))
    );
    render(<CreditProvidersTab />);
    expect(screen.getByText('Loading finance dashboard...')).toBeInTheDocument();
  });

  it('renders header after loading', async () => {
    render(<CreditProvidersTab />);
    await waitFor(() => {
      expect(screen.getByText('Finance & Credit Providers')).toBeInTheDocument();
    });
  });

  it('shows error banner on fetch failure', async () => {
    mockFetchWithTimeout.mockReset();
    mockFetchWithTimeout.mockRejectedValue(new Error('Network error'));

    render(<CreditProvidersTab />);
    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('displays summary cards', async () => {
    render(<CreditProvidersTab />);
    await waitFor(() => {
      expect(screen.getByText('Total Disbursed')).toBeInTheDocument();
      // "Outstanding" appears in both summary card and stats table header
      expect(screen.getAllByText('Outstanding').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Repaid').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Active Loans')).toBeInTheDocument();
      // "Overdue" appears in both summary card and stats table header
      expect(screen.getAllByText('Overdue').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('displays provider health section', async () => {
    render(<CreditProvidersTab />);
    await waitFor(() => {
      expect(screen.getByText('Provider Health')).toBeInTheDocument();
      // prov-a/prov-b appear in both health cards and provider table
      expect(screen.getAllByText('prov-a').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('healthy')).toBeInTheDocument();
      expect(screen.getAllByText('prov-b').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('degraded')).toBeInTheDocument();
    });
  });

  it('displays latency and approval rate', async () => {
    render(<CreditProvidersTab />);
    await waitFor(() => {
      expect(screen.getByText(/120ms/)).toBeInTheDocument();
      expect(screen.getByText(/Approval: 85%/)).toBeInTheDocument();
      expect(screen.getByText(/450ms/)).toBeInTheDocument();
    });
  });

  it('renders providers table', async () => {
    render(<CreditProvidersTab />);
    await waitFor(() => {
      expect(screen.getByText('Providers (2)')).toBeInTheDocument();
      expect(screen.getByText('FinCo')).toBeInTheDocument();
      expect(screen.getByText('LendCorp')).toBeInTheDocument();
    });
  });

  it('shows provider modes', async () => {
    render(<CreditProvidersTab />);
    await waitFor(() => {
      expect(screen.getByText('live')).toBeInTheDocument();
      expect(screen.getByText('sandbox')).toBeInTheDocument();
    });
  });

  it('shows disable button for active provider', async () => {
    render(<CreditProvidersTab />);
    await waitFor(() => {
      expect(screen.getByText('Disable')).toBeInTheDocument();
    });
  });

  it('shows enable button for inactive provider', async () => {
    render(<CreditProvidersTab />);
    await waitFor(() => {
      expect(screen.getByText('Enable')).toBeInTheDocument();
    });
  });

  it('shows confirm dialog on toggle click', async () => {
    render(<CreditProvidersTab />);
    await waitFor(() => {
      expect(screen.getByText('Disable')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Disable'));
    await waitFor(() => {
      expect(screen.getByText('Disable Credit Provider')).toBeInTheDocument();
      expect(screen.getByText(/Disable "FinCo"/)).toBeInTheDocument();
    });
  });

  it('renders per-provider stats table', async () => {
    render(<CreditProvidersTab />);
    await waitFor(() => {
      expect(screen.getByText('Per-Provider Stats')).toBeInTheDocument();
    });
  });

  it('shows retry button in error state', async () => {
    mockFetchWithTimeout.mockReset();
    mockFetchWithTimeout.mockRejectedValue(new Error('Server down'));

    render(<CreditProvidersTab />);
    await waitFor(() => {
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });
  });
});
