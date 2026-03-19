/**
 * V3-FIX-186: Runtime behavior test for buy-again → purchaseDraftStore wiring
 *
 * Executes actual code paths: loadBuyAgainIntoDraft() calls store.clear() + store.addOrUpdate()
 * and verifies Zustand state changes. This is NOT a source-text contract check.
 */

jest.mock('../../services/storeScope', () => ({
  storeScopedStorage: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

jest.mock('../../services/api/apiClient', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
  },
}));

import { usePurchaseDraftStore } from '../../stores/purchaseDraftStore';
import { loadBuyAgainIntoDraft, type BuyAgainDraft } from '../../services/api/buyAgainApi';

const store = usePurchaseDraftStore;

beforeEach(() => {
  store.setState({ items: [] });
});

describe('V3-FIX-186: loadBuyAgainIntoDraft runtime behavior', () => {
  const mockDraft: BuyAgainDraft = {
    storeId: 'store-1',
    items: [
      {
        productId: 'p1', barcode: '100001', name: 'Rice 5kg',
        quantity: 10, purchasePriceMinor: 25000, sellingPriceMinor: 30000,
        currency: 'INR', supplierId: 'sup-1', supplierName: 'Supplier A',
        source: 'last_purchase', currentStock: 3, daysOfStock: 1.5,
      },
      {
        productId: 'p2', barcode: '100002', name: 'Sugar 1kg',
        quantity: 5, purchasePriceMinor: 4500, sellingPriceMinor: 5500,
        currency: 'INR', supplierId: 'sup-1', supplierName: 'Supplier A',
        source: 'demand_signal', currentStock: 0, daysOfStock: 0,
      },
    ],
    totalItems: 2,
    totalAmountMinor: 272500,
    computedAt: '2026-03-20T12:00:00Z',
    suppressedCount: 0,
  };

  it('clears existing draft before loading', () => {
    // Pre-populate store
    store.getState().addOrUpdate({ barcode: 'old-item', name: 'Old Item', quantity: 1, purchasePriceMinor: 100, sellingPriceMinor: 200 });
    expect(store.getState().items).toHaveLength(1);

    loadBuyAgainIntoDraft(mockDraft);

    // Old item should be gone, replaced by draft items
    const items = store.getState().items;
    expect(items.find(i => i.barcode === 'old-item')).toBeUndefined();
  });

  it('loads all draft items with correct barcodes', () => {
    loadBuyAgainIntoDraft(mockDraft);

    const items = store.getState().items;
    expect(items).toHaveLength(2);
    expect(items[0].barcode).toBe('100001');
    expect(items[1].barcode).toBe('100002');
  });

  it('preserves quantities from draft', () => {
    loadBuyAgainIntoDraft(mockDraft);

    const items = store.getState().items;
    expect(items[0].quantity).toBe(10);
    expect(items[1].quantity).toBe(5);
  });

  it('preserves purchase and selling prices', () => {
    loadBuyAgainIntoDraft(mockDraft);

    const items = store.getState().items;
    expect(items[0].purchasePriceMinor).toBe(25000);
    expect(items[0].sellingPriceMinor).toBe(30000);
  });

  it('sets globalProductId from draft productId', () => {
    loadBuyAgainIntoDraft(mockDraft);

    const items = store.getState().items;
    expect(items[0].globalProductId).toBe('p1');
    expect(items[1].globalProductId).toBe('p2');
  });

  it('skips items without barcode', () => {
    const draftWithNullBarcode: BuyAgainDraft = {
      ...mockDraft,
      items: [
        ...mockDraft.items,
        {
          productId: 'p3', barcode: null, name: 'No Barcode Item',
          quantity: 1, purchasePriceMinor: 100, sellingPriceMinor: 200,
          currency: 'INR', supplierId: null, supplierName: null,
          source: 'demand_signal', currentStock: 0, daysOfStock: 0,
        },
      ],
    };

    loadBuyAgainIntoDraft(draftWithNullBarcode);

    // Only 2 items (the one without barcode is skipped)
    expect(store.getState().items).toHaveLength(2);
  });

  it('handles empty draft gracefully', () => {
    const emptyDraft: BuyAgainDraft = {
      storeId: 'store-1', items: [], totalItems: 0, totalAmountMinor: 0,
      computedAt: '2026-03-20T12:00:00Z', suppressedCount: 0,
    };

    loadBuyAgainIntoDraft(emptyDraft);
    expect(store.getState().items).toHaveLength(0);
  });
});
