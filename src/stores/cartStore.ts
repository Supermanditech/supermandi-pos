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
  // AUD-016: SCALE-A3 batch traceability — carried through cart to offline sale
  batchNumber?: string | null;
  // GL-RJ-007: Track price resolution status
  priceResolutionError?: boolean;
  priceResolutionMessage?: string;
  // ISSUE-MICRO-068: Track when price was last fetched for freshness validation
  priceFetchedAt?: number;
  // STG-555: Wholesale B2B fields — additive, optional, no breaking changes
  tradePriceMinor?: number;     // wholesale/trade price (PTR) in paise
  mrpMinor?: number;            // MRP in paise (for margin calculation)
  caseSize?: number;            // units per case/carton
  unitLabel?: string;           // pcs, kg, ltr, btl, box, tray
  hsnCode?: string;             // HSN code for GST
  gstPct?: number;              // GST rate: 0, 5, 12, 18, 28
  supplierName?: string;        // supplier who sold this product
  tradeDiscountPct?: number;    // trade discount percentage
  scheme?: string;              // e.g. "10+1 Free"
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

// STG-103: Customer info for credit/due sales
export interface CartCustomer {
  name: string;
  phone?: string;
}

// STG-112: Order note/memo
export type CartNote = string;

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

// GL-CRIT-0011: Cart lock timeout (5 minutes) to auto-unlock after payment failure
const CART_LOCK_TIMEOUT_MS = 5 * 60 * 1000;

// STG-555: Sell mode for wholesale/retail pricing
export type SellMode = 'retail' | 'bulk';

interface CartState {
  items: CartItem[];
  sellMode: SellMode; // STG-555: retail (MRP) or bulk (trade price + GST)
  discount: CartDiscount | null;
  customer: CartCustomer | null; // STG-103: Customer for credit sales
  note: CartNote | null; // STG-112: Order note/memo
  mutationHistory: CartMutation[];
  locked: boolean;
  lockedAt: number | null; // GL-CRIT-0011: Timestamp when cart was locked
  stockLimitEvent: StockLimitEvent | null;
  lastStockAdjustments: StockAdjustment[] | null; // GL-CRIT-0014: Last stock adjustments for UI notification
  
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
  updateItemDetails: (itemId: string, details: { name?: string; metadata?: Record<string, any> }) => void;
  applyItemDiscount: (itemId: string, discount: ItemDiscount) => void;
  removeItemDiscount: (itemId: string) => void;
  clearCart: (force?: boolean) => void;
  undoLastAction: () => void;
  applyDiscount: (discount: CartDiscount) => void;
  removeDiscount: () => void;
  lockCart: () => void;
  unlockCart: () => void;
  autoUnlockIfExpired: () => boolean; // GL-CRIT-0011: Auto-unlock if lock timed out
  isCartLocked: () => boolean; // GL-CRIT-0011: Check if locked (respects timeout)
  setCustomer: (customer: CartCustomer | null) => void; // STG-103
  setNote: (note: CartNote | null) => void; // STG-112
  setSellMode: (mode: SellMode) => void; // STG-555
  resetForStore: () => void;
  normalizeItemsToStock: () => { changed: boolean; adjustments: StockAdjustment[] }; // GL-CRIT-0014: Return adjustments for notification
  clearLastStockAdjustments: () => void; // GL-CRIT-0014: Clear after UI has shown notification

  // PD-025: Parked carts — V3-FIX-121: preserves full draft state
  parkedCarts: Array<{
    items: CartItem[];
    parkedAt: number;
    discount: CartDiscount | null;
    customer: CartCustomer | null;
    note: CartNote | null;
  }>;
  parkCart: () => void;
  resumeParkedCart: (index: number) => void;
  deleteParkedCart: (index: number) => void;

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

// GO-LIVE-116: Maximum safe total to prevent overflow
const MAX_SAFE_TOTAL = 9007199254740991; // Number.MAX_SAFE_INTEGER

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

  // GO-LIVE-116: Cap subtotal to prevent overflow (backend will also reject)
  if (subtotal > MAX_SAFE_TOTAL) {
    console.warn('[Cart] GO-LIVE-116: Subtotal exceeds MAX_SAFE_TOTAL, capping');
    subtotal = MAX_SAFE_TOTAL;
  }

  const subtotalAfterItemDiscounts = Math.max(0, subtotal - itemDiscountAmount);
  const cartDiscountAmount = calculateDiscountAmount(subtotalAfterItemDiscounts, discount);
  const discountTotal = itemDiscountAmount + cartDiscountAmount;
  // STG-542: Warn when discount exceeds subtotal (negative total capped to 0)
  const rawTotal = subtotal - discountTotal;
  if (rawTotal < 0 && __DEV__) {
    console.warn(`[cartStore] STG-542: Discount (${discountTotal}) exceeds subtotal (${subtotal}). Total capped to 0.`);
  }
  const total = Math.max(0, rawTotal);

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

// GL-CRIT-0014: Track details of stock adjustments for user notification
export type StockAdjustment = {
  itemId: string;
  itemName: string;
  previousQty: number;
  newQty: number;
  removed: boolean;
};

type NormalizeResult = {
  items: CartItem[];
  changed: boolean;
  adjustments: StockAdjustment[]; // GL-CRIT-0014: Details of adjustments
};

const normalizeItemsForStock = (
  items: CartItem[]
): NormalizeResult => {
  let changed = false;
  const nextItems: CartItem[] = [];
  const adjustments: StockAdjustment[] = []; // GL-CRIT-0014

  for (const item of items) {
    const availableStock = resolveItemAvailableStock(item);
    const cap = capRequestedQuantity(item.quantity, item.quantity, availableStock);
    const nextQty = cap.nextQty;

    if (nextQty <= 0) {
      changed = true;
      // GL-CRIT-0014: Track removed items
      adjustments.push({
        itemId: item.id,
        itemName: item.name,
        previousQty: item.quantity,
        newQty: 0,
        removed: true
      });
      continue;
    }

    if (nextQty !== item.quantity) {
      changed = true;
      // GL-CRIT-0014: Track quantity adjustments
      adjustments.push({
        itemId: item.id,
        itemName: item.name,
        previousQty: item.quantity,
        newQty: nextQty,
        removed: false
      });
      nextItems.push({ ...item, quantity: nextQty });
    } else {
      nextItems.push(item);
    }
  }

  return { items: nextItems, changed, adjustments };
};

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      sellMode: 'retail' as SellMode, // STG-555: default retail
      discount: null,
      customer: null, // STG-103
      note: null, // STG-112
      mutationHistory: [],
      locked: false,
      lockedAt: null, // GL-CRIT-0011: Track when cart was locked
      stockLimitEvent: null,
      lastStockAdjustments: null, // GL-CRIT-0014
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
            metadata: mergedMetadata,
            priceFetchedAt: Date.now(), // ISSUE-MICRO-068
            priceResolutionError: false, // AUD-007: clear stale error on successful re-add
          };
          newItems = state.items.map(i => (i.id === item.id ? nextItem : i));
        } else {
          nextItem = {
            ...item,
            quantity: nextQty,
            flags: item.flags,
            itemDiscount: item.itemDiscount,
            metadata: mergedMetadata,
            priceFetchedAt: Date.now(), // ISSUE-MICRO-068
            priceResolutionError: item.priceResolutionError ?? false, // AUD-017: normalise to boolean (spread may carry true from caller)
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

    const nextItem = { ...existingItem, priceMinor: Math.round(priceMinor), priceFetchedAt: Date.now() };
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

  updateItemDetails: (itemId, details) => {
    if (get().locked) return;
    const state = get();
    const existingIndex = state.items.findIndex(i => i.id === itemId);
    const existingItem = existingIndex >= 0 ? state.items[existingIndex] : null;
    if (!existingItem) return;

    const nextItem: CartItem = {
      ...existingItem,
      name: details.name ?? existingItem.name,
      metadata: details.metadata
        ? { ...existingItem.metadata, ...details.metadata }
        : existingItem.metadata
    };

    const newItems = [...state.items];
    newItems[existingIndex] = nextItem;

    set({
      items: newItems,
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

    eventLogger.log('CART_UPDATE_DETAILS', {
      itemId,
      name: nextItem.name,
      metadata: nextItem.metadata
    });
  },

  applyItemDiscount: (itemId, discount) => {
    if (get().locked) return;
    const state = get();
    const existingIndex = state.items.findIndex(i => i.id === itemId);
    const existingItem = existingIndex >= 0 ? state.items[existingIndex] : null;
    if (!existingItem) return;

    // POS-CART-003: Block negative discount values at entry point
    const safeDiscount: ItemDiscount = { ...discount, value: Math.max(0, discount.value) };
    const nextItem: CartItem = {
      ...existingItem,
      itemDiscount: safeDiscount,
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
      customer: null, // STG-103: Clear customer on cart clear
      note: null, // STG-112: Clear note on cart clear
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
    // POS-CART-003: Block negative discount values at entry point
    const safeDiscount: CartDiscount = { ...discount, value: Math.max(0, discount.value) };
    set({ discount: safeDiscount });
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
    // GL-CRIT-0011: Track when cart was locked for timeout-based auto-unlock
    set({ locked: true, lockedAt: Date.now() });
  },

  unlockCart: () => {
    set({ locked: false, lockedAt: null });
  },

  // GL-CRIT-0011: Auto-unlock cart if lock has expired (timeout after 5 min)
  autoUnlockIfExpired: () => {
    const state = get();
    if (!state.locked || !state.lockedAt) return false;

    const elapsed = Date.now() - state.lockedAt;
    if (elapsed >= CART_LOCK_TIMEOUT_MS) {
      console.warn(`[CartStore] GL-CRIT-0011: Auto-unlocking cart after ${Math.round(elapsed / 1000)}s timeout`);
      set({ locked: false, lockedAt: null });
      eventLogger.log('CART_AUTO_UNLOCKED', { elapsedMs: elapsed });
      return true;
    }
    return false;
  },

  // GL-CRIT-0011: Check if cart is locked (auto-unlocks if timed out)
  isCartLocked: () => {
    const state = get();
    if (!state.locked) return false;

    // Check for timeout
    if (state.lockedAt) {
      const elapsed = Date.now() - state.lockedAt;
      if (elapsed >= CART_LOCK_TIMEOUT_MS) {
        // Auto-unlock
        console.warn(`[CartStore] GL-CRIT-0011: Cart lock expired after ${Math.round(elapsed / 1000)}s`);
        set({ locked: false, lockedAt: null });
        eventLogger.log('CART_AUTO_UNLOCKED', { elapsedMs: elapsed });
        return false;
      }
    }
    return true;
  },

  // STG-103: Set customer info for credit sales
  setCustomer: (customer) => {
    set({ customer });
  },

  // STG-112: Set order note/memo (max 140 chars)
  setNote: (note) => {
    const trimmed = note ? note.slice(0, 140) : null;
    set({ note: trimmed || null });
  },

  // STG-555: Switch between retail (MRP) and bulk (trade price + GST) mode
  setSellMode: (mode) => {
    set({ sellMode: mode });
  },

  resetForStore: () => {
    set({
      items: [],
      sellMode: 'retail' as SellMode, // STG-555: reset to retail
      discount: null,
      customer: null, // STG-103
      note: null, // STG-112
      mutationHistory: [],
      locked: false,
      lockedAt: null, // GL-CRIT-0011
      lastStockAdjustments: null, // GL-CRIT-0014
      subtotal: 0,
      itemDiscountAmount: 0,
      cartDiscountAmount: 0,
      discountAmount: 0,
      discountTotal: 0,
      total: 0
    });
  },

  // PD-025: Parked carts — V3-FIX-121: preserves full draft state
  parkedCarts: [],
  parkCart: () => {
    const state = get();
    if (state.items.length === 0) return;
    if (state.parkedCarts.length >= 3) return; // Max 3 parked
    // V3-FIX-121: Save full draft commercial state (discount, customer, note)
    const parked = [...state.parkedCarts, {
      items: [...state.items],
      parkedAt: Date.now(),
      discount: state.discount ? { ...state.discount } : null,
      customer: state.customer ? { ...state.customer } : null,
      note: state.note,
    }];
    set({ parkedCarts: parked, items: [], discount: null, customer: null, note: null, subtotal: 0, total: 0, discountAmount: 0, cartDiscountAmount: 0, itemDiscountAmount: 0, discountTotal: 0 });
  },
  resumeParkedCart: (index: number) => {
    const state = get();
    if (index < 0 || index >= state.parkedCarts.length) return;
    const cart = state.parkedCarts[index];
    const remaining = state.parkedCarts.filter((_, i) => i !== index);
    // V3-FIX-121: Restore full draft state including discount, customer, note
    set({
      items: cart.items,
      discount: cart.discount ?? null,
      customer: cart.customer ?? null,
      note: cart.note ?? null,
      parkedCarts: remaining,
    });
    get().recalculate();
  },
  deleteParkedCart: (index: number) => {
    const state = get();
    set({ parkedCarts: state.parkedCarts.filter((_, i) => i !== index) });
  },

  // GL-CRIT-0014: Return adjustments so UI can notify user
  normalizeItemsToStock: () => {
    const state = get();
    const { items: nextItems, changed, adjustments } = normalizeItemsForStock(state.items);
    if (!changed) return { changed: false, adjustments: [] };
    // GL-CRIT-0014: Store adjustments in state for UI to read
    set({ items: nextItems, lastStockAdjustments: adjustments.length > 0 ? adjustments : null });
    get().recalculate();
    // Log adjustments for debugging
    if (adjustments.length > 0) {
      eventLogger.log('CART_STOCK_ADJUSTMENT', {
        adjustments: adjustments.map(a => ({
          itemId: a.itemId,
          previousQty: a.previousQty,
          newQty: a.newQty,
          removed: a.removed
        }))
      });
    }
    return { changed: true, adjustments };
  },

  // GL-CRIT-0014: Clear adjustments after UI has shown notification
  clearLastStockAdjustments: () => {
    set({ lastStockAdjustments: null });
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
      // GL-WF-019: Include locked state in persistence to prevent cart modification after crash during payment
      // GL-CRIT-0044: mutationHistory is intentionally NOT persisted.
      // Undo is disabled after restart because stale mutation history could cause issues.
      // The UI only shows undo for mutations made in the current session.
      partialize: (state) => ({
        items: state.items,
        discount: state.discount,
        customer: state.customer, // STG-103: Persist customer info
        note: state.note, // STG-112: Persist order note
        locked: state.locked,
        lockedAt: state.lockedAt  // GL-CRIT-0011: Persist for timeout-based auto-unlock
      }),
      // AUD-058-A FIX: Add error boundary for cart deserialization
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.error("[CartStore] Failed to rehydrate cart from storage:", error);
          // Cart will reset to empty state - this is acceptable for corrupted data
          return;
        }

        // ISSUE-MICRO-070: Defer stock normalization to next tick to avoid blocking UI
        // on large carts (500+ items). Items are already loaded; normalization just adjusts quantities.
        setTimeout(() => {
          try {
            const changed = state?.normalizeItemsToStock?.() ?? false;
            if (!changed) {
              state?.recalculate();
            }
          } catch (rehydrateError) {
            console.error("[CartStore] Error during cart normalization:", rehydrateError);
            // State is partially loaded but may be inconsistent - log for debugging
          }
        }, 0);
      }
    }
  )
);
