import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import InvoicesPage from '../pages/InvoicesPage';

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

vi.mock('../hooks/useUrlState', () => ({
  useUrlState: (_key: string, defaultValue: string = '') => {
    const { useState } = require('react');
    return useState(defaultValue);
  },
}));

vi.mock('lucide-react', () => ({
  FileText: () => <span>FileTextIcon</span>,
}));

vi.mock('../components/WhatsAppIcon', () => ({
  WhatsAppIcon: () => <span data-testid="wa-icon">WA</span>,
}));

vi.mock('../lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const mockAuthFetch = vi.fn();
vi.mock('../lib/api', () => ({
  authFetch: (...args: unknown[]) => mockAuthFetch(...args),
  safeJson: (res: { json: () => Promise<unknown> }) => res.json(),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const invoiceA = {
  id: 'inv-1',
  invoiceNumber: 'INV/2026/001',
  invoiceDate: '2026-01-15',
  dueDate: '2026-02-15',
  invoiceModel: 'standard',
  invoiceType: 'sale',
  status: 'issued',
  sellerName: 'Supplier A',
  buyerName: 'Store B',
  subtotalMinor: 100000,
  totalTaxMinor: 18000,
  totalAmountMinor: 118000,
  amountPaidMinor: 50000,
  balanceDueMinor: 68000,
  createdAt: '2026-01-15',
};

const invoiceB = {
  id: 'inv-2',
  invoiceNumber: 'INV-002',
  invoiceDate: '2026-02-01',
  dueDate: null,
  invoiceModel: 'standard',
  invoiceType: 'credit_note',
  status: 'paid',
  sellerName: 'Supplier B',
  buyerName: 'Store B',
  subtotalMinor: 50000,
  totalTaxMinor: 9000,
  totalAmountMinor: 59000,
  amountPaidMinor: 59000,
  balanceDueMinor: 0,
  createdAt: '2026-02-01',
};

const detailFull = {
  ...invoiceA,
  sellerGstin: '29ABCDE1234F1Z5',
  sellerAddress: '123 Main St',
  sellerPhone: '9876543210',
  buyerGstin: '29XYZAB5678C1D6',
  buyerAddress: '456 Oak Ave',
  buyerPhone: '9123456789',
  taxableAmountMinor: 100000,
  discountMinor: 0,
  cgstMinor: 9000,
  sgstMinor: 9000,
  igstMinor: 0,
  platformFeePercent: 2,
  platformFeeMinor: 2000,
  items: [
    {
      id: 'item-1',
      productName: 'Basmati Rice 5kg',
      hsnCode: '1006',
      quantity: 10,
      unit: 'bag',
      unitPriceMinor: 10000,
      taxableAmountMinor: 100000,
      gstRate: 5,
      totalMinor: 105000,
    },
  ],
  payments: [
    {
      id: 'pay-1',
      paymentDate: '2026-01-20',
      amountMinor: 50000,
      paymentMode: 'UPI',
      paymentReference: 'TXN123456',
    },
  ],
};

const detailNoTax = {
  ...detailFull,
  cgstMinor: 0,
  sgstMinor: 0,
  igstMinor: 0,
  amountPaidMinor: 0,
  payments: [],
  sellerPhone: null,
};

const detailAllTax = {
  ...detailFull,
  cgstMinor: 4500,
  sgstMinor: 4500,
  igstMinor: 9000,
};

function makeListResponse(data: unknown[], total: number) {
  return {
    ok: true,
    json: () => Promise.resolve({ data, total }),
  };
}

function makeDetailResponse(data: unknown) {
  return {
    ok: true,
    json: () => Promise.resolve({ data }),
  };
}

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/s/TEST/invoices']}>
      <Routes>
        <Route path="/s/:storeCode/invoices" element={<InvoicesPage />} />
      </Routes>
    </MemoryRouter>
  );

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('InvoicesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthFetch.mockReset();
    mockAccessToken = 'test-token';
  });

  // -----------------------------------------------------------------------
  // 1. Initial render & loading
  // -----------------------------------------------------------------------

  describe('initial render', () => {
    it('renders page title', () => {
      mockAuthFetch.mockReturnValue(new Promise(() => {}));
      renderPage();
      expect(screen.getByRole('heading', { name: 'Invoices' })).toBeInTheDocument();
    });

    it('shows loading state', () => {
      mockAuthFetch.mockReturnValue(new Promise(() => {}));
      renderPage();
      expect(screen.getByText('Loading invoices...')).toBeInTheDocument();
    });

    it('renders breadcrumb with Home and Invoices', () => {
      mockAuthFetch.mockReturnValue(new Promise(() => {}));
      renderPage();
      const breadcrumb = screen.getByTestId('breadcrumb');
      expect(breadcrumb).toBeInTheDocument();
      expect(breadcrumb).toHaveTextContent('Home');
      expect(breadcrumb).toHaveTextContent('Invoices');
    });

    it('breadcrumb Home links to /s/TEST', () => {
      mockAuthFetch.mockReturnValue(new Promise(() => {}));
      renderPage();
      const homeLink = screen.getByText('Home');
      expect(homeLink.closest('a')).toHaveAttribute('href', '/s/TEST');
    });

    it('has status filter dropdown with all options', () => {
      mockAuthFetch.mockReturnValue(new Promise(() => {}));
      renderPage();
      const select = screen.getByLabelText('Filter invoices by status');
      expect(select).toBeInTheDocument();
      expect(screen.getByText('All Statuses')).toBeInTheDocument();
      expect(screen.getByText('Draft')).toBeInTheDocument();
      expect(screen.getByText('Issued')).toBeInTheDocument();
      expect(screen.getByText('Paid')).toBeInTheDocument();
      expect(screen.getByText('Overdue')).toBeInTheDocument();
      expect(screen.getByText('Cancelled')).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // 2. Auth guard
  // -----------------------------------------------------------------------

  describe('auth guard', () => {
    it('shows Loading... when no accessToken', () => {
      mockAccessToken = null;
      renderPage();
      expect(screen.getByText('Loading...')).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Invoices' })).not.toBeInTheDocument();
    });

    it('does not call authFetch when no accessToken', () => {
      mockAccessToken = null;
      renderPage();
      expect(mockAuthFetch).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 3. Invoice list rendering
  // -----------------------------------------------------------------------

  describe('invoice list', () => {
    it('shows empty state when no invoices', async () => {
      mockAuthFetch.mockResolvedValue(makeListResponse([], 0));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('No invoices yet')).toBeInTheDocument();
      });
      expect(screen.getByText(/Invoices will appear here/)).toBeInTheDocument();
    });

    it('renders invoice rows with all columns', async () => {
      mockAuthFetch.mockResolvedValue(makeListResponse([invoiceA], 1));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('INV/2026/001')).toBeInTheDocument();
      });
      expect(screen.getByText('Supplier A')).toBeInTheDocument();
      expect(screen.getByText('ISSUED')).toBeInTheDocument();
      // Type column shows with underscores replaced
      expect(screen.getByText('sale')).toBeInTheDocument();
    });

    it('renders multiple invoices', async () => {
      mockAuthFetch.mockResolvedValue(makeListResponse([invoiceA, invoiceB], 2));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('INV/2026/001')).toBeInTheDocument();
        expect(screen.getByText('INV-002')).toBeInTheDocument();
      });
    });

    it('shows invoice count', async () => {
      mockAuthFetch.mockResolvedValue(makeListResponse([invoiceA], 1));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('1 invoice')).toBeInTheDocument();
      });
    });

    it('shows plural invoice count', async () => {
      mockAuthFetch.mockResolvedValue(makeListResponse([invoiceA, invoiceB], 2));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('2 invoices')).toBeInTheDocument();
      });
    });

    it('replaces underscores in invoice type', async () => {
      const inv = { ...invoiceA, invoiceType: 'credit_note' };
      mockAuthFetch.mockResolvedValue(makeListResponse([inv], 1));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('credit note')).toBeInTheDocument();
      });
    });

    it('shows balance in red when > 0', async () => {
      mockAuthFetch.mockResolvedValue(makeListResponse([invoiceA], 1));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('INV/2026/001')).toBeInTheDocument();
      });
      // balanceDueMinor = 68000 → ₹680.00, colored red via var(--danger)
      const balanceCells = document.querySelectorAll('td.cell-right');
      const balanceCell = Array.from(balanceCells).find(el =>
        el.getAttribute('style')?.includes('var(--danger)')
      );
      expect(balanceCell).toBeTruthy();
    });

    it('shows balance in green when 0', async () => {
      mockAuthFetch.mockResolvedValue(makeListResponse([invoiceB], 1));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('INV-002')).toBeInTheDocument();
      });
      const balanceCells = document.querySelectorAll('td.cell-right');
      const balanceCell = Array.from(balanceCells).find(el =>
        el.getAttribute('style')?.includes('var(--success)')
      );
      expect(balanceCell).toBeTruthy();
    });

    it('uses draft colors for unknown status', async () => {
      const inv = { ...invoiceA, status: 'unknown_status' };
      mockAuthFetch.mockResolvedValue(makeListResponse([inv], 1));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('UNKNOWN_STATUS')).toBeInTheDocument();
      });
      // Falls back to draft colors
      const badge = screen.getByText('UNKNOWN_STATUS');
      expect(badge.style.background).toBe('var(--badge-draft-bg)');
    });

    it('each row has View and PDF buttons', async () => {
      mockAuthFetch.mockResolvedValue(makeListResponse([invoiceA], 1));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('View')).toBeInTheDocument();
        expect(screen.getByText('PDF')).toBeInTheDocument();
      });
    });
  });

  // -----------------------------------------------------------------------
  // 4. Error handling
  // -----------------------------------------------------------------------

  describe('error handling', () => {
    it('shows error when API returns non-ok', async () => {
      mockAuthFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({}),
      });
      renderPage();
      await waitFor(() => {
        expect(screen.getByText(/Failed to load invoices: 500/)).toBeInTheDocument();
      });
    });

    it('shows error when API throws network error', async () => {
      mockAuthFetch.mockRejectedValue(new Error('Network error'));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });

    it('shows fallback error when API throws non-Error', async () => {
      mockAuthFetch.mockRejectedValue('string error');
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Failed to load invoices')).toBeInTheDocument();
      });
    });
  });

  // -----------------------------------------------------------------------
  // 5. Status filter
  // -----------------------------------------------------------------------

  describe('status filter', () => {
    it('loads with status filter param when selected', async () => {
      mockAuthFetch.mockResolvedValue(makeListResponse([], 0));
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('No invoices yet')).toBeInTheDocument();
      });

      mockAuthFetch.mockClear();
      mockAuthFetch.mockResolvedValue(makeListResponse([invoiceA], 1));

      const select = screen.getByLabelText('Filter invoices by status');
      fireEvent.change(select, { target: { value: 'issued' } });

      await waitFor(() => {
        expect(mockAuthFetch).toHaveBeenCalledWith(
          expect.stringContaining('status=issued'),
          'test-token'
        );
      });
    });

    it('resets offset when filter changes', async () => {
      mockAuthFetch.mockResolvedValue(makeListResponse([], 0));
      renderPage();

      await waitFor(() => {
        expect(mockAuthFetch).toHaveBeenCalled();
      });

      mockAuthFetch.mockClear();
      mockAuthFetch.mockResolvedValue(makeListResponse([], 0));

      const select = screen.getByLabelText('Filter invoices by status');
      fireEvent.change(select, { target: { value: 'paid' } });

      await waitFor(() => {
        expect(mockAuthFetch).toHaveBeenCalledWith(
          expect.stringContaining('offset=0'),
          'test-token'
        );
      });
    });
  });

  // -----------------------------------------------------------------------
  // 6. Pagination
  // -----------------------------------------------------------------------

  describe('pagination', () => {
    it('hides pagination when total fits on one page', async () => {
      mockAuthFetch.mockResolvedValue(makeListResponse([invoiceA], 1));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('INV/2026/001')).toBeInTheDocument();
      });
      expect(screen.queryByText('Prev')).not.toBeInTheDocument();
      expect(screen.queryByText('Next')).not.toBeInTheDocument();
    });

    it('shows pagination when multiple pages', async () => {
      // total=25, limit=20 → 2 pages
      mockAuthFetch.mockResolvedValue(makeListResponse([invoiceA], 25));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
      });
      expect(screen.getByText('Prev')).toBeInTheDocument();
      expect(screen.getByText('Next')).toBeInTheDocument();
    });

    it('disables Prev on first page', async () => {
      mockAuthFetch.mockResolvedValue(makeListResponse([invoiceA], 25));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
      });
      expect(screen.getByLabelText('Previous page of invoices')).toBeDisabled();
    });

    it('enables Next on first page', async () => {
      mockAuthFetch.mockResolvedValue(makeListResponse([invoiceA], 25));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
      });
      expect(screen.getByLabelText('Next page of invoices')).not.toBeDisabled();
    });

    it('clicking Next loads next page', async () => {
      mockAuthFetch.mockResolvedValue(makeListResponse([invoiceA], 25));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
      });

      mockAuthFetch.mockClear();
      mockAuthFetch.mockResolvedValue(makeListResponse([invoiceB], 25));

      fireEvent.click(screen.getByLabelText('Next page of invoices'));

      await waitFor(() => {
        expect(mockAuthFetch).toHaveBeenCalledWith(
          expect.stringContaining('offset=20'),
          'test-token'
        );
      });
    });

    it('clicking Prev loads previous page', async () => {
      // Start with offset already at 20 by clicking Next first
      mockAuthFetch.mockResolvedValue(makeListResponse([invoiceA], 45));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
      });

      // Go to page 2
      mockAuthFetch.mockClear();
      mockAuthFetch.mockResolvedValue(makeListResponse([invoiceB], 45));
      fireEvent.click(screen.getByLabelText('Next page of invoices'));

      await waitFor(() => {
        expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
      });

      // Go back
      mockAuthFetch.mockClear();
      mockAuthFetch.mockResolvedValue(makeListResponse([invoiceA], 45));
      fireEvent.click(screen.getByLabelText('Previous page of invoices'));

      await waitFor(() => {
        expect(mockAuthFetch).toHaveBeenCalledWith(
          expect.stringContaining('offset=0'),
          'test-token'
        );
      });
    });
  });

  // -----------------------------------------------------------------------
  // 7. Detail modal — open & close
  // -----------------------------------------------------------------------

  describe('detail modal', () => {
    it('opens detail when View clicked', async () => {
      mockAuthFetch
        .mockResolvedValueOnce(makeListResponse([invoiceA], 1))
        .mockResolvedValueOnce(makeDetailResponse(detailFull));

      renderPage();
      await waitFor(() => {
        expect(screen.getByText('View')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('View'));

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByText('INV/2026/001')).toBeInTheDocument();
      });
    });

    it('shows loading while fetching detail', async () => {
      mockAuthFetch
        .mockResolvedValueOnce(makeListResponse([invoiceA], 1))
        .mockReturnValueOnce(new Promise(() => {})); // never resolves

      renderPage();
      await waitFor(() => {
        expect(screen.getByText('View')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('View'));

      await waitFor(() => {
        // The modal loading state
        expect(screen.getAllByText('Loading...').length).toBeGreaterThanOrEqual(1);
      });
    });

    it('closes modal when X button clicked', async () => {
      mockAuthFetch
        .mockResolvedValueOnce(makeListResponse([invoiceA], 1))
        .mockResolvedValueOnce(makeDetailResponse(detailFull));

      renderPage();
      await waitFor(() => {
        expect(screen.getByText('View')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('View'));

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByLabelText('Close invoice detail'));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('closes modal when overlay clicked', async () => {
      mockAuthFetch
        .mockResolvedValueOnce(makeListResponse([invoiceA], 1))
        .mockResolvedValueOnce(makeDetailResponse(detailFull));

      renderPage();
      await waitFor(() => {
        expect(screen.getByText('View')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('View'));

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // Click the overlay (parent of the dialog card)
      const overlay = document.querySelector('.modal-overlay-custom');
      expect(overlay).toBeTruthy();
      fireEvent.click(overlay!);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('closes modal on Escape key', async () => {
      mockAuthFetch
        .mockResolvedValueOnce(makeListResponse([invoiceA], 1))
        .mockResolvedValueOnce(makeDetailResponse(detailFull));

      renderPage();
      await waitFor(() => {
        expect(screen.getByText('View')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('View'));

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      const overlay = document.querySelector('.modal-overlay-custom');
      fireEvent.keyDown(overlay!, { key: 'Escape' });

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('does not close modal when card is clicked', async () => {
      mockAuthFetch
        .mockResolvedValueOnce(makeListResponse([invoiceA], 1))
        .mockResolvedValueOnce(makeDetailResponse(detailFull));

      renderPage();
      await waitFor(() => {
        expect(screen.getByText('View')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('View'));

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // Click the card itself (stopPropagation)
      fireEvent.click(screen.getByRole('dialog'));

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('auto-closes detail when filter changes', async () => {
      mockAuthFetch
        .mockResolvedValueOnce(makeListResponse([invoiceA], 1))
        .mockResolvedValueOnce(makeDetailResponse(detailFull));

      renderPage();
      await waitFor(() => {
        expect(screen.getByText('View')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('View'));

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // Change filter → detail should auto-close (useEffect on statusFilter)
      mockAuthFetch.mockResolvedValue(makeListResponse([], 0));
      const select = screen.getByLabelText('Filter invoices by status');
      fireEvent.change(select, { target: { value: 'paid' } });

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });
  });

  // -----------------------------------------------------------------------
  // 8. Detail modal — content
  // -----------------------------------------------------------------------

  describe('detail content', () => {
    it('shows invoice header metadata', async () => {
      mockAuthFetch
        .mockResolvedValueOnce(makeListResponse([invoiceA], 1))
        .mockResolvedValueOnce(makeDetailResponse(detailFull));

      renderPage();
      await waitFor(() => {
        expect(screen.getByText('View')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('View'));

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // ISSUED appears in both table badge and detail — check within dialog
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveTextContent('ISSUED');
      expect(dialog).toHaveTextContent('Supplier A');
      expect(dialog).toHaveTextContent('Store B');
      expect(dialog).toHaveTextContent('29ABCDE1234F1Z5');
    });

    it('shows line items table', async () => {
      mockAuthFetch
        .mockResolvedValueOnce(makeListResponse([invoiceA], 1))
        .mockResolvedValueOnce(makeDetailResponse(detailFull));

      renderPage();
      await waitFor(() => {
        expect(screen.getByText('View')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('View'));

      await waitFor(() => {
        expect(screen.getByText('Basmati Rice 5kg')).toBeInTheDocument();
      });
      expect(screen.getByText('10 bag')).toBeInTheDocument();
      expect(screen.getByText('5%')).toBeInTheDocument();
    });

    it('shows CGST and SGST when > 0', async () => {
      mockAuthFetch
        .mockResolvedValueOnce(makeListResponse([invoiceA], 1))
        .mockResolvedValueOnce(makeDetailResponse(detailFull));

      renderPage();
      await waitFor(() => {
        expect(screen.getByText('View')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('View'));

      await waitFor(() => {
        expect(screen.getByText('CGST:')).toBeInTheDocument();
        expect(screen.getByText('SGST:')).toBeInTheDocument();
      });
    });

    it('hides IGST when 0', async () => {
      mockAuthFetch
        .mockResolvedValueOnce(makeListResponse([invoiceA], 1))
        .mockResolvedValueOnce(makeDetailResponse(detailFull));

      renderPage();
      await waitFor(() => {
        expect(screen.getByText('View')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('View'));

      await waitFor(() => {
        expect(screen.getByText('CGST:')).toBeInTheDocument();
      });
      expect(screen.queryByText('IGST:')).not.toBeInTheDocument();
    });

    it('shows all three tax rows when all > 0', async () => {
      mockAuthFetch
        .mockResolvedValueOnce(makeListResponse([invoiceA], 1))
        .mockResolvedValueOnce(makeDetailResponse(detailAllTax));

      renderPage();
      await waitFor(() => {
        expect(screen.getByText('View')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('View'));

      await waitFor(() => {
        expect(screen.getByText('CGST:')).toBeInTheDocument();
        expect(screen.getByText('SGST:')).toBeInTheDocument();
        expect(screen.getByText('IGST:')).toBeInTheDocument();
      });
    });

    it('hides all tax rows when all 0', async () => {
      mockAuthFetch
        .mockResolvedValueOnce(makeListResponse([invoiceA], 1))
        .mockResolvedValueOnce(makeDetailResponse(detailNoTax));

      renderPage();
      await waitFor(() => {
        expect(screen.getByText('View')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('View'));

      await waitFor(() => {
        expect(screen.getByText('Subtotal:')).toBeInTheDocument();
      });
      expect(screen.queryByText('CGST:')).not.toBeInTheDocument();
      expect(screen.queryByText('SGST:')).not.toBeInTheDocument();
      expect(screen.queryByText('IGST:')).not.toBeInTheDocument();
    });

    it('shows paid and balance when amountPaid > 0', async () => {
      mockAuthFetch
        .mockResolvedValueOnce(makeListResponse([invoiceA], 1))
        .mockResolvedValueOnce(makeDetailResponse(detailFull));

      renderPage();
      await waitFor(() => {
        expect(screen.getByText('View')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('View'));

      await waitFor(() => {
        expect(screen.getByText('Paid:')).toBeInTheDocument();
        expect(screen.getByText('Balance:')).toBeInTheDocument();
      });
    });

    it('hides paid and balance when amountPaid is 0', async () => {
      mockAuthFetch
        .mockResolvedValueOnce(makeListResponse([invoiceA], 1))
        .mockResolvedValueOnce(makeDetailResponse(detailNoTax));

      renderPage();
      await waitFor(() => {
        expect(screen.getByText('View')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('View'));

      await waitFor(() => {
        expect(screen.getByText('Total:')).toBeInTheDocument();
      });
      expect(screen.queryByText('Paid:')).not.toBeInTheDocument();
      expect(screen.queryByText('Balance:')).not.toBeInTheDocument();
    });

    it('shows payment history when payments exist', async () => {
      mockAuthFetch
        .mockResolvedValueOnce(makeListResponse([invoiceA], 1))
        .mockResolvedValueOnce(makeDetailResponse(detailFull));

      renderPage();
      await waitFor(() => {
        expect(screen.getByText('View')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('View'));

      await waitFor(() => {
        expect(screen.getByText('Payment History')).toBeInTheDocument();
      });
      expect(screen.getByText(/UPI/)).toBeInTheDocument();
      expect(screen.getByText(/TXN123456/)).toBeInTheDocument();
    });

    it('hides payment history when no payments', async () => {
      mockAuthFetch
        .mockResolvedValueOnce(makeListResponse([invoiceA], 1))
        .mockResolvedValueOnce(makeDetailResponse(detailNoTax));

      renderPage();
      await waitFor(() => {
        expect(screen.getByText('View')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('View'));

      await waitFor(() => {
        expect(screen.getByText('Items')).toBeInTheDocument();
      });
      expect(screen.queryByText('Payment History')).not.toBeInTheDocument();
    });

    it('shows due date when present', async () => {
      mockAuthFetch
        .mockResolvedValueOnce(makeListResponse([invoiceA], 1))
        .mockResolvedValueOnce(makeDetailResponse(detailFull));

      renderPage();
      await waitFor(() => {
        expect(screen.getByText('View')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('View'));

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });
      // Due date is rendered as formatted date string
      const dueLabel = screen.getByText('Due:');
      const dueContainer = dueLabel.closest('div');
      expect(dueContainer?.textContent).not.toContain('-');
    });

    it('shows dash for missing due date', async () => {
      const noDue = { ...detailFull, dueDate: null };
      mockAuthFetch
        .mockResolvedValueOnce(makeListResponse([invoiceA], 1))
        .mockResolvedValueOnce(makeDetailResponse(noDue));

      renderPage();
      await waitFor(() => {
        expect(screen.getByText('View')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('View'));

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });
      const dueLabel = screen.getByText('Due:');
      const dueContainer = dueLabel.closest('div');
      expect(dueContainer?.textContent).toContain('-');
    });
  });

  // -----------------------------------------------------------------------
  // 9. Detail modal — error
  // -----------------------------------------------------------------------

  describe('detail error', () => {
    it('shows error when detail API fails', async () => {
      mockAuthFetch
        .mockResolvedValueOnce(makeListResponse([invoiceA], 1))
        .mockResolvedValueOnce({ ok: false, status: 500, json: () => Promise.resolve({}) });

      renderPage();
      await waitFor(() => {
        expect(screen.getByText('View')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('View'));

      await waitFor(() => {
        expect(screen.getByText('Failed to load invoice')).toBeInTheDocument();
      });
    });

    it('shows error message in detail modal', async () => {
      mockAuthFetch
        .mockResolvedValueOnce(makeListResponse([invoiceA], 1))
        .mockRejectedValueOnce(new Error('Connection refused'));

      renderPage();
      await waitFor(() => {
        expect(screen.getByText('View')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('View'));

      await waitFor(() => {
        expect(screen.getByText('Failed to load invoice')).toBeInTheDocument();
        expect(screen.getByText('Connection refused')).toBeInTheDocument();
      });
    });

    it('detail error has Close button that dismisses', async () => {
      mockAuthFetch
        .mockResolvedValueOnce(makeListResponse([invoiceA], 1))
        .mockRejectedValueOnce(new Error('timeout'));

      renderPage();
      await waitFor(() => {
        expect(screen.getByText('View')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('View'));

      await waitFor(() => {
        expect(screen.getByText('Failed to load invoice')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Close'));

      // Error modal should be gone
      expect(screen.queryByText('Failed to load invoice')).not.toBeInTheDocument();
    });

    it('shows fallback error when detail throws non-Error', async () => {
      mockAuthFetch
        .mockResolvedValueOnce(makeListResponse([invoiceA], 1))
        .mockRejectedValueOnce('string error');

      renderPage();
      await waitFor(() => {
        expect(screen.getByText('View')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('View'));

      await waitFor(() => {
        expect(screen.getByText(/Failed to load invoice detail/)).toBeInTheDocument();
      });
    });
  });

  // -----------------------------------------------------------------------
  // 10. PDF download
  // -----------------------------------------------------------------------

  describe('PDF download', () => {
    let mockCreateObjectURL: ReturnType<typeof vi.fn>;
    let mockRevokeObjectURL: ReturnType<typeof vi.fn>;
    let appendSpy: ReturnType<typeof vi.spyOn> | null = null;
    let removeSpy: ReturnType<typeof vi.spyOn> | null = null;

    beforeEach(() => {
      mockCreateObjectURL = vi.fn().mockReturnValue('blob:test-url');
      mockRevokeObjectURL = vi.fn();
      URL.createObjectURL = mockCreateObjectURL;
      URL.revokeObjectURL = mockRevokeObjectURL;
    });

    afterEach(() => {
      appendSpy?.mockRestore();
      removeSpy?.mockRestore();
      appendSpy = null;
      removeSpy = null;
    });

    it('downloads PDF from table row', async () => {
      const mockBlob = new Blob(['pdf-content'], { type: 'application/pdf' });
      mockAuthFetch
        .mockResolvedValueOnce(makeListResponse([invoiceA], 1))
        .mockResolvedValueOnce({ ok: true, blob: () => Promise.resolve(mockBlob) });

      renderPage();
      await waitFor(() => {
        expect(screen.getByText('PDF')).toBeInTheDocument();
      });

      appendSpy = vi.spyOn(document.body, 'appendChild');
      removeSpy = vi.spyOn(document.body, 'removeChild');

      await act(async () => {
        fireEvent.click(screen.getByText('PDF'));
      });

      await waitFor(() => {
        expect(mockAuthFetch).toHaveBeenCalledWith(
          '/api/v1/retailer-admin/invoices/inv-1/pdf',
          'test-token'
        );
      });

      expect(mockCreateObjectURL).toHaveBeenCalledWith(mockBlob);
      expect(appendSpy).toHaveBeenCalled();
      expect(removeSpy).toHaveBeenCalled();
      expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:test-url');
    });

    it('sanitizes filename by replacing slashes', async () => {
      const mockBlob = new Blob(['pdf'], { type: 'application/pdf' });
      mockAuthFetch
        .mockResolvedValueOnce(makeListResponse([invoiceA], 1))
        .mockResolvedValueOnce({ ok: true, blob: () => Promise.resolve(mockBlob) });

      renderPage();
      await waitFor(() => {
        expect(screen.getByText('PDF')).toBeInTheDocument();
      });

      // Spy AFTER render so component can mount
      let capturedDownload = '';
      appendSpy = vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
        const anchor = node as HTMLAnchorElement;
        if (anchor.download) capturedDownload = anchor.download;
        return node;
      });
      removeSpy = vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);

      await act(async () => {
        fireEvent.click(screen.getByText('PDF'));
      });

      await waitFor(() => {
        expect(appendSpy).toHaveBeenCalled();
      });

      expect(capturedDownload).toBe('INV-2026-001.pdf');
    });

    it('shows error when PDF download fails', async () => {
      mockAuthFetch
        .mockResolvedValueOnce(makeListResponse([invoiceA], 1))
        .mockResolvedValueOnce({ ok: false, status: 500 });

      renderPage();
      await waitFor(() => {
        expect(screen.getByText('PDF')).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByText('PDF'));
      });

      await waitFor(() => {
        expect(screen.getByText(/Failed to download PDF/)).toBeInTheDocument();
      });
    });

    it('shows error when PDF download throws', async () => {
      mockAuthFetch
        .mockResolvedValueOnce(makeListResponse([invoiceA], 1))
        .mockRejectedValueOnce(new Error('Network failed'));

      renderPage();
      await waitFor(() => {
        expect(screen.getByText('PDF')).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByText('PDF'));
      });

      await waitFor(() => {
        expect(screen.getByText(/Failed to download PDF/)).toBeInTheDocument();
      });
    });

    it('downloads PDF from detail modal', async () => {
      const mockBlob = new Blob(['pdf'], { type: 'application/pdf' });
      mockAuthFetch
        .mockResolvedValueOnce(makeListResponse([invoiceA], 1))
        .mockResolvedValueOnce(makeDetailResponse(detailFull))
        .mockResolvedValueOnce({ ok: true, blob: () => Promise.resolve(mockBlob) });

      renderPage();
      await waitFor(() => {
        expect(screen.getByText('View')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('View'));
      await waitFor(() => {
        expect(screen.getByText('Download PDF')).toBeInTheDocument();
      });

      // Spy AFTER render so component can mount
      appendSpy = vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
      removeSpy = vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);

      await act(async () => {
        fireEvent.click(screen.getByText('Download PDF'));
      });

      await waitFor(() => {
        expect(mockAuthFetch).toHaveBeenCalledWith(
          '/api/v1/retailer-admin/invoices/inv-1/pdf',
          'test-token'
        );
      });
    });
  });

  // -----------------------------------------------------------------------
  // 11. WhatsApp share
  // -----------------------------------------------------------------------

  describe('WhatsApp share', () => {
    let mockWindowOpen: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockWindowOpen = vi.fn();
      window.open = mockWindowOpen;
    });

    it('shows WhatsApp button when sellerPhone is present', async () => {
      mockAuthFetch
        .mockResolvedValueOnce(makeListResponse([invoiceA], 1))
        .mockResolvedValueOnce(makeDetailResponse(detailFull));

      renderPage();
      await waitFor(() => {
        expect(screen.getByText('View')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('View'));

      await waitFor(() => {
        expect(screen.getByText('WhatsApp')).toBeInTheDocument();
      });
    });

    it('hides WhatsApp button when no sellerPhone', async () => {
      mockAuthFetch
        .mockResolvedValueOnce(makeListResponse([invoiceA], 1))
        .mockResolvedValueOnce(makeDetailResponse(detailNoTax));

      renderPage();
      await waitFor(() => {
        expect(screen.getByText('View')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('View'));

      await waitFor(() => {
        expect(screen.getByText('Items')).toBeInTheDocument();
      });
      expect(screen.queryByText('WhatsApp')).not.toBeInTheDocument();
    });

    it('opens wa.me link with 91 prefix for 10-digit phone', async () => {
      mockAuthFetch
        .mockResolvedValueOnce(makeListResponse([invoiceA], 1))
        .mockResolvedValueOnce(makeDetailResponse(detailFull));

      renderPage();
      await waitFor(() => {
        expect(screen.getByText('View')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('View'));

      await waitFor(() => {
        expect(screen.getByText('WhatsApp')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('WhatsApp'));

      expect(mockWindowOpen).toHaveBeenCalledWith(
        expect.stringContaining('https://wa.me/919876543210'),
        '_blank',
        'noopener,noreferrer'
      );
    });

    it('includes invoice details in WhatsApp message', async () => {
      mockAuthFetch
        .mockResolvedValueOnce(makeListResponse([invoiceA], 1))
        .mockResolvedValueOnce(makeDetailResponse(detailFull));

      renderPage();
      await waitFor(() => {
        expect(screen.getByText('View')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('View'));

      await waitFor(() => {
        expect(screen.getByText('WhatsApp')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('WhatsApp'));

      const call = mockWindowOpen.mock.calls[0][0] as string;
      expect(call).toContain('INV%2F2026%2F001');
      expect(call).toContain('ISSUED');
    });

    it('uses international phone as-is (no 91 prefix)', async () => {
      const intlPhone = { ...detailFull, sellerPhone: '+919876543210' };
      mockAuthFetch
        .mockResolvedValueOnce(makeListResponse([invoiceA], 1))
        .mockResolvedValueOnce(makeDetailResponse(intlPhone));

      renderPage();
      await waitFor(() => {
        expect(screen.getByText('View')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('View'));

      await waitFor(() => {
        expect(screen.getByText('WhatsApp')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('WhatsApp'));

      // +919876543210 → strip non-digits → 919876543210 (12 digits, no prefix added)
      expect(mockWindowOpen).toHaveBeenCalledWith(
        expect.stringContaining('https://wa.me/919876543210'),
        '_blank',
        'noopener,noreferrer'
      );
    });

    it('does nothing for short phone (< 10 digits)', async () => {
      const shortPhone = { ...detailFull, sellerPhone: '12345' };
      mockAuthFetch
        .mockResolvedValueOnce(makeListResponse([invoiceA], 1))
        .mockResolvedValueOnce(makeDetailResponse(shortPhone));

      renderPage();
      await waitFor(() => {
        expect(screen.getByText('View')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('View'));

      await waitFor(() => {
        expect(screen.getByText('WhatsApp')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('WhatsApp'));

      expect(mockWindowOpen).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 12. API calls
  // -----------------------------------------------------------------------

  describe('API calls', () => {
    it('passes limit and offset to list endpoint', async () => {
      mockAuthFetch.mockResolvedValue(makeListResponse([], 0));
      renderPage();

      await waitFor(() => {
        expect(mockAuthFetch).toHaveBeenCalledWith(
          expect.stringMatching(/limit=20.*offset=0|offset=0.*limit=20/),
          'test-token'
        );
      });
    });

    it('calls detail endpoint with invoice ID', async () => {
      mockAuthFetch
        .mockResolvedValueOnce(makeListResponse([invoiceA], 1))
        .mockResolvedValueOnce(makeDetailResponse(detailFull));

      renderPage();
      await waitFor(() => {
        expect(screen.getByText('View')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('View'));

      await waitFor(() => {
        expect(mockAuthFetch).toHaveBeenCalledWith(
          '/api/v1/retailer-admin/invoices/inv-1',
          'test-token'
        );
      });
    });
  });
});
