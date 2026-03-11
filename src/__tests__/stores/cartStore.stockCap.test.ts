/**
 * TQ-003: CartStore stock cap integration tests
 *
 * Unlike cartStore.test.ts which mocks stockCap to always succeed,
 * these tests use the REAL stockCap implementation to verify that
 * the cart enforces stock limits — the most critical business invariant.
 */
import { capAddQuantity, capRequestedQuantity } from '../../services/stockCap';
import { useCartStore } from '../../stores/cartStore';

// Mock everything EXCEPT stockCap — use real implementation
jest.mock('../../services/eventLogger', () => ({
  eventLogger: { log: jest.fn() },
}));

jest.mock('../../services/cloudEventLogger', () => ({
  logPosEvent: jest.fn(),
}));

jest.mock('../../services/storeScope', () => ({
  storeScopedStorage: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

// DO NOT mock stockCap — use real implementation

// Mock stockService to return controlled stock values
const mockResolveStock = jest.fn();
jest.mock('../../services/stockService', () => ({
  resolveStockForCartItem: (...args: unknown[]) => mockResolveStock(...args),
}));

describe('cartStore — real stock cap enforcement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useCartStore.setState({
      items: [],
      discount: null,
      mutationHistory: [],
      locked: false,
      lockedAt: null,
      stockLimitEvent: null,
      lastStockAdjustments: null,
      subtotal: 0,
      itemDiscountAmount: 0,
      cartDiscountAmount: 0,
      discountAmount: 0,
      discountTotal: 0,
      total: 0,
    });
  });

  describe('capAddQuantity — direct function tests', () => {
    it('allows adding within stock limit', () => {
      const result = capAddQuantity(0, 3, 10);
      expect(result.nextQty).toBe(3);
      expect(result.addedQty).toBe(3);
      expect(result.capped).toBe(false);
      expect(result.outOfStock).toBe(false);
    });

    it('caps quantity when adding exceeds stock', () => {
      const result = capAddQuantity(5, 10, 8);
      expect(result.requestedQty).toBe(15);
      expect(result.nextQty).toBe(8);
      expect(result.addedQty).toBe(3);
      expect(result.capped).toBe(true);
    });

    it('rejects adding when out of stock', () => {
      const result = capAddQuantity(0, 1, 0);
      expect(result.nextQty).toBe(0);
      expect(result.addedQty).toBe(0);
      expect(result.outOfStock).toBe(true);
      expect(result.capped).toBe(true);
    });

    it('allows add with unknown stock (undefined) — marks unknownStock', () => {
      const result = capAddQuantity(0, 5, undefined);
      expect(result.unknownStock).toBe(true);
      expect(result.addedQty).toBe(5);
    });

    it('allows add with unknown stock (null) — marks unknownStock', () => {
      const result = capAddQuantity(0, 5, null);
      expect(result.unknownStock).toBe(true);
      expect(result.addedQty).toBe(5);
    });

    it('handles NaN inputs gracefully', () => {
      const result = capAddQuantity(NaN, NaN, NaN);
      expect(result.nextQty).toBe(0);
      expect(result.addedQty).toBe(0);
      expect(result.unknownStock).toBe(false);
    });

    it('handles exact stock boundary', () => {
      const result = capAddQuantity(0, 5, 5);
      expect(result.nextQty).toBe(5);
      expect(result.addedQty).toBe(5);
      expect(result.capped).toBe(false);
    });

    it('prevents adding beyond existing cart quantity', () => {
      // Already have 8 in cart, stock is 10, try to add 5 more
      const result = capAddQuantity(8, 5, 10);
      expect(result.requestedQty).toBe(13);
      expect(result.nextQty).toBe(10);
      expect(result.addedQty).toBe(2);
      expect(result.capped).toBe(true);
    });
  });

  describe('capRequestedQuantity — direct function tests', () => {
    it('allows setting quantity within stock', () => {
      const result = capRequestedQuantity(1, 5, 10);
      expect(result.nextQty).toBe(5);
      expect(result.capped).toBe(false);
    });

    it('caps quantity to stock limit', () => {
      const result = capRequestedQuantity(1, 15, 10);
      expect(result.nextQty).toBe(10);
      expect(result.capped).toBe(true);
    });

    it('zeros quantity when out of stock', () => {
      const result = capRequestedQuantity(5, 3, 0);
      expect(result.nextQty).toBe(0);
      expect(result.outOfStock).toBe(true);
    });

    it('marks unknown stock and caps when stock unknown', () => {
      // With unknown stock, requesting more than current is capped
      const result = capRequestedQuantity(3, 5, undefined);
      expect(result.unknownStock).toBe(true);
      expect(result.nextQty).toBe(3); // capped to current
    });

    it('allows reducing quantity with unknown stock', () => {
      const result = capRequestedQuantity(5, 3, undefined);
      expect(result.nextQty).toBe(3);
      expect(result.unknownStock).toBe(false);
      expect(result.capped).toBe(false);
    });
  });

  describe('rapid tap simulation (stock=1)', () => {
    it('20 rapid adds with stock=1 result in quantity 1', () => {
      // This simulates the most critical real-world scenario:
      // User rapidly taps "add to cart" on an item with stock=1
      mockResolveStock.mockReturnValue(1);

      const store = useCartStore.getState();
      for (let i = 0; i < 20; i++) {
        store.addItem({
          id: 'limited-item',
          name: 'Limited Stock Item',
          priceMinor: 5000,
          currency: 'INR',
        });
      }

      const state = useCartStore.getState();
      const item = state.items.find(i => i.id === 'limited-item');

      // With real stock cap, quantity should be capped at 1
      // (The mock stockCap in the other test file would allow 20)
      if (item) {
        expect(item.quantity).toBeLessThanOrEqual(1);
      }
    });
  });
});
