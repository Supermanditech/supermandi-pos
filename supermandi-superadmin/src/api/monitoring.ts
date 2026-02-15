// T-223: Cloud Monitoring API client for SuperAdmin
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '') as string;
import { getAuthHeaders, fetchWithTimeout } from "./authToken";

export interface HealthCheck {
  status: string;
  latencyMs?: number;
  details?: string;
}

export interface HealthResponse {
  status: "healthy" | "degraded";
  timestamp: string;
  checks: Record<string, HealthCheck>;
  uptime: number;
  version: string;
}

export interface TokenCleanupResult {
  deactivated: number;
  deleted: number;
}

function base(): string {
  return API_BASE || "";
}

export async function fetchHealthStatus(): Promise<HealthResponse> {
  const res = await fetchWithTimeout(`${base()}/api/v1/admin/monitoring/health`, {
    headers: getAuthHeaders(),
  });
  // Health endpoint returns 503 for degraded — still valid JSON
  const json = await res.json();
  return json;
}

export async function triggerTokenCleanup(): Promise<TokenCleanupResult> {
  const res = await fetchWithTimeout(`${base()}/api/v1/admin/jobs/token-cleanup`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(`Token cleanup failed: ${res.status}`);
  const json = await res.json();
  return { deactivated: json.deactivated || 0, deleted: json.deleted || 0 };
}
