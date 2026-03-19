/**
 * V3-HARDEN-185: Retailer demand signal API consumer
 * Canonical contract: GET /retailer-admin/demand-signals, /recommendations
 */

import { API_GATEWAY_BASE } from "./api";

export interface DemandSignal {
  storeId: string;
  productId: string;
  productName: string;
  barcode: string | null;
  currentStock: number;
  soldLast7Days: number;
  soldLast30Days: number;
  dailyVelocity: number;
  daysOfStock: number;
  pendingInbound: number;
  needsReorder: boolean;
  computedAt: string;
  snapshotVersion: number;
}

export interface DemandSignalResponse {
  storeId: string;
  totalProducts: number;
  needsReorderCount: number;
  criticalCount: number;
  computedAt: string;
  snapshotVersion: number;
  signals: DemandSignal[];
}

export interface ReorderRecommendation {
  productId: string;
  productName: string;
  barcode: string | null;
  currentStock: number;
  dailyVelocity: number;
  daysOfStock: number;
  suggestedQuantity: number;
  isRepeat: boolean;
}

export async function getDemandSignals(params?: {
  needsReorder?: boolean;
  sortBy?: "daysOfStock" | "velocity" | "stock";
  limit?: number;
}): Promise<DemandSignalResponse> {
  const q = new URLSearchParams();
  if (params?.needsReorder) q.set("needsReorder", "true");
  if (params?.sortBy) q.set("sortBy", params.sortBy);
  if (params?.limit) q.set("limit", String(params.limit));
  const qs = q.toString();

  const res = await fetch(`${API_GATEWAY_BASE}/api/v1/retailer-admin/demand-signals${qs ? `?${qs}` : ""}`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
  return data.data;
}

export async function getDemandRecommendations(): Promise<{
  storeId: string;
  computedAt: string;
  totalRecommendations: number;
  recommendations: ReorderRecommendation[];
}> {
  const res = await fetch(`${API_GATEWAY_BASE}/api/v1/retailer-admin/demand-signals/recommendations`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
  return data.data;
}
