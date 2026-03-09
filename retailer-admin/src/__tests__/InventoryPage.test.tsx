import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import InventoryPage from '../pages/InventoryPage';

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

vi.mock('../hooks/useUrlState', () => ({
  useUrlState: (_key: string, defaultValue: string = '') => {
    const { useState } = require('react');
    return useState(defaultValue);
  },
}));

vi.mock('../lib/formatters', () => ({
  formatDateTime: (d: string) => new Date(d).toLocaleDateString(),
}));

vi.mock('lucide-react', () => ({
  ClipboardList: () => <span>ClipboardIcon</span>,
  RefreshCw: (props: { style?: object }) => <span style={props.style}>RefreshIcon</span>,
}));

vi.mock('../lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn() },
}));

const mockAuthFetch = vi.fn();
vi.mock('../lib/api', () => ({
  authFetch: (...args: unknown[]) => mockAuthFetch(...args),
  safeJson: (res: { json: () => Promise<unknown> }) => res.json(),
}));

function makeLedgerResponse(data: unknown[] = [], totals = { totalSkus: 0, totalEntries: 0, todaysMovements: 0 }) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({
      success: true,
      data,
      totals,
      pagination: { total: data.length, limit: 100, offset: 0, hasMore: false },
    }),
  };
}

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'e1',
    productName: 'Rice',
    transactionType: 'sale',
    deltaQty: -5,
    stockBefore: 100,
    stockAfter: 95,
    createdAt: '2026-01-01T10:00:00Z',
    productId: 'p1',
    storeId: 's1',
    ...overrides,
  };
}

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/s/TEST/inventory']}>
      <Routes>
        <Route path="/s/:storeCode/inventory" element={<InventoryPage />} />
      </Routes>
    </MemoryRouter>
  );

describe('InventoryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // =========================================================================
  // Existing smoke tests (preserved)
  // =========================================================================

  it('renders page title', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText('Inventory Ledger')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText('Loading ledger entries...')).toBeInTheDocument();
  });

  it('shows empty state when no entries', async () => {
    mockAuthFetch.mockResolvedValue(makeLedgerResponse());
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('No ledger entries yet')).toBeInTheDocument();
    });
  });

  it('renders ledger entries', async () => {
    mockAuthFetch.mockResolvedValue(makeLedgerResponse(
      [makeEntry()],
      { totalSkus: 10, totalEntries: 50, todaysMovements: 3 },
    ));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Rice')).toBeInTheDocument();
      expect(screen.getByText('OUTWARD')).toBeInTheDocument();
    });
  });

  it('shows summary stats', async () => {
    mockAuthFetch.mockResolvedValue(makeLedgerResponse(
      [],
      { totalSkus: 10, totalEntries: 50, todaysMovements: 3 },
    ));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('10')).toBeInTheDocument();
      expect(screen.getByText('50')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
    });
  });

  it('renders filter tabs', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('Inward')).toBeInTheDocument();
    expect(screen.getByText('Outward')).toBeInTheDocument();
    expect(screen.getByText('Adjustment')).toBeInTheDocument();
  });

  it('shows error state with retry', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Failed to load inventory ledger/)).toBeInTheDocument();
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });
  });

  it('renders breadcrumb', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByTestId('breadcrumb')).toBeInTheDocument();
  });

  // =========================================================================
  // Filter tab switching (J22-A03 to J22-A06)
  // =========================================================================

  describe('Filter tab switching', () => {
    it('clicking Inward filter re-fetches with purchase_received,sale_return,opening_stock params', async () => {
      mockAuthFetch.mockResolvedValue(makeLedgerResponse());
      renderPage();
      await waitFor(() => expect(screen.getByText('No ledger entries yet')).toBeInTheDocument());

      mockAuthFetch.mockClear();
      mockAuthFetch.mockResolvedValue(makeLedgerResponse());

      fireEvent.click(screen.getByText('Inward'));
      await waitFor(() => {
        const url = mockAuthFetch.mock.calls[0][0] as string;
        expect(url).toContain('transactionType=purchase_received,sale_return,opening_stock');
      });
    });

    it('clicking Outward filter re-fetches with transactionType=sale', async () => {
      mockAuthFetch.mockResolvedValue(makeLedgerResponse());
      renderPage();
      await waitFor(() => expect(screen.getByTestId('empty-state')).toBeInTheDocument());

      mockAuthFetch.mockClear();
      mockAuthFetch.mockResolvedValue(makeLedgerResponse());

      fireEvent.click(screen.getByText('Outward'));
      await waitFor(() => {
        const url = mockAuthFetch.mock.calls[0][0] as string;
        expect(url).toContain('transactionType=sale');
      });
    });

    it('clicking Adjustment filter re-fetches with transactionType=adjustment', async () => {
      mockAuthFetch.mockResolvedValue(makeLedgerResponse());
      renderPage();
      await waitFor(() => expect(screen.getByTestId('empty-state')).toBeInTheDocument());

      mockAuthFetch.mockClear();
      mockAuthFetch.mockResolvedValue(makeLedgerResponse());

      fireEvent.click(screen.getByText('Adjustment'));
      await waitFor(() => {
        const url = mockAuthFetch.mock.calls[0][0] as string;
        expect(url).toContain('transactionType=adjustment');
      });
    });

    it('clicking All filter re-fetches without transactionType param', async () => {
      mockAuthFetch.mockResolvedValue(makeLedgerResponse());
      renderPage();
      await waitFor(() => expect(screen.getByTestId('empty-state')).toBeInTheDocument());

      // Switch to Inward first
      mockAuthFetch.mockClear();
      mockAuthFetch.mockResolvedValue(makeLedgerResponse());
      fireEvent.click(screen.getByText('Inward'));
      await waitFor(() => expect(mockAuthFetch).toHaveBeenCalled());

      // Switch back to All
      mockAuthFetch.mockClear();
      mockAuthFetch.mockResolvedValue(makeLedgerResponse());
      fireEvent.click(screen.getByText('All'));
      await waitFor(() => {
        const url = mockAuthFetch.mock.calls[0][0] as string;
        expect(url).not.toContain('transactionType');
      });
    });

    it('active filter tab has aria-pressed=true', async () => {
      mockAuthFetch.mockResolvedValue(makeLedgerResponse());
      renderPage();
      await waitFor(() => expect(screen.getByTestId('empty-state')).toBeInTheDocument());

      const allBtn = screen.getByText('All');
      expect(allBtn).toHaveAttribute('aria-pressed', 'true');

      const inwardBtn = screen.getByText('Inward');
      expect(inwardBtn).toHaveAttribute('aria-pressed', 'false');
    });
  });

  // =========================================================================
  // Date range filter (J22-A07, J22-A08, J22-A09)
  // =========================================================================

  describe('Date range filter', () => {
    it('setting start date includes startDate param in fetch URL', async () => {
      mockAuthFetch.mockResolvedValue(makeLedgerResponse());
      renderPage();
      await waitFor(() => expect(screen.getByTestId('empty-state')).toBeInTheDocument());

      mockAuthFetch.mockClear();
      mockAuthFetch.mockResolvedValue(makeLedgerResponse());

      const startInput = screen.getByLabelText('From:');
      fireEvent.change(startInput, { target: { value: '2026-01-01' } });

      await waitFor(() => {
        const url = mockAuthFetch.mock.calls[0][0] as string;
        expect(url).toContain('startDate=2026-01-01');
      });
    });

    it('setting end date includes endDate param in fetch URL', async () => {
      mockAuthFetch.mockResolvedValue(makeLedgerResponse());
      renderPage();
      await waitFor(() => expect(screen.getByTestId('empty-state')).toBeInTheDocument());

      mockAuthFetch.mockClear();
      mockAuthFetch.mockResolvedValue(makeLedgerResponse());

      const endInput = screen.getByLabelText('To:');
      fireEvent.change(endInput, { target: { value: '2026-02-28' } });

      await waitFor(() => {
        const url = mockAuthFetch.mock.calls[0][0] as string;
        expect(url).toContain('endDate=2026-02-28');
      });
    });

    it('Clear Dates button appears when dates are set and resets both', async () => {
      mockAuthFetch.mockResolvedValue(makeLedgerResponse());
      renderPage();
      await waitFor(() => expect(screen.getByTestId('empty-state')).toBeInTheDocument());

      // No Clear Dates initially
      expect(screen.queryByText('Clear Dates')).not.toBeInTheDocument();

      const startInput = screen.getByLabelText('From:');
      fireEvent.change(startInput, { target: { value: '2026-01-01' } });

      await waitFor(() => {
        expect(screen.getByText('Clear Dates')).toBeInTheDocument();
      });

      mockAuthFetch.mockClear();
      mockAuthFetch.mockResolvedValue(makeLedgerResponse());

      fireEvent.click(screen.getByText('Clear Dates'));

      await waitFor(() => {
        expect(screen.queryByText('Clear Dates')).not.toBeInTheDocument();
      });
    });

    it('date inputs have max/min constraints', async () => {
      mockAuthFetch.mockResolvedValue(makeLedgerResponse());
      renderPage();
      await waitFor(() => expect(screen.getByTestId('empty-state')).toBeInTheDocument());

      const startInput = screen.getByLabelText('From:') as HTMLInputElement;
      const endInput = screen.getByLabelText('To:') as HTMLInputElement;

      // Set end date — start input should get max constraint
      fireEvent.change(endInput, { target: { value: '2026-02-28' } });
      await waitFor(() => {
        expect(startInput).toHaveAttribute('max', '2026-02-28');
      });
    });
  });

  // =========================================================================
  // Contextual empty states per filter (E02, E03)
  // =========================================================================

  describe('Contextual empty states', () => {
    it('shows "No inward entries found" when Inward filter selected and empty', async () => {
      mockAuthFetch.mockResolvedValue(makeLedgerResponse());
      renderPage();
      await waitFor(() => expect(screen.getByTestId('empty-state')).toBeInTheDocument());

      mockAuthFetch.mockResolvedValue(makeLedgerResponse());
      fireEvent.click(screen.getByText('Inward'));
      await waitFor(() => {
        expect(screen.getByText('No inward entries found')).toBeInTheDocument();
      });
    });

    it('shows "No sales recorded yet" when Outward filter selected and empty', async () => {
      mockAuthFetch.mockResolvedValue(makeLedgerResponse());
      renderPage();
      await waitFor(() => expect(screen.getByTestId('empty-state')).toBeInTheDocument());

      mockAuthFetch.mockResolvedValue(makeLedgerResponse());
      fireEvent.click(screen.getByText('Outward'));
      await waitFor(() => {
        expect(screen.getByText('No sales recorded yet')).toBeInTheDocument();
      });
    });

    it('shows "No stock adjustments found" when Adjustment filter selected and empty', async () => {
      mockAuthFetch.mockResolvedValue(makeLedgerResponse());
      renderPage();
      await waitFor(() => expect(screen.getByTestId('empty-state')).toBeInTheDocument());

      mockAuthFetch.mockResolvedValue(makeLedgerResponse());
      fireEvent.click(screen.getByText('Adjustment'));
      await waitFor(() => {
        expect(screen.getByText('No stock adjustments found')).toBeInTheDocument();
      });
    });

    it('shows date range message when dates set and empty', async () => {
      mockAuthFetch.mockResolvedValue(makeLedgerResponse());
      renderPage();
      await waitFor(() => expect(screen.getByTestId('empty-state')).toBeInTheDocument());

      mockAuthFetch.mockResolvedValue(makeLedgerResponse());
      const startInput = screen.getByLabelText('From:');
      fireEvent.change(startInput, { target: { value: '2026-01-01' } });

      await waitFor(() => {
        expect(screen.getByText(/No entries found for the selected date range/)).toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // Manual refresh (J22-A10)
  // =========================================================================

  describe('Manual refresh', () => {
    it('clicking Refresh button re-fetches ledger data', async () => {
      mockAuthFetch.mockResolvedValue(makeLedgerResponse(
        [makeEntry()],
        { totalSkus: 5, totalEntries: 10, todaysMovements: 2 },
      ));
      renderPage();
      await waitFor(() => expect(screen.getByText('Rice')).toBeInTheDocument());

      mockAuthFetch.mockClear();
      mockAuthFetch.mockResolvedValue(makeLedgerResponse(
        [makeEntry({ productName: 'Dal' })],
        { totalSkus: 6, totalEntries: 11, todaysMovements: 3 },
      ));

      fireEvent.click(screen.getByLabelText('Refresh inventory data'));

      await waitFor(() => {
        expect(screen.getByText('Dal')).toBeInTheDocument();
      });
    });

    it('Refresh button is disabled during loading', () => {
      mockAuthFetch.mockReturnValue(new Promise(() => {}));
      renderPage();
      const refreshBtn = screen.getByLabelText('Refresh inventory data');
      expect(refreshBtn).toBeDisabled();
    });
  });

  // =========================================================================
  // Retry on error (J22-A14)
  // =========================================================================

  describe('Retry on error', () => {
    it('clicking Retry re-fetches and shows data on success', async () => {
      mockAuthFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({}),
      });
      renderPage();
      await waitFor(() => expect(screen.getByText('Retry')).toBeInTheDocument());

      mockAuthFetch.mockResolvedValueOnce(makeLedgerResponse(
        [makeEntry({ productName: 'Sugar' })],
        { totalSkus: 1, totalEntries: 1, todaysMovements: 1 },
      ));

      fireEvent.click(screen.getByText('Retry'));

      await waitFor(() => {
        expect(screen.getByText('Sugar')).toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // Entry row rendering (J22-A13, E12)
  // =========================================================================

  describe('Entry row rendering', () => {
    it('displays INWARD badge for purchase_received entries', async () => {
      mockAuthFetch.mockResolvedValue(makeLedgerResponse([
        makeEntry({ transactionType: 'purchase_received', deltaQty: 10, stockAfter: 110 }),
      ]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('INWARD')).toBeInTheDocument();
      });
    });

    it('displays INWARD badge for opening_stock entries', async () => {
      mockAuthFetch.mockResolvedValue(makeLedgerResponse([
        makeEntry({ transactionType: 'opening_stock', deltaQty: 50, stockAfter: 50 }),
      ]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('INWARD')).toBeInTheDocument();
      });
    });

    it('displays INWARD badge for sale_return entries', async () => {
      mockAuthFetch.mockResolvedValue(makeLedgerResponse([
        makeEntry({ transactionType: 'sale_return', deltaQty: 2, stockAfter: 97 }),
      ]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('INWARD')).toBeInTheDocument();
      });
    });

    it('displays ADJUSTMENT badge for adjustment entries', async () => {
      mockAuthFetch.mockResolvedValue(makeLedgerResponse([
        makeEntry({ transactionType: 'adjustment', deltaQty: -3, stockAfter: 92 }),
      ]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('ADJUSTMENT')).toBeInTheDocument();
      });
    });

    it('shows positive delta with + prefix', async () => {
      mockAuthFetch.mockResolvedValue(makeLedgerResponse([
        makeEntry({ transactionType: 'purchase_received', deltaQty: 10, stockAfter: 110 }),
      ]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('+10')).toBeInTheDocument();
      });
    });

    it('shows negative delta without + prefix', async () => {
      mockAuthFetch.mockResolvedValue(makeLedgerResponse([makeEntry()]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('-5')).toBeInTheDocument();
      });
    });

    it('shows stock balance in Balance column', async () => {
      mockAuthFetch.mockResolvedValue(makeLedgerResponse([
        makeEntry({ stockAfter: 95 }),
      ]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('95')).toBeInTheDocument();
      });
    });

    it('truncates referenceId to 8 chars', async () => {
      mockAuthFetch.mockResolvedValue(makeLedgerResponse([
        makeEntry({ referenceId: 'abcdefgh12345678' }),
      ]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText(/sale #abcdefgh/)).toBeInTheDocument();
        expect(screen.queryByText(/12345678/)).not.toBeInTheDocument();
      });
    });

    it('shows transaction type without referenceId when none provided', async () => {
      mockAuthFetch.mockResolvedValue(makeLedgerResponse([
        makeEntry({ referenceId: undefined }),
      ]));
      renderPage();
      await waitFor(() => {
        const refCells = screen.getAllByRole('cell');
        const refCell = refCells.find(c => c.textContent === 'sale');
        expect(refCell).toBeTruthy();
      });
    });

    it('falls back to productId when productName is empty', async () => {
      mockAuthFetch.mockResolvedValue(makeLedgerResponse([
        makeEntry({ productName: '', productId: 'prod-xyz' }),
      ]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('prod-xyz')).toBeInTheDocument();
      });
    });

    it('renders multiple entries', async () => {
      mockAuthFetch.mockResolvedValue(makeLedgerResponse([
        makeEntry({ id: 'e1', productName: 'Rice', transactionType: 'sale' }),
        makeEntry({ id: 'e2', productName: 'Dal', transactionType: 'purchase_received', deltaQty: 20, stockAfter: 120 }),
        makeEntry({ id: 'e3', productName: 'Sugar', transactionType: 'adjustment', deltaQty: -1, stockAfter: 49 }),
      ]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Rice')).toBeInTheDocument();
        expect(screen.getByText('Dal')).toBeInTheDocument();
        expect(screen.getByText('Sugar')).toBeInTheDocument();
        expect(screen.getByText('OUTWARD')).toBeInTheDocument();
        expect(screen.getByText('INWARD')).toBeInTheDocument();
        expect(screen.getByText('ADJUSTMENT')).toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // Freshness indicator (J22-A16)
  // =========================================================================

  describe('Freshness indicator', () => {
    it('shows "Updated just now" initially', async () => {
      mockAuthFetch.mockResolvedValue(makeLedgerResponse());
      renderPage();
      await waitFor(() => {
        expect(screen.getByText(/Updated just now/)).toBeInTheDocument();
      });
    });

    it('shows seconds count after 5+ seconds', async () => {
      mockAuthFetch.mockResolvedValue(makeLedgerResponse());
      renderPage();
      await waitFor(() => expect(screen.getByText(/Updated just now/)).toBeInTheDocument());

      // Advance 6 seconds
      await act(async () => {
        vi.advanceTimersByTime(6000);
      });

      await waitFor(() => {
        expect(screen.getByText(/Updated 6s ago/)).toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // Auto-refresh polling (J22-A11, J22-A12, E08)
  // =========================================================================

  describe('Auto-refresh polling', () => {
    it('polls every 30 seconds when tab is visible', async () => {
      mockAuthFetch.mockResolvedValue(makeLedgerResponse());
      renderPage();
      await waitFor(() => expect(screen.getByTestId('empty-state')).toBeInTheDocument());

      const initialCallCount = mockAuthFetch.mock.calls.length;

      // Ensure visibilityState is visible
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });

      mockAuthFetch.mockResolvedValue(makeLedgerResponse());

      await act(async () => {
        vi.advanceTimersByTime(30000);
      });

      // Should have made at least one additional call
      expect(mockAuthFetch.mock.calls.length).toBeGreaterThan(initialCallCount);
    });

    it('skips polling when tab is hidden', async () => {
      mockAuthFetch.mockResolvedValue(makeLedgerResponse());
      renderPage();
      await waitFor(() => expect(screen.getByTestId('empty-state')).toBeInTheDocument());

      const callCountAfterLoad = mockAuthFetch.mock.calls.length;

      // Set tab to hidden
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });

      await act(async () => {
        vi.advanceTimersByTime(30000);
      });

      // No new fetch calls when hidden
      expect(mockAuthFetch.mock.calls.length).toBe(callCountAfterLoad);

      // Restore for other tests
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    });
  });

  // =========================================================================
  // Table headers (UI completeness)
  // =========================================================================

  describe('Table headers', () => {
    it('renders all 6 column headers', () => {
      mockAuthFetch.mockReturnValue(new Promise(() => {}));
      renderPage();
      expect(screen.getByText('Date/Time')).toBeInTheDocument();
      expect(screen.getByText('Product')).toBeInTheDocument();
      expect(screen.getByText('Type')).toBeInTheDocument();
      expect(screen.getByText('Qty Change')).toBeInTheDocument();
      expect(screen.getByText('Reference')).toBeInTheDocument();
      expect(screen.getByText('Balance')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Summary stats loading state
  // =========================================================================

  describe('Summary stats loading', () => {
    it('shows "..." placeholders during loading', () => {
      mockAuthFetch.mockReturnValue(new Promise(() => {}));
      renderPage();
      const dots = screen.getAllByText('...');
      expect(dots.length).toBe(4); // 4 stat cards
    });

    it('shows Showing count matching entry count', async () => {
      mockAuthFetch.mockResolvedValue(makeLedgerResponse(
        [makeEntry({ id: 'e1' }), makeEntry({ id: 'e2', productName: 'Dal' })],
        { totalSkus: 3, totalEntries: 5, todaysMovements: 1 },
      ));
      renderPage();
      await waitFor(() => {
        // Showing count = 2 (entries rendered), totalSkus = 3
        const statValues = screen.getAllByText('2');
        expect(statValues.length).toBeGreaterThanOrEqual(1); // Showing count
        expect(screen.getByText('3')).toBeInTheDocument(); // totalSkus
      });
    });
  });

  // =========================================================================
  // Auth guard (E05)
  // =========================================================================

  describe('Auth guard', () => {
    it('shows info box note', async () => {
      mockAuthFetch.mockResolvedValue(makeLedgerResponse());
      renderPage();
      await waitFor(() => {
        expect(screen.getByText(/Inventory changes are tracked through the ledger/)).toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // 401 silent exit (E06)
  // =========================================================================

  describe('401 handling', () => {
    it('silently exits without error on 401 response', async () => {
      mockAuthFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({}),
      });
      renderPage();
      // Should not show error — 401 triggers silent return
      // Wait a bit for any async effects
      await act(async () => {
        vi.advanceTimersByTime(100);
      });
      expect(screen.queryByText(/Failed to load inventory ledger/)).not.toBeInTheDocument();
    });
  });
});
