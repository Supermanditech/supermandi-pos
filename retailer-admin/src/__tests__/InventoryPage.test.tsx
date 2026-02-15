import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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
  useUrlState: (key: string, defaultValue: string = '') => {
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

const mockAuthFetch = vi.fn();
vi.mock('../lib/api', () => ({
  authFetch: (...args: unknown[]) => mockAuthFetch(...args),
  safeJson: (res: { json: () => Promise<unknown> }) => res.json(),
}));

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
  });

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
    mockAuthFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        success: true,
        data: [],
        totals: { totalSkus: 0, totalEntries: 0, todaysMovements: 0 },
        pagination: { total: 0, hasMore: false },
      }),
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('No ledger entries yet')).toBeInTheDocument();
    });
  });

  it('renders ledger entries', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        success: true,
        data: [
          { id: 'e1', productName: 'Rice', transactionType: 'sale', deltaQty: -5, stockBefore: 100, stockAfter: 95, createdAt: '2026-01-01T10:00:00Z', productId: 'p1', storeId: 's1' },
        ],
        totals: { totalSkus: 10, totalEntries: 50, todaysMovements: 3 },
        pagination: { total: 1, hasMore: false },
      }),
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Rice')).toBeInTheDocument();
      expect(screen.getByText('OUTWARD')).toBeInTheDocument();
    });
  });

  it('shows summary stats', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        success: true,
        data: [],
        totals: { totalSkus: 10, totalEntries: 50, todaysMovements: 3 },
        pagination: { total: 0, hasMore: false },
      }),
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('10')).toBeInTheDocument();
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
});
