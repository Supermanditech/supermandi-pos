// SA-P1-010: Anomaly Detection & Alerting API client
import { getAuthHeaders, fetchWithTimeout } from "./authToken";
import { sanitizeErrorMessage } from "./errorSanitizer";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '') as string;

export type AnomalyAlert = {
  id: string;
  storeId: string;
  storeName: string | null;
  anomalyType: string;
  severity: "critical" | "warning" | "info";
  description: string;
  metadata: Record<string, unknown>;
  isReviewed: boolean;
  detectedAt: string;
};

export type AnomalyAlertsResponse = {
  alerts: AnomalyAlert[];
  pagination: { total: number; limit: number; offset: number };
};

export type AlertSummary = {
  summary: { critical: number; warning: number; info: number; total: number };
};

export async function fetchAnomalyAlerts(params?: {
  severity?: string;
  storeId?: string;
  reviewed?: string;
  limit?: number;
  offset?: number;
}): Promise<AnomalyAlertsResponse> {
  const qs = new URLSearchParams();
  if (params?.severity) qs.set("severity", params.severity);
  if (params?.storeId) qs.set("storeId", params.storeId);
  if (params?.reviewed) qs.set("reviewed", params.reviewed);
  if (params?.limit) qs.set("limit", String(params.limit));
  // R3-API-003: offset=0 is falsy but valid — use != null check
  if (params?.offset != null) qs.set("offset", String(params.offset));

  const url = `${API_BASE}/api/v1/admin/anomaly-alerts${qs.toString() ? `?${qs}` : ""}`;
  const res = await fetchWithTimeout(url, {
    cache: "no-store",
    headers: { Accept: "application/json", ...getAuthHeaders() },
  });
  const data = await res.json().catch(() => ({ _parseError: true }));
  if (!res.ok) {
    if (res.status === 401) throw new Error("Unauthorized");
    throw new Error(sanitizeErrorMessage(data?.error ? String(data.error) : null, `Request failed (${res.status})`));
  }
  return data as AnomalyAlertsResponse;
}

export async function acknowledgeAlert(id: string): Promise<{ alert: { id: string; isReviewed: boolean } }> {
  // R3-SEC-004: Encode path params to prevent URL traversal
  const res = await fetchWithTimeout(`${API_BASE}/api/v1/admin/anomaly-alerts/${encodeURIComponent(id)}/acknowledge`, {
    method: "POST",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: "{}",
  });
  const data = await res.json().catch(() => ({ _parseError: true }));
  if (!res.ok) {
    if (res.status === 401) throw new Error("Unauthorized");
    const msg = data?.error?.message || data?.error || `Request failed (${res.status})`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return data as { alert: { id: string; isReviewed: boolean } };
}

export async function fetchAlertSummary(): Promise<AlertSummary> {
  const res = await fetchWithTimeout(`${API_BASE}/api/v1/admin/anomaly-alerts/summary`, {
    cache: "no-store",
    headers: { Accept: "application/json", ...getAuthHeaders() },
  });
  const data = await res.json().catch(() => ({ _parseError: true }));
  if (!res.ok) {
    if (res.status === 401) throw new Error("Unauthorized");
    throw new Error(sanitizeErrorMessage(data?.error ? String(data.error) : null, `Request failed (${res.status})`));
  }
  return data as AlertSummary;
}
