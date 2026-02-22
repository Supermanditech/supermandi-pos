// SuperAdmin — Test GstComplianceTab component
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { GstComplianceTab } from '../../tabs/GstComplianceTab';

vi.mock('../../api/gstCompliance', () => ({
  fetchGstStoresOverview: vi.fn(),
  fetchGstSummary: vi.fn(),
  exportGstr1: vi.fn(),
}));

describe('GstComplianceTab', () => {
  let gstMock: {
    fetchGstStoresOverview: ReturnType<typeof vi.fn>;
    fetchGstSummary: ReturnType<typeof vi.fn>;
    exportGstr1: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    gstMock = (await import('../../api/gstCompliance')) as any;
  });

  it('renders header', async () => {
    gstMock.fetchGstStoresOverview.mockResolvedValue({
      stores: [],
      totals: { totalSales: 0, totalTax: 0, totalInvoices: 0 },
      filingDeadline: '2026-02-20',
    });

    render(<GstComplianceTab />);
    expect(screen.getByText('GST Compliance Dashboard')).toBeTruthy();
  });

  it('shows loading state', () => {
    gstMock.fetchGstStoresOverview.mockReturnValue(new Promise(() => {}));
    const { container } = render(<GstComplianceTab />);
    // UNMAPPED.043: Loading text replaced with skeleton loaders
    expect(container.querySelector('div[style]')).toBeTruthy();
  });

  it('shows error state', async () => {
    gstMock.fetchGstStoresOverview.mockRejectedValue(new Error('Network error'));
    render(<GstComplianceTab />);
    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeTruthy();
    });
  });

  it('shows empty state when no stores', async () => {
    gstMock.fetchGstStoresOverview.mockResolvedValue({
      stores: [],
      totals: { totalSales: 0, totalTax: 0, totalInvoices: 0 },
      filingDeadline: '2026-02-20',
    });
    render(<GstComplianceTab />);
    await waitFor(() => {
      expect(screen.getByText(/No GST data for/)).toBeTruthy();
    });
  });

  it('renders store data when available', async () => {
    gstMock.fetchGstStoresOverview.mockResolvedValue({
      stores: [{
        storeId: 's1', storeName: 'Test Store', storeCode: 'TS01',
        gstin: '12ABCDE1234Z5', totalSales: 100000, totalTax: 18000, invoiceCount: 50,
      }],
      totals: { totalSales: 100000, totalTax: 18000, totalInvoices: 50 },
      filingDeadline: '2026-02-20',
    });
    render(<GstComplianceTab />);
    await waitFor(() => {
      expect(screen.getByText('Test Store')).toBeTruthy();
      expect(screen.getByText('TS01')).toBeTruthy();
    });
  });

  it('renders summary cards', async () => {
    gstMock.fetchGstStoresOverview.mockResolvedValue({
      stores: [],
      totals: { totalSales: 100000, totalTax: 18000, totalInvoices: 50 },
      filingDeadline: '2026-02-20',
    });
    render(<GstComplianceTab />);
    await waitFor(() => {
      expect(screen.getByText('Total Sales')).toBeTruthy();
      expect(screen.getByText('Total GST Collected')).toBeTruthy();
      expect(screen.getByText('Total Invoices')).toBeTruthy();
      expect(screen.getByText('Filing Deadline')).toBeTruthy();
    });
  });
});
