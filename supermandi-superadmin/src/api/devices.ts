import { getAuthHeaders, handle401Response } from "./authToken";
import { sanitizeErrorMessage } from "./errorSanitizer";

const API_BASE = import.meta.env.VITE_API_BASE_URL as string | undefined;

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
  // GO-LIVE-171: Handle 401 by redirecting to login
  if (res.status === 401) {
    handle401Response();
    return "Session expired. Redirecting to login...";
  }
  // GL-CRIT-0055: Sanitize error messages
  return sanitizeErrorMessage(data.error, fallback);
}

export async function fetchDevices(params?: { storeId?: string }): Promise<DeviceRecord[]> {
  if (!API_BASE) {
    throw new Error("VITE_API_BASE_URL is missing (set it in .env / hosting env vars)");
  }

  const storeId = params?.storeId?.trim();
  const qs = storeId ? `?storeId=${encodeURIComponent(storeId)}` : "";
  const res = await fetch(`${API_BASE}/api/v1/admin/devices${qs}`, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...getAuthHeaders(),
    }
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  const data = (await res.json().catch(() => ({}))) as { devices?: DeviceRecord[] };
  return Array.isArray(data.devices) ? data.devices : [];
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
  if (!API_BASE) {
    throw new Error("VITE_API_BASE_URL is missing (set it in .env / hosting env vars)");
  }

  const res = await fetch(`${API_BASE}/api/v1/admin/devices/${encodeURIComponent(deviceId)}`, {
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
