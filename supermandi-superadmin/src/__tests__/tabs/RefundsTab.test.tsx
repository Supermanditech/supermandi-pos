// SuperAdmin — Test RefundsTab component
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { RefundsTab } from '../../tabs/RefundsTab';

vi.mock('../../api/refunds', () => ({
  fetchRefunds: vi.fn(),
  approveRefund: vi.fn(),
  rejectRefund: vi.fn(),
}));

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

  it('renders header', async () => {
    refundsMock.fetchRefunds.mockResolvedValue({ data: [], total: 0 });
    render(<RefundsTab />);
    expect(screen.getByText('Refund Management')).toBeTruthy();
  });

  it('shows loading state', () => {
    refundsMock.fetchRefunds.mockReturnValue(new Promise(() => {}));
    render(<RefundsTab />);
    expect(screen.getByText('Loading refunds...')).toBeTruthy();
  });

  it('shows empty state', async () => {
    refundsMock.fetchRefunds.mockResolvedValue({ data: [], total: 0 });
    render(<RefundsTab />);
    await waitFor(() => {
      expect(screen.getByText('No refund requests found')).toBeTruthy();
    });
  });

  it('shows error state', async () => {
    refundsMock.fetchRefunds.mockRejectedValue(new Error('Network error'));
    render(<RefundsTab />);
    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeTruthy();
    });
  });

  it('renders refund data', async () => {
    refundsMock.fetchRefunds.mockResolvedValue({
      data: [{
        id: 'r1', storeId: 'store-id-1234', storeName: 'Test Store',
        orderId: 'order-id-5678', refundAmount: 50000, reason: 'Defective item',
        status: 'initiated', createdAt: '2026-01-01T00:00:00Z',
      }],
      total: 1,
    });
    render(<RefundsTab />);
    await waitFor(() => {
      expect(screen.getByText('Test Store')).toBeTruthy();
      expect(screen.getByText('Defective item')).toBeTruthy();
      expect(screen.getByText('Approve')).toBeTruthy();
    });
  });

  it('shows Reject button for initiated refunds', async () => {
    refundsMock.fetchRefunds.mockResolvedValue({
      data: [{
        id: 'r1', storeId: 's1', storeName: 'Store',
        orderId: 'o1', refundAmount: 1000, reason: 'Test',
        status: 'initiated', createdAt: '2026-01-01',
      }],
      total: 1,
    });
    render(<RefundsTab />);
    await waitFor(() => {
      expect(screen.getByText('Reject')).toBeTruthy();
    });
  });

  it('shows total count', async () => {
    refundsMock.fetchRefunds.mockResolvedValue({ data: [], total: 42 });
    render(<RefundsTab />);
    await waitFor(() => {
      expect(screen.getByText(/42 total refund requests/)).toBeTruthy();
    });
  });
});
