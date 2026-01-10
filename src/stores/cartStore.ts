import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { eventLogger } from '../services/eventLogger';
import { logPosEvent } from "../services/cloudEventLogger";
import { storeScopedStorage } from "../services/storeScope";
import { capAddQuantity, capRequestedQuantity } from "../services/stockCap";
import { resolveStockForCartItem } from "../services/stockService";

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

export type StockLimitReason = "out_of_stock" | "capped" | "unknown_stock";

export type StockLimitEvent = {
  itemId: string;
  availableStock: number;
  reason: StockLimitReason;
  requestedQty: number;
  nextQty: number;
  at: number;
};

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
  stockLimitEvent: StockLimitEvent | null;
  
  // Computed values
  subtotal: number;
  itemDiscountAmount: number;
  cartDiscountAmount: number;
  discountAmount: number;
  discountTotal: number;
  total: number;
  
  // Actions
  addItem: (item: Omit<CartItem, 'quantity'> & { quantity?: number }) => void;
  removeItem: (itemId: string, force?: boolean) => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  updatePrice: (itemId: string, priceMinor: number) => void;
  applyItemDiscount: (itemId: string, discount: ItemDiscount) => void;
  removeItemDiscount: (itemId: string) => void;
  clearCart: (force?: boolean) => void;
  undoLastAction: () => void;
  applyDiscount: (discount: CartDiscount) => void;
  removeDiscount: () => void;
  lockCart: () => void;
  unlockCart: () => void;
  resetForStore: () => void;
  normalizeItemsToStock: () => boolean;
  
  // Internal
  recalculate: () => void;
}

const CART_STORAGE_KEY = "supermandi.cart.sell.v1";

const calculateDiscountAmount = (
  baseAmount: number,
  discount: CartDiscount | ItemDiscount | null
): number => {
  if (!discount) return 0;
  const MAX_MINOR = 2147483647; // INT32_MAX to prevent overflow
  const baseParsed = Number(baseAmount);
  const safeBase = Math.max(0, Math.min(Math.round(Number.isFinite(baseParsed) ? baseParsed : 0), MAX_MINOR));
  const valueParsed = Number(discount.value);

  // Cap percentage at 100% and fixed amount at MAX_MINOR
  const maxValue = discount.type === 'percentage' ? 100 : MAX_MINOR;
  const safeValue = Math.max(0, Math.min(Number.isFinite(valueParsed) ? valueParsed : 0, maxValue));

  if (discount.type === 'percentage') {
    return Math.min(Math.round(safeBase * (safeValue / 100)), safeBase);
  }
  return Math.min(Math.round(safeValue), safeBase);
};

const calculateCartTotals = (items: CartItem[], discount: CartDiscount | null) => {
  let subtotal = 0;
  let itemDiscountAmount = 0;

  for (const item of items) {
    const priceParsed = Number(item.priceMinor);
    const qtyParsed = Number(item.quantity);
    const safePrice = Math.max(0, Math.round(Number.isFinite(priceParsed) ? priceParsed : 0));
    const safeQty = Math.max(0, Math.round(Number.isFinite(qtyParsed) ? qtyParsed : 0));
    const lineSubtotal = safePrice * safeQty;
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

const mergeMetadata = (
  existing: Record<string, any> | undefined,
  incoming: Record<string, any> | undefined
): Record<string, any> | undefined => {
  if (!existing && !incoming) return undefined;
  return { ...(existing ?? {}), ...(incoming ?? {}) };
};

const resolveItemAvailableStock = (item: CartItem): number | null => {
  return resolveStockForCartItem({ id: item.id, barcode: item.barcode ?? null });
};

const buildStockLimitEvent = (
  itemId: string,
  availableStock: number,
  reason: StockLimitReason,
  requestedQty: number,
  nextQty: number
): StockLimitEvent => ({
  itemId,
  availableStock,
  reason,
  requestedQty,
  nextQty,
  at: Date.now()
});

const normalizeItemsForStock = (
  items: CartItem[]
): { items: CartItem[]; changed: boolean } => {
  let changed = false;
  const nextItems: CartItem[] = [];

  for (const item of items) {
    const availableStock = resolveItemAvailableStock(item);
    const cap = capRequestedQuantity(item.quantity, item.quantity, availableStock);
    const nextQty = cap.nextQty;

    if (nextQty <= 0) {
      changed = true;
      continue;
    }

    if (nextQty !== item.quantity) {
      changed = true;
      nextItems.push({ ...item, quantity: nextQty });
    } else {
      nextItems.push(item);
    }
  }

  return { items: nextItems, changed };
};

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      discount: null,
      mutationHistory: [],
      locked: false,
      stockLimitEvent: null,
      subtotal: 0,
      itemDiscountAmount: 0,
      cartDiscountAmount: 0,
      discountAmount: 0,
      discountTotal: 0,
      total: 0,
      
      // DEV-GUARD: All quantity changes must go through stockCap helpers.
      // Use addItem/updateQuantity/normalizeItemsToStock to avoid bypassing caps.
      addItem: (item) => {
        if (get().locked) return;
        const state = get();
        const existingIndex = state.items.findIndex(i => i.id === item.id);
        const existingItem = existingIndex >= 0 ? state.items[existingIndex] : null;
        
        let newItems: CartItem[];
        let nextItem: CartItem;
        const currentQty = existingItem ? existingItem.quantity : 0;
        const mergedMetadata = mergeMetadata(existingItem?.metadata, item.metadata);
        const combinedItem: CartItem = existingItem
          ? { ...existingItem, ...item, metadata: mergedMetadata }
          : { ...item, quantity: item.quantity ?? 1, metadata: mergedMetadata };
        const availableStock = resolveItemAvailableStock(combinedItem);
        const cap = capAddQuantity(currentQty, item.quantity ?? 1, availableStock);
        const requestedQty = cap.requestedQty;
        const nextQty = cap.nextQty;
        const addedQty = cap.addedQty;
        const stockReason: StockLimitReason | null = cap.unknownStock
          ? "unknown_stock"
          : cap.outOfStock
            ? "out_of_stock"
            : cap.capped
              ? "capped"
              : null;
        const stockEvent = stockReason
          ? buildStockLimitEvent(
              existingItem?.id ?? item.id,
              availableStock ?? 0,
              stockReason,
              requestedQty,
              nextQty
            )
          : null;

        if (addedQty <= 0) {
          if (stockEvent) {
            set({ stockLimitEvent: stockEvent });
          }
          return;
        }

        if (existingItem) {
          nextItem = {
            ...existingItem,
            ...item,
            quantity: nextQty,
            flags: mergeFlags(existingItem.flags, item.flags),
            itemDiscount: item.itemDiscount ?? existingItem.itemDiscount,
            metadata: mergedMetadata
          };
          newItems = state.items.map(i => (i.id === item.id ? nextItem : i));
        } else {
          nextItem = {
            ...item,
            quantity: nextQty,
            flags: item.flags,
            itemDiscount: item.itemDiscount,
            metadata: mergedMetadata
          };
          newItems = [...state.items, nextItem];
        }
        
        const mutation: CartMutation = {
          type: "UPSERT_ITEM",
          itemId: item.id,
          previousItem: existingItem ? cloneItem(existingItem) : null,
          previousIndex: existingIndex
        };

        const nextState: Partial<CartState> = {
          items: newItems,
          mutationHistory: [...state.mutationHistory, mutation]
        };
        if (stockEvent) {
          nextState.stockLimitEvent = stockEvent;
        }
        set(nextState as Partial<CartState>);
        get().recalculate();

        eventLogger.log('CART_ADD_ITEM', {
          itemId: item.id,
          itemName: item.name,
          quantity: addedQty,
          priceMinor: item.priceMinor,
        });

        // Cloud event (required): ADD_TO_CART
        void logPosEvent("ADD_TO_CART", {
          productId: item.id,
          name: item.name,
          quantity: addedQty,
          priceMinor: item.priceMinor,
          currency: item.currency ?? undefined,
          barcode: item.barcode ?? undefined
        });
      },
  
  removeItem: (itemId, force = false) => {
    if (get().locked && !force) return;
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
    const state = get();
    const existingIndex = state.items.findIndex(i => i.id === itemId);
    const existingItem = existingIndex >= 0 ? state.items[existingIndex] : null;
    if (!existingItem) return;
    const availableStock = resolveItemAvailableStock(existingItem);
    const cap = capRequestedQuantity(existingItem.quantity, quantity, availableStock);
    const requestedQty = cap.requestedQty;
    const nextQty = cap.nextQty;
    const stockReason: StockLimitReason | null = cap.unknownStock
      ? "unknown_stock"
      : cap.outOfStock
        ? "out_of_stock"
        : cap.capped
          ? "capped"
          : null;
    const stockEvent = stockReason
      ? buildStockLimitEvent(itemId, availableStock ?? 0, stockReason, requestedQty, nextQty)
      : null;

    if (nextQty <= 0) {
      get().removeItem(itemId);
      if (stockEvent) {
        set({ stockLimitEvent: stockEvent });
      }
      return;
    }

    if (nextQty === existingItem.quantity) {
      if (stockEvent) {
        set({ stockLimitEvent: stockEvent });
      }
      return;
    }

    const nextItem = { ...existingItem, quantity: nextQty };
    const newItems = state.items.map(i => (i.id === itemId ? nextItem : i));
    
    const mutation: CartMutation = {
      type: "UPSERT_ITEM",
      itemId,
      previousItem: cloneItem(existingItem),
      previousIndex: existingIndex
    };

    const nextState: Partial<CartState> = {
      items: newItems,
      mutationHistory: [...state.mutationHistory, mutation]
    };
    if (stockEvent) {
      nextState.stockLimitEvent = stockEvent;
    }
    set(nextState as Partial<CartState>);
    get().recalculate();
    
    eventLogger.log('CART_UPDATE_QUANTITY', {
      itemId,
      quantity: nextQty,
    });
  },

  updatePrice: (itemId, priceMinor) => {
    if (get().locked) return;
    if (!Number.isFinite(priceMinor) || priceMinor <= 0) return;

    const state = get();
    const existingIndex = state.items.findIndex(i => i.id === itemId);
    const existingItem = existingIndex >= 0 ? state.items[existingIndex] : null;
    if (!existingItem) return;

    const nextItem = { ...existingItem, priceMinor: Math.round(priceMinor) };
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

    eventLogger.log('CART_UPDATE_PRICE', {
      itemId,
      priceMinor: nextItem.priceMinor
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

    const normalized = normalizeItemsForStock(nextItems);
    set({
      items: normalized.items,
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

  resetForStore: () => {
    set({
      items: [],
      discount: null,
      mutationHistory: [],
      locked: false,
      subtotal: 0,
      itemDiscountAmount: 0,
      cartDiscountAmount: 0,
      discountAmount: 0,
      discountTotal: 0,
      total: 0
    });
  },

  normalizeItemsToStock: () => {
    const state = get();
    const { items: nextItems, changed } = normalizeItemsForStock(state.items);
    if (!changed) return false;
    set({ items: nextItems });
    get().recalculate();
    return true;
  },
  
  recalculate: () => {
    const state = get();
    const totals = calculateCartTotals(state.items, state.discount);
    set({
      subtotal: totals.subtotal,
      itemDiscountAmount: totals.itemDiscountAmount,
      cartDiscountAmount: totals.cartDiscountAmount,
      discountAmount: totals.discountTotal,
      discountTotal: totals.discountTotal,
      total: totals.total
    });
  },
    }),
    {
      name: CART_STORAGE_KEY,
      storage: createJSONStorage(() => storeScopedStorage),
      partialize: (state) => ({
        items: state.items,
        discount: state.discount
      }),
      onRehydrateStorage: () => (state) => {
        const changed = state?.normalizeItemsToStock?.() ?? false;
        if (!changed) {
          state?.recalculate();
        }
      }
    }
  )
);
