import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PurchaseOrdersPage from '../pages/PurchaseOrdersPage';

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

vi.mock('../components/Modal', () => ({
  default: ({ isOpen, title, children }: { isOpen: boolean; title: string; children: React.ReactNode }) =>
    isOpen ? <div data-testid="modal"><h3>{title}</h3>{children}</div> : null,
}));

vi.mock('../hooks/useUrlState', () => ({
  useUrlState: (key: string, defaultValue: string = '') => {
    const { useState } = require('react');
    return useState(defaultValue);
  },
}));

vi.mock('lucide-react', () => ({
  Truck: () => <span>TruckIcon</span>,
}));

const mockAuthFetch = vi.fn();
vi.mock('../lib/api', () => ({
  authFetch: (...args: unknown[]) => mockAuthFetch(...args),
  safeJson: (res: { json: () => Promise<unknown> }) => res.json(),
}));

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/s/TEST/purchase-orders']}>
      <Routes>
        <Route path="/s/:storeCode/purchase-orders" element={<PurchaseOrdersPage />} />
      </Routes>
    </MemoryRouter>
  );

describe('PurchaseOrdersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders page title', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText('Purchase Orders')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText('Loading purchase orders...')).toBeInTheDocument();
  });

  it('shows empty state', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true, data: [], total: 0 }),
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('No purchase orders yet')).toBeInTheDocument();
    });
  });

  it('renders purchase order list', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        success: true,
        data: [
          {
            id: 'po-1', poNumber: 'PO-001', supplierId: 's1', supplierName: 'Fresh Farms',
            orderDate: '2026-01-15', totalMinor: 500000, status: 'pending',
            itemsCount: 5, createdAt: '2026-01-15',
          },
        ],
        total: 1,
      }),
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('PO-001')).toBeInTheDocument();
      expect(screen.getByText('Fresh Farms')).toBeInTheDocument();
      // "Pending" appears both in the status filter dropdown and the order status
      const pendingElems = screen.getAllByText('Pending');
      expect(pendingElems.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('has status filter and search', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByDisplayValue('All Statuses')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search by supplier name...')).toBeInTheDocument();
  });

  it('shows error with retry', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Failed to load purchase orders/)).toBeInTheDocument();
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });
  });

  it('renders breadcrumb', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByTestId('breadcrumb')).toBeInTheDocument();
  });
});
