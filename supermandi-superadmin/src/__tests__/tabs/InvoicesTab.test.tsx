// SuperAdmin — Test InvoicesTab component
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { InvoicesTab } from '../../tabs/InvoicesTab';
import * as invoicesApi from '../../api/invoices';

vi.mock('../../api/invoices', () => ({
  listInvoices: vi.fn(),
  getInvoice: vi.fn(),
  issueInvoice: vi.fn(),
  cancelInvoice: vi.fn(),
  downloadInvoicePdf: vi.fn(),
}));

vi.mock('../../lib/formatters', () => ({
  formatDateTime: vi.fn((v: string) => v || '--'),
}));

const mockInvoiceList = [
  {
    id: 'inv-1',
    invoiceNumber: 'INV/2024/001',
    invoiceDate: '2024-01-15',
    invoiceModel: 'buy_resell' as const,
    invoiceType: 'purchase' as const,
    status: 'draft' as const,
    sellerName: 'Supplier A',
    buyerName: 'Store B',
    subtotalMinor: 100000,
    totalTaxMinor: 18000,
    totalAmountMinor: 118000,
    amountPaidMinor: 0,
    balanceDueMinor: 118000,
    createdAt: '2024-01-15',
  },
];

const mockInvoiceDetail = {
  ...mockInvoiceList[0],
  sellerType: 'supplier',
  sellerGstin: '12ABCDE1234Z5',
  sellerAddress: '123 Street',
  buyerType: 'platform',
  buyerGstin: '12FGHIJ5678K9',
  buyerAddress: '456 Avenue',
  taxableAmountMinor: 100000,
  discountMinor: 0,
  cgstMinor: 9000,
  sgstMinor: 9000,
  igstMinor: 0,
  items: [
    {
      id: 'item-1',
      productName: 'Premium Rice',
      productSku: 'RICE-001',
      hsnCode: '1006',
      quantity: 100,
      unit: 'kg',
      unitPriceMinor: 1000,
      discountMinor: 0,
      taxableAmountMinor: 100000,
      gstRate: 18,
      cgstMinor: 9000,
      sgstMinor: 9000,
      igstMinor: 0,
      totalMinor: 118000,
    },
  ],
  payments: [],
};

describe('InvoicesTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (invoicesApi.listInvoices as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: mockInvoiceList,
      total: 1,
    });
  });

  // =========================================================================
  // Basic rendering
  // =========================================================================

  describe('basic rendering', () => {
    it('renders the invoices tab header', async () => {
      render(<InvoicesTab />);
      expect(screen.getByText('Invoices')).toBeTruthy();
      await waitFor(() => {
        expect(invoicesApi.listInvoices).toHaveBeenCalled();
      });
    });

    it('renders filter dropdowns', async () => {
      render(<InvoicesTab />);
      expect(screen.getByText('All Models')).toBeTruthy();
      expect(screen.getByText('All Types')).toBeTruthy();
      expect(screen.getByText('All Statuses')).toBeTruthy();
      await waitFor(() => {
        expect(invoicesApi.listInvoices).toHaveBeenCalled();
      });
    });

    it('renders refresh button', async () => {
      render(<InvoicesTab />);
      await waitFor(() => {
        expect(screen.getByText('Refresh')).toBeTruthy();
      });
    });

    it('shows total count', async () => {
      render(<InvoicesTab />);
      await waitFor(() => {
        expect(screen.getByText('1 invoice')).toBeTruthy();
      });
    });
  });

  // =========================================================================
  // Invoice list
  // =========================================================================

  describe('invoice list', () => {
    it('renders invoice rows', async () => {
      render(<InvoicesTab />);
      await waitFor(() => {
        expect(screen.getByText('INV/2024/001')).toBeTruthy();
        expect(screen.getByText('Supplier A')).toBeTruthy();
        expect(screen.getByText('Store B')).toBeTruthy();
      });
    });

    it('shows invoice status badge', async () => {
      render(<InvoicesTab />);
      await waitFor(() => {
        expect(screen.getByText('DRAFT')).toBeTruthy();
      });
    });

    it('shows view and PDF action buttons', async () => {
      render(<InvoicesTab />);
      await waitFor(() => {
        expect(screen.getByText('View')).toBeTruthy();
        expect(screen.getByText('PDF')).toBeTruthy();
      });
    });
  });

  // =========================================================================
  // Empty state
  // =========================================================================

  describe('empty state', () => {
    it('shows no invoices message when empty', async () => {
      (invoicesApi.listInvoices as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [],
        total: 0,
      });

      render(<InvoicesTab />);
      await waitFor(() => {
        expect(screen.getByText('No invoices found.')).toBeTruthy();
      });
    });
  });

  // =========================================================================
  // Error state
  // =========================================================================

  describe('error state', () => {
    it('shows error message on API failure', async () => {
      (invoicesApi.listInvoices as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Connection failed'));

      render(<InvoicesTab />);
      await waitFor(() => {
        expect(screen.getByText('Connection failed')).toBeTruthy();
      });
    });
  });

  // =========================================================================
  // Filters
  // =========================================================================

  describe('filters', () => {
    it('calls listInvoices on initial render', async () => {
      render(<InvoicesTab />);
      await waitFor(() => {
        expect(invoicesApi.listInvoices).toHaveBeenCalledWith(
          expect.objectContaining({ limit: 50, offset: 0 })
        );
      });
    });

    it('calls refresh on Refresh button click', async () => {
      render(<InvoicesTab />);
      await waitFor(() => {
        expect(screen.getByText('Refresh')).toBeTruthy();
      });

      (invoicesApi.listInvoices as ReturnType<typeof vi.fn>).mockClear();
      (invoicesApi.listInvoices as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [], total: 0 });

      fireEvent.click(screen.getByText('Refresh'));
      await waitFor(() => {
        expect(invoicesApi.listInvoices).toHaveBeenCalled();
      });
    });
  });

  // =========================================================================
  // Detail modal
  // =========================================================================

  describe('detail modal', () => {
    it('opens detail modal on invoice number click', async () => {
      (invoicesApi.getInvoice as ReturnType<typeof vi.fn>).mockResolvedValue(mockInvoiceDetail);

      render(<InvoicesTab />);
      await waitFor(() => {
        expect(screen.getByText('INV/2024/001')).toBeTruthy();
      });

      fireEvent.click(screen.getByText('INV/2024/001'));
      await waitFor(() => {
        expect(invoicesApi.getInvoice).toHaveBeenCalledWith('inv-1');
      });
    });

    it('opens detail on View button click', async () => {
      (invoicesApi.getInvoice as ReturnType<typeof vi.fn>).mockResolvedValue(mockInvoiceDetail);

      render(<InvoicesTab />);
      await waitFor(() => {
        expect(screen.getByText('View')).toBeTruthy();
      });

      fireEvent.click(screen.getByText('View'));
      await waitFor(() => {
        expect(invoicesApi.getInvoice).toHaveBeenCalledWith('inv-1');
      });
    });

    it('shows detail modal content', async () => {
      (invoicesApi.getInvoice as ReturnType<typeof vi.fn>).mockResolvedValue(mockInvoiceDetail);

      render(<InvoicesTab />);
      await waitFor(() => {
        expect(screen.getByText('View')).toBeTruthy();
      });

      fireEvent.click(screen.getByText('View'));
      await waitFor(() => {
        expect(screen.getByText('From (Seller)')).toBeTruthy();
        expect(screen.getByText('To (Buyer)')).toBeTruthy();
        expect(screen.getByText('Premium Rice')).toBeTruthy();
      });
    });

    it('shows issue button for draft invoices', async () => {
      (invoicesApi.getInvoice as ReturnType<typeof vi.fn>).mockResolvedValue(mockInvoiceDetail);

      render(<InvoicesTab />);
      await waitFor(() => {
        expect(screen.getByText('View')).toBeTruthy();
      });

      fireEvent.click(screen.getByText('View'));
      await waitFor(() => {
        expect(screen.getByText('Issue')).toBeTruthy();
      });
    });

    it('shows cancel button for draft invoices', async () => {
      (invoicesApi.getInvoice as ReturnType<typeof vi.fn>).mockResolvedValue(mockInvoiceDetail);

      render(<InvoicesTab />);
      await waitFor(() => {
        expect(screen.getByText('View')).toBeTruthy();
      });

      fireEvent.click(screen.getByText('View'));
      await waitFor(() => {
        expect(screen.getByText('Cancel')).toBeTruthy();
      });
    });

    it('shows close button in modal', async () => {
      (invoicesApi.getInvoice as ReturnType<typeof vi.fn>).mockResolvedValue(mockInvoiceDetail);

      render(<InvoicesTab />);
      await waitFor(() => {
        expect(screen.getByText('View')).toBeTruthy();
      });

      fireEvent.click(screen.getByText('View'));
      await waitFor(() => {
        expect(screen.getByText('Close')).toBeTruthy();
      });
    });
  });

  // =========================================================================
  // Actions
  // =========================================================================

  describe('actions', () => {
    it('calls downloadInvoicePdf on PDF button click', async () => {
      render(<InvoicesTab />);
      await waitFor(() => {
        expect(screen.getByText('PDF')).toBeTruthy();
      });

      fireEvent.click(screen.getByText('PDF'));
      expect(invoicesApi.downloadInvoicePdf).toHaveBeenCalledWith('inv-1', 'INV/2024/001');
    });
  });
});
