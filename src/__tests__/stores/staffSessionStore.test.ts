/**
 * Deep tests for POS staffSessionStore
 * Covers: setSession, clearSession, session persistence shape, StaffRole types
 */

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

import { useStaffSessionStore, type StaffRole } from '../../stores/staffSessionStore';

const store = useStaffSessionStore;

beforeEach(() => {
  store.setState({ session: null });
});

describe('staffSessionStore', () => {
  describe('initial state', () => {
    it('starts with null session', () => {
      expect(store.getState().session).toBeNull();
    });
  });

  describe('setSession', () => {
    it('sets CASHIER session', () => {
      store.getState().setSession({ staffId: 's1', name: 'Raju', role: 'CASHIER', maxDiscountPct: 100 });

      const session = store.getState().session;
      expect(session).not.toBeNull();
      expect(session!.staffId).toBe('s1');
      expect(session!.name).toBe('Raju');
      expect(session!.role).toBe('CASHIER');
    });

    it('sets STOCK_MANAGER session', () => {
      store.getState().setSession({ staffId: 's2', name: 'Priya', role: 'STOCK_MANAGER', maxDiscountPct: 100 });
      expect(store.getState().session!.role).toBe('STOCK_MANAGER');
    });

    it('sets MANAGER session', () => {
      store.getState().setSession({ staffId: 's3', name: 'Amit', role: 'MANAGER', maxDiscountPct: 100 });
      expect(store.getState().session!.role).toBe('MANAGER');
    });

    it('replaces existing session', () => {
      store.getState().setSession({ staffId: 's1', name: 'Raju', role: 'CASHIER', maxDiscountPct: 100 });
      store.getState().setSession({ staffId: 's2', name: 'Priya', role: 'MANAGER', maxDiscountPct: 100 });

      const session = store.getState().session;
      expect(session!.staffId).toBe('s2');
      expect(session!.name).toBe('Priya');
    });
  });

  describe('clearSession', () => {
    it('sets session to null', () => {
      store.getState().setSession({ staffId: 's1', name: 'Raju', role: 'CASHIER', maxDiscountPct: 100 });
      store.getState().clearSession();
      expect(store.getState().session).toBeNull();
    });

    it('no-ops when session already null', () => {
      store.getState().clearSession();
      expect(store.getState().session).toBeNull();
    });
  });
});
