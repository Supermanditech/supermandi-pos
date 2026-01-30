// ADM-SCR-003: Settings API Module
import { getAuthHeaders } from "./authToken";
import { sanitizeErrorMessage } from "./errorSanitizer";

const API_BASE = import.meta.env.VITE_API_BASE_URL as string | undefined;

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

async function parseError(res: Response): Promise<string> {
  const fallback = `Request failed (${res.status})`;
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (res.status === 503 && data.error === "admin_disabled") return "Admin disabled (ADMIN_TOKEN missing)";
  if (res.status === 401) return "Unauthorized (set VITE_ADMIN_TOKEN to match backend ADMIN_TOKEN)";
  // GL-CRIT-0055: Sanitize error messages
  return sanitizeErrorMessage(data.error, fallback);
}

export async function fetchSettings(): Promise<SystemSettings> {
  if (!API_BASE) {
    throw new Error("VITE_API_BASE_URL is missing (set it in .env / hosting env vars)");
  }

    const res = await fetch(`${API_BASE}/api/v1/admin/settings`, {
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
  if (!API_BASE) {
    throw new Error("VITE_API_BASE_URL is missing (set it in .env / hosting env vars)");
  }

    const res = await fetch(`${API_BASE}/api/v1/admin/settings/stats`, {
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
