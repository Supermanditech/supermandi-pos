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

vi.mock('../../components/ConfirmDialog', () => ({
  ConfirmDialog: ({ title, message, confirmLabel, onConfirm, onCancel }: {
    title: string; message: string; confirmLabel: string;
    onConfirm: () => void; onCancel: () => void;
  }) => (
    <div data-testid="confirm-dialog">
      <div>{title}</div>
      <div>{message}</div>
      <button onClick={onConfirm}>{confirmLabel}</button>
      <button onClick={onCancel}>Cancel</button>
    </div>
  ),
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

function setupMocks() {
  mockFetchWithTimeout
    .mockResolvedValueOnce(okResponse({ providers: mockProviders }))
    .mockResolvedValueOnce(okResponse({ providerStats: mockStats }))
    .mockResolvedValueOnce(okResponse({ providers: mockHealth }));
}

describe('CreditProvidersTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMocks();
  });

  // ── Loading State ─────────────────────────────────────────

  it('shows loading state initially', () => {
    mockFetchWithTimeout.mockReset();
    mockFetchWithTimeout.mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve(okResponse({ providers: [] })), 100))
    );
    render(<CreditProvidersTab />);
    expect(screen.getByText('Loading finance dashboard...')).toBeInTheDocument();
  });

  // ── Header ────────────────────────────────────────────────

  it('renders header after loading', async () => {
    render(<CreditProvidersTab />);
    await waitFor(() => {
      expect(screen.getByText('Finance & Credit Providers')).toBeInTheDocument();
    });
  });

  // ── Error State ───────────────────────────────────────────

  it('shows error banner on fetch failure', async () => {
    mockFetchWithTimeout.mockReset();
    mockFetchWithTimeout.mockRejectedValue(new Error('Network error'));
    render(<CreditProvidersTab />);
    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
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

  it('retries fetch on Retry click', async () => {
    mockFetchWithTimeout.mockReset();
    mockFetchWithTimeout.mockRejectedValueOnce(new Error('Server down'));
    render(<CreditProvidersTab />);
    await waitFor(() => {
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });
    setupMocks();
    fireEvent.click(screen.getByText('Retry'));
    await waitFor(() => {
      expect(screen.getByText('Finance & Credit Providers')).toBeInTheDocument();
    });
  });

  // ── Summary Cards ─────────────────────────────────────────

  it('displays summary cards', async () => {
    render(<CreditProvidersTab />);
    await waitFor(() => {
      expect(screen.getByText('Total Disbursed')).toBeInTheDocument();
      expect(screen.getAllByText('Outstanding').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Repaid').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Active Loans')).toBeInTheDocument();
      expect(screen.getAllByText('Overdue').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('displays active loans count from stats', async () => {
    render(<CreditProvidersTab />);
    await waitFor(() => {
      // 45 appears in both summary card and stats table
      expect(screen.getAllByText('45').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('displays overdue count from stats', async () => {
    render(<CreditProvidersTab />);
    await waitFor(() => {
      // 3 appears in both summary card and stats table
      expect(screen.getAllByText('3').length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Provider Health ───────────────────────────────────────

  it('displays provider health section', async () => {
    render(<CreditProvidersTab />);
    await waitFor(() => {
      expect(screen.getByText('Provider Health')).toBeInTheDocument();
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

  it('does not show approval rate when not provided', async () => {
    render(<CreditProvidersTab />);
    await waitFor(() => {
      const approvals = screen.getAllByText(/Approval:/);
      expect(approvals.length).toBe(1);
    });
  });

  // ── Providers Table ───────────────────────────────────────

  it('renders providers table with count', async () => {
    render(<CreditProvidersTab />);
    await waitFor(() => {
      expect(screen.getByText('Providers (2)')).toBeInTheDocument();
    });
  });

  it('renders provider names', async () => {
    render(<CreditProvidersTab />);
    await waitFor(() => {
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

  it('renders table column headers', async () => {
    render(<CreditProvidersTab />);
    await waitFor(() => {
      expect(screen.getByText('Mode')).toBeInTheDocument();
      expect(screen.getByText('Priority')).toBeInTheDocument();
      expect(screen.getByText('Min')).toBeInTheDocument();
      expect(screen.getByText('Max')).toBeInTheDocument();
      expect(screen.getByText('Action')).toBeInTheDocument();
    });
  });

  it('renders provider priority values', async () => {
    render(<CreditProvidersTab />);
    await waitFor(() => {
      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
    });
  });

  // ── Enable/Disable Buttons ────────────────────────────────

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

  it('shows confirm dialog on Disable click', async () => {
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

  it('shows confirm dialog on Enable click', async () => {
    render(<CreditProvidersTab />);
    await waitFor(() => {
      expect(screen.getByText('Enable')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Enable'));
    await waitFor(() => {
      expect(screen.getByText('Enable Credit Provider')).toBeInTheDocument();
      expect(screen.getByText(/Enable "LendCorp"/)).toBeInTheDocument();
    });
  });

  it('closes confirm dialog on Cancel', async () => {
    render(<CreditProvidersTab />);
    await waitFor(() => {
      expect(screen.getByText('Disable')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Disable'));
    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Cancel'));
    await waitFor(() => {
      expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument();
    });
  });

  // ── Per-Provider Stats ────────────────────────────────────

  it('renders per-provider stats table', async () => {
    render(<CreditProvidersTab />);
    await waitFor(() => {
      expect(screen.getByText('Per-Provider Stats')).toBeInTheDocument();
    });
  });

  it('renders per-provider stats table headers', async () => {
    render(<CreditProvidersTab />);
    await waitFor(() => {
      expect(screen.getByText('Paid')).toBeInTheDocument();
      expect(screen.getByText('Disbursed')).toBeInTheDocument();
    });
  });

  it('renders stats row data', async () => {
    render(<CreditProvidersTab />);
    await waitFor(() => {
      expect(screen.getByText('120')).toBeInTheDocument();
      expect(screen.getByText('72')).toBeInTheDocument();
    });
  });

  it('does not render per-provider stats when empty', async () => {
    mockFetchWithTimeout.mockReset();
    mockFetchWithTimeout
      .mockResolvedValueOnce(okResponse({ providers: mockProviders }))
      .mockResolvedValueOnce(okResponse({ providerStats: [] }))
      .mockResolvedValueOnce(okResponse({ providers: mockHealth }));
    render(<CreditProvidersTab />);
    await waitFor(() => {
      expect(screen.getByText('Finance & Credit Providers')).toBeInTheDocument();
    });
    expect(screen.queryByText('Per-Provider Stats')).not.toBeInTheDocument();
  });

  // ── Edge Cases ────────────────────────────────────────────

  it('renders Providers (0) when no providers', async () => {
    mockFetchWithTimeout.mockReset();
    mockFetchWithTimeout
      .mockResolvedValueOnce(okResponse({ providers: [] }))
      .mockResolvedValueOnce(okResponse({ providerStats: [] }))
      .mockResolvedValueOnce(okResponse({ providers: [] }));
    render(<CreditProvidersTab />);
    await waitFor(() => {
      expect(screen.getByText('Providers (0)')).toBeInTheDocument();
    });
  });

  it('renders down health status', async () => {
    mockFetchWithTimeout.mockReset();
    mockFetchWithTimeout
      .mockResolvedValueOnce(okResponse({ providers: mockProviders }))
      .mockResolvedValueOnce(okResponse({ providerStats: mockStats }))
      .mockResolvedValueOnce(okResponse({ providers: [
        { providerId: 'prov-c', status: 'down', latencyMs: 5000, lastChecked: '2026-01-15T10:00:00Z' },
      ]}));
    render(<CreditProvidersTab />);
    await waitFor(() => {
      expect(screen.getByText('down')).toBeInTheDocument();
      expect(screen.getByText(/5000ms/)).toBeInTheDocument();
    });
  });

  // ── Confirm dialog content ──────────────────────────────────

  it('shows disable warning message in confirm dialog', async () => {
    render(<CreditProvidersTab />);
    await waitFor(() => {
      expect(screen.getByText('Disable')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Disable'));
    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
      expect(screen.getByText(/stop all new credit applications/)).toBeInTheDocument();
    });
  });

  it('shows enable encouragement message in confirm dialog', async () => {
    render(<CreditProvidersTab />);
    await waitFor(() => {
      expect(screen.getByText('Enable')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Enable'));
    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
      expect(screen.getByText(/allow new credit applications/)).toBeInTheDocument();
    });
  });

  it('confirm dialog shows correct provider name for disable', async () => {
    render(<CreditProvidersTab />);
    await waitFor(() => {
      expect(screen.getByText('Disable')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Disable'));
    await waitFor(() => {
      // FinCo appears in both table and dialog message
      expect(screen.getByText(/Disable "FinCo"\?/)).toBeInTheDocument();
    });
  });

  // ── Fallback error message ─────────────────────────────────

  it('shows fallback error for non-Error exceptions', async () => {
    mockFetchWithTimeout.mockReset();
    mockFetchWithTimeout.mockRejectedValue('string error');
    render(<CreditProvidersTab />);
    await waitFor(() => {
      // Promise.allSettled catches rejections; reason is string so reason?.message is undefined
      // -> throws new Error('Partial load failure') -> caught by outer catch -> err.message = 'Partial load failure'
      expect(screen.getByText('Partial load failure')).toBeInTheDocument();
    });
  });

  // ── Provider ID shown under name ───────────────────────────

  it('renders provider IDs under provider names', async () => {
    render(<CreditProvidersTab />);
    await waitFor(() => {
      expect(screen.getAllByText('prov-a').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('prov-b').length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Per-provider stats table headers ───────────────────────

  it('renders full per-provider stats table headers', async () => {
    render(<CreditProvidersTab />);
    await waitFor(() => {
      expect(screen.getByText('Total')).toBeInTheDocument();
      expect(screen.getAllByText('Active').length).toBeGreaterThanOrEqual(1);
    });
  });
});
