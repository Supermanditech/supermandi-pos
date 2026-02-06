const API_BASE = import.meta.env.VITE_API_BASE_URL as string | undefined;
import { getAuthHeaders, fetchWithTimeout } from "./authToken";

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


/**
 * Fetch latest POS events from the cloud backend.
 * Filters are applied server-side via query parameters.
 */
export async function fetchPosEvents(params: FetchPosEventsParams): Promise<PosEvent[]> {
  const base = requireApiBase();
  const limit = Math.min(1000, Math.max(1, Number(params.limit || 100)));

  const url = new URL(`${base}/api/v1/admin/pos/events`);
  url.searchParams.set("limit", String(limit));
  if (params.storeId?.trim()) url.searchParams.set("storeId", params.storeId.trim());
  if (params.deviceId?.trim()) url.searchParams.set("deviceId", params.deviceId.trim());
  if (params.eventType?.trim()) url.searchParams.set("eventType", params.eventType.trim());

  const res = await fetchWithTimeout(url.toString(), {
    method: "GET",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...getAuthHeaders()
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
      throw new Error("Session expired or unauthorized. Please log in again.");
    }
    const suffix = detail ? `: ${detail}` : "";
    throw new Error(`Failed to fetch POS events (${res.status})${suffix}`);
  }

  const raw = (await res.json()) as unknown;
  if (!Array.isArray(raw)) {
    throw new Error("Invalid POS events response (expected array)");
  }

  return raw
    .map((e: any): PosEvent => ({
      id: String(e?.id ?? ""),
      deviceId: String(e?.deviceId ?? ""),
      storeId: String(e?.storeId ?? ""),
      eventType: String(e?.eventType ?? ""),
      payload: e?.payload,
      createdAt: String(e?.createdAt ?? "")
    }))
    .filter((e) => e.id && e.createdAt);
}
