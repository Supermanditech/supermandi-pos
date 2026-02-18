import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AnalyticsPage from '../pages/AnalyticsPage';

vi.mock('../lib/AuthContext', () => ({
  useAuth: () => ({ accessToken: 'test-token', store: { id: 's1', name: 'Test', code: 'TEST' } }),
}));

vi.mock('../components/Breadcrumb', () => ({
  default: () => <nav data-testid="breadcrumb">Breadcrumb</nav>,
}));

vi.mock('../lib/formatters', () => ({
  formatCurrency: (v: number) => `Rs ${(v / 100).toFixed(2)}`,
}));

const mockFetchAnalytics = vi.fn();
const mockFetchProductAnalytics = vi.fn();
vi.mock('../api/store', () => ({
  fetchSalesAnalytics: (...args: unknown[]) => mockFetchAnalytics(...args),
  fetchProductAnalytics: (...args: unknown[]) => mockFetchProductAnalytics(...args),
}));

const defaultCategoryData = { data: { salesByGroup: [], missingFields: [] } };

describe('AnalyticsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchProductAnalytics.mockResolvedValue(defaultCategoryData);
  });

  it('shows loading state initially', () => {
    mockFetchAnalytics.mockReturnValue(new Promise(() => {}));
    mockFetchProductAnalytics.mockReturnValue(new Promise(() => {}));
    render(<MemoryRouter><AnalyticsPage /></MemoryRouter>);
    expect(screen.getByText('Sales Analytics')).toBeInTheDocument();
  });

  it('shows error state on failure', async () => {
    mockFetchAnalytics.mockRejectedValue(new Error('Network error'));
    render(<MemoryRouter><AnalyticsPage /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('renders summary cards when data loads', async () => {
    mockFetchAnalytics.mockResolvedValue({
      data: {
        totals: { totalSales: 100000, totalBills: 10, averageBillValue: 10000 },
        daily: [{ date: '2026-01-01', totalSales: 50000, bills: 5 }],
        paymentBreakdown: { cash: 50000, upi: 30000, credit: 20000 },
        topProducts: [{ productId: 'p1', productName: 'Rice', totalAmount: 30000, qtySold: 10 }],
      },
    });
    render(<MemoryRouter><AnalyticsPage /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Total Sales')).toBeInTheDocument();
      expect(screen.getByText('Total Bills')).toBeInTheDocument();
      expect(screen.getByText('10')).toBeInTheDocument();
    });
  });

  it('shows date range picker', () => {
    mockFetchAnalytics.mockReturnValue(new Promise(() => {}));
    mockFetchProductAnalytics.mockReturnValue(new Promise(() => {}));
    render(<MemoryRouter><AnalyticsPage /></MemoryRouter>);
    const dateInputs = screen.getAllByDisplayValue(/\d{4}-\d{2}-\d{2}/);
    expect(dateInputs.length).toBe(2);
  });

  it('retries on clicking Retry', async () => {
    mockFetchAnalytics.mockRejectedValue(new Error('Fail'));
    render(<MemoryRouter><AnalyticsPage /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });
    mockFetchAnalytics.mockResolvedValue({
      data: {
        totals: { totalSales: 0, totalBills: 0, averageBillValue: 0 },
        daily: [],
        paymentBreakdown: { cash: 0, upi: 0, credit: 0 },
        topProducts: [],
      },
    });
    fireEvent.click(screen.getByText('Retry'));
    await waitFor(() => {
      expect(mockFetchAnalytics).toHaveBeenCalledTimes(2);
    });
  });

  it('renders breadcrumb', () => {
    mockFetchAnalytics.mockReturnValue(new Promise(() => {}));
    mockFetchProductAnalytics.mockReturnValue(new Promise(() => {}));
    render(<MemoryRouter><AnalyticsPage /></MemoryRouter>);
    expect(screen.getByTestId('breadcrumb')).toBeInTheDocument();
  });
});
