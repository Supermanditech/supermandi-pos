/**
 * V3-FIX-186: Buy-again / repeat-last-order API client
 *
 * Canonical flow:
 *   1. Call buyAgain() or buyAgainFromOrder()
 *   2. Returns BuyAgainDraft
 *   3. Caller loads items into purchaseDraftStore
 */

import { apiClient } from "./apiClient";
import { usePurchaseDraftStore } from "../../stores/purchaseDraftStore";

export interface BuyAgainDraftItem {
  productId: string;
  barcode: string | null;
  name: string;
  quantity: number;
  purchasePriceMinor: number;
  sellingPriceMinor: number;
  currency: string;
  supplierId: string | null;
  supplierName: string | null;
  source: string;
  currentStock: number;
  daysOfStock: number;
}

export interface BuyAgainDraft {
  storeId: string;
  items: BuyAgainDraftItem[];
  totalItems: number;
  totalAmountMinor: number;
  computedAt: string;
  suppressedCount: number;
}

export interface PurchaseHistoryEntry {
  orderId: string;
  supplierName: string | null;
  totalMinor: number;
  itemCount: number;
  createdAt: string;
}

/**
 * Build buy-again draft from specific products or last purchased products.
 */
export async function buyAgain(
  productIds?: string[]
): Promise<BuyAgainDraft> {
  const body = productIds ? { productIds } : {};
  const res = await apiClient.post<{ success: boolean; data: BuyAgainDraft }>(
    "/api/v1/pos/buy-again",
    body
  );
  return res.data;
}

/**
 * Build buy-again draft from a specific previous purchase order.
 */
export async function buyAgainFromOrder(
  orderId: string
): Promise<BuyAgainDraft> {
  const res = await apiClient.post<{ success: boolean; data: BuyAgainDraft }>(
    "/api/v1/pos/buy-again",
    { orderId }
  );
  return res.data;
}

/**
 * Get recent purchase orders for "repeat last order" selection.
 */
export async function getPurchaseHistory(
  limit?: number
): Promise<PurchaseHistoryEntry[]> {
  const q = limit ? `?limit=${limit}` : "";
  const res = await apiClient.get<{ success: boolean; data: PurchaseHistoryEntry[] }>(
    `/api/v1/pos/buy-again/history${q}`
  );
  return res.data;
}

/**
 * Load a buy-again draft into the purchaseDraftStore.
 * This is the canonical wiring point: API result → Zustand store.
 */
export function loadBuyAgainIntoDraft(draft: BuyAgainDraft): void {
  const store = usePurchaseDraftStore.getState();
  // Clear existing draft before loading
  store.clear();

  for (const item of draft.items) {
    if (!item.barcode) continue; // purchaseDraftStore requires barcode
    store.addOrUpdate({
      barcode: item.barcode,
      globalProductId: item.productId,
      name: item.name,
      quantity: item.quantity,
      purchasePriceMinor: item.purchasePriceMinor,
      sellingPriceMinor: item.sellingPriceMinor,
      currency: item.currency,
    });
  }
}
