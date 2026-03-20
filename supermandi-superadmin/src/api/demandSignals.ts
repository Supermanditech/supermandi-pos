/**
 * V3-HARDEN-185: SuperAdmin demand signal API consumer
 * Canonical contract: GET /admin/demand-signals/pressure, /store/:storeId, POST /recompute
 */

import { getAuthHeaders, fetchWithTimeout } from "./authToken";
import { sanitizeErrorMessage } from "./errorSanitizer";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '') as string;

export interface DemandPressureItem {
  productId: string;
  productName: string;
  totalStores: number;
  storesNeedingReorder: number;
  avgDaysOfStock: number;
  totalPendingInbound: number;
}

export interface DemandPressureResponse {
  computedAt: string;
  totalProducts: number;
  pressure: DemandPressureItem[];
}

export interface StoreDemandSignal {
  storeId: string;
  productId: string;
  productName: string;
  currentStock: number;
  dailyVelocity: number;
  daysOfStock: number;
  pendingInbound: number;
  needsReorder: boolean;
  computedAt: string;
  snapshotVersion: number;
}

export interface StoreDemandResponse {
  storeId: string;
  totalProducts: number;
  needsReorderCount: number;
  criticalCount: number;
  computedAt: string;
  snapshotVersion: number;
  signals: StoreDemandSignal[];
}

export async function getDemandPressure(limit: number = 50): Promise<DemandPressureResponse> {
  const res = await fetchWithTimeout(`${API_BASE}/api/v1/admin/demand-signals/pressure?limit=${limit}`, {
    headers: { Accept: "application/json", ...getAuthHeaders() },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(sanitizeErrorMessage(data?.error, `Request failed (${res.status})`));
  return data.data;
}

export async function getStoreDemandSignals(storeId: string): Promise<StoreDemandResponse> {
  const res = await fetchWithTimeout(`${API_BASE}/api/v1/admin/demand-signals/store/${storeId}`, {
    headers: { Accept: "application/json", ...getAuthHeaders() },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(sanitizeErrorMessage(data?.error, `Request failed (${res.status})`));
  return data.data;
}

export async function recomputeDemandSignals(storeId?: string): Promise<void> {
  const res = await fetchWithTimeout(`${API_BASE}/api/v1/admin/demand-signals/recompute`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(storeId ? { storeId } : {}),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(sanitizeErrorMessage(data?.error, `Recompute failed (${res.status})`));
  }
}
