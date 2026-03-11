// SuperAdmin — Test RefundsTab component
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { RefundsTab } from '../../tabs/RefundsTab';

vi.mock('../../api/refunds', () => ({
  fetchRefunds: vi.fn(),
  approveRefund: vi.fn(),
  rejectRefund: vi.fn(),
}));

vi.mock('../../lib/formatters', () => ({
  formatDateTime: vi.fn((v: string) => v || '--'),
}));

vi.mock('../../components/ConfirmDialog', () => ({
  ConfirmDialog: ({ title, onConfirm, onCancel }: any) => (
    <div data-testid="confirm-dialog">
      <span>{title}</span>
      <button onClick={onConfirm}>Confirm</button>
      <button onClick={onCancel}>Cancel</button>
    </div>
  ),
}));

const makeRefund = (overrides: Record<string, unknown> = {}) => ({
  id: 'r1',
  storeId: 'store-id-1234',
  storeName: 'Test Store',
  orderId: 'order-id-5678abcdef',
  refundAmount: 50000,
  reason: 'Defective item',
  status: 'initiated',
  createdAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

describe('RefundsTab', () => {
  let refundsMock: {
    fetchRefunds: ReturnType<typeof vi.fn>;
    approveRefund: ReturnType<typeof vi.fn>;
    rejectRefund: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    refundsMock = (await import('../../api/refunds')) as any;
  });

  // ── Header ──────────────────────────────────────────────────

  it('renders header title', async () => {
    refundsMock.fetchRefunds.mockResolvedValue({ data: [], total: 0 });
    render(<RefundsTab />);
    expect(screen.getByText('Refund Management')).toBeTruthy();
  });

  it('shows total count in subtitle', async () => {
    refundsMock.fetchRefunds.mockResolvedValue({ data: [], total: 42 });
    render(<RefundsTab />);
    await waitFor(() => {
      expect(screen.getByText(/42 total refund requests/)).toBeTruthy();
    });
  });

  it('renders status filter dropdown', async () => {
    refundsMock.fetchRefunds.mockResolvedValue({ data: [], total: 0 });
    render(<RefundsTab />);
    expect(screen.getByLabelText('Refund status')).toBeTruthy();
  });

  it('renders Refresh button', async () => {
    refundsMock.fetchRefunds.mockResolvedValue({ data: [], total: 0 });
    render(<RefundsTab />);
    expect(screen.getByText('Refresh')).toBeTruthy();
  });

  it('renders all status filter options', async () => {
    refundsMock.fetchRefunds.mockResolvedValue({ data: [], total: 0 });
    render(<RefundsTab />);
    expect(screen.getByText('All Statuses')).toBeTruthy();
    expect(screen.getByText('Initiated')).toBeTruthy();
    expect(screen.getByText('Processing')).toBeTruthy();
    expect(screen.getByText('Processed')).toBeTruthy();
    expect(screen.getByText('Failed')).toBeTruthy();
    expect(screen.getByText('Cancelled')).toBeTruthy();
  });

  // ── Loading State ───────────────────────────────────────────

  it('shows loading message', () => {
    refundsMock.fetchRefunds.mockReturnValue(new Promise(() => {}));
    render(<RefundsTab />);
    expect(screen.getByText('Loading refunds...')).toBeTruthy();
  });

  // ── Empty State ─────────────────────────────────────────────

  it('shows empty state when no refunds', async () => {
    refundsMock.fetchRefunds.mockResolvedValue({ data: [], total: 0 });
    render(<RefundsTab />);
    await waitFor(() => {
      expect(screen.getByText('No refund requests found')).toBeTruthy();
    });
  });

  // ── Error State ─────────────────────────────────────────────

  it('shows error message', async () => {
    refundsMock.fetchRefunds.mockRejectedValue(new Error('Network error'));
    render(<RefundsTab />);
    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeTruthy();
    });
  });

  it('shows error with role=alert', async () => {
    refundsMock.fetchRefunds.mockRejectedValue(new Error('Server down'));
    render(<RefundsTab />);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
    });
  });

  it('shows fallback error for non-Error exceptions', async () => {
    refundsMock.fetchRefunds.mockRejectedValue({ message: '' });
    render(<RefundsTab />);
    await waitFor(() => {
      expect(screen.getByText('Failed to load refunds')).toBeTruthy();
    });
  });

  // ── Table ───────────────────────────────────────────────────

  it('renders table column headers', async () => {
    refundsMock.fetchRefunds.mockResolvedValue({ data: [makeRefund()], total: 1 });
    render(<RefundsTab />);
    await waitFor(() => {
      expect(screen.getByText('Store')).toBeTruthy();
      expect(screen.getByText('Order')).toBeTruthy();
      expect(screen.getByText('Amount')).toBeTruthy();
      expect(screen.getByText('Reason')).toBeTruthy();
      expect(screen.getByText('Status')).toBeTruthy();
      expect(screen.getByText('Date')).toBeTruthy();
      expect(screen.getByText('Actions')).toBeTruthy();
    });
  });

  it('renders store name', async () => {
    refundsMock.fetchRefunds.mockResolvedValue({ data: [makeRefund()], total: 1 });
    render(<RefundsTab />);
    await waitFor(() => {
      expect(screen.getByText('Test Store')).toBeTruthy();
    });
  });

  it('renders refund reason', async () => {
    refundsMock.fetchRefunds.mockResolvedValue({ data: [makeRefund()], total: 1 });
    render(<RefundsTab />);
    await waitFor(() => {
      expect(screen.getByText('Defective item')).toBeTruthy();
    });
  });

  it('renders Initiated status badge', async () => {
    refundsMock.fetchRefunds.mockResolvedValue({ data: [makeRefund()], total: 1 });
    render(<RefundsTab />);
    await waitFor(() => {
      // "Initiated" appears in both filter options and badge
      const initiated = screen.getAllByText('Initiated');
      expect(initiated.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('renders Approve button for initiated refund', async () => {
    refundsMock.fetchRefunds.mockResolvedValue({ data: [makeRefund()], total: 1 });
    render(<RefundsTab />);
    await waitFor(() => {
      expect(screen.getByText('Approve')).toBeTruthy();
    });
  });

  it('renders Reject button for initiated refund', async () => {
    refundsMock.fetchRefunds.mockResolvedValue({ data: [makeRefund()], total: 1 });
    render(<RefundsTab />);
    await waitFor(() => {
      expect(screen.getByText('Reject')).toBeTruthy();
    });
  });

  it('does not render Approve/Reject for processed refund', async () => {
    refundsMock.fetchRefunds.mockResolvedValue({ data: [makeRefund({ status: 'processed' })], total: 1 });
    render(<RefundsTab />);
    await waitFor(() => {
      expect(screen.getByText('Test Store')).toBeTruthy();
    });
    expect(screen.queryByText('Approve')).toBeNull();
    expect(screen.queryByText('Reject')).toBeNull();
  });

  it('renders Processed status badge', async () => {
    refundsMock.fetchRefunds.mockResolvedValue({ data: [makeRefund({ status: 'processed' })], total: 1 });
    render(<RefundsTab />);
    await waitFor(() => {
      // "Processed" appears in both filter options and badge
      const processed = screen.getAllByText('Processed');
      expect(processed.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('renders multiple refunds', async () => {
    refundsMock.fetchRefunds.mockResolvedValue({
      data: [
        makeRefund({ id: 'r1', storeName: 'Store Alpha', reason: 'Wrong item' }),
        makeRefund({ id: 'r2', storeName: 'Store Beta', reason: 'Damaged' }),
      ],
      total: 2,
    });
    render(<RefundsTab />);
    await waitFor(() => {
      expect(screen.getByText('Store Alpha')).toBeTruthy();
      expect(screen.getByText('Store Beta')).toBeTruthy();
    });
  });

  // ── Approve Flow ────────────────────────────────────────────

  it('shows confirm dialog on Approve click', async () => {
    refundsMock.fetchRefunds.mockResolvedValue({ data: [makeRefund()], total: 1 });
    render(<RefundsTab />);
    await waitFor(() => expect(screen.getByText('Approve')).toBeTruthy());
    fireEvent.click(screen.getByText('Approve'));
    expect(screen.getByTestId('confirm-dialog')).toBeTruthy();
    expect(screen.getByText('Approve Refund')).toBeTruthy();
  });

  // ── Reject Flow ─────────────────────────────────────────────

  it('opens reject modal on Reject click', async () => {
    refundsMock.fetchRefunds.mockResolvedValue({ data: [makeRefund()], total: 1 });
    render(<RefundsTab />);
    await waitFor(() => expect(screen.getByText('Reject')).toBeTruthy());
    fireEvent.click(screen.getByText('Reject'));
    expect(screen.getByRole('dialog')).toBeTruthy();
    // "Reject Refund" appears as both modal title and submit button
    const rejectElements = screen.getAllByText('Reject Refund');
    expect(rejectElements.length).toBeGreaterThanOrEqual(1);
  });

  it('renders rejection reason textarea in modal', async () => {
    refundsMock.fetchRefunds.mockResolvedValue({ data: [makeRefund()], total: 1 });
    render(<RefundsTab />);
    await waitFor(() => expect(screen.getByText('Reject')).toBeTruthy());
    fireEvent.click(screen.getByText('Reject'));
    expect(screen.getByPlaceholderText('Reason for rejection...')).toBeTruthy();
  });

  it('renders Cancel button in reject modal', async () => {
    refundsMock.fetchRefunds.mockResolvedValue({ data: [makeRefund()], total: 1 });
    render(<RefundsTab />);
    await waitFor(() => expect(screen.getByText('Reject')).toBeTruthy());
    fireEvent.click(screen.getByText('Reject'));
    // Cancel button appears in the modal
    const cancelButtons = screen.getAllByText('Cancel');
    expect(cancelButtons.length).toBeGreaterThanOrEqual(1);
  });

  // ── Refresh ─────────────────────────────────────────────────

  it('calls fetchRefunds on Refresh click', async () => {
    refundsMock.fetchRefunds.mockResolvedValue({ data: [], total: 0 });
    render(<RefundsTab />);
    await waitFor(() => expect(screen.getByText('No refund requests found')).toBeTruthy());
    refundsMock.fetchRefunds.mockClear();
    fireEvent.click(screen.getByText('Refresh'));
    await waitFor(() => {
      expect(refundsMock.fetchRefunds).toHaveBeenCalled();
    });
  });

  // ── Pagination ──────────────────────────────────────────────

  it('does not show pagination when total under limit', async () => {
    refundsMock.fetchRefunds.mockResolvedValue({ data: [makeRefund()], total: 1 });
    render(<RefundsTab />);
    await waitFor(() => expect(screen.getByText('Test Store')).toBeTruthy());
    expect(screen.queryByText('Previous')).toBeNull();
  });

  it('shows pagination when total exceeds limit', async () => {
    refundsMock.fetchRefunds.mockResolvedValue({
      data: Array.from({ length: 50 }, (_, i) => makeRefund({ id: `r-${i}` })),
      total: 100,
    });
    render(<RefundsTab />);
    await waitFor(() => {
      expect(screen.getByText('Previous')).toBeTruthy();
      expect(screen.getByText('Next')).toBeTruthy();
    });
  });

  it('shows page info with range', async () => {
    refundsMock.fetchRefunds.mockResolvedValue({
      data: Array.from({ length: 50 }, (_, i) => makeRefund({ id: `r-${i}` })),
      total: 100,
    });
    render(<RefundsTab />);
    await waitFor(() => {
      expect(screen.getByText(/1–50 of 100/)).toBeTruthy();
    });
  });

  // ── Approve Flow (confirm + execute) ──────────────────────────

  it('calls approveRefund after confirm dialog confirmation', async () => {
    refundsMock.fetchRefunds.mockResolvedValue({ data: [makeRefund()], total: 1 });
    refundsMock.approveRefund.mockResolvedValue({});
    render(<RefundsTab />);
    await waitFor(() => expect(screen.getByText('Approve')).toBeTruthy());
    fireEvent.click(screen.getByText('Approve'));
    expect(screen.getByTestId('confirm-dialog')).toBeTruthy();
    // After re-fetch setup
    refundsMock.fetchRefunds.mockResolvedValue({ data: [makeRefund({ status: 'processed' })], total: 1 });
    fireEvent.click(screen.getByText('Confirm'));
    await waitFor(() => {
      expect(refundsMock.approveRefund).toHaveBeenCalledWith('r1');
    });
  });

  it('closes confirm dialog on Cancel click', async () => {
    refundsMock.fetchRefunds.mockResolvedValue({ data: [makeRefund()], total: 1 });
    render(<RefundsTab />);
    await waitFor(() => expect(screen.getByText('Approve')).toBeTruthy());
    fireEvent.click(screen.getByText('Approve'));
    expect(screen.getByTestId('confirm-dialog')).toBeTruthy();
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
  });

  // ── Reject Flow (submit) ──────────────────────────────────────

  it('calls rejectRefund after entering reason and clicking Reject Refund', async () => {
    refundsMock.fetchRefunds.mockResolvedValue({ data: [makeRefund()], total: 1 });
    refundsMock.rejectRefund.mockResolvedValue({});
    render(<RefundsTab />);
    await waitFor(() => expect(screen.getByText('Reject')).toBeTruthy());
    fireEvent.click(screen.getByText('Reject'));
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('Reason for rejection...'), { target: { value: 'Wrong item returned' } });
    refundsMock.fetchRefunds.mockResolvedValue({ data: [makeRefund({ status: 'cancelled' })], total: 1 });
    const rejectButtons = screen.getAllByText('Reject Refund');
    fireEvent.click(rejectButtons[rejectButtons.length - 1]);
    await waitFor(() => {
      expect(refundsMock.rejectRefund).toHaveBeenCalledWith('r1', 'Wrong item returned');
    });
  });

  it('disables Reject Refund button when reason is empty', async () => {
    refundsMock.fetchRefunds.mockResolvedValue({ data: [makeRefund()], total: 1 });
    render(<RefundsTab />);
    await waitFor(() => expect(screen.getByText('Reject')).toBeTruthy());
    fireEvent.click(screen.getByText('Reject'));
    const rejectButtons = screen.getAllByText('Reject Refund');
    const submitBtn = rejectButtons[rejectButtons.length - 1] as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);
  });

  it('closes reject modal on Cancel', async () => {
    refundsMock.fetchRefunds.mockResolvedValue({ data: [makeRefund()], total: 1 });
    render(<RefundsTab />);
    await waitFor(() => expect(screen.getByText('Reject')).toBeTruthy());
    fireEvent.click(screen.getByText('Reject'));
    expect(screen.getByRole('dialog')).toBeTruthy();
    const cancelButtons = screen.getAllByText('Cancel');
    fireEvent.click(cancelButtons[cancelButtons.length - 1]);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  // ── Error during actions ──────────────────────────────────────

  it('shows error when approve fails', async () => {
    refundsMock.fetchRefunds.mockResolvedValue({ data: [makeRefund()], total: 1 });
    refundsMock.approveRefund.mockRejectedValue(new Error('Approve denied'));
    render(<RefundsTab />);
    await waitFor(() => expect(screen.getByText('Approve')).toBeTruthy());
    fireEvent.click(screen.getByText('Approve'));
    fireEvent.click(screen.getByText('Confirm'));
    await waitFor(() => {
      expect(screen.getByText('Approve denied')).toBeTruthy();
    });
  });

  it('shows error when reject fails', async () => {
    refundsMock.fetchRefunds.mockResolvedValue({ data: [makeRefund()], total: 1 });
    refundsMock.rejectRefund.mockRejectedValue(new Error('Reject denied'));
    render(<RefundsTab />);
    await waitFor(() => expect(screen.getByText('Reject')).toBeTruthy());
    fireEvent.click(screen.getByText('Reject'));
    fireEvent.change(screen.getByPlaceholderText('Reason for rejection...'), { target: { value: 'Bad' } });
    const rejectButtons = screen.getAllByText('Reject Refund');
    fireEvent.click(rejectButtons[rejectButtons.length - 1]);
    await waitFor(() => {
      expect(screen.getByText('Reject denied')).toBeTruthy();
    });
  });

  // ── Status filter change ──────────────────────────────────────

  it('calls fetchRefunds with status filter on change', async () => {
    refundsMock.fetchRefunds.mockResolvedValue({ data: [], total: 0 });
    render(<RefundsTab />);
    await waitFor(() => expect(screen.getByText('No refund requests found')).toBeTruthy());
    refundsMock.fetchRefunds.mockClear();
    fireEvent.change(screen.getByLabelText('Refund status'), { target: { value: 'processing' } });
    await waitFor(() => {
      expect(refundsMock.fetchRefunds).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'processing' })
      );
    });
  });

  // ── Table headers ─────────────────────────────────────────────

  it('renders table column headers', async () => {
    refundsMock.fetchRefunds.mockResolvedValue({ data: [makeRefund()], total: 1 });
    render(<RefundsTab />);
    await waitFor(() => {
      expect(screen.getByText('Store')).toBeTruthy();
      expect(screen.getByText('Order')).toBeTruthy();
      expect(screen.getByText('Amount')).toBeTruthy();
      expect(screen.getByText('Reason')).toBeTruthy();
      expect(screen.getByText('Status')).toBeTruthy();
      expect(screen.getByText('Date')).toBeTruthy();
      expect(screen.getByText('Actions')).toBeTruthy();
    });
  });

  // ── Pagination Previous disabled ──────────────────────────────

  it('Previous button is disabled on first page', async () => {
    refundsMock.fetchRefunds.mockResolvedValue({
      data: Array.from({ length: 50 }, (_, i) => makeRefund({ id: `r-${i}` })),
      total: 100,
    });
    render(<RefundsTab />);
    await waitFor(() => {
      expect(screen.getByText('Previous')).toBeTruthy();
    });
    expect((screen.getByText('Previous') as HTMLButtonElement).disabled).toBe(true);
  });

  // ── Failed refund shows failure reason ────────────────────────

  it('shows Failed text for failed refund with failure reason', async () => {
    refundsMock.fetchRefunds.mockResolvedValue({
      data: [makeRefund({ status: 'failed', failureReason: 'Bank rejected' })],
      total: 1,
    });
    render(<RefundsTab />);
    await waitFor(() => {
      const failedElements = screen.getAllByText('Failed');
      expect(failedElements.length).toBeGreaterThanOrEqual(2); // filter option + cell
    });
  });

  // ── Store name fallback to storeId ────────────────────────────

  it('shows truncated storeId when storeName is missing', async () => {
    refundsMock.fetchRefunds.mockResolvedValue({
      data: [makeRefund({ storeName: '', storeId: 'abcdef12-3456-7890' })],
      total: 1,
    });
    render(<RefundsTab />);
    await waitFor(() => {
      expect(screen.getByText('abcdef12')).toBeTruthy();
    });
  });

  // ── Subtitle shows status in filter ───────────────────────────

  it('shows status in subtitle when filtered', async () => {
    refundsMock.fetchRefunds.mockResolvedValue({ data: [], total: 5 });
    render(<RefundsTab />);
    await waitFor(() => expect(screen.getByText('No refund requests found')).toBeTruthy());
    refundsMock.fetchRefunds.mockResolvedValue({ data: [], total: 3 });
    fireEvent.change(screen.getByLabelText('Refund status'), { target: { value: 'processing' } });
    await waitFor(() => {
      expect(screen.getByText(/3 total refund requests \(processing\)/)).toBeTruthy();
    });
  });
});
