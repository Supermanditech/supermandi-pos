import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type PurchaseDraftItem = {
  id: string;
  barcode: string;
  name: string;
  category?: string;
  quantity: number;
  purchasePriceMinor: number | null;
  sellingPriceMinor: number | null;
  currency: string;
  isNew?: boolean;
  status: "COMPLETE" | "INCOMPLETE";
};

type PurchaseDraftInput = {
  id?: string;
  barcode: string;
  name?: string;
  category?: string;
  quantity?: number;
  purchasePriceMinor?: number | null;
  sellingPriceMinor?: number | null;
  currency?: string;
  isNew?: boolean;
};

type PurchaseDraftState = {
  items: PurchaseDraftItem[];
  addOrUpdate: (item: PurchaseDraftInput) => void;
  updateItem: (barcode: string, updates: Partial<PurchaseDraftInput>) => void;
  remove: (barcode: string) => void;
  clear: () => void;
  hasIncomplete: () => boolean;
};

const PURCHASE_DRAFT_STORAGE_KEY = "supermandi.purchase.draft.v1";

const buildName = (barcode: string): string => {
  const suffix = barcode.slice(-4);
  return `Item ${suffix || barcode}`;
};

function isIncomplete(item: {
  name?: string | null;
  quantity?: number | null;
  purchasePriceMinor?: number | null;
  sellingPriceMinor?: number | null;
}): boolean {
  if (!item.name || !item.name.trim()) return true;
  if (!item.quantity || item.quantity <= 0) return true;
  if (item.purchasePriceMinor === null || item.purchasePriceMinor === undefined || item.purchasePriceMinor <= 0) {
    return true;
  }
  if (item.sellingPriceMinor === null || item.sellingPriceMinor === undefined || item.sellingPriceMinor <= 0) {
    return true;
  }
  return false;
}

function normalizeItem(entry: PurchaseDraftInput & { quantity: number }): PurchaseDraftItem {
  const name = entry.name?.trim() || buildName(entry.barcode);
  const currency = entry.currency?.trim() || "INR";
  const status: PurchaseDraftItem["status"] = isIncomplete({
    name,
    quantity: entry.quantity,
    purchasePriceMinor: entry.purchasePriceMinor ?? null,
    sellingPriceMinor: entry.sellingPriceMinor ?? null
  })
    ? "INCOMPLETE"
    : "COMPLETE";

  return {
    id: entry.id ?? entry.barcode,
    barcode: entry.barcode,
    name,
    category: entry.category,
    quantity: entry.quantity,
    purchasePriceMinor: entry.purchasePriceMinor ?? null,
    sellingPriceMinor: entry.sellingPriceMinor ?? null,
    currency,
    isNew: entry.isNew,
    status
  };
}

export const usePurchaseDraftStore = create<PurchaseDraftState>()(
  persist(
    (set, get) => ({
      items: [],
      addOrUpdate: (item) => {
        const qty = item.quantity ?? 1;
        const existing = get().items.find((entry) => entry.barcode === item.barcode);
        if (existing) {
          const nextQty = Math.max(1, existing.quantity + qty);
          const nextItem = normalizeItem({
            ...existing,
            name: existing.name || item.name,
            category: existing.category ?? item.category,
            quantity: nextQty,
            purchasePriceMinor: existing.purchasePriceMinor ?? item.purchasePriceMinor ?? null,
            sellingPriceMinor: existing.sellingPriceMinor ?? item.sellingPriceMinor ?? null,
            currency: existing.currency || item.currency,
            isNew: existing.isNew ?? item.isNew
          });
          set({
            items: get().items.map((entry) => (entry.barcode === item.barcode ? nextItem : entry))
          });
          return;
        }

        set({
          items: [
            ...get().items,
            normalizeItem({
              ...item,
              quantity: Math.max(1, qty)
            })
          ]
        });
      },
      updateItem: (barcode, updates) => {
        const existing = get().items.find((entry) => entry.barcode === barcode);
        if (!existing) return;
        const nextQuantity =
          updates.quantity === undefined ? existing.quantity : Math.max(0, Math.round(updates.quantity));
        const nextItem = normalizeItem({
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
      hasIncomplete: () => get().items.some((entry) => entry.status === "INCOMPLETE")
    }),
    {
      name: PURCHASE_DRAFT_STORAGE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        items: state.items
      })
    }
  )
);
