// Purchase Cart Store - V3.0.9 compliant
// Manages purchase order items grouped by supplier

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { storeScopedStorage } from "../services/storeScope";

// =============================================================================
// TYPES
// =============================================================================

export interface PurchaseCartItem {
  supplierProductId: string;
  productId: string;
  supplierId: string;
  supplierName: string;
  productName: string;
  barcode?: string;
  quantity: number;
  unitPrice: number;
  mrp?: number;
  moq: number;
  minOrderValue?: number; // Supplier min order value from link
  // AUD-012: Price resolution error flag (mirrors cartStore pattern)
  priceResolutionError?: boolean;
}

export interface SupplierGroup {
  supplierId: string;
  supplierName: string;
  items: PurchaseCartItem[];
  itemCount: number;
  totalQuantity: number;
  totalAmount: number;
  minOrderValue: number; // Supplier min order value
}

export interface CartTotals {
  supplierCount: number;
  itemCount: number;
  totalQuantity: number;
  grandTotal: number;
}

export interface DraftPOItem {
  supplierProductId: string;
  productId: string;
  supplierId: string;
  supplierName: string;
  productName: string;
  barcode?: string;
  suggestedQuantity: number;
  unitPrice: number;
  mrp?: number;
  moq: number;
  minOrderValue?: number; // Supplier min order value from link
}

// =============================================================================
// STATE INTERFACE
// =============================================================================

interface PurchaseCartState {
  items: PurchaseCartItem[];

  // Actions
  addItem: (item: Omit<PurchaseCartItem, "quantity"> & { quantity?: number }) => void;
  updateQuantity: (supplierProductId: string, quantity: number) => void;
  removeItem: (supplierProductId: string) => void;
  removeSupplierItems: (supplierId: string) => void;
  clear: () => void;
  loadDraftPOs: (drafts: DraftPOItem[]) => void;
  resetForStore: () => void;

  // Computed getters
  getItemsBySupplier: () => SupplierGroup[];
  getSupplierTotal: (supplierId: string) => number;
  getTotals: () => CartTotals;
  hasItems: () => boolean;
  getItemCount: () => number;
}

// =============================================================================
// HELPERS
// =============================================================================

function normalizeQuantity(quantity: number, moq: number): number {
  const rounded = Math.round(quantity);
  return Math.max(moq, rounded);
}

function calculateSupplierGroups(items: PurchaseCartItem[]): SupplierGroup[] {
  const groupMap = new Map<string, SupplierGroup>();

  for (const item of items) {
    let group = groupMap.get(item.supplierId);
    if (!group) {
      group = {
        supplierId: item.supplierId,
        supplierName: item.supplierName,
        items: [],
        itemCount: 0,
        totalQuantity: 0,
        totalAmount: 0,
        minOrderValue: item.minOrderValue ?? 0,
      };
      groupMap.set(item.supplierId, group);
    }

    group.items.push(item);
    group.itemCount++;
    group.totalQuantity += item.quantity;
    group.totalAmount += item.quantity * item.unitPrice;
    // Update minOrderValue if not set (use first non-zero value found)
    if (group.minOrderValue === 0 && item.minOrderValue) {
      group.minOrderValue = item.minOrderValue;
    }
  }

  // Sort groups by supplier name
  return Array.from(groupMap.values()).sort((a, b) =>
    a.supplierName.localeCompare(b.supplierName)
  );
}

function calculateTotals(items: PurchaseCartItem[]): CartTotals {
  const supplierIds = new Set<string>();
  let totalQuantity = 0;
  let grandTotal = 0;

  for (const item of items) {
    supplierIds.add(item.supplierId);
    totalQuantity += item.quantity;
    grandTotal += item.quantity * item.unitPrice;
  }

  return {
    supplierCount: supplierIds.size,
    itemCount: items.length,
    totalQuantity,
    grandTotal,
  };
}

// =============================================================================
// STORE
// =============================================================================

const PURCHASE_CART_STORAGE_KEY = "supermandi.purchase.cart.v1";

export const usePurchaseCartStore = create<PurchaseCartState>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (item) => {
        const quantity = normalizeQuantity(item.quantity ?? item.moq, item.moq);
        const newItem: PurchaseCartItem = {
          supplierProductId: item.supplierProductId,
          productId: item.productId,
          supplierId: item.supplierId,
          supplierName: item.supplierName,
          productName: item.productName,
          barcode: item.barcode,
          unitPrice: item.unitPrice,
          mrp: item.mrp,
          moq: item.moq,
          minOrderValue: item.minOrderValue,
          priceResolutionError: false, // AUD-012: default false on add/re-add
          quantity,
        };

        set((state) => {
          // Check if item already exists
          const existingIndex = state.items.findIndex(
            (i) => i.supplierProductId === item.supplierProductId
          );

          if (existingIndex >= 0) {
            // Update existing item - add quantities
            const updated = [...state.items];
            const existing = updated[existingIndex];
            updated[existingIndex] = {
              ...existing,
              quantity: normalizeQuantity(existing.quantity + quantity, existing.moq),
            };
            return { items: updated };
          }

          // Add new item
          return { items: [...state.items, newItem] };
        });
      },

      updateQuantity: (supplierProductId, quantity) => {
        set((state) => {
          const item = state.items.find((i) => i.supplierProductId === supplierProductId);
          if (!item) return state;

          const normalizedQty = normalizeQuantity(quantity, item.moq);

          // If quantity is 0 or below moq threshold after normalization, we still keep moq
          // To remove, user must explicitly call removeItem
          return {
            items: state.items.map((i) =>
              i.supplierProductId === supplierProductId
                ? { ...i, quantity: normalizedQty }
                : i
            ),
          };
        });
      },

      removeItem: (supplierProductId) => {
        set((state) => ({
          items: state.items.filter((i) => i.supplierProductId !== supplierProductId),
        }));
      },

      removeSupplierItems: (supplierId) => {
        set((state) => ({
          items: state.items.filter((i) => i.supplierId !== supplierId),
        }));
      },

      clear: () => set({ items: [] }),

      loadDraftPOs: (drafts) => {
        const newItems: PurchaseCartItem[] = drafts.map((draft) => ({
          supplierProductId: draft.supplierProductId,
          productId: draft.productId,
          supplierId: draft.supplierId,
          supplierName: draft.supplierName,
          productName: draft.productName,
          barcode: draft.barcode,
          quantity: normalizeQuantity(draft.suggestedQuantity, draft.moq),
          unitPrice: draft.unitPrice,
          mrp: draft.mrp,
          moq: draft.moq,
          minOrderValue: draft.minOrderValue,
        }));

        set((state) => {
          // Merge with existing items
          const merged = [...state.items];

          for (const newItem of newItems) {
            const existingIndex = merged.findIndex(
              (i) => i.supplierProductId === newItem.supplierProductId
            );

            if (existingIndex >= 0) {
              // Update existing - use the draft quantity (overwrite)
              merged[existingIndex] = {
                ...merged[existingIndex],
                quantity: newItem.quantity,
                unitPrice: newItem.unitPrice,
              };
            } else {
              merged.push(newItem);
            }
          }

          return { items: merged };
        });
      },

      resetForStore: () => set({ items: [] }),

      getItemsBySupplier: () => calculateSupplierGroups(get().items),

      getSupplierTotal: (supplierId) => {
        const supplierItems = get().items.filter((i) => i.supplierId === supplierId);
        return supplierItems.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
      },

      getTotals: () => calculateTotals(get().items),

      hasItems: () => get().items.length > 0,

      getItemCount: () => get().items.length,
    }),
    {
      name: PURCHASE_CART_STORAGE_KEY,
      storage: createJSONStorage(() => storeScopedStorage),
      partialize: (state) => ({
        items: state.items,
      }),
    }
  )
);
