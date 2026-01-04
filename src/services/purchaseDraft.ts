import { apiClient } from "./api/apiClient";
import { isOnline } from "./networkStatus";
import { enqueueEvent } from "./offline/outbox";
import { offlineDb } from "./offline/localDb";
import { uuidv4 } from "../utils/uuid";
import { usePurchaseDraftStore, type PurchaseDraftItem } from "../stores/purchaseDraftStore";

type PurchaseSubmitResponse = {
  purchaseId: string;
  totalMinor: number;
};

type PurchaseSubmitItem = {
  barcode: string;
  name: string;
  quantity: number;
  purchasePriceMinor: number;
  sellingPriceMinor: number;
  currency: string;
};

function ensureValidItems(items: PurchaseDraftItem[]): PurchaseSubmitItem[] {
  const normalized: PurchaseSubmitItem[] = [];
  for (const item of items) {
    if (item.status !== "COMPLETE") {
      throw new Error("purchase_incomplete");
    }

    normalized.push({
      barcode: item.barcode,
      name: item.name.trim(),
      quantity: Math.max(1, Math.round(item.quantity)),
      purchasePriceMinor: Math.max(1, Math.round(item.purchasePriceMinor ?? 0)),
      sellingPriceMinor: Math.max(1, Math.round(item.sellingPriceMinor ?? 0)),
      currency: item.currency || "INR"
    });
  }
  if (normalized.length === 0) {
    throw new Error("purchase_empty");
  }
  return normalized;
}

async function upsertOfflineProduct(item: PurchaseSubmitItem): Promise<void> {
  const now = new Date().toISOString();
  await offlineDb.run(
    `
    INSERT INTO offline_products (barcode, name, currency, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(barcode) DO UPDATE SET
      name = excluded.name,
      currency = excluded.currency,
      updated_at = excluded.updated_at
    `,
    [item.barcode, item.name, item.currency, now, now]
  );

  await offlineDb.run(
    `
    INSERT INTO offline_prices (barcode, price_minor, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(barcode) DO UPDATE SET
      price_minor = excluded.price_minor,
      updated_at = excluded.updated_at
    `,
    [item.barcode, item.sellingPriceMinor, now]
  );
}

export async function submitPurchaseDraft(input: {
  supplierName?: string | null;
} = {}): Promise<PurchaseSubmitResponse> {
  const { items, clear } = usePurchaseDraftStore.getState();
  const normalized = ensureValidItems(items);
  const totalMinor = normalized.reduce(
    (sum, item) => sum + item.purchasePriceMinor * item.quantity,
    0
  );

  if (await isOnline()) {
    const res = await apiClient.post<PurchaseSubmitResponse>("/api/v1/pos/purchases", {
      supplierName: input.supplierName ?? null,
      items: normalized
    });
    for (const item of normalized) {
      await upsertOfflineProduct(item);
    }
    clear();
    return res;
  }

  const purchaseId = uuidv4();
  const createdAt = new Date().toISOString();

  await enqueueEvent("PURCHASE_SUBMIT", {
    purchaseId,
    supplierName: input.supplierName ?? null,
    items: normalized,
    totalMinor,
    createdAt
  });

  for (const item of normalized) {
    await upsertOfflineProduct(item);
  }

  clear();
  return { purchaseId, totalMinor };
}
