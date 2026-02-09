// SA-P1-004: GRN Excess Receipt Alerts API client
import { getAuthHeaders, fetchWithTimeout } from "./authToken";
import { sanitizeErrorMessage } from "./errorSanitizer";

const API_BASE = import.meta.env.VITE_API_BASE_URL as string | undefined;

function requireApiBase(): string {
  if (!API_BASE) {
    throw new Error("VITE_API_BASE_URL is missing");
  }
  return API_BASE;
}

export type GrnExcessAlert = {
  id: string;
  store_id: string;
  store_name: string | null;
  purchase_order_id: string;
  order_number: string | null;
  order_item_id: string;
  receive_id: string;
  product_name: string;
  ordered_qty: number;
  total_received_qty: number;
  excess_qty: number;
  excess_pct: number;
  status: "OPEN" | "ACKNOWLEDGED" | "DISMISSED";
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  notes: string | null;
  created_at: string;
};

export type GrnAlertsResponse = {
  alerts: GrnExcessAlert[];
  pagination: { total: number; limit: number; offset: number };
  openCount: number;
};

export async function fetchGrnAlerts(params?: {
  status?: string;
  storeId?: string;
  limit?: number;
  offset?: number;
}): Promise<GrnAlertsResponse> {
  const base = requireApiBase();
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.storeId) qs.set("storeId", params.storeId);
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.offset) qs.set("offset", String(params.offset));

  const url = `${base}/api/v1/admin/grn/alerts${qs.toString() ? `?${qs}` : ""}`;
  const res = await fetchWithTimeout(url, {
    cache: "no-store",
    headers: { Accept: "application/json", ...getAuthHeaders() },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) throw new Error("Unauthorized");
    throw new Error(sanitizeErrorMessage(data?.error ? String(data.error) : null, `Request failed (${res.status})`));
  }
  return data as GrnAlertsResponse;
}

export async function updateGrnAlert(
  alertId: string,
  input: { status: "ACKNOWLEDGED" | "DISMISSED"; notes?: string }
): Promise<{ alert: GrnExcessAlert }> {
  const base = requireApiBase();
  const res = await fetchWithTimeout(`${base}/api/v1/admin/grn/alerts/${alertId}`, {
    method: "PATCH",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) throw new Error("Unauthorized");
    const msg = data?.error?.message || data?.error || `Request failed (${res.status})`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return data as { alert: GrnExcessAlert };
}
