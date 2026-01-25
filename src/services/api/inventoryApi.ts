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

/**
 * Record a manual stock inward transaction (increments stock).
 * GO-LIVE-004: For stock-in without a PO.
 * ITER2-001 (AUD-074-A): Added supplierId/supplierName for traceability
 */
export async function recordManualInward(
  items: InventoryTransactionItem[],
  notes?: string,
  supplier?: { id?: string; name?: string } | null
): Promise<InventoryTransactionResponse> {
  if (!(await isOnline())) {
    throw new Error("Offline mode not supported for stock inward");
  }

  // Generate a unique reference ID for this inward batch
  const referenceId = `INWARD-${Date.now()}`;

  const response = await apiClient.post<{ data: InventoryTransactionResponse }>(
    `/api/v1/pos/inventory/transactions`,
    {
      items,
      transactionType: "purchase_received",
      referenceType: "manual",
      referenceId,
      notes,
      // ITER2-001: Pass supplier info for backend traceability
      supplierId: supplier?.id || undefined,
      supplierName: supplier?.name || undefined,
    }
  );
  return response.data;
}

// =============================================================================
// REPORTS - GO-LIVE-006/007/008
// =============================================================================

export interface LedgerQueryParams {
  transactionType?: string;
  referenceType?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export interface LedgerQueryResponse {
  entries: LedgerEntry[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

/**
 * Get ledger entries for reports.
 * GO-LIVE-006: Purchase History, GO-LIVE-007: Sales Statement
 */
export async function getLedgerEntries(
  params?: LedgerQueryParams
): Promise<LedgerQueryResponse> {
  const storeId = await getDeviceStoreId();
  if (!storeId) {
    throw new Error("Store not configured");
  }

  if (!(await isOnline())) {
    return { entries: [], pagination: { total: 0, limit: 50, offset: 0, hasMore: false } };
  }

  const query = new URLSearchParams();
  if (params?.transactionType) query.set("transactionType", params.transactionType);
  if (params?.referenceType) query.set("referenceType", params.referenceType);
  if (params?.startDate) query.set("startDate", params.startDate);
  if (params?.endDate) query.set("endDate", params.endDate);
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.offset) query.set("offset", String(params.offset));

  const queryString = query.toString();
  const path = `/api/v1/pos/inventory/ledger${queryString ? `?${queryString}` : ""}`;

  try {
    const response = await apiClient.get<{ data: LedgerEntry[]; pagination?: any }>(path);
    return {
      entries: response.data,
      pagination: response.pagination ?? {
        total: response.data.length,
        limit: params?.limit ?? 50,
        offset: params?.offset ?? 0,
        hasMore: false,
      },
    };
  } catch (error) {
    // If endpoint doesn't exist, return empty
    console.warn("Ledger endpoint not available:", error);
    return { entries: [], pagination: { total: 0, limit: 50, offset: 0, hasMore: false } };
  }
}

/**
 * Get purchase history (purchase_received transactions).
 * GO-LIVE-006
 */
export async function getPurchaseHistory(
  startDate?: string,
  endDate?: string
): Promise<LedgerEntry[]> {
  const result = await getLedgerEntries({
    transactionType: "purchase_received",
    startDate,
    endDate,
    limit: 100,
  });
  return result.entries;
}

/**
 * Get sales history (sale transactions).
 * GO-LIVE-007
 */
export async function getSalesHistory(
  startDate?: string,
  endDate?: string
): Promise<LedgerEntry[]> {
  const result = await getLedgerEntries({
    transactionType: "sale",
    startDate,
    endDate,
    limit: 100,
  });
  return result.entries;
}

// =============================================================================
// AUD-074-B: STOCK STATEMENT (ACTUAL INVENTORY)
// =============================================================================

export interface StockStatementItem {
  id: string;
  productId: string;
  displayName: string;
  barcode: string;
  sellPrice: number;
  purchasePrice: number;
  currentStock: number;
  stockValue: number;
  mrp: number;
  unit: string;
}

export interface StockStatementResponse {
  success: boolean;
  data: StockStatementItem[];
  meta: {
    count: number;
    limit: number;
    includeZeroStock: boolean;
    source: string;
  };
}

/**
 * Get complete stock statement with ACTUAL inventory from inventory.stock_balances
 * AUD-074-B FIX: Returns real store inventory, not supplier/cached stock
 * GO-LIVE-008
 *
 * @param limit - Maximum items to return (default 200, max 500)
 * @param includeZeroStock - Include items with 0 stock (default true)
 */
export async function getStockStatement(
  limit: number = 200,
  includeZeroStock: boolean = true
): Promise<StockStatementResponse> {
  const storeId = await getDeviceStoreId();
  if (!storeId) {
    throw new Error("Store not configured");
  }

  if (!(await isOnline())) {
    // Return empty for offline mode
    return {
      success: false,
      data: [],
      meta: { count: 0, limit, includeZeroStock, source: 'offline' },
    };
  }

  const query = new URLSearchParams();
  query.set("limit", String(Math.min(limit, 500)));
  query.set("includeZeroStock", String(includeZeroStock));

  const response = await apiClient.get<StockStatementResponse>(
    `/api/v1/pos/inventory/statement?${query.toString()}`
  );

  return response;
}
