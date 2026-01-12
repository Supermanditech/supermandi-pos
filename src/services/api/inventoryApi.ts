// Inventory API - V3.0.9 compliant
// Frontend API client for inventory-service endpoints

import { apiClient } from "./apiClient";
import { isOnline } from "../networkStatus";
import { getDeviceStoreId } from "../deviceSession";

// =============================================================================
// TYPES
// =============================================================================

export interface StockLookupResult {
  storeId: string;
  productId: string;
  currentQty: number;
  lastUpdated?: string;
}

export interface StockBatchResult {
  [productId: string]: StockLookupResult;
}

export interface InventoryTransactionItem {
  productId: string;
  quantity: number;
  unitCost?: number;
}

export interface InventoryTransactionInput {
  items: InventoryTransactionItem[];
  transactionType: "sale" | "sale_return" | "purchase_received" | "adjustment";
  referenceType?: "sale" | "po" | "return" | "manual";
  referenceId?: string;
  notes?: string;
}

export interface LedgerEntry {
  id: string;
  storeId: string;
  productId: string;
  deltaQty: number;
  transactionType: string;
  referenceType?: string;
  referenceId?: string;
  stockBefore: number;
  stockAfter: number;
  createdAt: string;
}

export interface InventoryTransactionResponse {
  entries: LedgerEntry[];
}

// =============================================================================
// STOCK LOOKUP
// =============================================================================

/**
 * Get current stock for a single product.
 * Returns 0 if product has no inventory record.
 */
export async function getStock(productId: string): Promise<StockLookupResult> {
  const storeId = await getDeviceStoreId();
  if (!storeId) {
    throw new Error("Store not configured");
  }

  if (!(await isOnline())) {
    // Return cached/offline stock or 0
    return {
      storeId,
      productId,
      currentQty: 0,
    };
  }

  const response = await apiClient.get<{ data: StockLookupResult }>(
    `/api/v1/pos/inventory/stock/${encodeURIComponent(productId)}`
  );
  return response.data;
}

/**
 * Get current stock for multiple products in a single request.
 * More efficient than multiple single lookups.
 */
export async function getStockBatch(
  productIds: string[]
): Promise<StockBatchResult> {
  const storeId = await getDeviceStoreId();
  if (!storeId) {
    throw new Error("Store not configured");
  }

  if (productIds.length === 0) {
    return {};
  }

  if (!(await isOnline())) {
    // Return empty stock for offline mode
    const result: StockBatchResult = {};
    for (const productId of productIds) {
      result[productId] = {
        storeId,
        productId,
        currentQty: 0,
      };
    }
    return result;
  }

  const response = await apiClient.post<{ data: StockLookupResult[] }>(
    `/api/v1/pos/inventory/stock/batch`,
    { productIds }
  );

  // Convert array to map for easier lookup
  const result: StockBatchResult = {};
  for (const stock of response.data) {
    result[stock.productId] = stock;
  }
  return result;
}

// =============================================================================
// INVENTORY TRANSACTIONS
// =============================================================================

/**
 * Record a sale transaction (decrements stock).
 * Uses saleId as idempotency key via referenceId.
 */
export async function recordSaleTransaction(
  saleId: string,
  items: InventoryTransactionItem[],
  notes?: string
): Promise<InventoryTransactionResponse> {
  if (!(await isOnline())) {
    // Queue for offline sync - for now just return empty
    // Offline sales will sync inventory when device comes online
    return { entries: [] };
  }

  const response = await apiClient.post<{ data: InventoryTransactionResponse }>(
    `/api/v1/pos/inventory/transactions`,
    {
      items,
      transactionType: "sale",
      referenceType: "sale",
      referenceId: saleId,
      notes,
    }
  );
  return response.data;
}

/**
 * Record a sale return transaction (increments stock).
 */
export async function recordSaleReturnTransaction(
  returnId: string,
  items: InventoryTransactionItem[],
  notes?: string
): Promise<InventoryTransactionResponse> {
  if (!(await isOnline())) {
    return { entries: [] };
  }

  const response = await apiClient.post<{ data: InventoryTransactionResponse }>(
    `/api/v1/pos/inventory/transactions`,
    {
      items,
      transactionType: "sale_return",
      referenceType: "return",
      referenceId: returnId,
      notes,
    }
  );
  return response.data;
}
