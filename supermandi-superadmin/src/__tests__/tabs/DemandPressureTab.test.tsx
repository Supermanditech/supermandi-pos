/**
 * V3-HARDEN-185: Mounted runtime test for DemandPressureTab
 * Renders component, asserts data display + user action wiring.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

vi.mock('../../api/demandSignals', () => ({
  getDemandPressure: vi.fn(),
  recomputeDemandSignals: vi.fn(),
}));

import { getDemandPressure, recomputeDemandSignals } from '../../api/demandSignals';
import { DemandPressureTab } from '../../tabs/DemandPressureTab';

const mockGetPressure = getDemandPressure as ReturnType<typeof vi.fn>;
const mockRecompute = recomputeDemandSignals as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('DemandPressureTab mounted behavior', () => {
  it('shows loading then renders pressure data', async () => {
    mockGetPressure.mockResolvedValueOnce({
      computedAt: '2026-03-20T12:00:00Z',
      totalProducts: 2,
      pressure: [
        { productId: 'p1', productName: 'Rice 5kg', totalStores: 10, storesNeedingReorder: 7, avgDaysOfStock: 2.5, totalPendingInbound: 20 },
        { productId: 'p2', productName: 'Sugar 1kg', totalStores: 8, storesNeedingReorder: 3, avgDaysOfStock: 5.0, totalPendingInbound: 10 },
      ],
    });

    render(<DemandPressureTab />);

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('Rice 5kg')).toBeInTheDocument();
    });
    expect(screen.getByText('Sugar 1kg')).toBeInTheDocument();
    expect(screen.getByText('7 / 10')).toBeInTheDocument();
    expect(screen.getByText('2.5')).toBeInTheDocument();
    expect(mockGetPressure).toHaveBeenCalledWith(50);
  });

  it('shows empty state when no products need reorder', async () => {
    mockGetPressure.mockResolvedValueOnce({
      computedAt: '2026-03-20T12:00:00Z',
      totalProducts: 0,
      pressure: [],
    });

    render(<DemandPressureTab />);

    await waitFor(() => {
      expect(screen.getByText('No products need reorder across stores')).toBeInTheDocument();
    });
  });

  it('shows error on API failure', async () => {
    mockGetPressure.mockRejectedValueOnce(new Error('Network error'));

    render(<DemandPressureTab />);

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('recompute button calls recomputeDemandSignals then refetches', async () => {
    mockGetPressure.mockResolvedValue({
      computedAt: '2026-03-20T12:00:00Z',
      totalProducts: 0,
      pressure: [],
    });
    mockRecompute.mockResolvedValueOnce(undefined);

    render(<DemandPressureTab />);

    await waitFor(() => {
      expect(screen.getByText('Recompute')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Recompute'));

    await waitFor(() => {
      expect(mockRecompute).toHaveBeenCalledTimes(1);
      // refetch after recompute
      expect(mockGetPressure).toHaveBeenCalledTimes(2);
    });
  });
});
