/**
 * Deep tests for POS inwardStore
 * Covers: addItem (new + merge), updateItem, removeItem, setSupplier (cascades to all items),
 * setNotes, clearCart, getTotal, getItemCount
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

import { useInwardStore, type InwardItem } from '../../stores/inwardStore';

const store = useInwardStore;

beforeEach(() => {
  store.setState({ items: [], selectedSupplier: null, notes: '' });
});

describe('inwardStore', () => {
  describe('addItem', () => {
    it('adds a new item with no supplier', () => {
      store.getState().addItem({
        id: 'p1',
        barcode: '111',
        name: 'Rice',
        quantity: 10,
        purchasePriceMinor: 5000,
      });

      const state = store.getState();
      expect(state.items).toHaveLength(1);
      expect(state.items[0].id).toBe('p1');
      expect(state.items[0].supplierId).toBeNull();
      expect(state.items[0].supplierName).toBeNull();
    });

    it('attaches current supplier to new items', () => {
      store.getState().setSupplier({ id: 's1', name: 'Vendor A' });
      store.getState().addItem({
        id: 'p1',
        barcode: '111',
        name: 'Rice',
        quantity: 5,
        purchasePriceMinor: 5000,
      });

      expect(store.getState().items[0].supplierId).toBe('s1');
      expect(store.getState().items[0].supplierName).toBe('Vendor A');
    });

    it('merges quantity when adding existing item', () => {
      store.getState().addItem({ id: 'p1', barcode: '111', name: 'Rice', quantity: 5, purchasePriceMinor: 5000 });
      store.getState().addItem({ id: 'p1', barcode: '111', name: 'Rice', quantity: 3, purchasePriceMinor: 5000 });

      expect(store.getState().items).toHaveLength(1);
      expect(store.getState().items[0].quantity).toBe(8);
    });

    it('keeps separate entries for different product IDs', () => {
      store.getState().addItem({ id: 'p1', barcode: '111', name: 'Rice', quantity: 5, purchasePriceMinor: 5000 });
      store.getState().addItem({ id: 'p2', barcode: '222', name: 'Dal', quantity: 3, purchasePriceMinor: 8000 });

      expect(store.getState().items).toHaveLength(2);
    });
  });

  describe('updateItem', () => {
    it('updates quantity', () => {
      store.getState().addItem({ id: 'p1', barcode: '111', name: 'Rice', quantity: 5, purchasePriceMinor: 5000 });
      store.getState().updateItem('p1', { quantity: 20 });

      expect(store.getState().items[0].quantity).toBe(20);
    });

    it('updates purchasePriceMinor', () => {
      store.getState().addItem({ id: 'p1', barcode: '111', name: 'Rice', quantity: 5, purchasePriceMinor: 5000 });
      store.getState().updateItem('p1', { purchasePriceMinor: 6000 });

      expect(store.getState().items[0].purchasePriceMinor).toBe(6000);
    });

    it('does not affect other items', () => {
      store.getState().addItem({ id: 'p1', barcode: '111', name: 'Rice', quantity: 5, purchasePriceMinor: 5000 });
      store.getState().addItem({ id: 'p2', barcode: '222', name: 'Dal', quantity: 3, purchasePriceMinor: 8000 });
      store.getState().updateItem('p1', { quantity: 99 });

      expect(store.getState().items[1].quantity).toBe(3);
    });
  });

  describe('removeItem', () => {
    it('removes item by id', () => {
      store.getState().addItem({ id: 'p1', barcode: '111', name: 'Rice', quantity: 5, purchasePriceMinor: 5000 });
      store.getState().addItem({ id: 'p2', barcode: '222', name: 'Dal', quantity: 3, purchasePriceMinor: 8000 });
      store.getState().removeItem('p1');

      expect(store.getState().items).toHaveLength(1);
      expect(store.getState().items[0].id).toBe('p2');
    });

    it('no-ops when item not found', () => {
      store.getState().addItem({ id: 'p1', barcode: '111', name: 'Rice', quantity: 5, purchasePriceMinor: 5000 });
      store.getState().removeItem('nonexistent');

      expect(store.getState().items).toHaveLength(1);
    });
  });

  describe('setSupplier', () => {
    it('sets selected supplier', () => {
      store.getState().setSupplier({ id: 's1', name: 'Vendor A' });
      expect(store.getState().selectedSupplier).toEqual({ id: 's1', name: 'Vendor A' });
    });

    it('cascades supplier to all existing items', () => {
      store.getState().addItem({ id: 'p1', barcode: '111', name: 'Rice', quantity: 5, purchasePriceMinor: 5000 });
      store.getState().addItem({ id: 'p2', barcode: '222', name: 'Dal', quantity: 3, purchasePriceMinor: 8000 });
      store.getState().setSupplier({ id: 's2', name: 'Vendor B' });

      const items = store.getState().items;
      expect(items[0].supplierId).toBe('s2');
      expect(items[0].supplierName).toBe('Vendor B');
      expect(items[1].supplierId).toBe('s2');
      expect(items[1].supplierName).toBe('Vendor B');
    });

    it('clears supplier from all items when set to null', () => {
      store.getState().setSupplier({ id: 's1', name: 'Vendor A' });
      store.getState().addItem({ id: 'p1', barcode: '111', name: 'Rice', quantity: 5, purchasePriceMinor: 5000 });
      store.getState().setSupplier(null);

      expect(store.getState().selectedSupplier).toBeNull();
      expect(store.getState().items[0].supplierId).toBeNull();
      expect(store.getState().items[0].supplierName).toBeNull();
    });
  });

  describe('setNotes', () => {
    it('sets notes string', () => {
      store.getState().setNotes('Urgent delivery');
      expect(store.getState().notes).toBe('Urgent delivery');
    });
  });

  describe('clearCart', () => {
    it('clears items, supplier, and notes', () => {
      store.getState().setSupplier({ id: 's1', name: 'V' });
      store.getState().setNotes('test');
      store.getState().addItem({ id: 'p1', barcode: '111', name: 'Rice', quantity: 5, purchasePriceMinor: 5000 });
      store.getState().clearCart();

      const state = store.getState();
      expect(state.items).toHaveLength(0);
      expect(state.selectedSupplier).toBeNull();
      expect(state.notes).toBe('');
    });
  });

  describe('getTotal', () => {
    it('sums purchasePrice * quantity for all items', () => {
      store.getState().addItem({ id: 'p1', barcode: '111', name: 'Rice', quantity: 10, purchasePriceMinor: 5000 });
      store.getState().addItem({ id: 'p2', barcode: '222', name: 'Dal', quantity: 5, purchasePriceMinor: 8000 });

      // (5000*10) + (8000*5) = 50000 + 40000 = 90000
      expect(store.getState().getTotal()).toBe(90000);
    });

    it('returns 0 for empty cart', () => {
      expect(store.getState().getTotal()).toBe(0);
    });
  });

  describe('getItemCount', () => {
    it('sums quantities across all items', () => {
      store.getState().addItem({ id: 'p1', barcode: '111', name: 'Rice', quantity: 10, purchasePriceMinor: 5000 });
      store.getState().addItem({ id: 'p2', barcode: '222', name: 'Dal', quantity: 5, purchasePriceMinor: 8000 });

      expect(store.getState().getItemCount()).toBe(15);
    });

    it('returns 0 for empty cart', () => {
      expect(store.getState().getItemCount()).toBe(0);
    });
  });
});
