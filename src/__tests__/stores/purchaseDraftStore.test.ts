/**
 * Deep tests for POS purchaseDraftStore
 * Covers: addOrUpdate, updateItem, remove, clear, hasIncomplete, resetForStore
 */

jest.mock('../../services/storeScope', () => ({
  storeScopedStorage: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

import { usePurchaseDraftStore } from '../../stores/purchaseDraftStore';

const store = usePurchaseDraftStore;

beforeEach(() => {
  store.setState({ items: [] });
});

describe('purchaseDraftStore', () => {
  describe('addOrUpdate', () => {
    it('adds a new item via merge logic', () => {
      store.getState().addOrUpdate({ barcode: '111', name: 'Apples' });

      expect(store.getState().items).toHaveLength(1);
      expect(store.getState().items[0].barcode).toBe('111');
      expect(store.getState().items[0].quantity).toBe(1);
    });

    it('merges duplicate barcode by incrementing quantity', () => {
      store.getState().addOrUpdate({ barcode: '111', name: 'Apples' });
      store.getState().addOrUpdate({ barcode: '111', name: 'Apples' });

      expect(store.getState().items).toHaveLength(1);
      expect(store.getState().items[0].quantity).toBe(2);
    });

    it('keeps separate items for different barcodes', () => {
      store.getState().addOrUpdate({ barcode: '111', name: 'Apples' });
      store.getState().addOrUpdate({ barcode: '222', name: 'Bananas' });

      expect(store.getState().items).toHaveLength(2);
    });
  });

  describe('updateItem', () => {
    it('updates quantity for existing item', () => {
      store.getState().addOrUpdate({ barcode: '111', name: 'Apples', purchasePriceMinor: 5000, sellingPriceMinor: 8000 });
      store.getState().updateItem('111', { quantity: 10 });

      expect(store.getState().items[0].quantity).toBe(10);
    });

    it('updates prices', () => {
      store.getState().addOrUpdate({ barcode: '111', name: 'Apples' });
      store.getState().updateItem('111', { purchasePriceMinor: 6000, sellingPriceMinor: 9000 });

      expect(store.getState().items[0].purchasePriceMinor).toBe(6000);
      expect(store.getState().items[0].sellingPriceMinor).toBe(9000);
    });

    it('no-ops for non-existent barcode', () => {
      store.getState().addOrUpdate({ barcode: '111', name: 'Apples' });
      store.getState().updateItem('999', { quantity: 10 });

      expect(store.getState().items).toHaveLength(1);
      expect(store.getState().items[0].quantity).toBe(1);
    });

    it('floors negative quantity to 0', () => {
      store.getState().addOrUpdate({ barcode: '111', name: 'Apples' });
      store.getState().updateItem('111', { quantity: -5 });

      expect(store.getState().items[0].quantity).toBe(0);
    });
  });

  describe('remove', () => {
    it('removes item by barcode', () => {
      store.getState().addOrUpdate({ barcode: '111', name: 'Apples' });
      store.getState().addOrUpdate({ barcode: '222', name: 'Bananas' });
      store.getState().remove('111');

      expect(store.getState().items).toHaveLength(1);
      expect(store.getState().items[0].barcode).toBe('222');
    });
  });

  describe('clear', () => {
    it('removes all items', () => {
      store.getState().addOrUpdate({ barcode: '111', name: 'Apples' });
      store.getState().addOrUpdate({ barcode: '222', name: 'Bananas' });
      store.getState().clear();

      expect(store.getState().items).toHaveLength(0);
    });
  });

  describe('hasIncomplete', () => {
    it('returns false when all items are COMPLETE', () => {
      store.getState().addOrUpdate({
        barcode: '111',
        name: 'Apples',
        purchasePriceMinor: 5000,
        sellingPriceMinor: 8000,
      });

      expect(store.getState().hasIncomplete()).toBe(false);
    });

    it('returns true when any item is INCOMPLETE', () => {
      store.getState().addOrUpdate({
        barcode: '111',
        name: 'Apples',
        purchasePriceMinor: null,
        sellingPriceMinor: null,
      });

      expect(store.getState().hasIncomplete()).toBe(true);
    });
  });

  describe('resetForStore', () => {
    it('clears all items (same as clear)', () => {
      store.getState().addOrUpdate({ barcode: '111', name: 'Apples' });
      store.getState().resetForStore();

      expect(store.getState().items).toHaveLength(0);
    });
  });
});
