/**
 * GCP-STG-0402: BUY Cart Not Persisted — Lost on Screen Unmount
 *
 * Tests that orderQtys and selectedSupplierIndex are managed by
 * the purchaseCartStore (Zustand with persistence) instead of
 * local useState, so they survive BuyScreenV3 unmount/remount.
 */
import { usePurchaseCartStore } from '../../stores/purchaseCartStore';

// Mock zustand persistence
jest.mock('../../services/storeScope', () => ({
  storeScopedStorage: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

const store = usePurchaseCartStore;

beforeEach(() => {
  store.getState().clear();
});

describe('GCP-STG-0402: purchaseCartStore orderQtys persistence', () => {
  it('initializes with empty orderQtys', () => {
    expect(store.getState().orderQtys).toEqual({});
  });

  it('initializes selectedSupplierIndex to 0', () => {
    expect(store.getState().selectedSupplierIndex).toBe(0);
  });

  it('setOrderQty sets a product quantity', () => {
    store.getState().setOrderQty('prod-1', 5);
    expect(store.getState().orderQtys['prod-1']).toBe(5);
  });

  it('setOrderQty updates an existing product quantity', () => {
    store.getState().setOrderQty('prod-1', 5);
    store.getState().setOrderQty('prod-1', 10);
    expect(store.getState().orderQtys['prod-1']).toBe(10);
  });

  it('setOrderQty preserves other products', () => {
    store.getState().setOrderQty('prod-1', 5);
    store.getState().setOrderQty('prod-2', 3);
    expect(store.getState().orderQtys).toEqual({ 'prod-1': 5, 'prod-2': 3 });
  });

  it('setOrderQty to 0 keeps key (removal handled by UI logic)', () => {
    store.getState().setOrderQty('prod-1', 5);
    store.getState().setOrderQty('prod-1', 0);
    expect(store.getState().orderQtys['prod-1']).toBe(0);
  });

  it('clearOrderQtys resets orderQtys to empty and supplier index to 0', () => {
    store.getState().setOrderQty('prod-1', 5);
    store.getState().setOrderQty('prod-2', 3);
    store.getState().setSelectedSupplierIndex(2);
    store.getState().clearOrderQtys();
    expect(store.getState().orderQtys).toEqual({});
    expect(store.getState().selectedSupplierIndex).toBe(0);
  });

  it('setSelectedSupplierIndex updates the supplier filter', () => {
    store.getState().setSelectedSupplierIndex(3);
    expect(store.getState().selectedSupplierIndex).toBe(3);
  });

  it('clear() also resets orderQtys and selectedSupplierIndex', () => {
    store.getState().setOrderQty('prod-1', 5);
    store.getState().setSelectedSupplierIndex(2);
    store.getState().clear();
    expect(store.getState().orderQtys).toEqual({});
    expect(store.getState().selectedSupplierIndex).toBe(0);
  });

  it('resetForStore() also resets orderQtys and selectedSupplierIndex', () => {
    store.getState().setOrderQty('prod-1', 5);
    store.getState().setSelectedSupplierIndex(2);
    store.getState().resetForStore();
    expect(store.getState().orderQtys).toEqual({});
    expect(store.getState().selectedSupplierIndex).toBe(0);
  });

  it('orderQtys survives simulated unmount/remount (store state persists)', () => {
    // Simulate: BuyScreenV3 sets order quantities
    store.getState().setOrderQty('prod-a', 10);
    store.getState().setOrderQty('prod-b', 7);
    store.getState().setSelectedSupplierIndex(1);

    // Simulate: user navigates away (component unmounts)
    // ... no state reset happens because it's in the store, not useState

    // Simulate: user navigates back (component remounts, reads store)
    const state = store.getState();
    expect(state.orderQtys).toEqual({ 'prod-a': 10, 'prod-b': 7 });
    expect(state.selectedSupplierIndex).toBe(1);
  });

  it('multiple rapid setOrderQty calls are consistent', () => {
    for (let i = 0; i < 20; i++) {
      store.getState().setOrderQty(`prod-${i}`, i + 1);
    }
    const qtys = store.getState().orderQtys;
    expect(Object.keys(qtys)).toHaveLength(20);
    for (let i = 0; i < 20; i++) {
      expect(qtys[`prod-${i}`]).toBe(i + 1);
    }
  });
});
