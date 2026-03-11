// SA-P1-015: Reorder Policy Supervision — API client
import { getAuthHeaders, fetchWithTimeout } from "./authToken";
import { sanitizeErrorMessage } from "./errorSanitizer";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '') as string;

function requireApiBase(): string {
  return API_BASE;
}

// =============================================================================
// TYPES
// =============================================================================

export type ReorderPolicyRecord = {
  id: string;
  storeId: string;
  storeName: string | null;
  productId: string;
  productName: string | null;
  minStock: number;
  targetStock: number;
  maxReorderQty: number | null;
  preferredSupplierId: string | null;
  supplierName: string | null;
  isEnabled: boolean;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ReorderPoliciesResponse = {
  policies: ReorderPolicyRecord[];
  pagination: { total: number; limit: number; offset: number };
};

export type ReorderAuditEntry = {
  id: string;
  adminId: string | null;
  adminEmail: string | null;
  method: string;
  route: string;
  statusCode: number;
  entityType: string | null;
  entityId: string | null;
  storeName?: string | null;
  productName?: string | null;
  changes: Record<string, unknown> | null;
  createdAt: string;
};

export type ReorderAuditLogResponse = {
  auditLog: ReorderAuditEntry[];
  pagination: { total: number; limit: number; offset: number };
};

// =============================================================================
// FETCH FUNCTIONS
// =============================================================================

export async function fetchReorderPolicies(params?: {
  storeId?: string;
  enabledOnly?: boolean;
  limit?: number;
  offset?: number;
}): Promise<ReorderPoliciesResponse> {
  const base = requireApiBase();
  const qs = new URLSearchParams();
  if (params?.storeId) qs.set("storeId", params.storeId);
  if (params?.enabledOnly) qs.set("enabledOnly", "true");
  if (params?.limit) qs.set("limit", String(params.limit));
  // R3-API-003: offset=0 is falsy but valid — use != null check
  if (params?.offset != null) qs.set("offset", String(params.offset));

  const url = `${base}/api/v1/admin/reorder/policies${qs.toString() ? `?${qs}` : ""}`;
  const res = await fetchWithTimeout(url, {
    cache: "no-store",
    headers: { Accept: "application/json", ...getAuthHeaders() },
  });
  const data = await res.json().catch(() => ({ _parseError: true }));
  if (!res.ok) {
    if (res.status === 401) throw new Error("Unauthorized");
    throw new Error(sanitizeErrorMessage(data?.error ? String(data.error) : null, `Request failed (${res.status})`));
  }
  return data as ReorderPoliciesResponse;
}

export async function fetchReorderAuditLog(params?: {
  storeId?: string;
  limit?: number;
  offset?: number;
}): Promise<ReorderAuditLogResponse> {
  const base = requireApiBase();
  const qs = new URLSearchParams();
  if (params?.storeId) qs.set("storeId", params.storeId);
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.offset != null) qs.set("offset", String(params.offset));

  const url = `${base}/api/v1/admin/reorder/policies/audit-log${qs.toString() ? `?${qs}` : ""}`;
  const res = await fetchWithTimeout(url, {
    cache: "no-store",
    headers: { Accept: "application/json", ...getAuthHeaders() },
  });
  const data = await res.json().catch(() => ({ _parseError: true }));
  if (!res.ok) {
    if (res.status === 401) throw new Error("Unauthorized");
    throw new Error(sanitizeErrorMessage(data?.error ? String(data.error) : null, `Request failed (${res.status})`));
  }
  return data as ReorderAuditLogResponse;
}
