/**
 * V3-HARDEN-185: Mounted runtime test for DemandSignalsSection
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

vi.mock('../lib/demandSignals', () => ({
  getDemandSignals: vi.fn(),
  getDemandRecommendations: vi.fn(),
}));

import { getDemandSignals, getDemandRecommendations } from '../lib/demandSignals';
import { DemandSignalsSection } from '../components/DemandSignalsSection';

const mockGetSignals = getDemandSignals as ReturnType<typeof vi.fn>;
const mockGetRecs = getDemandRecommendations as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('DemandSignalsSection mounted behavior', () => {
  it('renders low stock signals on mount', async () => {
    mockGetSignals.mockResolvedValueOnce({
      signals: [
        { productId: 'p1', productName: 'Rice 5kg', currentStock: 3, dailyVelocity: 2, daysOfStock: 1.5, needsReorder: true },
      ],
    });

    render(<DemandSignalsSection />);

    await waitFor(() => {
      expect(screen.getByText('Rice 5kg')).toBeInTheDocument();
    });
    expect(screen.getByText('1.5')).toBeInTheDocument();
    expect(mockGetSignals).toHaveBeenCalledWith({ needsReorder: true, sortBy: 'daysOfStock', limit: 20 });
  });

  it('shows healthy message when no signals', async () => {
    mockGetSignals.mockResolvedValueOnce({ signals: [] });

    render(<DemandSignalsSection />);

    await waitFor(() => {
      expect(screen.getByText('All stock levels healthy')).toBeInTheDocument();
    });
  });

  it('switches to recommendations view and calls API', async () => {
    mockGetSignals.mockResolvedValueOnce({ signals: [] });
    mockGetRecs.mockResolvedValueOnce({
      recommendations: [
        { productId: 'p1', productName: 'Sugar', suggestedQuantity: 15, daysOfStock: 2, isRepeat: true },
      ],
    });

    render(<DemandSignalsSection />);
    await waitFor(() => expect(screen.getByText('All stock levels healthy')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Reorder Recommendations'));

    await waitFor(() => {
      expect(screen.getByText('Sugar')).toBeInTheDocument();
      expect(screen.getByText('15')).toBeInTheDocument();
      expect(screen.getByText('Repeat')).toBeInTheDocument();
    });
    expect(mockGetRecs).toHaveBeenCalled();
  });

  it('shows error on API failure', async () => {
    mockGetSignals.mockRejectedValueOnce(new Error('Server error'));

    render(<DemandSignalsSection />);

    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument();
    });
  });
});
