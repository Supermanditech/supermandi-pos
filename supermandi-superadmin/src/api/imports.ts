// SA-P2-008: Bulk Import Notification — API client for admin import status
import { getAuthHeaders, fetchWithTimeout } from "./authToken";
import { parseError } from "./errorSanitizer";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '') as string;

export type ImportJobRecord = {
  id: string;
  store_id: string;
  store_name?: string | null;
  file_name: string;
  import_mode: string;
  status: "pending" | "validating" | "validated" | "committing" | "committed" | "failed";
  total_rows: number;
  valid_rows: number;
  error_rows: number;
  products_created: number;
  products_updated: number;
  suppliers_created: number;
  validated_at?: string | null;
  committed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ImportsPaginatedResponse = {
  imports: ImportJobRecord[];
  total: number;
  limit: number;
  offset: number;
};

export async function fetchImportJobs(params?: {
  storeId?: string;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<ImportsPaginatedResponse> {
  const url = new URL(`${API_BASE}/api/v1/admin/imports/status`, window.location.origin);
  if (params?.storeId?.trim()) url.searchParams.set("storeId", params.storeId.trim());
  if (params?.status?.trim()) url.searchParams.set("status", params.status.trim());
  if (params?.limit) url.searchParams.set("limit", String(params.limit));
  if (params?.offset != null) url.searchParams.set("offset", String(params.offset));

  const res = await fetchWithTimeout(url.toString(), {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...getAuthHeaders(),
    },
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  const data = (await res.json().catch(() => ({}))) as {
    imports?: ImportJobRecord[];
    total?: number;
    limit?: number;
    offset?: number;
  };

  return {
    imports: Array.isArray(data.imports) ? data.imports : [],
    total: data.total ?? 0,
    limit: data.limit ?? 50,
    offset: data.offset ?? 0,
  };
}
