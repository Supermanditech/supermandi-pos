/**
 * SA-P1-010: Anomaly Alerts API client for SuperAdmin UI
 *
 * - fetchAnomalyAlerts(filters) — paginated list with severity/store/reviewed filters
 * - acknowledgeAlert(id) — mark alert as reviewed
 * - fetchAlertSummary() — count by severity (critical/warning/info)
 */

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '') as string;
import { getAuthHeaders, fetchWithTimeout } from "./authToken";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AnomalyAlert {
  id: string;
  storeId: string;
  storeName: string | null;
  alertType: string;
  severity: "critical" | "warning" | "info";
  title: string;
  message: string;
  metadata: Record<string, unknown>;
  isRead: boolean;
  isDismissed: boolean;
  createdAt: string;
}

export interface AnomalyAlertSummary {
  critical: number;
  warning: number;
  info: number;
  total: number;
}

export interface AnomalyAlertFilters {
  severity?: string;
  storeId?: string;
  reviewed?: boolean;
  limit?: number;
  offset?: number;
}

// ─── API Functions ──────────────────────────────────────────────────────────

function base(): string {
  return API_BASE || "";
}

export async function fetchAnomalyAlerts(
  filters: AnomalyAlertFilters = {}
): Promise<{ alerts: AnomalyAlert[]; total: number }> {
  const params = new URLSearchParams();
  if (filters.severity) params.set("severity", filters.severity);
  if (filters.storeId) params.set("storeId", filters.storeId);
  if (filters.reviewed !== undefined) params.set("reviewed", String(filters.reviewed));
  if (filters.limit) params.set("limit", String(filters.limit));
  if (filters.offset) params.set("offset", String(filters.offset));

  const qs = params.toString();
  const url = `${base()}/api/v1/admin/anomaly-alerts${qs ? `?${qs}` : ""}`;

  const res = await fetchWithTimeout(url, {
    headers: {
      Accept: "application/json",
      ...getAuthHeaders(),
    },
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error("Unauthorized — session may have expired");
    }
    const msg = json && typeof json === "object" && "error" in json
      ? String((json as Record<string, unknown>).error)
      : `Failed to fetch alerts (${res.status})`;
    throw new Error(msg);
  }

  const data = (json as Record<string, unknown>).data;
  const total = (json as Record<string, unknown>).total;

  return {
    alerts: Array.isArray(data) ? data.map(mapAlert) : [],
    total: typeof total === "number" ? total : 0,
  };
}

export async function acknowledgeAlert(id: string): Promise<void> {
  const res = await fetchWithTimeout(`${base()}/api/v1/admin/anomaly-alerts/${id}/acknowledge`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
  });

  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    if (res.status === 401) {
      throw new Error("Unauthorized — session may have expired");
    }
    const msg = json && typeof json === "object" && "error" in json
      ? String((json as Record<string, unknown>).error)
      : `Failed to acknowledge alert (${res.status})`;
    throw new Error(msg);
  }
}

export async function fetchAlertSummary(): Promise<AnomalyAlertSummary> {
  const res = await fetchWithTimeout(`${base()}/api/v1/admin/anomaly-alerts/summary`, {
    headers: {
      Accept: "application/json",
      ...getAuthHeaders(),
    },
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error("Unauthorized — session may have expired");
    }
    const msg = json && typeof json === "object" && "error" in json
      ? String((json as Record<string, unknown>).error)
      : `Failed to fetch alert summary (${res.status})`;
    throw new Error(msg);
  }

  const data = (json as Record<string, unknown>).data as Record<string, unknown> | undefined;

  return {
    critical: typeof data?.critical === "number" ? data.critical : 0,
    warning: typeof data?.warning === "number" ? data.warning : 0,
    info: typeof data?.info === "number" ? data.info : 0,
    total: typeof data?.total === "number" ? data.total : 0,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function mapAlert(raw: unknown): AnomalyAlert {
  const r = raw as Record<string, unknown>;
  return {
    id: String(r.id ?? ""),
    storeId: String(r.storeId ?? ""),
    storeName: r.storeName ? String(r.storeName) : null,
    alertType: String(r.alertType ?? ""),
    severity: (r.severity as AnomalyAlert["severity"]) || "info",
    title: String(r.title ?? ""),
    message: String(r.message ?? ""),
    metadata: (r.metadata as Record<string, unknown>) || {},
    isRead: Boolean(r.isRead),
    isDismissed: Boolean(r.isDismissed),
    createdAt: String(r.createdAt ?? ""),
  };
}
