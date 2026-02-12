// ADM-SCR-003: Settings API Module
import { getAuthHeaders, fetchWithTimeout } from "./authToken";
import { parseError } from "./errorSanitizer";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '') as string;

export type SystemSettings = {
  version: string;
  environment: string;
  features: {
    aiEnabled: boolean;
    analyticsEnabled: boolean;
  };
  database: {
    connected: boolean;
  };
};

export type SystemStats = {
  totalStores: number;
  totalDevices: number;
  totalUsers: number;
};

export async function fetchSettings(): Promise<SystemSettings> {
    const res = await fetchWithTimeout(`${API_BASE}/api/v1/admin/settings`, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...getAuthHeaders()
    }
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  const data = (await res.json().catch(() => ({}))) as { settings?: SystemSettings };
  if (!data.settings) {
    throw new Error("Settings response missing");
  }
  return data.settings;
}

export async function fetchSystemStats(): Promise<SystemStats> {
    const res = await fetchWithTimeout(`${API_BASE}/api/v1/admin/settings/stats`, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...getAuthHeaders()
    }
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  const data = (await res.json().catch(() => ({}))) as { stats?: SystemStats };
  if (!data.stats) {
    throw new Error("Stats response missing");
  }
  return data.stats;
}
