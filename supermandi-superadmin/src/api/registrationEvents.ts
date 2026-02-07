/**
 * RO-007: Registration Events API for SuperAdmin
 *
 * Fetches registration events from GET /api/v1/admin/registration-events
 * Provides visibility into all store registrations across surfaces.
 */

import { getAuthHeaders, fetchWithTimeout } from "./authToken";

const API_BASE = import.meta.env.VITE_API_BASE_URL as string | undefined;

function requireApiBase(): string {
  if (!API_BASE) {
    throw new Error("VITE_API_BASE_URL is missing");
  }
  return API_BASE;
}

export type RegistrationEvent = {
  id: string;
  storeId: string | null;
  storeName: string | null;
  storeCode: string | null;
  userId: string | null;
  source: string;
  outcome: string;
  errorCode: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  deviceMeta: Record<string, unknown> | null;
  phone: string;
  businessName: string;
  gstin: string | null;
  createdAt: string;
};

export type RegistrationEventsResponse = {
  events: RegistrationEvent[];
  pagination: { total: number; limit: number; offset: number };
};

export type FetchRegistrationEventsParams = {
  limit?: number;
  offset?: number;
  source?: string;
  outcome?: string;
  storeId?: string;
};

export async function fetchRegistrationEvents(
  params: FetchRegistrationEventsParams = {}
): Promise<RegistrationEventsResponse> {
  const base = requireApiBase();
  const url = new URL(`${base}/api/v1/admin/registration-events`);

  if (params.limit) url.searchParams.set("limit", String(params.limit));
  if (params.offset) url.searchParams.set("offset", String(params.offset));
  if (params.source) url.searchParams.set("source", params.source);
  if (params.outcome) url.searchParams.set("outcome", params.outcome);
  if (params.storeId) url.searchParams.set("storeId", params.storeId);

  const res = await fetchWithTimeout(url.toString(), {
    method: "GET",
    cache: "no-store",
    headers: { Accept: "application/json", ...getAuthHeaders() },
  });

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error("Session expired. Please log in again.");
    }
    throw new Error(`Failed to fetch registration events (${res.status})`);
  }

  return (await res.json()) as RegistrationEventsResponse;
}

export type RegistrationSummary = {
  total: number;
  bySource: Record<string, Record<string, number>>;
};

export async function fetchRegistrationSummary(): Promise<RegistrationSummary> {
  const base = requireApiBase();
  const res = await fetchWithTimeout(
    `${base}/api/v1/admin/registration-events/summary`,
    {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/json", ...getAuthHeaders() },
    }
  );

  if (!res.ok) {
    throw new Error(`Failed to fetch registration summary (${res.status})`);
  }

  return (await res.json()) as RegistrationSummary;
}
