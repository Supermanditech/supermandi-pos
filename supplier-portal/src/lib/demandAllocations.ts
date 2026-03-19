/**
 * V3-FIX-187: Supplier allocation API consumer
 * Canonical contract: GET /supplier/allocations, /:id, PATCH /:id/status
 */

import { getOrders } from "./api";

// Re-use the authenticated fetch from the existing supplier API client
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

async function supplierFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...init?.headers,
    },
    ...init,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
  return data.data ?? data;
}

export interface SupplierAllocation {
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

export async function listAllocations(
  params?: { status?: string; limit?: number; offset?: number }
): Promise<{ allocations: SupplierAllocation[]; total: number }> {
  const q = new URLSearchParams();
  if (params?.status) q.set("status", params.status);
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.offset) q.set("offset", String(params.offset));
  const qs = q.toString();

  const res = await fetch(`${API_BASE}/api/v1/supplier/allocations${qs ? `?${qs}` : ""}`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
  return { allocations: data.data ?? [], total: data.pagination?.total ?? 0 };
}

export async function getAllocation(id: string): Promise<SupplierAllocation> {
  return supplierFetch<SupplierAllocation>(`/api/v1/supplier/allocations/${id}`);
}

export async function updateAllocationStatus(
  id: string,
  status: string,
  payload?: Record<string, unknown>
): Promise<SupplierAllocation> {
  return supplierFetch<SupplierAllocation>(`/api/v1/supplier/allocations/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status, ...payload }),
  });
}
