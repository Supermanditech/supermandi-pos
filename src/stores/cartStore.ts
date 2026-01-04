import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { eventLogger } from '../services/eventLogger';
import { logPosEvent } from "../services/cloudEventLogger";

export interface CartItem {
  id: string;
  name: string;
  priceMinor: number;
  currency?: string;
  quantity: number;
  sku?: string;
  barcode?: string;
  metadata?: Record<string, any>;
  flags?: string[];
  itemDiscount?: ItemDiscount;
}

export interface ItemDiscount {
  type: 'percentage' | 'fixed';
  value: number;
  reason?: string;
}

export interface CartDiscount {
  type: 'percentage' | 'fixed';
  value: number;
  reason?: string;
}

export type CartMutation =
  | {
      type: "UPSERT_ITEM" | "REMOVE_ITEM";
      itemId: string;
      previousItem: CartItem | null;
      previousIndex: number;
    }
  | {
      type: "CLEAR_CART";
      previousItems: CartItem[];
      previousDiscount: CartDiscount | null;
    };

interface CartState {
  items: CartItem[];
  discount: CartDiscount | null;
  mutationHistory: CartMutation[];
  locked: boolean;
  
  // Computed values
  subtotal: number;
  itemDiscountAmount: number;
  cartDiscountAmount: number;
  discountAmount: number;
  discountTotal: number;
  total: number;
  
  // Actions
  addItem: (item: Omit<CartItem, 'quantity'> & { quantity?: number }) => void;
  removeItem: (itemId: string) => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  applyItemDiscount: (itemId: string, discount: ItemDiscount) => void;
  removeItemDiscount: (itemId: string) => void;
  clearCart: (force?: boolean) => void;
  undoLastAction: () => void;
  applyDiscount: (discount: CartDiscount) => void;
  removeDiscount: () => void;
  lockCart: () => void;
  unlockCart: () => void;
  
  // Internal
  recalculate: () => void;
}

const CART_STORAGE_KEY = "supermandi.cart.sell.v1";

const calculateDiscountAmount = (
  baseAmount: number,
  discount: CartDiscount | ItemDiscount | null
): number => {
  if (!discount) return 0;
  const safeBase = Math.max(0, Math.round(baseAmount));
  const safeValue = Math.max(0, Number.isFinite(discount.value) ? discount.value : 0);

  if (discount.type === 'percentage') {
    return Math.min(Math.round(safeBase * (safeValue / 100)), safeBase);
  }
  return Math.min(Math.round(safeValue), safeBase);
};

const calculateCartTotals = (items: CartItem[], discount: CartDiscount | null) => {
  let subtotal = 0;
  let itemDiscountAmount = 0;

  for (const item of items) {
    const lineSubtotal = Math.round(item.priceMinor) * Math.round(item.quantity);
    const lineDiscount = calculateDiscountAmount(lineSubtotal, item.itemDiscount ?? null);
    subtotal += lineSubtotal;
    itemDiscountAmount += lineDiscount;
  }

  const subtotalAfterItemDiscounts = Math.max(0, subtotal - itemDiscountAmount);
  const cartDiscountAmount = calculateDiscountAmount(subtotalAfterItemDiscounts, discount);
  const discountTotal = itemDiscountAmount + cartDiscountAmount;
  const total = Math.max(0, subtotal - discountTotal);

  return {
    subtotal,
    itemDiscountAmount,
    cartDiscountAmount,
    discountTotal,
    total
  };
};

const cloneItem = (item: CartItem): CartItem => ({
  ...item,
  metadata: item.metadata ? { ...item.metadata } : undefined,
  flags: item.flags ? [...item.flags] : undefined,
  itemDiscount: item.itemDiscount ? { ...item.itemDiscount } : undefined,
});

const mergeFlags = (existing: string[] | undefined, incoming: string[] | undefined): string[] | undefined => {
  if (!existing && !incoming) return undefined;
  const set = new Set<string>();
  if (existing) existing.forEach(flag => set.add(flag));
  if (incoming) incoming.forEach(flag => set.add(flag));
  return Array.from(set);
};

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      discount: null,
      mutationHistory: [],
      locked: false,
      subtotal: 0,
      itemDiscountAmount: 0,
      cartDiscountAmount: 0,
      discountAmount: 0,
      discountTotal: 0,
      total: 0,
      
      addItem: (item) => {
        if (get().locked) return;
        const state = get();
        const existingIndex = state.items.findIndex(i => i.id === item.id);
        const existingItem = existingIndex >= 0 ? state.items[existingIndex] : null;
        
        let newItems: CartItem[];
        let nextItem: CartItem;
        const quantity = item.quantity || 1;
        
        if (existingItem) {
          nextItem = {
            ...existingItem,
            ...item,
            quantity: existingItem.quantity + quantity,
            flags: mergeFlags(existingItem.flags, item.flags),
            itemDiscount: item.itemDiscount ?? existingItem.itemDiscount
          };
          newItems = state.items.map(i => (i.id === item.id ? nextItem : i));
        } else {
          nextItem = { ...item, quantity, flags: item.flags, itemDiscount: item.itemDiscount };
          newItems = [...state.items, nextItem];
        }
        
        const mutation: CartMutation = {
          type: "UPSERT_ITEM",
          itemId: item.id,
          previousItem: existingItem ? cloneItem(existingItem) : null,
          previousIndex: existingIndex
        };

        set({
          items: newItems,
          mutationHistory: [...state.mutationHistory, mutation]
        });
        get().recalculate();
        
        eventLogger.log('CART_ADD_ITEM', {
          itemId: item.id,
          itemName: item.name,
          quantity,
          priceMinor: item.priceMinor,
        });

        // Cloud event (required): ADD_TO_CART
        void logPosEvent("ADD_TO_CART", {
          productId: item.id,
          name: item.name,
          quantity,
          priceMinor: item.priceMinor,
          currency: item.currency ?? undefined,
          barcode: item.barcode ?? undefined
        });
      },
  
  removeItem: (itemId) => {
    if (get().locked) return;
    const state = get();
    const itemIndex = state.items.findIndex(i => i.id === itemId);
    const item = itemIndex >= 0 ? state.items[itemIndex] : null;
    if (!item) return;
    
    set({
      items: state.items.filter(i => i.id !== itemId),
      mutationHistory: [
        ...state.mutationHistory,
        {
          type: "REMOVE_ITEM",
          itemId,
          previousItem: cloneItem(item),
          previousIndex: itemIndex
        }
      ]
    });
    get().recalculate();
    
    eventLogger.log('CART_REMOVE_ITEM', {
      itemId: item.id,
      itemName: item.name,
    });

    // Cloud event (required): REMOVE_FROM_CART
    void logPosEvent("REMOVE_FROM_CART", {
      productId: item.id,
      name: item.name,
      quantity: item.quantity,
      priceMinor: item.priceMinor,
      currency: item.currency ?? undefined,
      barcode: item.barcode ?? undefined
    });
  },
  
  updateQuantity: (itemId, quantity) => {
    if (get().locked) return;
    if (quantity <= 0) {
      get().removeItem(itemId);
      return;
    }
    
    const state = get();
    const existingIndex = state.items.findIndex(i => i.id === itemId);
    const existingItem = existingIndex >= 0 ? state.items[existingIndex] : null;
    if (!existingItem) return;
    const nextItem = { ...existingItem, quantity };
    const newItems = state.items.map(i => (i.id === itemId ? nextItem : i));
    
    const mutation: CartMutation = {
      type: "UPSERT_ITEM",
      itemId,
      previousItem: cloneItem(existingItem),
      previousIndex: existingIndex
    };

    set({
      items: newItems,
      mutationHistory: [...state.mutationHistory, mutation]
    });
    get().recalculate();
    
    eventLogger.log('CART_UPDATE_QUANTITY', {
      itemId,
      quantity,
    });
  },

  applyItemDiscount: (itemId, discount) => {
    if (get().locked) return;
    const state = get();
    const existingIndex = state.items.findIndex(i => i.id === itemId);
    const existingItem = existingIndex >= 0 ? state.items[existingIndex] : null;
    if (!existingItem) return;

    const nextItem: CartItem = {
      ...existingItem,
      itemDiscount: { ...discount }
    };

    set({
      items: state.items.map(i => (i.id === itemId ? nextItem : i)),
      mutationHistory: [
        ...state.mutationHistory,
        {
          type: "UPSERT_ITEM",
          itemId,
          previousItem: cloneItem(existingItem),
          previousIndex: existingIndex
        }
      ]
    });

    get().recalculate();
  },

  removeItemDiscount: (itemId) => {
    if (get().locked) return;
    const state = get();
    const existingIndex = state.items.findIndex(i => i.id === itemId);
    const existingItem = existingIndex >= 0 ? state.items[existingIndex] : null;
    if (!existingItem) return;

    const nextItem: CartItem = {
      ...existingItem,
      itemDiscount: undefined
    };

    set({
      items: state.items.map(i => (i.id === itemId ? nextItem : i)),
      mutationHistory: [
        ...state.mutationHistory,
        {
          type: "UPSERT_ITEM",
          itemId,
          previousItem: cloneItem(existingItem),
          previousIndex: existingIndex
        }
      ]
    });

    get().recalculate();
  },
  
  clearCart: (force = false) => {
    const state = get();
    if (state.locked && !force) return;
    set({
      items: [],
      discount: null,
      subtotal: 0,
      itemDiscountAmount: 0,
      cartDiscountAmount: 0,
      discountAmount: 0,
      discountTotal: 0,
      total: 0,
      mutationHistory: [
        ...state.mutationHistory,
        {
          type: "CLEAR_CART",
          previousItems: state.items.map(cloneItem),
          previousDiscount: state.discount ? { ...state.discount } : null
        }
      ]
    });
    
    eventLogger.log('CART_CLEAR', {});
  },

  undoLastAction: () => {
    const state = get();
    if (state.locked) return;
    const last = state.mutationHistory[state.mutationHistory.length - 1];
    if (!last) return;

    if (last.type === "CLEAR_CART") {
      set({
        items: last.previousItems,
        discount: last.previousDiscount,
        mutationHistory: state.mutationHistory.slice(0, -1)
      });
      get().recalculate();
      return;
    }

    let nextItems = state.items.filter(i => i.id !== last.itemId);

    if (last.previousItem) {
      const insertIndex = last.previousIndex >= 0 ? Math.min(last.previousIndex, nextItems.length) : nextItems.length;
      nextItems = [
        ...nextItems.slice(0, insertIndex),
        last.previousItem,
        ...nextItems.slice(insertIndex)
      ];
    }

    set({
      items: nextItems,
      mutationHistory: state.mutationHistory.slice(0, -1)
    });
    get().recalculate();
  },
  
  applyDiscount: (discount) => {
    if (get().locked) return;
    set({ discount });
    get().recalculate();
    
    eventLogger.log('CART_APPLY_DISCOUNT', {
      type: discount.type,
      value: discount.value,
      reason: discount.reason,
    });
  },
  
  removeDiscount: () => {
    if (get().locked) return;
    set({ discount: null });
    get().recalculate();
  },

  lockCart: () => {
    set({ locked: true });
  },

  unlockCart: () => {
    set({ locked: false });
  },
  
  recalculate: () => {
    const state = get();
    const totals = calculateCartTotals(state.items, state.discount);
    set({
      subtotal: totals.subtotal,
      itemDiscountAmount: totals.itemDiscountAmount,
      cartDiscountAmount: totals.cartDiscountAmount,
      discountAmount: totals.cartDiscountAmount,
      discountTotal: totals.discountTotal,
      total: totals.total
    });
  },
    }),
    {
      name: CART_STORAGE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        items: state.items,
        discount: state.discount
      }),
      onRehydrateStorage: () => (state) => {
        state?.recalculate();
      }
    }
  )
);
