import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import InvoicesPage from '../pages/InvoicesPage';

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

vi.mock('lucide-react', () => ({
  FileText: () => <span>FileTextIcon</span>,
}));

const mockAuthFetch = vi.fn();
vi.mock('../lib/api', () => ({
  authFetch: (...args: unknown[]) => mockAuthFetch(...args),
  safeJson: (res: { json: () => Promise<unknown> }) => res.json(),
}));

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/s/TEST/invoices']}>
      <Routes>
        <Route path="/s/:storeCode/invoices" element={<InvoicesPage />} />
      </Routes>
    </MemoryRouter>
  );

describe('InvoicesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders page title', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText('Invoices')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText('Loading invoices...')).toBeInTheDocument();
  });

  it('shows empty state when no invoices', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [], total: 0 }),
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('No invoices yet')).toBeInTheDocument();
    });
  });

  it('renders invoice list', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        data: [
          {
            id: 'inv-1', invoiceNumber: 'INV-001', invoiceDate: '2026-01-15',
            invoiceModel: 'standard', invoiceType: 'sale', status: 'issued',
            sellerName: 'Supplier A', buyerName: 'Store B',
            subtotalMinor: 100000, totalTaxMinor: 18000, totalAmountMinor: 118000,
            amountPaidMinor: 0, balanceDueMinor: 118000, createdAt: '2026-01-15',
          },
        ],
        total: 1,
      }),
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('INV-001')).toBeInTheDocument();
      expect(screen.getByText('Supplier A')).toBeInTheDocument();
      expect(screen.getByText('ISSUED')).toBeInTheDocument();
    });
  });

  it('has status filter dropdown', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    const select = screen.getByDisplayValue('All Statuses');
    expect(select).toBeInTheDocument();
  });

  it('shows error state', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Failed to load invoices/)).toBeInTheDocument();
    });
  });

  it('renders breadcrumb', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByTestId('breadcrumb')).toBeInTheDocument();
  });
});
