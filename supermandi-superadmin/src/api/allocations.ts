/**
 * V3-FIX-187: SuperAdmin allocation API consumer
 * Canonical contract: GET /admin/allocations/summary, /store/:storeId, /:id, POST, PATCH /:id/status
 */

import { getAuthHeaders, fetchWithTimeout } from "./authToken";
import { sanitizeErrorMessage } from "./errorSanitizer";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '') as string;

export interface AllocationRecord {
  id: string;
  retailerOrderId: string;
  supplierId: string;
  storeId: string;
  status: string;
  triggeredAt: string | null;
  acceptedAt: string | null;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AllocationSummary {
  total: number;
  byStatus: Record<string, number>;
}

export async function getAllocationSummary(): Promise<AllocationSummary> {
  const res = await fetchWithTimeout(`${API_BASE}/api/v1/admin/allocations/summary`, {
    headers: { Accept: "application/json", ...getAuthHeaders() },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(sanitizeErrorMessage(data?.error, `Request failed (${res.status})`));
  return data.data;
}

export async function getStoreAllocations(
  storeId: string,
  params?: { status?: string; limit?: number; offset?: number }
): Promise<{ allocations: AllocationRecord[]; total: number }> {
  const q = new URLSearchParams();
  if (params?.status) q.set("status", params.status);
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.offset) q.set("offset", String(params.offset));
  const qs = q.toString();

  const res = await fetchWithTimeout(`${API_BASE}/api/v1/admin/allocations/store/${storeId}${qs ? `?${qs}` : ""}`, {
    headers: { Accept: "application/json", ...getAuthHeaders() },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(sanitizeErrorMessage(data?.error, `Request failed (${res.status})`));
  return { allocations: data.data, total: data.pagination?.total ?? 0 };
}

export async function transitionAllocation(
  allocationId: string,
  status: string,
  reason?: string
): Promise<AllocationRecord> {
  const res = await fetchWithTimeout(`${API_BASE}/api/v1/admin/allocations/${allocationId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ status, reason }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(sanitizeErrorMessage(data?.error, `Transition failed (${res.status})`));
  return data.data;
}
