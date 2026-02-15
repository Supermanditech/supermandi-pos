import {
  mergePurchaseDraftItems,
  normalizePurchaseDraftItem,
  findPurchaseDraftMatchIndex,
  type PurchaseDraftItem,
  type PurchaseDraftInput,
} from '../../stores/purchaseDraftLogic';

describe('purchaseDraftLogic - Enhanced Tests', () => {
  describe('normalizePurchaseDraftItem', () => {
    it('normalizes a complete item', () => {
      const input: PurchaseDraftInput & { quantity: number } = {
        barcode: '1234567890',
        name: 'Test Product',
        quantity: 5,
        purchasePriceMinor: 10000,
        sellingPriceMinor: 15000,
        currency: 'INR',
      };

      const result = normalizePurchaseDraftItem(input);

      expect(result.status).toBe('COMPLETE');
      expect(result.barcode).toBe('1234567890');
      expect(result.name).toBe('Test Product');
      expect(result.quantity).toBe(5);
      expect(result.purchasePriceMinor).toBe(10000);
      expect(result.sellingPriceMinor).toBe(15000);
      expect(result.currency).toBe('INR');
    });

    it('marks item as INCOMPLETE when missing purchase price', () => {
      const input: PurchaseDraftInput & { quantity: number } = {
        barcode: '1234567890',
        name: 'Test Product',
        quantity: 5,
        purchasePriceMinor: null,
        sellingPriceMinor: 15000,
      };

      const result = normalizePurchaseDraftItem(input);

      expect(result.status).toBe('INCOMPLETE');
    });

    it('marks item as INCOMPLETE when missing selling price', () => {
      const input: PurchaseDraftInput & { quantity: number } = {
        barcode: '1234567890',
        name: 'Test Product',
        quantity: 5,
        purchasePriceMinor: 10000,
        sellingPriceMinor: null,
      };

      const result = normalizePurchaseDraftItem(input);

      expect(result.status).toBe('INCOMPLETE');
    });

    it('auto-generates name from barcode when name is empty (still COMPLETE if prices set)', () => {
      const input: PurchaseDraftInput & { quantity: number } = {
        barcode: '1234567890',
        name: '',
        quantity: 5,
        purchasePriceMinor: 10000,
        sellingPriceMinor: 15000,
      };

      const result = normalizePurchaseDraftItem(input);

      // Empty name gets auto-filled from barcode via buildName(), so item is COMPLETE
      expect(result.status).toBe('COMPLETE');
      expect(result.name).toBeTruthy();
    });

    it('generates a name from barcode when name is not provided', () => {
      const input: PurchaseDraftInput & { quantity: number } = {
        barcode: '1234567890',
        quantity: 1,
      };

      const result = normalizePurchaseDraftItem(input);

      expect(result.name).toBe('Item 7890'); // Last 4 digits of barcode
    });

    it('defaults currency to INR when not provided', () => {
      const input: PurchaseDraftInput & { quantity: number } = {
        barcode: '1234567890',
        quantity: 1,
      };

      const result = normalizePurchaseDraftItem(input);

      expect(result.currency).toBe('INR');
    });
  });

  describe('findPurchaseDraftMatchIndex', () => {
    const items: PurchaseDraftItem[] = [
      {
        id: 'product1',
        barcode: '1111',
        globalProductId: 'global1',
        scanFormat: null,
        name: 'Product 1',
        quantity: 1,
        purchasePriceMinor: 10000,
        sellingPriceMinor: 15000,
        currency: 'INR',
        status: 'COMPLETE',
      },
      {
        id: '2222',
        barcode: '2222',
        globalProductId: null,
        scanFormat: null,
        name: 'Product 2',
        quantity: 1,
        purchasePriceMinor: 20000,
        sellingPriceMinor: 25000,
        currency: 'INR',
        status: 'COMPLETE',
      },
    ];

    it('finds match by globalProductId', () => {
      const input: PurchaseDraftInput = {
        barcode: '9999',
        globalProductId: 'global1',
      };

      const index = findPurchaseDraftMatchIndex(items, input);

      expect(index).toBe(0);
    });

    it('finds match by id when globalProductId is not set', () => {
      const input: PurchaseDraftInput = {
        barcode: '9999',
        id: 'product1',
      };

      const index = findPurchaseDraftMatchIndex(items, input);

      expect(index).toBe(0);
    });

    it('falls back to barcode match when productId does not match', () => {
      const input: PurchaseDraftInput = {
        barcode: '2222',
        globalProductId: 'nonexistent',
      };

      const index = findPurchaseDraftMatchIndex(items, input);

      expect(index).toBe(1);
    });

    it('returns -1 when no match is found', () => {
      const input: PurchaseDraftInput = {
        barcode: '9999',
        globalProductId: 'nonexistent',
      };

      const index = findPurchaseDraftMatchIndex(items, input);

      expect(index).toBe(-1);
    });
  });

  describe('mergePurchaseDraftItems', () => {
    it('merges items with the same barcode by incrementing quantity', () => {
      let items: PurchaseDraftItem[] = [];

      items = mergePurchaseDraftItems(items, { barcode: '1111', name: 'Apples' });
      items = mergePurchaseDraftItems(items, { barcode: '1111', name: 'Apples' });

      expect(items).toHaveLength(1);
      expect(items[0].quantity).toBe(2);
    });

    it('keeps separate items for different barcodes', () => {
      let items: PurchaseDraftItem[] = [];

      items = mergePurchaseDraftItems(items, { barcode: '1111', name: 'Apples' });
      items = mergePurchaseDraftItems(items, { barcode: '2222', name: 'Bananas' });

      expect(items).toHaveLength(2);
      expect(items[0].barcode).toBe('1111');
      expect(items[1].barcode).toBe('2222');
    });

    it('merges based on globalProductId when present', () => {
      let items: PurchaseDraftItem[] = [];

      items = mergePurchaseDraftItems(items, {
        barcode: '1111',
        name: 'Apples',
        globalProductId: 'product1',
      });

      items = mergePurchaseDraftItems(items, {
        barcode: '2222',
        name: 'Apples',
        globalProductId: 'product1',
      });

      expect(items).toHaveLength(1);
      expect(items[0].quantity).toBe(2);
      expect(items[0].globalProductId).toBe('product1');
    });

    it('adds custom quantity when specified', () => {
      let items: PurchaseDraftItem[] = [];

      items = mergePurchaseDraftItems(items, {
        barcode: '1111',
        name: 'Apples',
        quantity: 5,
      });

      expect(items).toHaveLength(1);
      expect(items[0].quantity).toBe(5);
    });

    it('preserves existing prices when merging', () => {
      let items: PurchaseDraftItem[] = [];

      items = mergePurchaseDraftItems(items, {
        barcode: '1111',
        name: 'Apples',
        purchasePriceMinor: 10000,
        sellingPriceMinor: 15000,
      });

      items = mergePurchaseDraftItems(items, {
        barcode: '1111',
        name: 'Apples',
      });

      expect(items[0].purchasePriceMinor).toBe(10000);
      expect(items[0].sellingPriceMinor).toBe(15000);
    });

    it('updates prices when new prices are provided', () => {
      let items: PurchaseDraftItem[] = [];

      items = mergePurchaseDraftItems(items, {
        barcode: '1111',
        name: 'Apples',
        purchasePriceMinor: null,
        sellingPriceMinor: null,
      });

      items = mergePurchaseDraftItems(items, {
        barcode: '1111',
        name: 'Apples',
        purchasePriceMinor: 10000,
        sellingPriceMinor: 15000,
      });

      expect(items[0].purchasePriceMinor).toBe(10000);
      expect(items[0].sellingPriceMinor).toBe(15000);
    });

    it('ensures minimum quantity of 1', () => {
      let items: PurchaseDraftItem[] = [];

      items = mergePurchaseDraftItems(items, {
        barcode: '1111',
        name: 'Apples',
        quantity: 0,
      });

      expect(items[0].quantity).toBe(1);
    });
  });
});
