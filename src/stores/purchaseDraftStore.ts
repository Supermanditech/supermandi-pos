import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { storeScopedStorage } from "../services/storeScope";
import {
  mergePurchaseDraftItems,
  normalizePurchaseDraftItem,
  type PurchaseDraftInput,
  type PurchaseDraftItem
} from "./purchaseDraftLogic";

export type { PurchaseDraftInput, PurchaseDraftItem };

type PurchaseDraftState = {
  items: PurchaseDraftItem[];
  addOrUpdate: (item: PurchaseDraftInput) => void;
  updateItem: (barcode: string, updates: Partial<PurchaseDraftInput>) => void;
  remove: (barcode: string) => void;
  clear: () => void;
  hasIncomplete: () => boolean;
  resetForStore: () => void;
};

const PURCHASE_DRAFT_STORAGE_KEY = "supermandi.purchase.draft.v1";

export const usePurchaseDraftStore = create<PurchaseDraftState>()(
  persist(
    (set, get) => ({
      items: [],
      addOrUpdate: (item) => {
        set((state) => ({
          items: mergePurchaseDraftItems(state.items, item)
        }));
      },
      updateItem: (barcode, updates) => {
        const existing = get().items.find((entry) => entry.barcode === barcode);
        if (!existing) return;
        const nextQuantity =
          updates.quantity === undefined ? existing.quantity : Math.max(0, Math.round(updates.quantity));
        const nextItem = normalizePurchaseDraftItem({
          ...existing,
          ...updates,
          quantity: nextQuantity
        });
        set({
          items: get().items.map((entry) => (entry.barcode === barcode ? nextItem : entry))
        });
      },
      remove: (barcode) => {
        set({ items: get().items.filter((entry) => entry.barcode !== barcode) });
      },
      clear: () => set({ items: [] }),
      hasIncomplete: () => get().items.some((entry) => entry.status === "INCOMPLETE"),
      resetForStore: () => set({ items: [] })
    }),
    {
      name: PURCHASE_DRAFT_STORAGE_KEY,
      storage: createJSONStorage(() => storeScopedStorage),
      partialize: (state) => ({
        items: state.items
      })
    }
  )
);
