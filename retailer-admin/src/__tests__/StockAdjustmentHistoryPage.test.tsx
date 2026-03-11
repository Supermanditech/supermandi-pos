import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import StockAdjustmentHistoryPage from '../pages/StockAdjustmentHistoryPage';

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

vi.mock('../lib/formatters', () => ({
  formatDateTime: (d: string) => new Date(d).toLocaleDateString(),
}));

vi.mock('lucide-react', () => ({
  ClipboardList: () => <span>ClipboardIcon</span>,
  RefreshCw: (props: { style?: object }) => <span style={props.style}>RefreshIcon</span>,
  ChevronLeft: () => <span>ChevronLeft</span>,
  ChevronRight: () => <span>ChevronRight</span>,
}));

vi.mock('../lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn() },
}));

const mockFetchStockAdjustments = vi.fn();
vi.mock('../api/store', () => ({
  fetchStockAdjustments: (...args: unknown[]) => mockFetchStockAdjustments(...args),
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/s/TEST001/stock-adjustments']}>
      <Routes>
        <Route path="/s/:storeCode/stock-adjustments" element={<StockAdjustmentHistoryPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('SA-P1-011: StockAdjustmentHistoryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    mockFetchStockAdjustments.mockReturnValue(new Promise(() => {})); // never resolves
    renderPage();
    expect(screen.getByText('Loading adjustments...')).toBeTruthy();
  });

  it('renders empty state when no adjustments', async () => {
    mockFetchStockAdjustments.mockResolvedValue({
      success: true,
      adjustments: [],
      total: 0,
      page: 1,
      limit: 50,
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeTruthy();
    });
    expect(screen.getByText('No Stock Adjustments')).toBeTruthy();
  });

  it('renders adjustment data in table', async () => {
    mockFetchStockAdjustments.mockResolvedValue({
      success: true,
      adjustments: [
        {
          id: 'adj-1',
          productId: 'prod-1',
          productName: 'Rice 5kg',
          oldQty: 100,
          newQty: 95,
          reason: 'damage',
          adjustedBy: 'POS_MANUAL_ADJUST',
          adjustedAt: '2026-03-11T10:00:00.000Z',
          notes: 'Broken bag',
          referenceType: 'manual',
        },
      ],
      total: 1,
      page: 1,
      limit: 50,
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Rice 5kg')).toBeTruthy();
    });
    expect(screen.getByText('100')).toBeTruthy();
    expect(screen.getByText('95')).toBeTruthy();
    expect(screen.getByText('-5')).toBeTruthy();
    expect(screen.getByText('Damage')).toBeTruthy();
    expect(screen.getByText('POS Device')).toBeTruthy();
  });

  it('renders positive change with + prefix', async () => {
    mockFetchStockAdjustments.mockResolvedValue({
      success: true,
      adjustments: [
        {
          id: 'adj-2',
          productId: 'prod-2',
          productName: 'Oil 1L',
          oldQty: 10,
          newQty: 15,
          reason: 'found',
          adjustedBy: 'POS_MANUAL_ADJUST',
          adjustedAt: '2026-03-11T11:00:00.000Z',
          notes: null,
          referenceType: 'manual',
        },
      ],
      total: 1,
      page: 1,
      limit: 50,
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('+5')).toBeTruthy();
    });
    expect(screen.getByText('Found')).toBeTruthy();
  });

  it('renders error state', async () => {
    mockFetchStockAdjustments.mockRejectedValue(new Error('Network error'));
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('error-message')).toBeTruthy();
    });
    expect(screen.getByText('Network error')).toBeTruthy();
  });

  it('has page title', async () => {
    mockFetchStockAdjustments.mockResolvedValue({
      success: true,
      adjustments: [],
      total: 0,
      page: 1,
      limit: 50,
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Stock Adjustment History')).toBeTruthy();
    });
  });

  it('renders filter controls', async () => {
    mockFetchStockAdjustments.mockResolvedValue({
      success: true,
      adjustments: [],
      total: 0,
      page: 1,
      limit: 50,
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('filter-from')).toBeTruthy();
      expect(screen.getByTestId('filter-to')).toBeTruthy();
      expect(screen.getByTestId('filter-reason')).toBeTruthy();
    });
  });

  it('calls API with reason filter when selected', async () => {
    mockFetchStockAdjustments.mockResolvedValue({
      success: true,
      adjustments: [],
      total: 0,
      page: 1,
      limit: 50,
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('filter-reason')).toBeTruthy();
    });

    fireEvent.change(screen.getByTestId('filter-reason'), { target: { value: 'theft' } });

    await waitFor(() => {
      const lastCall = mockFetchStockAdjustments.mock.calls[mockFetchStockAdjustments.mock.calls.length - 1];
      expect(lastCall[1]).toMatchObject({ reason: 'theft' });
    });
  });

  it('renders refresh button', async () => {
    mockFetchStockAdjustments.mockResolvedValue({
      success: true,
      adjustments: [],
      total: 0,
      page: 1,
      limit: 50,
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByLabelText('Refresh')).toBeTruthy();
    });
  });

  it('renders pagination when data present', async () => {
    mockFetchStockAdjustments.mockResolvedValue({
      success: true,
      adjustments: [
        {
          id: 'adj-3',
          productId: 'prod-3',
          productName: 'Sugar',
          oldQty: 50,
          newQty: 48,
          reason: 'expired',
          adjustedBy: 'POS_MANUAL_ADJUST',
          adjustedAt: '2026-03-11T12:00:00.000Z',
          notes: null,
          referenceType: 'manual',
        },
      ],
      total: 100,
      page: 1,
      limit: 50,
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('1 / 2')).toBeTruthy();
    });
    expect(screen.getByLabelText('Previous page')).toBeTruthy();
    expect(screen.getByLabelText('Next page')).toBeTruthy();
  });

  it('renders breadcrumb', async () => {
    mockFetchStockAdjustments.mockResolvedValue({
      success: true,
      adjustments: [],
      total: 0,
      page: 1,
      limit: 50,
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('breadcrumb')).toBeTruthy();
    });
  });

  it('renders table headers', async () => {
    mockFetchStockAdjustments.mockResolvedValue({
      success: true,
      adjustments: [
        {
          id: 'adj-4',
          productId: 'prod-4',
          productName: 'Salt',
          oldQty: 30,
          newQty: 25,
          reason: 'correction',
          adjustedBy: 'POS_MANUAL_ADJUST',
          adjustedAt: '2026-03-11T13:00:00.000Z',
          notes: null,
          referenceType: 'manual',
        },
      ],
      total: 1,
      page: 1,
      limit: 50,
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Date')).toBeTruthy();
      expect(screen.getByText('Product')).toBeTruthy();
      expect(screen.getByText('Old Qty')).toBeTruthy();
      expect(screen.getByText('New Qty')).toBeTruthy();
      expect(screen.getByText('Change')).toBeTruthy();
      expect(screen.getByText('Reason')).toBeTruthy();
      expect(screen.getByText('Adjusted By')).toBeTruthy();
    });
  });
});
