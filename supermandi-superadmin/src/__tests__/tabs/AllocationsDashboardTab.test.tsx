/**
 * V3-FIX-187: Mounted integration test for AllocationsDashboardTab
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

vi.mock('../../api/allocations', () => ({
  getAllocationSummary: vi.fn(),
  getStoreAllocations: vi.fn(),
  transitionAllocation: vi.fn(),
}));

import { getAllocationSummary, getStoreAllocations, transitionAllocation } from '../../api/allocations';
import { AllocationsDashboardTab } from '../../tabs/AllocationsDashboardTab';

const mockGetSummary = getAllocationSummary as ReturnType<typeof vi.fn>;
const mockGetStore = getStoreAllocations as ReturnType<typeof vi.fn>;
const mockTransition = transitionAllocation as ReturnType<typeof vi.fn>;

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); });

describe('AllocationsDashboardTab mounted behavior', () => {
  it('renders summary with status breakdown on mount', async () => {
    mockGetSummary.mockResolvedValueOnce({ total: 25, byStatus: { triggered: 10, accepted: 8, delivered: 7 } });

    render(<AllocationsDashboardTab />);

    await waitFor(() => {
      expect(screen.getByText('25')).toBeInTheDocument();
    });
    expect(screen.getByText('triggered')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(mockGetSummary).toHaveBeenCalledTimes(1);
  });

  it('shows error on API failure', async () => {
    mockGetSummary.mockRejectedValueOnce(new Error('Server error'));

    render(<AllocationsDashboardTab />);

    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument();
    });
  });

  it('drill-down loads store allocations', async () => {
    mockGetSummary.mockResolvedValueOnce({ total: 12, byStatus: { triggered: 12 } });
    mockGetStore.mockResolvedValueOnce({
      allocations: [{ id: 'alloc-abc123', retailerOrderId: 'order-xyz', status: 'pending_trigger', updatedAt: '2026-03-20' }],
      total: 1,
    });

    render(<AllocationsDashboardTab />);
    await waitFor(() => expect(screen.getByText('Allocation Dashboard')).toBeInTheDocument());

    const input = screen.getByPlaceholderText('Enter store ID');
    fireEvent.change(input, { target: { value: 'store-1' } });
    fireEvent.click(screen.getByText('Load'));

    await waitFor(() => {
      expect(screen.getByText('pending_trigger')).toBeInTheDocument();
    });
    expect(mockGetStore).toHaveBeenCalledWith('store-1', { limit: 20 });
  });

  it('transition button calls API and refreshes', async () => {
    mockGetSummary.mockResolvedValue({ total: 3, byStatus: { pending_trigger: 3 } });
    mockGetStore.mockResolvedValue({
      allocations: [{ id: 'alloc-abc123', retailerOrderId: 'order-xyz', status: 'pending_trigger', updatedAt: '2026-03-20' }],
      total: 1,
    });
    mockTransition.mockResolvedValueOnce({ id: 'alloc-abc123', status: 'triggered' });

    render(<AllocationsDashboardTab />);
    await waitFor(() => expect(screen.getByText('Allocation Dashboard')).toBeInTheDocument());

    const input = screen.getByPlaceholderText('Enter store ID');
    fireEvent.change(input, { target: { value: 'store-1' } });
    fireEvent.click(screen.getByText('Load'));

    await waitFor(() => expect(screen.getByText('Trigger')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Trigger'));

    await waitFor(() => {
      expect(mockTransition).toHaveBeenCalledWith('alloc-abc123', 'triggered', 'admin override');
    });
  });
});
