/**
 * Deep tests for POS shiftStore
 * Covers: fetchCurrentShift, fetchHistory, startShift, endShift,
 * loading states, error handling, no-active-shift guard
 */

// Mock AsyncStorage before any import
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
    getAllKeys: jest.fn(),
  },
}));

const mockGetCurrentShift = jest.fn();
const mockGetShiftHistory = jest.fn();
const mockStartShift = jest.fn();
const mockEndShift = jest.fn();

jest.mock('../../services/shiftService', () => ({
  getCurrentShift: (...args: unknown[]) => mockGetCurrentShift(...args),
  getShiftHistory: (...args: unknown[]) => mockGetShiftHistory(...args),
  startShift: (...args: unknown[]) => mockStartShift(...args),
  endShift: (...args: unknown[]) => mockEndShift(...args),
}));

import { useShiftStore } from '../../stores/shiftStore';

const store = useShiftStore;

const mockShift = {
  id: 'shift-1',
  staffId: 'staff-1',
  staffName: 'Ravi',
  startedAt: '2026-01-15T09:00:00Z',
  endedAt: null,
  openingCashMinor: 100000,
  closingCashMinor: null,
  expectedCashMinor: null,
  varianceMinor: null,
  salesCount: 0,
  salesTotalMinor: 0,
  salesByPaymentType: { cashMinor: 0, upiMinor: 0, dueMinor: 0, cardMinor: 0 },
  notes: null,
  status: 'ACTIVE' as const,
};

const mockEndedShift = {
  ...mockShift,
  id: 'shift-2',
  endedAt: '2026-01-15T18:00:00Z',
  closingCashMinor: 250000,
  expectedCashMinor: 240000,
  varianceMinor: 10000,
  salesCount: 15,
  salesTotalMinor: 150000,
  salesByPaymentType: { cashMinor: 100000, upiMinor: 40000, dueMinor: 10000, cardMinor: 0 },
  status: 'CLOSED' as const,
};

beforeEach(() => {
  jest.clearAllMocks();
  store.setState({
    currentShift: null,
    history: [],
    loading: false,
    historyLoading: false,
    starting: false,
    ending: false,
    error: null,
  });
});

describe('shiftStore', () => {
  describe('fetchCurrentShift', () => {
    it('fetches and stores current shift', async () => {
      mockGetCurrentShift.mockResolvedValueOnce(mockShift);

      await store.getState().fetchCurrentShift();

      expect(store.getState().currentShift).toEqual(mockShift);
      expect(store.getState().loading).toBe(false);
    });

    it('sets null when no active shift', async () => {
      mockGetCurrentShift.mockResolvedValueOnce(null);

      await store.getState().fetchCurrentShift();

      expect(store.getState().currentShift).toBeNull();
    });

    it('handles error', async () => {
      mockGetCurrentShift.mockRejectedValueOnce(new Error('Timeout'));

      await store.getState().fetchCurrentShift();

      expect(store.getState().error).toBe('Timeout');
      expect(store.getState().loading).toBe(false);
    });
  });

  describe('fetchHistory', () => {
    it('fetches shift history', async () => {
      mockGetShiftHistory.mockResolvedValueOnce([mockEndedShift]);

      await store.getState().fetchHistory();

      expect(store.getState().history).toHaveLength(1);
      expect(store.getState().historyLoading).toBe(false);
    });

    it('handles error', async () => {
      mockGetShiftHistory.mockRejectedValueOnce(new Error('DB error'));

      await store.getState().fetchHistory();

      expect(store.getState().error).toBe('DB error');
    });
  });

  describe('startShift', () => {
    it('starts shift and stores it', async () => {
      mockStartShift.mockResolvedValueOnce(mockShift);

      const result = await store.getState().startShift({ openingCashMinor: 100000 });

      expect(result).toBe(true);
      expect(store.getState().currentShift).toEqual(mockShift);
      expect(store.getState().starting).toBe(false);
    });

    it('returns false on error', async () => {
      mockStartShift.mockRejectedValueOnce(new Error('Already have active shift'));

      const result = await store.getState().startShift({ openingCashMinor: 100000 });

      expect(result).toBe(false);
      expect(store.getState().error).toBe('Already have active shift');
    });
  });

  describe('endShift', () => {
    it('ends active shift, clears current, prepends to history', async () => {
      store.setState({ currentShift: mockShift, history: [] });
      mockEndShift.mockResolvedValueOnce(mockEndedShift);

      const result = await store.getState().endShift({ closingCashMinor: 250000 });

      expect(result).toBe(true);
      expect(store.getState().currentShift).toBeNull();
      expect(store.getState().history).toHaveLength(1);
      expect(store.getState().history[0].id).toBe('shift-2');
    });

    it('returns false when no active shift', async () => {
      store.setState({ currentShift: null });

      const result = await store.getState().endShift({ closingCashMinor: 0 });

      expect(result).toBe(false);
      expect(store.getState().error).toBe('No active shift to end');
    });

    it('returns false on API error', async () => {
      store.setState({ currentShift: mockShift });
      mockEndShift.mockRejectedValueOnce(new Error('Server error'));

      const result = await store.getState().endShift({ closingCashMinor: 0 });

      expect(result).toBe(false);
      expect(store.getState().error).toBe('Server error');
      expect(store.getState().ending).toBe(false);
      // Current shift should NOT be cleared on error
      expect(store.getState().currentShift).toEqual(mockShift);
    });
  });

  describe('clearError', () => {
    it('clears error state', () => {
      store.setState({ error: 'Some error' });
      store.getState().clearError();
      expect(store.getState().error).toBeNull();
    });
  });
});
