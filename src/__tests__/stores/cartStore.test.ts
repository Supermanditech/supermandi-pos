import { useCartStore } from '../../stores/cartStore';

// Mock dependencies
jest.mock('../../services/eventLogger', () => ({
  eventLogger: {
    log: jest.fn(),
  },
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

jest.mock('../../services/stockCap', () => ({
  capAddQuantity: jest.fn((currentQty, addQty) => ({
    requestedQty: addQty,
    nextQty: currentQty + addQty,
    addedQty: addQty,
    unknownStock: false,
    outOfStock: false,
    capped: false,
  })),
  capRequestedQuantity: jest.fn((currentQty, requestedQty) => ({
    requestedQty,
    nextQty: requestedQty,
    unknownStock: false,
    outOfStock: false,
    capped: false,
  })),
}));

jest.mock('../../services/stockService', () => ({
  resolveStockForCartItem: jest.fn(() => null),
}));

describe('cartStore', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
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

  describe('addItem', () => {
    it('adds a new item to the cart', () => {
      const store = useCartStore.getState();

      store.addItem({
        id: 'item1',
        name: 'Test Item',
        priceMinor: 10000,
        currency: 'INR',
      });

      const state = useCartStore.getState();
      expect(state.items).toHaveLength(1);
      expect(state.items[0].id).toBe('item1');
      expect(state.items[0].name).toBe('Test Item');
      expect(state.items[0].quantity).toBe(1);
    });

    it('increments quantity when adding existing item', () => {
      const store = useCartStore.getState();

      store.addItem({
        id: 'item1',
        name: 'Test Item',
        priceMinor: 10000,
      });

      store.addItem({
        id: 'item1',
        name: 'Test Item',
        priceMinor: 10000,
      });

      const state = useCartStore.getState();
      expect(state.items).toHaveLength(1);
      expect(state.items[0].quantity).toBe(2);
    });

    it('adds custom quantity when specified', () => {
      const store = useCartStore.getState();

      store.addItem({
        id: 'item1',
        name: 'Test Item',
        priceMinor: 10000,
        quantity: 5,
      });

      const state = useCartStore.getState();
      expect(state.items[0].quantity).toBe(5);
    });

    it('does not add item when cart is locked', () => {
      const store = useCartStore.getState();
      store.lockCart();

      store.addItem({
        id: 'item1',
        name: 'Test Item',
        priceMinor: 10000,
      });

      const state = useCartStore.getState();
      expect(state.items).toHaveLength(0);
    });
  });

  describe('removeItem', () => {
    it('removes item from cart', () => {
      const store = useCartStore.getState();

      store.addItem({
        id: 'item1',
        name: 'Test Item',
        priceMinor: 10000,
      });

      store.removeItem('item1');

      const state = useCartStore.getState();
      expect(state.items).toHaveLength(0);
    });

    it('does not remove item when cart is locked (without force)', () => {
      const store = useCartStore.getState();

      store.addItem({
        id: 'item1',
        name: 'Test Item',
        priceMinor: 10000,
      });

      store.lockCart();
      store.removeItem('item1');

      const state = useCartStore.getState();
      expect(state.items).toHaveLength(1);
    });

    it('removes item when cart is locked with force flag', () => {
      const store = useCartStore.getState();

      store.addItem({
        id: 'item1',
        name: 'Test Item',
        priceMinor: 10000,
      });

      store.lockCart();
      store.removeItem('item1', true);

      const state = useCartStore.getState();
      expect(state.items).toHaveLength(0);
    });
  });

  describe('updateQuantity', () => {
    it('updates item quantity', () => {
      const store = useCartStore.getState();

      store.addItem({
        id: 'item1',
        name: 'Test Item',
        priceMinor: 10000,
      });

      store.updateQuantity('item1', 5);

      const state = useCartStore.getState();
      expect(state.items[0].quantity).toBe(5);
    });

    it('removes item when quantity is set to 0', () => {
      const store = useCartStore.getState();

      store.addItem({
        id: 'item1',
        name: 'Test Item',
        priceMinor: 10000,
      });

      store.updateQuantity('item1', 0);

      const state = useCartStore.getState();
      expect(state.items).toHaveLength(0);
    });

    it('does not update when cart is locked', () => {
      const store = useCartStore.getState();

      store.addItem({
        id: 'item1',
        name: 'Test Item',
        priceMinor: 10000,
      });

      store.lockCart();
      store.updateQuantity('item1', 5);

      const state = useCartStore.getState();
      expect(state.items[0].quantity).toBe(1);
    });
  });

  describe('calculateTotals', () => {
    it('calculates subtotal correctly', () => {
      const store = useCartStore.getState();

      store.addItem({
        id: 'item1',
        name: 'Item 1',
        priceMinor: 10000,
        quantity: 2,
      });

      store.addItem({
        id: 'item2',
        name: 'Item 2',
        priceMinor: 5000,
        quantity: 3,
      });

      const state = useCartStore.getState();
      // (10000 * 2) + (5000 * 3) = 20000 + 15000 = 35000
      expect(state.subtotal).toBe(35000);
      expect(state.total).toBe(35000);
    });

    it('applies percentage discount correctly', () => {
      const store = useCartStore.getState();

      store.addItem({
        id: 'item1',
        name: 'Item 1',
        priceMinor: 10000,
        quantity: 1,
      });

      store.applyDiscount({
        type: 'percentage',
        value: 10,
        reason: 'Test discount',
      });

      const state = useCartStore.getState();
      expect(state.subtotal).toBe(10000);
      expect(state.cartDiscountAmount).toBe(1000); // 10% of 10000
      expect(state.total).toBe(9000);
    });

    it('applies fixed discount correctly', () => {
      const store = useCartStore.getState();

      store.addItem({
        id: 'item1',
        name: 'Item 1',
        priceMinor: 10000,
        quantity: 1,
      });

      store.applyDiscount({
        type: 'fixed',
        value: 2000,
        reason: 'Test discount',
      });

      const state = useCartStore.getState();
      expect(state.subtotal).toBe(10000);
      expect(state.cartDiscountAmount).toBe(2000);
      expect(state.total).toBe(8000);
    });
  });

  describe('clearCart', () => {
    it('clears all items from cart', () => {
      const store = useCartStore.getState();

      store.addItem({
        id: 'item1',
        name: 'Item 1',
        priceMinor: 10000,
      });

      store.addItem({
        id: 'item2',
        name: 'Item 2',
        priceMinor: 5000,
      });

      store.clearCart();

      const state = useCartStore.getState();
      expect(state.items).toHaveLength(0);
      expect(state.total).toBe(0);
      expect(state.subtotal).toBe(0);
    });

    it('clears discount when clearing cart', () => {
      const store = useCartStore.getState();

      store.addItem({
        id: 'item1',
        name: 'Item 1',
        priceMinor: 10000,
      });

      store.applyDiscount({
        type: 'percentage',
        value: 10,
      });

      store.clearCart();

      const state = useCartStore.getState();
      expect(state.discount).toBeNull();
    });

    it('does not clear when locked (without force)', () => {
      const store = useCartStore.getState();

      store.addItem({
        id: 'item1',
        name: 'Item 1',
        priceMinor: 10000,
      });

      store.lockCart();
      store.clearCart();

      const state = useCartStore.getState();
      expect(state.items).toHaveLength(1);
    });

    it('clears when locked with force flag', () => {
      const store = useCartStore.getState();

      store.addItem({
        id: 'item1',
        name: 'Item 1',
        priceMinor: 10000,
      });

      store.lockCart();
      store.clearCart(true);

      const state = useCartStore.getState();
      expect(state.items).toHaveLength(0);
    });
  });

  describe('lockCart / unlockCart', () => {
    it('locks the cart', () => {
      const store = useCartStore.getState();
      store.lockCart();

      const state = useCartStore.getState();
      expect(state.locked).toBe(true);
      expect(state.lockedAt).toBeGreaterThan(0);
    });

    it('unlocks the cart', () => {
      const store = useCartStore.getState();
      store.lockCart();
      store.unlockCart();

      const state = useCartStore.getState();
      expect(state.locked).toBe(false);
      expect(state.lockedAt).toBeNull();
    });

    it('auto-unlocks after timeout', () => {
      const store = useCartStore.getState();

      // Manually set locked state with old timestamp
      const fiveMinutesAgo = Date.now() - (5 * 60 * 1000 + 1000);
      useCartStore.setState({
        locked: true,
        lockedAt: fiveMinutesAgo,
      });

      const unlocked = store.autoUnlockIfExpired();

      expect(unlocked).toBe(true);
      const state = useCartStore.getState();
      expect(state.locked).toBe(false);
    });

    it('does not auto-unlock before timeout', () => {
      const store = useCartStore.getState();
      store.lockCart();

      const unlocked = store.autoUnlockIfExpired();

      expect(unlocked).toBe(false);
      const state = useCartStore.getState();
      expect(state.locked).toBe(true);
    });
  });
});
