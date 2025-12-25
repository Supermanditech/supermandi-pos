import { create } from 'zustand';
import { eventLogger } from '../services/eventLogger';

export interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  sku?: string;
  barcode?: string;
  metadata?: Record<string, any>;
}

export interface CartDiscount {
  type: 'percentage' | 'fixed';
  value: number;
  reason?: string;
}

interface CartState {
  items: CartItem[];
  discount: CartDiscount | null;
  
  // Computed values
  subtotal: number;
  discountAmount: number;
  total: number;
  
  // Actions
  addItem: (item: Omit<CartItem, 'quantity'> & { quantity?: number }) => void;
  removeItem: (itemId: string) => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  clearCart: () => void;
  applyDiscount: (discount: CartDiscount) => void;
  removeDiscount: () => void;
  
  // Internal
  recalculate: () => void;
}

const calculateSubtotal = (items: CartItem[]): number => {
  return items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
};

const calculateDiscountAmount = (subtotal: number, discount: CartDiscount | null): number => {
  if (!discount) return 0;
  
  if (discount.type === 'percentage') {
    return subtotal * (discount.value / 100);
  } else {
    return Math.min(discount.value, subtotal);
  }
};

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  discount: null,
  subtotal: 0,
  discountAmount: 0,
  total: 0,
  
  addItem: (item) => {
    const state = get();
    const existingItem = state.items.find(i => i.id === item.id);
    
    let newItems: CartItem[];
    
    if (existingItem) {
      newItems = state.items.map(i =>
        i.id === item.id
          ? { ...i, quantity: i.quantity + (item.quantity || 1) }
          : i
      );
    } else {
      newItems = [...state.items, { ...item, quantity: item.quantity || 1 }];
    }
    
    set({ items: newItems });
    get().recalculate();
    
    eventLogger.log('CART_ADD_ITEM', {
      itemId: item.id,
      itemName: item.name,
      quantity: item.quantity || 1,
      price: item.price,
    });
  },
  
  removeItem: (itemId) => {
    const state = get();
    const item = state.items.find(i => i.id === itemId);
    
    set({ items: state.items.filter(i => i.id !== itemId) });
    get().recalculate();
    
    if (item) {
      eventLogger.log('CART_REMOVE_ITEM', {
        itemId: item.id,
        itemName: item.name,
      });
    }
  },
  
  updateQuantity: (itemId, quantity) => {
    if (quantity <= 0) {
      get().removeItem(itemId);
      return;
    }
    
    const state = get();
    const newItems = state.items.map(i =>
      i.id === itemId ? { ...i, quantity } : i
    );
    
    set({ items: newItems });
    get().recalculate();
    
    eventLogger.log('CART_UPDATE_QUANTITY', {
      itemId,
      quantity,
    });
  },
  
  clearCart: () => {
    set({
      items: [],
      discount: null,
      subtotal: 0,
      discountAmount: 0,
      total: 0,
    });
    
    eventLogger.log('CART_CLEAR', {});
  },
  
  applyDiscount: (discount) => {
    set({ discount });
    get().recalculate();
    
    eventLogger.log('CART_APPLY_DISCOUNT', {
      type: discount.type,
      value: discount.value,
      reason: discount.reason,
    });
  },
  
  removeDiscount: () => {
    set({ discount: null });
    get().recalculate();
  },
  
  recalculate: () => {
    const state = get();
    const subtotal = calculateSubtotal(state.items);
    const discountAmount = calculateDiscountAmount(subtotal, state.discount);
    const total = Math.max(0, subtotal - discountAmount);
    
    set({ subtotal, discountAmount, total });
  },
}));
