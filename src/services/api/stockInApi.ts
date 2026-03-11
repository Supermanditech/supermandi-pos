// Stock-In API for Counter Purchase / Ledger Entry
// Records stock received at the counter from suppliers

import { apiClient } from "./apiClient";

// =============================================================================
// TYPES
// =============================================================================

export interface StockInItem {
  barcode: string;
  productName: string;
  quantity: number;
  buyPrice: number;      // Cost price per unit
  sellPrice: number;     // Retail price per unit
  isNewProduct?: boolean; // Flag for products not yet in catalog
  // SCALE-C1: Optional batch tracking for FEFO and recall traceability
  batchNumber?: string | null;
  expiryDate?: string | null; // ISO date YYYY-MM-DD
}

export interface StockInPayload {
  supplierId?: string;    // Optional - may be walk-in/unknown supplier
  supplierName?: string;  // For display/reference
  supplierGstin?: string; // SA-P0-004: Optional GSTIN for walk-in suppliers
  orderId?: string;       // T-207: Optional PO reference for validation
  items: StockInItem[];
  notes?: string;
  totalAmount: number;    // Sum of (qty * buyPrice) for all items
}

interface StockInResponse {
  success: boolean;
  data: {
    ledgerEntryId: string;
    itemsProcessed: number;
    totalAmount: number;
    createdAt: string;
  };
}

interface StockInListResponse {
  success: boolean;
  data: {
    entries: StockInEntry[];
  };
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
}

export interface StockInEntry {
  id: string;
  supplierId?: string;
  supplierName?: string;
  itemCount: number;
  totalAmount: number;
  createdAt: string;
  status: "pending" | "completed" | "cancelled";
}

// =============================================================================
// API FUNCTIONS
// =============================================================================

const STOCK_IN_BASE = "/api/v1/pos/stock-in";

// GATE-000: DEMO_MODE flag removed - now controlled by ReadinessGate
// The PurchaseScreen component checks isFeatureReady("stockIn") before calling this API.
// If the API is not ready, PurchaseScreen shows a warning and uses local demo mode.

/**
 * Submit a stock-in ledger entry.
 * Records products received from supplier at the counter.
 *
 * GATE-000: This function now always attempts the real API call.
 * The caller (PurchaseScreen) is responsible for checking endpoint readiness
 * via ReadinessGate before calling this function.
 *
 * If the endpoint is not deployed, this will throw an error that the caller should handle.
 */
export async function submitStockIn(payload: StockInPayload): Promise<{
  ledgerEntryId: string;
  itemsProcessed: number;
  totalAmount: number;
  createdAt: string;
}> {
  try {
    const response = await apiClient.post<StockInResponse>(STOCK_IN_BASE, payload);
    return response.data;
  } catch (error) {
    console.error("[stockInApi] submitStockIn failed:", error);
    throw error;
  }
}

/**
 * Submit a stock-in ledger entry in demo mode (local only, no API call).
 * Used when ReadinessGate indicates the stock-in API is not available.
 *
 * @returns Mock response with demo ledger entry ID
 */
export async function submitStockInDemo(payload: StockInPayload): Promise<{
  ledgerEntryId: string;
  itemsProcessed: number;
  totalAmount: number;
  createdAt: string;
}> {
  console.log("[stockInApi] DEMO MODE - Mock stock-in submission:", payload);
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 500));
  return {
    ledgerEntryId: `DEMO-${Date.now()}`,
    itemsProcessed: payload.items.length,
    totalAmount: payload.totalAmount,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Get recent stock-in entries for the current store.
 */
export async function getStockInHistory(options?: {
  limit?: number;
  offset?: number;
  status?: "pending" | "completed" | "cancelled";
}): Promise<{
  entries: StockInEntry[];
  pagination: { total: number; limit: number; offset: number };
}> {
  try {
    const params = new URLSearchParams();
    if (options?.limit) params.set("limit", String(options.limit));
    if (options?.offset) params.set("offset", String(options.offset));
    if (options?.status) params.set("status", options.status);

    const queryString = params.toString();
    const url = queryString ? `${STOCK_IN_BASE}?${queryString}` : STOCK_IN_BASE;

    const response = await apiClient.get<StockInListResponse>(url);
    return {
      entries: response.data?.entries ?? [],
      pagination: response.pagination ?? { total: 0, limit: 20, offset: 0 },
    };
  } catch (error) {
    console.error("[stockInApi] getStockInHistory failed:", error);
    return {
      entries: [],
      pagination: { total: 0, limit: 20, offset: 0 },
    };
  }
}

/**
 * Cancel a pending stock-in entry.
 */
export async function cancelStockIn(entryId: string): Promise<void> {
  try {
    await apiClient.del(`${STOCK_IN_BASE}/${entryId}`);
  } catch (error) {
    console.error("[stockInApi] cancelStockIn failed:", error);
    throw error;
  }
}
