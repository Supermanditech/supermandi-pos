import { create } from "zustand";

export type PurchaseDraftItem = {
  id: string;
  barcode: string;
  name: string;
  quantity: number;
  currency?: string;
  isNew?: boolean;
};

type PurchaseDraftState = {
  items: PurchaseDraftItem[];
  addOrUpdate: (item: Omit<PurchaseDraftItem, "quantity"> & { quantity?: number }) => void;
  clear: () => void;
};

const buildName = (barcode: string): string => {
  const suffix = barcode.slice(-4);
  return `Item ${suffix || barcode}`;
};

export const usePurchaseDraftStore = create<PurchaseDraftState>((set, get) => ({
  items: [],
  addOrUpdate: (item) => {
    const qty = item.quantity ?? 1;
    const existing = get().items.find((entry) => entry.barcode === item.barcode);
    if (existing) {
      set({
        items: get().items.map((entry) =>
          entry.barcode === item.barcode
            ? { ...entry, quantity: entry.quantity + qty }
            : entry
        )
      });
      return;
    }

    set({
      items: [
        ...get().items,
        {
          ...item,
          name: item.name || buildName(item.barcode),
          quantity: qty
        }
      ]
    });
  },
  clear: () => set({ items: [] })
}));
