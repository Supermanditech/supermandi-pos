// SA-P0-005 + SA-P1-007: Feature Flags API Client
import { getAuthHeaders, fetchWithTimeout } from "./authToken";
import { sanitizeErrorMessage } from "./errorSanitizer";

const API_BASE = import.meta.env.VITE_API_BASE_URL as string | undefined;

function requireApiBase(): string {
  if (!API_BASE) throw new Error("VITE_API_BASE_URL is missing");
  return API_BASE;
}

async function parseError(res: Response): Promise<string> {
  const fallback = `Request failed (${res.status})`;
  const data = await res.json().catch(() => ({}));
  if (data && typeof data === "object" && "error" in data) {
    return sanitizeErrorMessage(String((data as { error: string }).error), fallback);
  }
  return fallback;
}

export type GlobalFeatureFlag = {
  flag_key: string;
  enabled: boolean;
  description: string | null;
  updated_at: string;
};

export type StoreFeatureFlag = {
  flag_key: string;
  global_enabled: boolean;
  store_override: boolean | null;
  effective: boolean;
};

export async function fetchGlobalFlags(): Promise<GlobalFeatureFlag[]> {
  const base = requireApiBase();
  const res = await fetchWithTimeout(`${base}/api/v1/admin/feature-flags`, {
    cache: "no-store",
    headers: { Accept: "application/json", ...getAuthHeaders() },
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json().catch(() => ({}))) as { flags?: GlobalFeatureFlag[] };
  return data.flags ?? [];
}

export async function toggleGlobalFlag(key: string, enabled: boolean): Promise<GlobalFeatureFlag> {
  const base = requireApiBase();
  const res = await fetchWithTimeout(`${base}/api/v1/admin/feature-flags/${encodeURIComponent(key)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Accept: "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ enabled }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json().catch(() => ({}))) as { flag?: GlobalFeatureFlag };
  if (!data.flag) throw new Error("Flag response missing");
  return data.flag;
}

export async function fetchStoreFeatureFlags(storeId: string): Promise<StoreFeatureFlag[]> {
  const base = requireApiBase();
  const res = await fetchWithTimeout(`${base}/api/v1/admin/stores/${encodeURIComponent(storeId)}/feature-flags`, {
    cache: "no-store",
    headers: { Accept: "application/json", ...getAuthHeaders() },
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json().catch(() => ({}))) as { flags?: StoreFeatureFlag[] };
  return data.flags ?? [];
}

export async function setStoreOverride(storeId: string, key: string, enabled: boolean): Promise<void> {
  const base = requireApiBase();
  const res = await fetchWithTimeout(
    `${base}/api/v1/admin/stores/${encodeURIComponent(storeId)}/feature-flags/${encodeURIComponent(key)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Accept: "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ enabled }),
    }
  );
  if (!res.ok) throw new Error(await parseError(res));
}

export async function removeStoreOverride(storeId: string, key: string): Promise<void> {
  const base = requireApiBase();
  const res = await fetchWithTimeout(
    `${base}/api/v1/admin/stores/${encodeURIComponent(storeId)}/feature-flags/${encodeURIComponent(key)}`,
    {
      method: "DELETE",
      headers: { Accept: "application/json", ...getAuthHeaders() },
    }
  );
  if (!res.ok) throw new Error(await parseError(res));
}

export async function bulkSetOverride(
  storeIds: string[],
  flagKey: string,
  enabled: boolean
): Promise<{ updated: number }> {
  const base = requireApiBase();
  const res = await fetchWithTimeout(`${base}/api/v1/admin/feature-flags/bulk`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ storeIds, flagKey, enabled }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json().catch(() => ({}))) as { updated?: number };
  return { updated: data.updated ?? 0 };
}
