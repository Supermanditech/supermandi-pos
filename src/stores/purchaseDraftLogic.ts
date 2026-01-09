export type PurchaseDraftItem = {
  id: string;
  barcode: string;
  globalProductId?: string | null;
  scanFormat?: string | null;
  name: string;
  category?: string;
  quantity: number;
  purchasePriceMinor: number | null;
  sellingPriceMinor: number | null;
  currency: string;
  isNew?: boolean;
  status: "COMPLETE" | "INCOMPLETE";
};

export type PurchaseDraftInput = {
  id?: string;
  barcode: string;
  globalProductId?: string | null;
  scanFormat?: string | null;
  name?: string;
  category?: string;
  quantity?: number;
  purchasePriceMinor?: number | null;
  sellingPriceMinor?: number | null;
  currency?: string;
  isNew?: boolean;
};

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

const resolveProductId = (item: PurchaseDraftInput): string | null => {
  const rawGlobal = typeof item.globalProductId === "string" ? item.globalProductId : "";
  const rawId = typeof item.id === "string" ? item.id : "";
  const candidate = rawGlobal || rawId;
  const trimmed = candidate.trim();
  return trimmed ? trimmed : null;
};

export function normalizePurchaseDraftItem(entry: PurchaseDraftInput & { quantity: number }): PurchaseDraftItem {
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
    globalProductId: entry.globalProductId ?? null,
    scanFormat: entry.scanFormat ?? null,
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

export function findPurchaseDraftMatchIndex(
  items: PurchaseDraftItem[],
  input: PurchaseDraftInput
): number {
  const productId = resolveProductId(input);
  if (productId) {
    const matchByProductId = items.findIndex(
      (entry) => entry.globalProductId === productId || entry.id === productId
    );
    if (matchByProductId >= 0) return matchByProductId;
  }
  return items.findIndex((entry) => entry.barcode === input.barcode);
}

export function mergePurchaseDraftItems(
  items: PurchaseDraftItem[],
  input: PurchaseDraftInput
): PurchaseDraftItem[] {
  const qty = input.quantity ?? 1;
  const matchIndex = findPurchaseDraftMatchIndex(items, input);
  if (matchIndex >= 0) {
    const existing = items[matchIndex];
    const nextQty = Math.max(1, existing.quantity + qty);
    const nextItem = normalizePurchaseDraftItem({
      ...existing,
      name: existing.name || input.name,
      category: existing.category ?? input.category,
      quantity: nextQty,
      purchasePriceMinor: existing.purchasePriceMinor ?? input.purchasePriceMinor ?? null,
      sellingPriceMinor: existing.sellingPriceMinor ?? input.sellingPriceMinor ?? null,
      currency: existing.currency || input.currency,
      isNew: existing.isNew ?? input.isNew,
      globalProductId: existing.globalProductId ?? input.globalProductId ?? null,
      scanFormat: existing.scanFormat ?? input.scanFormat ?? null,
      id: existing.id ?? input.id
    });
    const nextItems = items.slice();
    nextItems[matchIndex] = nextItem;
    return nextItems;
  }

  return [
    ...items,
    normalizePurchaseDraftItem({
      ...input,
      quantity: Math.max(1, qty)
    })
  ];
}
