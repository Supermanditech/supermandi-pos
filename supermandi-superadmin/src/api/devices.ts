import { getAuthHeaders, fetchWithTimeout } from "./authToken";
import { sanitizeErrorMessage } from "./errorSanitizer";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '') as string;

export type DeviceRecord = {
  id: string;
  store_id?: string | null;
  store_name?: string | null;
  active: boolean;
  label?: string | null;
  device_type?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  android_version?: string | null;
  app_version?: string | null;
  printing_mode?: string | null;
  scan_lookup_v2_enabled?: boolean | null; // P1-SADM-001: V2 scan lookup toggle
  last_seen_online: string | null;
  last_sync_at: string | null;
  pending_outbox_count: number;
  created_at?: string | null;
  updated_at?: string | null;
};

async function parseError(res: Response): Promise<string> {
  const fallback = `Request failed (${res.status})`;
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (res.status === 503 && data.error === "admin_disabled") return "Admin disabled (ADMIN_TOKEN missing)";
  // POST-BATCH-018-FIX-002: No hard redirect — let caller handle auth errors
  if (res.status === 401) {
    return "Unauthorized — session may have expired";
  }
  // GL-CRIT-0055: Sanitize error messages
  return sanitizeErrorMessage(data.error, fallback);
}

// ADMIN-PAGINATION-001: Paginated response type
export type PaginatedResponse<T> = { items: T[]; total: number; limit: number; offset: number };

export async function fetchDevices(params?: { storeId?: string; deviceId?: string; limit?: number; offset?: number }): Promise<PaginatedResponse<DeviceRecord>> {
  const url = new URL(`${API_BASE}/api/v1/admin/devices`, window.location.origin);
  if (params?.storeId?.trim()) url.searchParams.set("storeId", params.storeId.trim());
  if (params?.deviceId?.trim()) url.searchParams.set("deviceId", params.deviceId.trim());
  if (params?.limit) url.searchParams.set("limit", String(params.limit));
  if (params?.offset) url.searchParams.set("offset", String(params.offset));

  const res = await fetchWithTimeout(url.toString(), {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...getAuthHeaders(),
    }
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  const data = (await res.json().catch(() => ({}))) as { devices?: DeviceRecord[]; total?: number; limit?: number; offset?: number };
  return {
    items: Array.isArray(data.devices) ? data.devices : [],
    total: data.total ?? 0,
    limit: data.limit ?? 50,
    offset: data.offset ?? 0,
  };
}

export type DevicePatchInput = {
  label?: string;
  deviceType?: string;
  printingMode?: string;
  scanLookupV2Enabled?: boolean; // P1-SADM-001: V2 scan lookup toggle
  active?: boolean;
  resetToken?: boolean;
};

export async function patchDevice(deviceId: string, input: DevicePatchInput): Promise<DeviceRecord> {
  const res = await fetchWithTimeout(`${API_BASE}/api/v1/admin/devices/${encodeURIComponent(deviceId)}`, {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify(input)
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  const data = (await res.json().catch(() => ({}))) as { device?: DeviceRecord };
  if (!data.device) {
    throw new Error("Device response missing");
  }
  return data.device;
}
