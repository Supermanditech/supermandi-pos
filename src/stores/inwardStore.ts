// Inward Store - Local cart for stock-in operations
// GO-LIVE-004: Supports manual stock inward without PO
// GL-WF-005: Added persist middleware to prevent data loss on app restart

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface InwardItem {
  id: string; // productId
  barcode: string;
  name: string;
  quantity: number;
  purchasePriceMinor: number; // paise
  supplierId: string | null;
  supplierName: string | null;
  // GO-LIVE-241: Market price reference for comparison
  marketPriceMinor?: number;
}

export interface InwardSupplier {
  id: string;
  name: string;
}

interface InwardState {
  items: InwardItem[];
  selectedSupplier: InwardSupplier | null;
  notes: string;

  // Actions
  addItem: (item: Omit<InwardItem, "supplierId" | "supplierName">) => void;
  updateItem: (id: string, updates: Partial<Pick<InwardItem, "quantity" | "purchasePriceMinor">>) => void;
  removeItem: (id: string) => void;
  setSupplier: (supplier: InwardSupplier | null) => void;
  setNotes: (notes: string) => void;
  clearCart: () => void;

  // Computed helpers
  getTotal: () => number;
  getItemCount: () => number;
}

export const useInwardStore = create<InwardState>()(
  persist(
    (set, get) => ({
      items: [],
      selectedSupplier: null,
      notes: "",

  addItem: (item) => {
    const { items, selectedSupplier } = get();
    const existing = items.find((i) => i.id === item.id);

    if (existing) {
      // Update quantity if already exists
      set({
        items: items.map((i) =>
          i.id === item.id
            ? { ...i, quantity: i.quantity + item.quantity }
            : i
        ),
      });
    } else {
      // Add new item with current supplier
      set({
        items: [
          ...items,
          {
            ...item,
            supplierId: selectedSupplier?.id ?? null,
            supplierName: selectedSupplier?.name ?? null,
          },
        ],
      });
    }
  },

  updateItem: (id, updates) => {
    const { items } = get();
    set({
      items: items.map((i) =>
        i.id === id ? { ...i, ...updates } : i
      ),
    });
  },

  removeItem: (id) => {
    const { items } = get();
    set({ items: items.filter((i) => i.id !== id) });
  },

  setSupplier: (supplier) => {
    const { items } = get();
    // Update all items with the new supplier
    set({
      selectedSupplier: supplier,
      items: items.map((i) => ({
        ...i,
        supplierId: supplier?.id ?? null,
        supplierName: supplier?.name ?? null,
      })),
    });
  },

  setNotes: (notes) => set({ notes }),

  clearCart: () => set({ items: [], selectedSupplier: null, notes: "" }),

  getTotal: () => {
    const { items } = get();
    return items.reduce(
      (sum, item) => sum + item.purchasePriceMinor * item.quantity,
      0
    );
  },

  getItemCount: () => {
    const { items } = get();
    return items.reduce((sum, item) => sum + item.quantity, 0);
  },
    }),
    {
      name: "supermandi-inward-cart",
      storage: createJSONStorage(() => AsyncStorage),
      // GL-WF-005: Persist all state to survive app restarts
      partialize: (state) => ({
        items: state.items,
        selectedSupplier: state.selectedSupplier,
        notes: state.notes,
      }),
    }
  )
);
