// SuperAdmin — Test GstComplianceTab component
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { GstComplianceTab } from '../../tabs/GstComplianceTab';

vi.mock('../../api/gstCompliance', () => ({
  fetchGstStoresOverview: vi.fn(),
  fetchGstSummary: vi.fn(),
  exportGstr1: vi.fn(),
}));

const makeOverview = (overrides: Record<string, unknown> = {}) => ({
  stores: [],
  totals: { totalSales: 0, totalTax: 0, totalInvoices: 0 },
  filingDeadline: '2026-02-20',
  ...overrides,
});

const makeStore = (overrides: Record<string, unknown> = {}) => ({
  storeId: 's1',
  storeName: 'Test Store',
  storeCode: 'TS01',
  gstin: '12ABCDE1234Z5',
  totalSales: 100000,
  totalTax: 18000,
  invoiceCount: 50,
  ...overrides,
});

const makeSummary = (overrides: Record<string, unknown> = {}) => ({
  cgstCollected: 9000,
  sgstCollected: 9000,
  igstCollected: 0,
  inputCgst: 3000,
  inputSgst: 3000,
  netPayable: 12000,
  stateBreakdown: [],
  supplierBreakdown: [],
  ...overrides,
});

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

  // ── Header ──────────────────────────────────────────────────

  it('renders header title', async () => {
    gstMock.fetchGstStoresOverview.mockResolvedValue(makeOverview());
    render(<GstComplianceTab />);
    expect(screen.getByText('GST Compliance Dashboard')).toBeTruthy();
  });

  it('renders subtitle description', async () => {
    gstMock.fetchGstStoresOverview.mockResolvedValue(makeOverview());
    render(<GstComplianceTab />);
    expect(screen.getByText(/Monthly GST summary, filing status/)).toBeTruthy();
  });

  it('renders month picker input', async () => {
    gstMock.fetchGstStoresOverview.mockResolvedValue(makeOverview());
    render(<GstComplianceTab />);
    expect(screen.getByLabelText('Select month')).toBeTruthy();
  });

  it('renders Refresh button', async () => {
    gstMock.fetchGstStoresOverview.mockResolvedValue(makeOverview());
    render(<GstComplianceTab />);
    expect(screen.getByText('Refresh')).toBeTruthy();
  });

  // ── Loading State ───────────────────────────────────────────

  it('shows loading skeleton on initial load', () => {
    gstMock.fetchGstStoresOverview.mockReturnValue(new Promise(() => {}));
    const { container } = render(<GstComplianceTab />);
    expect(container.querySelector('.skeleton')).toBeTruthy();
  });

  // ── Error State ─────────────────────────────────────────────

  it('shows error message when fetch fails', async () => {
    gstMock.fetchGstStoresOverview.mockRejectedValue(new Error('Network error'));
    render(<GstComplianceTab />);
    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeTruthy();
    });
  });

  it('shows error with role=alert', async () => {
    gstMock.fetchGstStoresOverview.mockRejectedValue(new Error('Server down'));
    render(<GstComplianceTab />);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
    });
  });

  it('shows fallback error for non-Error exceptions', async () => {
    gstMock.fetchGstStoresOverview.mockRejectedValue('some string error');
    render(<GstComplianceTab />);
    await waitFor(() => {
      expect(screen.getByText('Failed to load GST overview')).toBeTruthy();
    });
  });

  // ── Empty State ─────────────────────────────────────────────

  it('shows empty state when no stores', async () => {
    gstMock.fetchGstStoresOverview.mockResolvedValue(makeOverview());
    render(<GstComplianceTab />);
    await waitFor(() => {
      expect(screen.getByText(/No GST data for/)).toBeTruthy();
    });
  });

  // ── Summary Cards ───────────────────────────────────────────

  it('renders Total Sales card', async () => {
    gstMock.fetchGstStoresOverview.mockResolvedValue(makeOverview({
      totals: { totalSales: 100000, totalTax: 18000, totalInvoices: 50 },
    }));
    render(<GstComplianceTab />);
    await waitFor(() => {
      expect(screen.getByText('Total Sales')).toBeTruthy();
    });
  });

  it('renders Total GST Collected card', async () => {
    gstMock.fetchGstStoresOverview.mockResolvedValue(makeOverview({
      totals: { totalSales: 100000, totalTax: 18000, totalInvoices: 50 },
    }));
    render(<GstComplianceTab />);
    await waitFor(() => {
      expect(screen.getByText('Total GST Collected')).toBeTruthy();
    });
  });

  it('renders Total Invoices card', async () => {
    gstMock.fetchGstStoresOverview.mockResolvedValue(makeOverview({
      totals: { totalSales: 100000, totalTax: 18000, totalInvoices: 50 },
    }));
    render(<GstComplianceTab />);
    await waitFor(() => {
      expect(screen.getByText('Total Invoices')).toBeTruthy();
    });
  });

  it('renders Filing Deadline card', async () => {
    gstMock.fetchGstStoresOverview.mockResolvedValue(makeOverview({
      totals: { totalSales: 100000, totalTax: 18000, totalInvoices: 50 },
    }));
    render(<GstComplianceTab />);
    await waitFor(() => {
      expect(screen.getByText('Filing Deadline')).toBeTruthy();
      expect(screen.getByText('2026-02-20')).toBeTruthy();
    });
  });

  // ── Stores Table ────────────────────────────────────────────

  it('renders store name and code', async () => {
    gstMock.fetchGstStoresOverview.mockResolvedValue(makeOverview({
      stores: [makeStore()],
    }));
    render(<GstComplianceTab />);
    await waitFor(() => {
      expect(screen.getByText('Test Store')).toBeTruthy();
      expect(screen.getByText('TS01')).toBeTruthy();
    });
  });

  it('renders GSTIN value', async () => {
    gstMock.fetchGstStoresOverview.mockResolvedValue(makeOverview({
      stores: [makeStore()],
    }));
    render(<GstComplianceTab />);
    await waitFor(() => {
      expect(screen.getByText('12ABCDE1234Z5')).toBeTruthy();
    });
  });

  it('renders "Not registered" for null GSTIN', async () => {
    gstMock.fetchGstStoresOverview.mockResolvedValue(makeOverview({
      stores: [makeStore({ gstin: null })],
    }));
    render(<GstComplianceTab />);
    await waitFor(() => {
      expect(screen.getByText('Not registered')).toBeTruthy();
    });
  });

  it('renders table column headers', async () => {
    gstMock.fetchGstStoresOverview.mockResolvedValue(makeOverview({
      stores: [makeStore()],
    }));
    render(<GstComplianceTab />);
    await waitFor(() => {
      expect(screen.getByText('Store')).toBeTruthy();
      expect(screen.getByText('GSTIN')).toBeTruthy();
      expect(screen.getByText('Sales')).toBeTruthy();
      expect(screen.getByText('Tax')).toBeTruthy();
      expect(screen.getByText('Invoices')).toBeTruthy();
      expect(screen.getByText('Actions')).toBeTruthy();
    });
  });

  it('renders Detail button for each store', async () => {
    gstMock.fetchGstStoresOverview.mockResolvedValue(makeOverview({
      stores: [makeStore()],
    }));
    render(<GstComplianceTab />);
    await waitFor(() => {
      expect(screen.getByText('Detail')).toBeTruthy();
    });
  });

  it('renders GSTR-1 export button for each store', async () => {
    gstMock.fetchGstStoresOverview.mockResolvedValue(makeOverview({
      stores: [makeStore()],
    }));
    render(<GstComplianceTab />);
    await waitFor(() => {
      expect(screen.getByText('GSTR-1')).toBeTruthy();
    });
  });

  it('renders multiple stores', async () => {
    gstMock.fetchGstStoresOverview.mockResolvedValue(makeOverview({
      stores: [
        makeStore({ storeId: 's1', storeName: 'Store Alpha' }),
        makeStore({ storeId: 's2', storeName: 'Store Beta' }),
      ],
    }));
    render(<GstComplianceTab />);
    await waitFor(() => {
      expect(screen.getByText('Store Alpha')).toBeTruthy();
      expect(screen.getByText('Store Beta')).toBeTruthy();
    });
  });

  // ── Store Detail Modal ──────────────────────────────────────

  it('opens detail modal on Detail button click', async () => {
    gstMock.fetchGstStoresOverview.mockResolvedValue(makeOverview({
      stores: [makeStore()],
    }));
    gstMock.fetchGstSummary.mockResolvedValue(makeSummary());
    render(<GstComplianceTab />);
    await waitFor(() => {
      expect(screen.getByText('Detail')).toBeTruthy();
    });
    fireEvent.click(screen.getByText('Detail'));
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeTruthy();
    });
  });

  it('shows GST breakdown cards in modal', async () => {
    gstMock.fetchGstStoresOverview.mockResolvedValue(makeOverview({
      stores: [makeStore()],
    }));
    gstMock.fetchGstSummary.mockResolvedValue(makeSummary());
    render(<GstComplianceTab />);
    await waitFor(() => expect(screen.getByText('Detail')).toBeTruthy());
    fireEvent.click(screen.getByText('Detail'));
    await waitFor(() => {
      expect(screen.getByText('CGST')).toBeTruthy();
      expect(screen.getByText('SGST')).toBeTruthy();
      expect(screen.getByText('IGST')).toBeTruthy();
      expect(screen.getByText('Net Payable')).toBeTruthy();
    });
  });

  it('shows Close button in modal', async () => {
    gstMock.fetchGstStoresOverview.mockResolvedValue(makeOverview({
      stores: [makeStore()],
    }));
    gstMock.fetchGstSummary.mockResolvedValue(makeSummary());
    render(<GstComplianceTab />);
    await waitFor(() => expect(screen.getByText('Detail')).toBeTruthy());
    fireEvent.click(screen.getByText('Detail'));
    await waitFor(() => {
      expect(screen.getByLabelText('Close')).toBeTruthy();
    });
  });

  it('shows state breakdown table when data has stateBreakdown', async () => {
    gstMock.fetchGstStoresOverview.mockResolvedValue(makeOverview({
      stores: [makeStore()],
    }));
    gstMock.fetchGstSummary.mockResolvedValue(makeSummary({
      stateBreakdown: [{ state: 'Karnataka', taxableValue: 80000, cgst: 7200, sgst: 7200, igst: 0 }],
    }));
    render(<GstComplianceTab />);
    await waitFor(() => expect(screen.getByText('Detail')).toBeTruthy());
    fireEvent.click(screen.getByText('Detail'));
    await waitFor(() => {
      expect(screen.getByText('State-wise Breakdown')).toBeTruthy();
      expect(screen.getByText('Karnataka')).toBeTruthy();
    });
  });

  it('shows supplier breakdown table when data has supplierBreakdown', async () => {
    gstMock.fetchGstStoresOverview.mockResolvedValue(makeOverview({
      stores: [makeStore()],
    }));
    gstMock.fetchGstSummary.mockResolvedValue(makeSummary({
      supplierBreakdown: [{ supplierName: 'Fresh Farms', gstin: '22BBBBB1111Z9', taxableValue: 50000, totalTax: 9000 }],
    }));
    render(<GstComplianceTab />);
    await waitFor(() => expect(screen.getByText('Detail')).toBeTruthy());
    fireEvent.click(screen.getByText('Detail'));
    await waitFor(() => {
      expect(screen.getByText('Supplier Breakdown')).toBeTruthy();
      expect(screen.getByText('Fresh Farms')).toBeTruthy();
    });
  });

  // ── Refresh ─────────────────────────────────────────────────

  it('calls fetchGstStoresOverview on Refresh click', async () => {
    gstMock.fetchGstStoresOverview.mockResolvedValue(makeOverview());
    render(<GstComplianceTab />);
    await waitFor(() => {
      expect(screen.getByText(/No GST data for/)).toBeTruthy();
    });
    gstMock.fetchGstStoresOverview.mockClear();
    fireEvent.click(screen.getByText('Refresh'));
    await waitFor(() => {
      expect(gstMock.fetchGstStoresOverview).toHaveBeenCalled();
    });
  });

  // ── Month Selector ──────────────────────────────────────────

  it('calls fetchGstStoresOverview when month changes', async () => {
    gstMock.fetchGstStoresOverview.mockResolvedValue(makeOverview());
    render(<GstComplianceTab />);
    await waitFor(() => {
      expect(screen.getByText(/No GST data for/)).toBeTruthy();
    });
    gstMock.fetchGstStoresOverview.mockClear();
    fireEvent.change(screen.getByLabelText('Select month'), { target: { value: '2026-01' } });
    await waitFor(() => {
      expect(gstMock.fetchGstStoresOverview).toHaveBeenCalled();
    });
  });
});
