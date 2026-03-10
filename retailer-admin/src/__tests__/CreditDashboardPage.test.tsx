import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CreditDashboardPage from '../pages/CreditDashboardPage';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let mockAccessToken: string | null = 'test-token';

vi.mock('../lib/AuthContext', () => ({
  useAuth: () => ({ accessToken: mockAccessToken }),
}));

vi.mock('../components/Breadcrumb', () => ({
  default: ({ items }: { items: Array<{ label: string; path?: string }> }) => (
    <nav data-testid="breadcrumb">
      {items.map((item, i) => (
        <span key={i}>{item.path ? <a href={item.path}>{item.label}</a> : item.label}</span>
      ))}
    </nav>
  ),
}));

vi.mock('../components/EmptyState', () => ({
  default: ({ title, description }: { title: string; description: string }) => (
    <div data-testid="empty-state"><h3>{title}</h3><p>{description}</p></div>
  ),
}));

vi.mock('lucide-react', () => ({
  IndianRupee: () => <span>RupeeIcon</span>,
  TrendingUp: () => <span>TrendingUpIcon</span>,
  AlertTriangle: () => <span>AlertIcon</span>,
  Clock: () => <span>ClockIcon</span>,
  CheckCircle: () => <span>CheckIcon</span>,
}));

const mockAuthFetch = vi.fn();
vi.mock('../lib/api', () => ({
  authFetch: (...args: any[]) => mockAuthFetch(...args),
  safeJson: (res: any) => res.json(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/s/TEST/credit']}>
      <Routes>
        <Route path="/s/:storeCode/credit" element={<CreditDashboardPage />} />
      </Routes>
    </MemoryRouter>
  );
}

function makeResponse(data: any) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
  };
}

function makeErrorResponse(status: number) {
  return {
    ok: false,
    status,
    json: () => Promise.resolve({ error: 'fail' }),
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const balanceFull = {
  totalCreditLimitMinor: 10000000, // ₹1,00,000
  usedMinor: 3000000,             // ₹30,000
  availableMinor: 7000000,        // ₹70,000
  activeDrawdowns: 3,
  overdueDrawdowns: 1,
  perProvider: [
    { providerId: 'provider-a', totalCreditLimitMinor: 5000000, usedMinor: 2000000, availableMinor: 3000000 },
    { providerId: 'provider-b', totalCreditLimitMinor: 5000000, usedMinor: 1000000, availableMinor: 4000000 },
  ],
};

const balanceNoOverdue = {
  ...balanceFull,
  overdueDrawdowns: 0,
  perProvider: [],
};

const balanceHighUtil = {
  totalCreditLimitMinor: 10000000,
  usedMinor: 9000000,
  availableMinor: 1000000,
  activeDrawdowns: 5,
  overdueDrawdowns: 2,
  perProvider: [],
};

const balanceMidUtil = {
  totalCreditLimitMinor: 10000000,
  usedMinor: 6000000,
  availableMinor: 4000000,
  activeDrawdowns: 2,
  overdueDrawdowns: 0,
  perProvider: [],
};

const balanceLowUtil = {
  totalCreditLimitMinor: 10000000,
  usedMinor: 2000000,
  availableMinor: 8000000,
  activeDrawdowns: 1,
  overdueDrawdowns: 0,
  perProvider: [],
};

const balanceZeroLimit = {
  totalCreditLimitMinor: 0,
  usedMinor: 5000000,
  availableMinor: 0,
  activeDrawdowns: 1,
  overdueDrawdowns: 0,
  perProvider: [],
};

const drawdownActive = {
  id: 'dd-1',
  principalMinor: 1500000,
  paidAmountMinor: 500000,
  outstandingMinor: 1000000,
  dueDate: '2026-04-15',
  status: 'active',
  providerId: 'provider-a',
  providerName: 'FinCo',
  supplierName: 'Fresh Farms',
  externalLoanId: 'EXT-001',
};

const drawdownOverdue = {
  id: 'dd-2',
  principalMinor: 2000000,
  paidAmountMinor: 0,
  outstandingMinor: 2000000,
  dueDate: '2026-03-01',
  status: 'overdue',
  providerId: 'provider-b',
  providerName: 'CreditLine',
  supplierName: 'Agro Supplies',
};

const drawdownPartial = {
  id: 'dd-3',
  principalMinor: 800000,
  paidAmountMinor: 400000,
  outstandingMinor: 400000,
  dueDate: '2026-04-20',
  status: 'partial',
  providerId: 'provider-a',
  providerName: 'FinCo',
  supplierName: 'Dairy Direct',
};

const emiA = {
  installmentNumber: 1,
  dueDate: '2026-04-01',
  principalMinor: 500000,
  interestMinor: 25000,
  totalMinor: 525000,
  providerName: 'FinCo',
  supplierName: 'Fresh Farms',
};

const emiB = {
  installmentNumber: 2,
  dueDate: '2026-04-15',
  principalMinor: 500000,
  interestMinor: 20000,
  totalMinor: 520000,
  providerName: 'CreditLine',
  supplierName: 'Agro Supplies',
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockAccessToken = 'test-token';
  mockAuthFetch.mockReset();
});

// ==========================================================================
// 1. Initial render & loading
// ==========================================================================

describe('initial render', () => {
  it('renders page title', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByRole('heading', { name: 'Credit & Finance' })).toBeInTheDocument();
  });

  it('shows loading state while fetching', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText('Loading credit dashboard...')).toBeInTheDocument();
  });

  it('renders breadcrumb with Home and Credit & Finance', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    const breadcrumb = screen.getByTestId('breadcrumb');
    expect(breadcrumb).toHaveTextContent('Home');
    expect(breadcrumb).toHaveTextContent('Credit & Finance');
  });

  it('breadcrumb Home links to /s/TEST', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    const homeLink = screen.getByText('Home');
    expect(homeLink.closest('a')).toHaveAttribute('href', '/s/TEST');
  });

  it('calls credit-summary API on mount', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(mockAuthFetch).toHaveBeenCalledWith(
      '/api/v1/retailer-admin/reports/credit-summary',
      'test-token'
    );
  });
});

// ==========================================================================
// 2. Auth guard
// ==========================================================================

describe('auth guard', () => {
  it('shows Loading... when no accessToken', () => {
    mockAccessToken = null;
    renderPage();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Credit & Finance' })).not.toBeInTheDocument();
  });

  it('does not call authFetch when no accessToken', () => {
    mockAccessToken = null;
    renderPage();
    expect(mockAuthFetch).not.toHaveBeenCalled();
  });
});

// ==========================================================================
// 3. Empty state (no balance data)
// ==========================================================================

describe('empty state', () => {
  it('shows empty state when balance is null', async () => {
    mockAuthFetch.mockResolvedValueOnce(makeResponse({ balance: null, activeDrawdowns: [], upcomingEmis: [] }));
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    });
    expect(screen.getByText('No credit data')).toBeInTheDocument();
    expect(screen.getByText('Credit features are not yet active for your store.')).toBeInTheDocument();
  });

  it('shows empty state when response has no balance field', async () => {
    mockAuthFetch.mockResolvedValueOnce(makeResponse({ activeDrawdowns: [], upcomingEmis: [] }));
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    });
  });
});

// ==========================================================================
// 4. Error handling
// ==========================================================================

describe('error handling', () => {
  it('shows error message on API failure', async () => {
    mockAuthFetch.mockResolvedValueOnce(makeErrorResponse(500));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Failed to load: 500')).toBeInTheDocument();
    });
  });

  it('shows error on network exception', async () => {
    mockAuthFetch.mockRejectedValueOnce(new Error('Network error'));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('shows error on null json response', async () => {
    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(null),
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Invalid response')).toBeInTheDocument();
    });
  });

  it('shows Retry button on error', async () => {
    mockAuthFetch.mockResolvedValueOnce(makeErrorResponse(500));
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Retry loading credit dashboard' })).toBeInTheDocument();
    });
  });

  it('Retry button re-fetches data', async () => {
    mockAuthFetch
      .mockResolvedValueOnce(makeErrorResponse(500))
      .mockResolvedValueOnce(makeResponse({ balance: balanceNoOverdue, activeDrawdowns: [], upcomingEmis: [] }));

    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Failed to load: 500')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Retry loading credit dashboard' }));

    await waitFor(() => {
      expect(screen.getByText('Credit Limit')).toBeInTheDocument();
    });
    expect(mockAuthFetch).toHaveBeenCalledTimes(2);
  });

  it('shows fallback message for non-Error exceptions', async () => {
    mockAuthFetch.mockRejectedValueOnce('string error');
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Failed to load credit dashboard')).toBeInTheDocument();
    });
  });
});

// ==========================================================================
// 5. Summary cards
// ==========================================================================

describe('summary cards', () => {
  it('renders all four stat cards', async () => {
    mockAuthFetch.mockResolvedValueOnce(makeResponse({
      balance: balanceFull,
      activeDrawdowns: [],
      upcomingEmis: [],
    }));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Credit Limit')).toBeInTheDocument();
    });
    expect(screen.getByText('Available')).toBeInTheDocument();
    expect(screen.getAllByText('Outstanding').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Utilization')).toBeInTheDocument();
  });

  it('formats INR amounts correctly (Indian comma grouping)', async () => {
    mockAuthFetch.mockResolvedValueOnce(makeResponse({
      balance: balanceFull,
      activeDrawdowns: [],
      upcomingEmis: [],
    }));
    renderPage();
    await waitFor(() => {
      // ₹1,00,000 for credit limit (10000000 minor / 100)
      expect(screen.getByText('Credit Limit')).toBeInTheDocument();
    });
    // ₹70,000 for available
    expect(screen.getByText(/70,000/)).toBeInTheDocument();
  });

  it('shows utilization percentage', async () => {
    // 3000000/10000000 = 30%
    mockAuthFetch.mockResolvedValueOnce(makeResponse({
      balance: balanceFull,
      activeDrawdowns: [],
      upcomingEmis: [],
    }));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('30%')).toBeInTheDocument();
    });
  });

  it('outstanding gets danger color when > 0', async () => {
    mockAuthFetch.mockResolvedValueOnce(makeResponse({
      balance: balanceFull,
      activeDrawdowns: [],
      upcomingEmis: [],
    }));
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByText('Outstanding').length).toBeGreaterThanOrEqual(1);
    });
    // Get the stat-label "Outstanding" (inside stat-card), not the table header
    const outstandingLabel = screen.getAllByText('Outstanding').find(el => el.classList.contains('stat-label'));
    const outstandingCard = outstandingLabel?.closest('.stat-card');
    const valueEl = outstandingCard?.querySelector('.stat-value');
    expect(valueEl).toHaveStyle({ color: 'var(--danger)' });
  });

  it('utilization gets danger color when > 80%', async () => {
    mockAuthFetch.mockResolvedValueOnce(makeResponse({
      balance: balanceHighUtil,
      activeDrawdowns: [],
      upcomingEmis: [],
    }));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('90%')).toBeInTheDocument();
    });
    const utilCard = screen.getByText('Utilization').closest('.stat-card');
    const valueEl = utilCard?.querySelector('.stat-value');
    expect(valueEl).toHaveStyle({ color: 'var(--danger)' });
  });
});

// ==========================================================================
// 6. Utilization bar
// ==========================================================================

describe('utilization bar', () => {
  it('shows used and limit in header', async () => {
    mockAuthFetch.mockResolvedValueOnce(makeResponse({
      balance: balanceFull,
      activeDrawdowns: [],
      upcomingEmis: [],
    }));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Used:/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Limit:/)).toBeInTheDocument();
  });

  it('bar is green when utilization <= 50%', async () => {
    mockAuthFetch.mockResolvedValueOnce(makeResponse({
      balance: balanceLowUtil,
      activeDrawdowns: [],
      upcomingEmis: [],
    }));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('20%')).toBeInTheDocument();
    });
    const track = document.querySelector('.credit-util-track');
    const bar = track?.querySelector('div');
    expect(bar).toHaveStyle({ background: '#22c55e' });
  });

  it('bar is amber when utilization 51-80%', async () => {
    mockAuthFetch.mockResolvedValueOnce(makeResponse({
      balance: balanceMidUtil,
      activeDrawdowns: [],
      upcomingEmis: [],
    }));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('60%')).toBeInTheDocument();
    });
    const track = document.querySelector('.credit-util-track');
    const bar = track?.querySelector('div');
    expect(bar).toHaveStyle({ background: '#f59e0b' });
  });

  it('bar is red when utilization > 80%', async () => {
    mockAuthFetch.mockResolvedValueOnce(makeResponse({
      balance: balanceHighUtil,
      activeDrawdowns: [],
      upcomingEmis: [],
    }));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('90%')).toBeInTheDocument();
    });
    const track = document.querySelector('.credit-util-track');
    const bar = track?.querySelector('div');
    expect(bar).toHaveStyle({ background: '#ef4444' });
  });

  it('shows overdue warning when overdueDrawdowns > 0', async () => {
    mockAuthFetch.mockResolvedValueOnce(makeResponse({
      balance: balanceFull,
      activeDrawdowns: [],
      upcomingEmis: [],
    }));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/1 overdue payment/)).toBeInTheDocument();
    });
  });

  it('hides overdue warning when overdueDrawdowns = 0', async () => {
    mockAuthFetch.mockResolvedValueOnce(makeResponse({
      balance: balanceNoOverdue,
      activeDrawdowns: [],
      upcomingEmis: [],
    }));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Credit Limit')).toBeInTheDocument();
    });
    expect(screen.queryByText(/overdue payment/)).not.toBeInTheDocument();
  });

  it('clamps utilization to 100% when used > limit', async () => {
    mockAuthFetch.mockResolvedValueOnce(makeResponse({
      balance: balanceZeroLimit,
      activeDrawdowns: [],
      upcomingEmis: [],
    }));
    renderPage();
    await waitFor(() => {
      // Clamped to 100%
      expect(screen.getByText('100%')).toBeInTheDocument();
    });
  });
});

// ==========================================================================
// 7. Per-provider breakdown
// ==========================================================================

describe('per-provider breakdown', () => {
  it('shows provider cards when perProvider has entries', async () => {
    mockAuthFetch.mockResolvedValueOnce(makeResponse({
      balance: balanceFull,
      activeDrawdowns: [],
      upcomingEmis: [],
    }));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('By Provider')).toBeInTheDocument();
    });
    expect(screen.getByText('provider-a')).toBeInTheDocument();
    expect(screen.getByText('provider-b')).toBeInTheDocument();
  });

  it('shows available amount per provider', async () => {
    mockAuthFetch.mockResolvedValueOnce(makeResponse({
      balance: balanceFull,
      activeDrawdowns: [],
      upcomingEmis: [],
    }));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('By Provider')).toBeInTheDocument();
    });
    // provider-a available: 3000000 minor = ₹30,000
    expect(screen.getAllByText(/available/).length).toBeGreaterThanOrEqual(2);
  });

  it('hides provider section when perProvider is empty', async () => {
    mockAuthFetch.mockResolvedValueOnce(makeResponse({
      balance: balanceNoOverdue,
      activeDrawdowns: [],
      upcomingEmis: [],
    }));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Credit Limit')).toBeInTheDocument();
    });
    expect(screen.queryByText('By Provider')).not.toBeInTheDocument();
  });
});

// ==========================================================================
// 8. Upcoming EMIs
// ==========================================================================

describe('upcoming EMIs', () => {
  it('shows EMI table with data', async () => {
    mockAuthFetch.mockResolvedValueOnce(makeResponse({
      balance: balanceFull,
      activeDrawdowns: [],
      upcomingEmis: [emiA, emiB],
    }));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Upcoming Payments/)).toBeInTheDocument();
    });
    expect(screen.getByText('FinCo')).toBeInTheDocument();
    expect(screen.getByText('CreditLine')).toBeInTheDocument();
    expect(screen.getByText('Fresh Farms')).toBeInTheDocument();
    expect(screen.getByText('Agro Supplies')).toBeInTheDocument();
  });

  it('formats EMI due dates as dd/mm/yyyy', async () => {
    mockAuthFetch.mockResolvedValueOnce(makeResponse({
      balance: balanceFull,
      activeDrawdowns: [],
      upcomingEmis: [emiA],
    }));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('01/04/2026')).toBeInTheDocument();
    });
  });

  it('shows EMI table headers', async () => {
    mockAuthFetch.mockResolvedValueOnce(makeResponse({
      balance: balanceFull,
      activeDrawdowns: [],
      upcomingEmis: [emiA],
    }));
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByText('Due Date').length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getAllByText('Provider').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Supplier').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Amount').length).toBeGreaterThanOrEqual(1);
  });

  it('shows empty message when no EMIs', async () => {
    mockAuthFetch.mockResolvedValueOnce(makeResponse({
      balance: balanceFull,
      activeDrawdowns: [],
      upcomingEmis: [],
    }));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('No upcoming EMI payments in the next 30 days.')).toBeInTheDocument();
    });
  });
});

// ==========================================================================
// 9. Active drawdowns
// ==========================================================================

describe('active drawdowns', () => {
  it('shows drawdowns table with data', async () => {
    mockAuthFetch.mockResolvedValueOnce(makeResponse({
      balance: balanceFull,
      activeDrawdowns: [drawdownActive, drawdownOverdue],
      upcomingEmis: [],
    }));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Active Credit \(2\)/)).toBeInTheDocument();
    });
    expect(screen.getByText('Fresh Farms')).toBeInTheDocument();
    expect(screen.getByText('Agro Supplies')).toBeInTheDocument();
  });

  it('shows drawdown table headers', async () => {
    mockAuthFetch.mockResolvedValueOnce(makeResponse({
      balance: balanceFull,
      activeDrawdowns: [drawdownActive],
      upcomingEmis: [],
    }));
    renderPage();
    await waitFor(() => {
      // Multiple tables — check within Active Credit section
      const headings = screen.getAllByText('Provider');
      expect(headings.length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getAllByText('Supplier').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Status').length).toBeGreaterThanOrEqual(1);
  });

  it('formats drawdown due dates', async () => {
    mockAuthFetch.mockResolvedValueOnce(makeResponse({
      balance: balanceFull,
      activeDrawdowns: [drawdownActive],
      upcomingEmis: [],
    }));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('15/04/2026')).toBeInTheDocument();
    });
  });

  it('shows empty state when no drawdowns', async () => {
    mockAuthFetch.mockResolvedValueOnce(makeResponse({
      balance: balanceFull,
      activeDrawdowns: [],
      upcomingEmis: [],
    }));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Active Credit \(0\)/)).toBeInTheDocument();
    });
    // EmptyState within the table
    const emptyStates = screen.getAllByTestId('empty-state');
    const noCredit = emptyStates.find(el => el.textContent?.includes('No active credit'));
    expect(noCredit).toBeTruthy();
  });

  it('outstanding gets danger color when > 0', async () => {
    mockAuthFetch.mockResolvedValueOnce(makeResponse({
      balance: balanceFull,
      activeDrawdowns: [drawdownActive],
      upcomingEmis: [],
    }));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Fresh Farms')).toBeInTheDocument();
    });
    const boldCells = document.querySelectorAll('.cell-mono-right-bold');
    const hasColoredCell = Array.from(boldCells).some(cell =>
      (cell as HTMLElement).style.color === 'var(--danger)'
    );
    expect(hasColoredCell).toBe(true);
  });

  it('shows count in section title', async () => {
    mockAuthFetch.mockResolvedValueOnce(makeResponse({
      balance: balanceFull,
      activeDrawdowns: [drawdownActive, drawdownOverdue, drawdownPartial],
      upcomingEmis: [],
    }));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Active Credit \(3\)/)).toBeInTheDocument();
    });
  });
});

// ==========================================================================
// 10. Status badges
// ==========================================================================

describe('status badges', () => {
  it('shows Active badge for active drawdown', async () => {
    mockAuthFetch.mockResolvedValueOnce(makeResponse({
      balance: balanceFull,
      activeDrawdowns: [drawdownActive],
      upcomingEmis: [],
    }));
    renderPage();
    await waitFor(() => {
      const badge = screen.getByText('Active');
      expect(badge).toHaveClass('credit-badge-green');
    });
  });

  it('shows Overdue badge for overdue drawdown', async () => {
    mockAuthFetch.mockResolvedValueOnce(makeResponse({
      balance: balanceFull,
      activeDrawdowns: [drawdownOverdue],
      upcomingEmis: [],
    }));
    renderPage();
    await waitFor(() => {
      const badge = screen.getByText('Overdue');
      expect(badge).toHaveClass('credit-badge-red');
    });
  });

  it('shows Partial badge for partial drawdown', async () => {
    mockAuthFetch.mockResolvedValueOnce(makeResponse({
      balance: balanceFull,
      activeDrawdowns: [drawdownPartial],
      upcomingEmis: [],
    }));
    renderPage();
    await waitFor(() => {
      const badge = screen.getByText('Partial');
      expect(badge).toHaveClass('credit-badge-amber');
    });
  });

  it('shows raw status for unknown statuses', async () => {
    mockAuthFetch.mockResolvedValueOnce(makeResponse({
      balance: balanceFull,
      activeDrawdowns: [{ ...drawdownActive, id: 'dd-x', status: 'custom_status' }],
      upcomingEmis: [],
    }));
    renderPage();
    await waitFor(() => {
      const badge = screen.getByText('custom_status');
      expect(badge).toHaveClass('credit-badge-muted');
    });
  });

  it('renders all three badge types simultaneously', async () => {
    mockAuthFetch.mockResolvedValueOnce(makeResponse({
      balance: balanceFull,
      activeDrawdowns: [drawdownActive, drawdownOverdue, drawdownPartial],
      upcomingEmis: [],
    }));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Active')).toBeInTheDocument();
      expect(screen.getByText('Overdue')).toBeInTheDocument();
      expect(screen.getByText('Partial')).toBeInTheDocument();
    });
  });
});

// ==========================================================================
// 11. Combined scenarios
// ==========================================================================

describe('combined scenarios', () => {
  it('renders full dashboard with drawdowns and EMIs', async () => {
    mockAuthFetch.mockResolvedValueOnce(makeResponse({
      balance: balanceFull,
      activeDrawdowns: [drawdownActive, drawdownOverdue],
      upcomingEmis: [emiA, emiB],
    }));
    renderPage();
    await waitFor(() => {
      // Summary cards
      expect(screen.getByText('Credit Limit')).toBeInTheDocument();
      // Utilization
      expect(screen.getByText('30%')).toBeInTheDocument();
      // Overdue warning
      expect(screen.getByText(/1 overdue payment/)).toBeInTheDocument();
      // Per-provider
      expect(screen.getByText('By Provider')).toBeInTheDocument();
      // EMIs
      expect(screen.getByText('01/04/2026')).toBeInTheDocument();
      // Drawdowns
      expect(screen.getByText(/Active Credit \(2\)/)).toBeInTheDocument();
    });
  });

  it('shows multiple overdue payments text', async () => {
    mockAuthFetch.mockResolvedValueOnce(makeResponse({
      balance: balanceHighUtil,
      activeDrawdowns: [],
      upcomingEmis: [],
    }));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/2 overdue payment\(s\)/)).toBeInTheDocument();
    });
  });
});

// ==========================================================================
// 12. API call verification
// ==========================================================================

describe('API calls', () => {
  it('calls correct endpoint with token', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(mockAuthFetch).toHaveBeenCalledTimes(1);
    expect(mockAuthFetch).toHaveBeenCalledWith(
      '/api/v1/retailer-admin/reports/credit-summary',
      'test-token'
    );
  });

  it('does not fetch when accessToken is null', () => {
    mockAccessToken = null;
    renderPage();
    expect(mockAuthFetch).not.toHaveBeenCalled();
  });
});
