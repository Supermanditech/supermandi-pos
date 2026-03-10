const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '') as string;
import { getAuthHeaders, fetchWithTimeout } from "./authToken";

export type HealthResponse = { status: string };

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

