// SA-P0-007: Maintenance Mode API client
import { getAuthHeaders, fetchWithTimeout } from "./authToken";
import { parseError } from "./errorSanitizer";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '') as string;

export type MaintenanceStatus = {
  enabled: boolean;
  message: string | null;
  updated_at: string | null;
};

/**
 * Fetch current maintenance mode status.
 */
export async function fetchMaintenanceStatus(): Promise<MaintenanceStatus> {
  const res = await fetchWithTimeout(`${API_BASE}/api/v1/admin/system/maintenance`, {
    method: "GET",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...getAuthHeaders(),
    },
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  const data = await res.json();
  if (!data?.maintenance || typeof data.maintenance !== "object") {
    throw new Error("Invalid maintenance response: missing maintenance data");
  }
  return data.maintenance as MaintenanceStatus;
}

/**
 * Toggle maintenance mode on/off.
 */
export async function toggleMaintenanceMode(
  enabled: boolean,
  message?: string
): Promise<MaintenanceStatus> {
  const body: Record<string, unknown> = { enabled };
  if (message !== undefined) {
    body.message = message;
  }

  const res = await fetchWithTimeout(`${API_BASE}/api/v1/admin/system/maintenance`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  const data = await res.json();
  if (!data?.maintenance || typeof data.maintenance !== "object") {
    throw new Error("Invalid maintenance response: missing maintenance data");
  }
  return data.maintenance as MaintenanceStatus;
}
