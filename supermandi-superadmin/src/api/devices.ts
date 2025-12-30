import { getAdminToken } from "./authToken";

const API_BASE = import.meta.env.VITE_API_BASE_URL as string | undefined;

export type DeviceRecord = {
  id: string;
  store_id: string;
  active: boolean;
  label?: string | null;
  device_type?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  android_version?: string | null;
  app_version?: string | null;
  printing_mode?: string | null;
  last_seen_online: string | null;
  last_sync_at: string | null;
  pending_outbox_count: number;
  created_at?: string | null;
  updated_at?: string | null;
};

async function parseError(res: Response): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (res.status === 503 && data.error === "admin_disabled") return "Admin disabled (ADMIN_TOKEN missing)";
  if (res.status === 401) return "Unauthorized (set VITE_ADMIN_TOKEN to match backend ADMIN_TOKEN)";
  return data.error ? String(data.error) : `Request failed (${res.status})`;
}

export async function fetchDevices(params?: { storeId?: string }): Promise<DeviceRecord[]> {
  if (!API_BASE) {
    throw new Error("VITE_API_BASE_URL is missing (set it in .env / hosting env vars)");
  }

  const storeId = params?.storeId?.trim();
  const qs = storeId ? `?storeId=${encodeURIComponent(storeId)}` : "";
  const res = await fetch(`${API_BASE}/api/v1/admin/devices${qs}`, {
    headers: {
      Accept: "application/json",
      "x-admin-token": getAdminToken() ?? ""
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
      "x-admin-token": getAdminToken() ?? ""
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
