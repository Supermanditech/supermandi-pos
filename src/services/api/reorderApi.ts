// Reorder API Service - V3.0.9 compliant
// Frontend API client for reorder operations

import { apiClient } from "./apiClient";

// =============================================================================
// TYPES
// =============================================================================

export type PendingReorderStatus = "pending" | "approved" | "dismissed" | "expired";

export interface PendingReorder {
  id: string;
  storeId: string;
  productId: string;
  productName: string;
  barcode: string | null;
  currentStock: number;
  minThreshold: number;
  targetStock: number;
  suggestedQuantity: number;
  suggestedSupplierId: string | null;
  suggestedSupplierName: string | null;
  suggestedUnitPrice: number | null;
  supplierProductId: string | null;
  status: PendingReorderStatus;
  dismissedReason: string | null;
  purchaseOrderId: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ListPendingResponse {
  success: boolean;
  data: PendingReorder[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
}

export interface DraftPurchaseOrderItem {
  pendingReorderId: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  supplierProductId: string | null;
}

export interface DraftPurchaseOrder {
  supplierId: string;
  supplierName: string;
  items: DraftPurchaseOrderItem[];
  totalAmount: number;
}

export interface ApproveResponse {
  success: boolean;
  data: {
    approvedCount: number;
    draftPurchaseOrders: DraftPurchaseOrder[];
  };
  message: string;
}

export interface DismissResponse {
  success: boolean;
  data: PendingReorder;
  message: string;
}

export interface GetPendingResponse {
  success: boolean;
  data: PendingReorder;
}

// Settings Types
export interface ReorderSettings {
  storeId: string;
  reorderEnabled: boolean;
  requireApproval: boolean;
  autoApproveThreshold: number | null;
  defaultLeadDays: number;
  createdAt: string;
  updatedAt: string;
}

export interface GetSettingsResponse {
  success: boolean;
  data: ReorderSettings;
}

export interface UpdateSettingsRequest {
  reorderEnabled?: boolean;
  requireApproval?: boolean;
  autoApproveThreshold?: number | null;
  defaultLeadDays?: number;
}

export interface UpdateSettingsResponse {
  success: boolean;
  data: ReorderSettings;
  message: string;
}

// Policy Types
export interface ReorderPolicy {
  id: string;
  storeId: string;
  productId: string;
  productName: string;
  barcode: string | null;
  minThreshold: number;
  targetStock: number;
  preferredSupplierId: string | null;
  preferredSupplierName: string | null;
  isEnabled: boolean;
  currentStock: number;
  createdAt: string;
  updatedAt: string;
}

export interface ListPoliciesResponse {
  success: boolean;
  data: ReorderPolicy[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
}

export interface GetPolicyResponse {
  success: boolean;
  data: ReorderPolicy;
}

export interface UpdatePolicyRequest {
  minThreshold?: number;
  targetStock?: number;
  preferredSupplierId?: string | null;
  isEnabled?: boolean;
}

export interface UpdatePolicyResponse {
  success: boolean;
  data: ReorderPolicy;
  message: string;
}

export interface BulkUpdatePoliciesRequest {
  policies: Array<{
    productId: string;
    minThreshold?: number;
    targetStock?: number;
    preferredSupplierId?: string | null;
    isEnabled?: boolean;
  }>;
}

export interface BulkUpdatePoliciesResponse {
  success: boolean;
  data: {
    updatedCount: number;
    policies: ReorderPolicy[];
  };
  message: string;
}

// =============================================================================
// API FUNCTIONS
// =============================================================================

const REORDER_BASE = "/api/v1/reorder";

/**
 * List pending reorders for a store.
 */
export async function listPendingReorders(
  storeId: string,
  params?: {
    status?: PendingReorderStatus;
    limit?: number;
    offset?: number;
  }
): Promise<ListPendingResponse> {
  const query = new URLSearchParams();

  if (params?.status) {
    query.set("status", params.status);
  }
  if (params?.limit && params.limit > 0) {
    query.set("limit", String(params.limit));
  }
  if (params?.offset && params.offset > 0) {
    query.set("offset", String(params.offset));
  }

  const queryString = query.toString();
  const path = `${REORDER_BASE}/stores/${storeId}/reorder/pending${queryString ? `?${queryString}` : ""}`;

  return apiClient.get<ListPendingResponse>(path);
}

/**
 * Get a single pending reorder.
 */
export async function getPendingReorder(
  storeId: string,
  pendingId: string
): Promise<PendingReorder> {
  const path = `${REORDER_BASE}/stores/${storeId}/reorder/pending/${pendingId}`;
  const response = await apiClient.get<GetPendingResponse>(path);
  return response.data;
}

/**
 * Approve selected pending reorders.
 * Returns draft purchase orders grouped by supplier.
 */
export async function approvePendingReorders(
  storeId: string,
  ids: string[]
): Promise<ApproveResponse> {
  const path = `${REORDER_BASE}/stores/${storeId}/reorder/pending/approve`;
  return apiClient.post<ApproveResponse>(path, { ids });
}

/**
 * Dismiss a pending reorder with a reason.
 */
export async function dismissPendingReorder(
  storeId: string,
  pendingId: string,
  reason: string
): Promise<DismissResponse> {
  const path = `${REORDER_BASE}/stores/${storeId}/reorder/pending/${pendingId}/dismiss`;
  return apiClient.post<DismissResponse>(path, { reason });
}

// =============================================================================
// SETTINGS API FUNCTIONS
// =============================================================================

/**
 * Get reorder settings for a store.
 */
export async function getReorderSettings(
  storeId: string
): Promise<ReorderSettings> {
  const path = `${REORDER_BASE}/stores/${storeId}/reorder/settings`;
  const response = await apiClient.get<GetSettingsResponse>(path);
  return response.data;
}

/**
 * Update reorder settings for a store.
 */
export async function updateReorderSettings(
  storeId: string,
  settings: UpdateSettingsRequest
): Promise<ReorderSettings> {
  const path = `${REORDER_BASE}/stores/${storeId}/reorder/settings`;
  const response = await apiClient.patch<UpdateSettingsResponse>(path, settings);
  return response.data;
}

// =============================================================================
// POLICIES API FUNCTIONS
// =============================================================================

/**
 * List reorder policies for a store.
 */
export async function listReorderPolicies(
  storeId: string,
  params?: {
    search?: string;
    isEnabled?: boolean;
    limit?: number;
    offset?: number;
  }
): Promise<ListPoliciesResponse> {
  const query = new URLSearchParams();

  if (params?.search) {
    query.set("search", params.search);
  }
  if (params?.isEnabled !== undefined) {
    query.set("isEnabled", String(params.isEnabled));
  }
  if (params?.limit && params.limit > 0) {
    query.set("limit", String(params.limit));
  }
  if (params?.offset && params.offset > 0) {
    query.set("offset", String(params.offset));
  }

  const queryString = query.toString();
  const path = `${REORDER_BASE}/stores/${storeId}/reorder/policies${queryString ? `?${queryString}` : ""}`;

  return apiClient.get<ListPoliciesResponse>(path);
}

/**
 * Get a single reorder policy.
 */
export async function getReorderPolicy(
  storeId: string,
  productId: string
): Promise<ReorderPolicy> {
  const path = `${REORDER_BASE}/stores/${storeId}/reorder/policies/${productId}`;
  const response = await apiClient.get<GetPolicyResponse>(path);
  return response.data;
}

/**
 * Update a reorder policy.
 */
export async function updateReorderPolicy(
  storeId: string,
  productId: string,
  updates: UpdatePolicyRequest
): Promise<ReorderPolicy> {
  const path = `${REORDER_BASE}/stores/${storeId}/reorder/policies/${productId}`;
  const response = await apiClient.patch<UpdatePolicyResponse>(path, updates);
  return response.data;
}

/**
 * Bulk update reorder policies.
 */
export async function bulkUpdatePolicies(
  storeId: string,
  request: BulkUpdatePoliciesRequest
): Promise<BulkUpdatePoliciesResponse> {
  const path = `${REORDER_BASE}/stores/${storeId}/reorder/policies/bulk`;
  return apiClient.patch<BulkUpdatePoliciesResponse>(path, request);
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Calculate stock deficit (how many units below threshold)
 */
export function getStockDeficit(pending: PendingReorder): number {
  return Math.max(0, pending.minThreshold - pending.currentStock);
}

/**
 * Check if stock is critically low (below 50% of threshold)
 */
export function isCriticallyLow(pending: PendingReorder): boolean {
  return pending.currentStock < pending.minThreshold * 0.5;
}

/**
 * Calculate estimated total for a pending reorder
 */
export function getEstimatedTotal(pending: PendingReorder): number {
  if (!pending.suggestedUnitPrice) return 0;
  return pending.suggestedQuantity * pending.suggestedUnitPrice;
}
