const API_BASE = import.meta.env.VITE_API_BASE_URL as string | undefined;
import { getAdminToken } from "./authToken";

export type PosEvent = {
  id: string;
  deviceId: string;
  storeId: string;
  eventType: string;
  payload: unknown;
  createdAt: string;
};

export type FetchPosEventsParams = {
  limit: number;
  deviceId?: string;
  storeId?: string;
  eventType?: string;
};

function requireApiBase(): string {
  if (!API_BASE) {
    throw new Error("VITE_API_BASE_URL is missing (set it in .env / hosting env vars)");
  }
  return API_BASE;
}

function normalizeFilter(v: string | undefined): string {
  return (v ?? "").trim().toLowerCase();
}

/**
 * Fetch latest POS events from the cloud backend.
 * Backend currently supports `limit` only; other filters are applied client-side.
 */
export async function fetchPosEvents(params: FetchPosEventsParams): Promise<PosEvent[]> {
  const base = requireApiBase();
  const limit = Math.min(1000, Math.max(1, Number(params.limit || 100)));
  const token = getAdminToken();

  const res = await fetch(`${base}/api/v1/admin/pos/events?limit=${limit}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...(token ? { "x-admin-token": token } : {})
    }
  });

  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { error?: unknown };
      if (body && typeof body.error === "string") {
        detail = body.error;
      }
    } catch {
      // ignore parse errors
    }
    if (res.status === 401) {
      throw new Error("Unauthorized (set VITE_ADMIN_TOKEN to match backend ADMIN_TOKEN)");
    }
    const suffix = detail ? `: ${detail}` : "";
    throw new Error(`Failed to fetch POS events (${res.status})${suffix}`);
  }

  const raw = (await res.json()) as unknown;
  if (!Array.isArray(raw)) {
    throw new Error("Invalid POS events response (expected array)");
  }

  const deviceFilter = normalizeFilter(params.deviceId);
  const storeFilter = normalizeFilter(params.storeId);
  const eventTypeFilter = normalizeFilter(params.eventType);

  const events = raw
    .map((e: any): PosEvent => ({
      id: String(e?.id ?? ""),
      deviceId: String(e?.deviceId ?? ""),
      storeId: String(e?.storeId ?? ""),
      eventType: String(e?.eventType ?? ""),
      payload: e?.payload,
      createdAt: String(e?.createdAt ?? "")
    }))
    .filter((e) => e.id && e.createdAt);

  return events.filter((e) => {
    if (deviceFilter && !e.deviceId.toLowerCase().includes(deviceFilter)) return false;
    if (storeFilter && !e.storeId.toLowerCase().includes(storeFilter)) return false;
    if (eventTypeFilter && !e.eventType.toLowerCase().includes(eventTypeFilter)) return false;
    return true;
  });
}
