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
  // STAGING-FIX-012: Throw on non-JSON errors (429, 401, etc.) so caller can show error message
  if (!res.ok && res.status !== 503) {
    throw new Error(`Health check failed (${res.status})`);
  }
  // Health endpoint returns 503 for degraded — still valid JSON
  const json = await res.json();
  // STAGING-FIX-012: Validate response shape to prevent React crash on unexpected JSON
  if (!json.checks || typeof json.checks !== 'object') {
    throw new Error(`Unexpected health response (status ${res.status})`);
  }
  return json;
}

export async function triggerTokenCleanup(): Promise<TokenCleanupResult> {
  const res = await fetchWithTimeout(`${base()}/api/v1/admin/jobs/token-cleanup`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Token cleanup failed. Please try again.');
  const json = await res.json();
  return { deactivated: json.deactivated || 0, deleted: json.deleted || 0 };
}
