const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '') as string;
import { getAuthHeaders, fetchWithTimeout } from "./authToken";

export type HealthResponse = { status: string };

// SA-P1-009: Store health dashboard types
export interface StoreHealthFactor {
  name: string;
  status: "healthy" | "warning" | "critical";
  detail: string;
}

export interface StoreHealthEntry {
  id: string;
  name: string;
  code: string;
  status: string;
  healthScore: number;
  factors: StoreHealthFactor[];
}

export interface StoreHealthSummary {
  totalStores: number;
  healthyCount: number;
  warningCount: number;
  criticalCount: number;
}

export interface StoreHealthResponse {
  summary: StoreHealthSummary;
  stores: StoreHealthEntry[];
}

function requireApiBase(): string {
  return API_BASE;
}

export async function fetchHealth(): Promise<HealthResponse> {
  const base = requireApiBase();
  // GO-LIVE-SESSION: Use correct admin health endpoint path
  const res = await fetchWithTimeout(`${base}/api/v1/admin/health`, {
    method: "GET",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...getAuthHeaders(),
    }
  });

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error("Session expired or unauthorized. Please log in again.");
    }
    throw new Error(`Health check failed (${res.status})`);
  }

  const data = (await res.json()) as unknown;
  if (!data || typeof data !== "object" || !("status" in data)) {
    throw new Error("Invalid health response");
  }

  // R4-TS-001: Type-safe narrowing — `data` already verified to have "status" in data
  const status = (data as Record<string, unknown>).status;
  return { status: String(status) };
}

// SA-P1-009: Fetch aggregated store health dashboard data
export async function fetchStoreHealth(): Promise<StoreHealthResponse> {
  const base = requireApiBase();
  const res = await fetchWithTimeout(`${base}/api/v1/admin/stores/health`, {
    method: "GET",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...getAuthHeaders(),
    }
  });

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error("Session expired or unauthorized. Please log in again.");
    }
    throw new Error(`Store health fetch failed (${res.status})`);
  }

  const data = (await res.json()) as unknown;
  if (!data || typeof data !== "object" || !("summary" in data) || !("stores" in data)) {
    throw new Error("Invalid store health response");
  }

  return data as StoreHealthResponse;
}

