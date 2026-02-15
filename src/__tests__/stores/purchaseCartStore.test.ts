/**
 * Deep tests for POS purchaseCartStore
 * Covers: addItem, updateQuantity, removeItem, removeSupplierItems, clear,
 * loadDraftPOs, getItemsBySupplier, getSupplierTotal, getTotals, MOQ enforcement,
 * quantity normalization, supplier grouping, edge cases
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

function makeItem(overrides: Partial<Parameters<typeof store.getState>['addItem'] extends (arg: infer T) => any ? T : never> = {}) {
  return {
    supplierProductId: `sp-${Math.random().toString(36).slice(2, 8)}`,
    productId: 'prod-1',
    supplierId: 'sup-1',
    supplierName: 'Supplier A',
    productName: 'Rice 5kg',
    barcode: '1234567890',
    unitPrice: 25000, // 250 rupees in paise
    moq: 5,
    ...overrides,
  };
}

beforeEach(() => {
  store.getState().clear();
});

describe('purchaseCartStore', () => {
  // ════════════════════════════════════════════════════════════════════
  // addItem
  // ════════════════════════════════════════════════════════════════════

  describe('addItem', () => {
    it('adds a new item to empty cart', () => {
      store.getState().addItem(makeItem());
      expect(store.getState().items).toHaveLength(1);
    });

    it('uses MOQ as default quantity when no quantity provided', () => {
      store.getState().addItem(makeItem({ moq: 10 }));
      expect(store.getState().items[0].quantity).toBe(10);
    });

    it('enforces MOQ as minimum quantity', () => {
      store.getState().addItem(makeItem({ moq: 5, quantity: 2 }));
      expect(store.getState().items[0].quantity).toBe(5); // moq wins
    });

    it('allows quantity above MOQ', () => {
      store.getState().addItem(makeItem({ moq: 5, quantity: 20 }));
      expect(store.getState().items[0].quantity).toBe(20);
    });

    it('rounds fractional quantities', () => {
      store.getState().addItem(makeItem({ moq: 1, quantity: 3.7 }));
      expect(store.getState().items[0].quantity).toBe(4);
    });

    it('merges duplicate items by supplierProductId', () => {
      const item = makeItem({ supplierProductId: 'sp-dup', moq: 5, quantity: 10 });
      store.getState().addItem(item);
      store.getState().addItem(item);
      expect(store.getState().items).toHaveLength(1);
      expect(store.getState().items[0].quantity).toBe(20); // 10 + 10
    });

    it('does not merge different supplierProductIds', () => {
      store.getState().addItem(makeItem({ supplierProductId: 'sp-1' }));
      store.getState().addItem(makeItem({ supplierProductId: 'sp-2' }));
      expect(store.getState().items).toHaveLength(2);
    });

    it('preserves all item fields', () => {
      store.getState().addItem(makeItem({
        supplierProductId: 'sp-test',
        productId: 'prod-x',
        supplierId: 'sup-x',
        supplierName: 'Supplier X',
        productName: 'Wheat',
        barcode: '9876543210',
        unitPrice: 15000,
        mrp: 18000,
        moq: 3,
        quantity: 10,
        minOrderValue: 50000,
      }));

      const item = store.getState().items[0];
      expect(item.productName).toBe('Wheat');
      expect(item.barcode).toBe('9876543210');
      expect(item.unitPrice).toBe(15000);
      expect(item.mrp).toBe(18000);
      expect(item.moq).toBe(3);
      expect(item.minOrderValue).toBe(50000);
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // updateQuantity
  // ════════════════════════════════════════════════════════════════════

  describe('updateQuantity', () => {
    it('updates existing item quantity', () => {
      store.getState().addItem(makeItem({ supplierProductId: 'sp-1', moq: 1, quantity: 5 }));
      store.getState().updateQuantity('sp-1', 10);
      expect(store.getState().items[0].quantity).toBe(10);
    });

    it('enforces MOQ on quantity update', () => {
      store.getState().addItem(makeItem({ supplierProductId: 'sp-1', moq: 5, quantity: 10 }));
      store.getState().updateQuantity('sp-1', 2);
      expect(store.getState().items[0].quantity).toBe(5); // moq floor
    });

    it('does nothing for non-existent item', () => {
      store.getState().addItem(makeItem({ supplierProductId: 'sp-1', moq: 1, quantity: 5 }));
      store.getState().updateQuantity('sp-nonexistent', 99);
      expect(store.getState().items[0].quantity).toBe(5);
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // removeItem / removeSupplierItems
  // ════════════════════════════════════════════════════════════════════

  describe('removeItem', () => {
    it('removes item by supplierProductId', () => {
      store.getState().addItem(makeItem({ supplierProductId: 'sp-1' }));
      store.getState().addItem(makeItem({ supplierProductId: 'sp-2' }));
      store.getState().removeItem('sp-1');
      expect(store.getState().items).toHaveLength(1);
      expect(store.getState().items[0].supplierProductId).toBe('sp-2');
    });

    it('does nothing for non-existent item', () => {
      store.getState().addItem(makeItem({ supplierProductId: 'sp-1' }));
      store.getState().removeItem('sp-nonexistent');
      expect(store.getState().items).toHaveLength(1);
    });
  });

  describe('removeSupplierItems', () => {
    it('removes all items for a supplier', () => {
      store.getState().addItem(makeItem({ supplierProductId: 'sp-1', supplierId: 'sup-A' }));
      store.getState().addItem(makeItem({ supplierProductId: 'sp-2', supplierId: 'sup-A' }));
      store.getState().addItem(makeItem({ supplierProductId: 'sp-3', supplierId: 'sup-B' }));
      store.getState().removeSupplierItems('sup-A');
      expect(store.getState().items).toHaveLength(1);
      expect(store.getState().items[0].supplierId).toBe('sup-B');
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // clear / resetForStore
  // ════════════════════════════════════════════════════════════════════

  describe('clear / resetForStore', () => {
    it('clears all items', () => {
      store.getState().addItem(makeItem());
      store.getState().addItem(makeItem());
      store.getState().clear();
      expect(store.getState().items).toHaveLength(0);
    });

    it('resetForStore clears all items', () => {
      store.getState().addItem(makeItem());
      store.getState().resetForStore();
      expect(store.getState().items).toHaveLength(0);
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // loadDraftPOs
  // ════════════════════════════════════════════════════════════════════

  describe('loadDraftPOs', () => {
    it('loads draft PO items into cart', () => {
      store.getState().loadDraftPOs([
        {
          supplierProductId: 'sp-d1',
          productId: 'prod-1',
          supplierId: 'sup-1',
          supplierName: 'Supplier A',
          productName: 'Rice',
          suggestedQuantity: 10,
          unitPrice: 25000,
          moq: 5,
        },
      ]);
      expect(store.getState().items).toHaveLength(1);
      expect(store.getState().items[0].quantity).toBe(10);
    });

    it('merges drafts with existing items — overwrites quantity and price', () => {
      store.getState().addItem(makeItem({ supplierProductId: 'sp-merge', moq: 1, quantity: 5 }));
      store.getState().loadDraftPOs([
        {
          supplierProductId: 'sp-merge',
          productId: 'prod-1',
          supplierId: 'sup-1',
          supplierName: 'Supplier A',
          productName: 'Rice',
          suggestedQuantity: 20,
          unitPrice: 30000,
          moq: 1,
        },
      ]);
      expect(store.getState().items).toHaveLength(1);
      expect(store.getState().items[0].quantity).toBe(20);
      expect(store.getState().items[0].unitPrice).toBe(30000);
    });

    it('enforces MOQ on draft quantities', () => {
      store.getState().loadDraftPOs([
        {
          supplierProductId: 'sp-d2',
          productId: 'prod-1',
          supplierId: 'sup-1',
          supplierName: 'Supplier A',
          productName: 'Rice',
          suggestedQuantity: 2,
          unitPrice: 25000,
          moq: 10,
        },
      ]);
      expect(store.getState().items[0].quantity).toBe(10); // moq enforced
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // Computed getters
  // ════════════════════════════════════════════════════════════════════

  describe('getItemsBySupplier', () => {
    it('groups items by supplier', () => {
      store.getState().addItem(makeItem({ supplierProductId: 'sp-1', supplierId: 'sup-A', supplierName: 'A Corp', moq: 1, quantity: 3 }));
      store.getState().addItem(makeItem({ supplierProductId: 'sp-2', supplierId: 'sup-A', supplierName: 'A Corp', moq: 1, quantity: 2 }));
      store.getState().addItem(makeItem({ supplierProductId: 'sp-3', supplierId: 'sup-B', supplierName: 'B Corp', moq: 1, quantity: 7 }));

      const groups = store.getState().getItemsBySupplier();
      expect(groups).toHaveLength(2);

      const groupA = groups.find(g => g.supplierId === 'sup-A')!;
      expect(groupA.items).toHaveLength(2);
      expect(groupA.itemCount).toBe(2);
      expect(groupA.totalQuantity).toBe(5);

      const groupB = groups.find(g => g.supplierId === 'sup-B')!;
      expect(groupB.items).toHaveLength(1);
      expect(groupB.totalQuantity).toBe(7);
    });

    it('sorts groups by supplier name', () => {
      store.getState().addItem(makeItem({ supplierProductId: 'sp-1', supplierId: 'sup-Z', supplierName: 'Zebra', moq: 1, quantity: 1 }));
      store.getState().addItem(makeItem({ supplierProductId: 'sp-2', supplierId: 'sup-A', supplierName: 'Alpha', moq: 1, quantity: 1 }));

      const groups = store.getState().getItemsBySupplier();
      expect(groups[0].supplierName).toBe('Alpha');
      expect(groups[1].supplierName).toBe('Zebra');
    });

    it('calculates totalAmount correctly per group', () => {
      store.getState().addItem(makeItem({
        supplierProductId: 'sp-1', supplierId: 'sup-A', supplierName: 'A',
        moq: 1, quantity: 3, unitPrice: 10000,
      }));
      store.getState().addItem(makeItem({
        supplierProductId: 'sp-2', supplierId: 'sup-A', supplierName: 'A',
        moq: 1, quantity: 2, unitPrice: 20000,
      }));

      const groups = store.getState().getItemsBySupplier();
      expect(groups[0].totalAmount).toBe(3 * 10000 + 2 * 20000); // 70000
    });
  });

  describe('getSupplierTotal', () => {
    it('returns total for specific supplier', () => {
      store.getState().addItem(makeItem({
        supplierProductId: 'sp-1', supplierId: 'sup-A',
        moq: 1, quantity: 5, unitPrice: 10000,
      }));
      expect(store.getState().getSupplierTotal('sup-A')).toBe(50000);
    });

    it('returns 0 for unknown supplier', () => {
      expect(store.getState().getSupplierTotal('sup-nonexistent')).toBe(0);
    });
  });

  describe('getTotals', () => {
    it('returns correct totals', () => {
      store.getState().addItem(makeItem({
        supplierProductId: 'sp-1', supplierId: 'sup-A',
        moq: 1, quantity: 3, unitPrice: 10000,
      }));
      store.getState().addItem(makeItem({
        supplierProductId: 'sp-2', supplierId: 'sup-B',
        moq: 1, quantity: 2, unitPrice: 20000,
      }));

      const totals = store.getState().getTotals();
      expect(totals.supplierCount).toBe(2);
      expect(totals.itemCount).toBe(2);
      expect(totals.totalQuantity).toBe(5);
      expect(totals.grandTotal).toBe(70000);
    });

    it('returns zeros for empty cart', () => {
      const totals = store.getState().getTotals();
      expect(totals.supplierCount).toBe(0);
      expect(totals.itemCount).toBe(0);
      expect(totals.totalQuantity).toBe(0);
      expect(totals.grandTotal).toBe(0);
    });
  });

  describe('hasItems / getItemCount', () => {
    it('hasItems returns false for empty cart', () => {
      expect(store.getState().hasItems()).toBe(false);
    });

    it('hasItems returns true when items exist', () => {
      store.getState().addItem(makeItem());
      expect(store.getState().hasItems()).toBe(true);
    });

    it('getItemCount returns correct count', () => {
      store.getState().addItem(makeItem({ supplierProductId: 'sp-1' }));
      store.getState().addItem(makeItem({ supplierProductId: 'sp-2' }));
      expect(store.getState().getItemCount()).toBe(2);
    });
  });
});
