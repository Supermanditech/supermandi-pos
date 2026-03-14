/**
 * Deep tests for POS syncStore
 * Covers: setters, refreshOutboxCount, syncNow (online/offline/inflight guard), error handling
 */

const mockSyncOutbox = jest.fn();
const mockPendingCount = jest.fn();
const mockIsOnline = jest.fn();
const mockSyncServiceNow = jest.fn();

jest.mock('../../services/offline/sync', () => ({
  syncOutbox: (...args: any[]) => mockSyncOutbox(...args),
}));

jest.mock('../../services/offline/outbox', () => ({
  pendingOutboxCount: (...args: any[]) => mockPendingCount(...args),
}));

jest.mock('../../services/networkStatus', () => ({
  isOnline: (...args: any[]) => mockIsOnline(...args),
}));

// syncStore.syncNow() delegates to syncService.syncNow — mock the entire module
// to prevent the netinfo / api.ts import chain from running
jest.mock('../../services/syncService', () => ({
  syncNow: (...args: any[]) => mockSyncServiceNow(...args),
}));

import { useSyncStore } from '../../stores/syncStore';

const store = useSyncStore;

beforeEach(() => {
  jest.clearAllMocks();
  store.setState({
    connectionStatus: 'disconnected',
    outboxCount: 0,
    lastSyncAt: null,
    deadletterCount: 0,
    stockDrifts: [],
    syncing: false,
  });
});

describe('syncStore', () => {
  describe('setters', () => {
    it('setConnectionStatus', () => {
      store.getState().setConnectionStatus('connected');
      expect(store.getState().connectionStatus).toBe('connected');
    });

    it('setOutboxCount', () => {
      store.getState().setOutboxCount(5);
      expect(store.getState().outboxCount).toBe(5);
    });

    it('setLastSyncAt', () => {
      const d = new Date();
      store.getState().setLastSyncAt(d);
      expect(store.getState().lastSyncAt).toBe(d);
    });

    it('setDeadletterCount', () => {
      store.getState().setDeadletterCount(3);
      expect(store.getState().deadletterCount).toBe(3);
    });

    it('setStockDrifts', () => {
      const drifts = [{ productId: 'p1', productName: 'Rice', localStock: 10, serverStock: 8, delta: 2 }];
      store.getState().setStockDrifts(drifts);
      expect(store.getState().stockDrifts).toEqual(drifts);
    });

    it('setSyncing', () => {
      store.getState().setSyncing(true);
      expect(store.getState().syncing).toBe(true);
    });
  });

  describe('refreshOutboxCount', () => {
    it('updates outboxCount from service', async () => {
      mockPendingCount.mockResolvedValue(7);
      await store.getState().refreshOutboxCount();
      expect(store.getState().outboxCount).toBe(7);
    });

    it('handles errors silently', async () => {
      mockPendingCount.mockRejectedValue(new Error('fail'));
      await store.getState().refreshOutboxCount();
      // Should not throw, outboxCount stays 0
      expect(store.getState().outboxCount).toBe(0);
    });
  });

  describe('syncNow', () => {
    it('syncs when online and updates state', async () => {
      mockIsOnline.mockResolvedValue(true);
      mockSyncServiceNow.mockResolvedValue(undefined);
      mockPendingCount.mockResolvedValue(0);

      await store.getState().syncNow();

      const state = store.getState();
      expect(state.syncing).toBe(false);
      expect(state.outboxCount).toBe(0);
      expect(state.lastSyncAt).toBeInstanceOf(Date);
      expect(mockSyncServiceNow).toHaveBeenCalled();
    });

    it('skips sync when offline', async () => {
      mockIsOnline.mockResolvedValue(false);
      await store.getState().syncNow();

      expect(mockSyncServiceNow).not.toHaveBeenCalled();
      expect(store.getState().syncing).toBe(false);
    });

    it('guards against concurrent syncs', async () => {
      store.setState({ syncing: true });
      mockIsOnline.mockResolvedValue(true);

      await store.getState().syncNow();

      expect(mockIsOnline).not.toHaveBeenCalled();
      expect(mockSyncServiceNow).not.toHaveBeenCalled();
    });

    it('resets syncing on error', async () => {
      mockIsOnline.mockResolvedValue(true);
      mockSyncServiceNow.mockRejectedValue(new Error('sync failed'));

      await store.getState().syncNow();

      expect(store.getState().syncing).toBe(false);
    });
  });
});
