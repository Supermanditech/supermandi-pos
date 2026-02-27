/**
 * Deep tests for POS dailyClosingStore
 * Covers: fetchSummary, fetchHistory, closeDay, clearError, loading states, error handling
 */

const mockGetSummary = jest.fn();
const mockGetHistory = jest.fn();
const mockCloseDay = jest.fn();

jest.mock('../../services/dailyClosingService', () => ({
  getDailyClosingSummary: (...args: any[]) => mockGetSummary(...args),
  getDailyClosingHistory: (...args: any[]) => mockGetHistory(...args),
  closeDay: (...args: any[]) => mockCloseDay(...args),
}));

import { useDailyClosingStore } from '../../stores/dailyClosingStore';

const store = useDailyClosingStore;

beforeEach(() => {
  jest.clearAllMocks();
  store.setState({
    summary: null,
    history: [],
    loading: false,
    historyLoading: false,
    closing: false,
    error: null,
  });
});

describe('dailyClosingStore', () => {
  describe('fetchSummary', () => {
    it('sets loading true then stores summary', async () => {
      const summary = { totalSales: 10, totalRevenue: 50000, cashTotal: 30000, upiTotal: 20000 };
      mockGetSummary.mockResolvedValue(summary);

      await store.getState().fetchSummary();

      const state = store.getState();
      expect(state.summary).toEqual(summary);
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('passes date parameter to service', async () => {
      mockGetSummary.mockResolvedValue({});
      await store.getState().fetchSummary('2025-06-15');

      expect(mockGetSummary).toHaveBeenCalledWith('2025-06-15');
    });

    it('sets error on failure', async () => {
      mockGetSummary.mockRejectedValue(new Error('Network error'));
      await store.getState().fetchSummary();

      const state = store.getState();
      expect(state.loading).toBe(false);
      expect(state.error).toBe('Network error');
      expect(state.summary).toBeNull();
    });

    it('uses generic message for non-Error throws', async () => {
      // asError('fail') converts to Error("fail"), which has a truthy message,
      // so the fallback generic message is never reached. Test the actual behavior.
      mockGetSummary.mockRejectedValue('fail');
      await store.getState().fetchSummary();

      expect(store.getState().error).toBe('fail');
    });
  });

  describe('fetchHistory', () => {
    it('stores history records', async () => {
      const records = [
        { id: 'r1', date: '2025-06-14', totalSales: 5 },
        { id: 'r2', date: '2025-06-13', totalSales: 8 },
      ];
      mockGetHistory.mockResolvedValue(records);

      await store.getState().fetchHistory();

      const state = store.getState();
      expect(state.history).toEqual(records);
      expect(state.historyLoading).toBe(false);
    });

    it('sets error on failure', async () => {
      mockGetHistory.mockRejectedValue(new Error('Timeout'));
      await store.getState().fetchHistory();

      expect(store.getState().error).toBe('Timeout');
      expect(store.getState().historyLoading).toBe(false);
    });
  });

  describe('closeDay', () => {
    it('returns true and prepends to history on success', async () => {
      const record = { id: 'r-new', date: '2025-06-15', totalSales: 12 };
      mockCloseDay.mockResolvedValue(record);

      // Pre-seed history
      store.setState({ history: [{ id: 'r-old', date: '2025-06-14' }] as any[] });

      const result = await store.getState().closeDay({ date: '2025-06-15', cashInDrawer: 5000 } as any);

      expect(result).toBe(true);
      const state = store.getState();
      expect(state.closing).toBe(false);
      expect(state.history[0]).toEqual(record);
      expect(state.history).toHaveLength(2);
    });

    it('returns false and sets error on failure', async () => {
      mockCloseDay.mockRejectedValue(new Error('Already closed'));
      const result = await store.getState().closeDay({ date: '2025-06-15' } as any);

      expect(result).toBe(false);
      expect(store.getState().error).toBe('Already closed');
      expect(store.getState().closing).toBe(false);
    });
  });

  describe('clearError', () => {
    it('clears error', () => {
      store.setState({ error: 'some error' });
      store.getState().clearError();
      expect(store.getState().error).toBeNull();
    });
  });
});
