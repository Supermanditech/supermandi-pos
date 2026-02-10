const API_BASE = import.meta.env.VITE_API_BASE_URL as string | undefined;
import { getAuthHeaders, fetchWithTimeout } from "./authToken";
import { sanitizeErrorMessage } from "./errorSanitizer";

export type StoreRecord = {
  id: string;
  name?: string | null;
  storeName?: string | null;
  upi_vpa?: string | null;
  active?: boolean;
  status?: string | null; // SA-P0-001: Raw store status (DRAFT, ACTIVE, SUSPENDED, etc.)
  status_reason?: string | null; // SA-P0-001: Reason for current status
  address?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  location?: string | null;
  pos_device_id?: string | null;
  kyc_status?: string | null;
  upi_vpa_updated_at?: string | null;
  upi_vpa_updated_by?: string | null;
  allowed_payment_methods?: string[] | null; // SA-P1-006
  created_at?: string | null;
  updated_at?: string | null;
};

function requireApiBase(): string {
  if (!API_BASE) {
    throw new Error("VITE_API_BASE_URL is missing (set it in .env / hosting env vars)");
  }
  return API_BASE;
}

async function parseError(res: Response): Promise<string> {
  const fallback = `Request failed (${res.status})`;
  const data = await res.json().catch(() => ({}));
  if (data && typeof data === "object" && "error" in data) {
    // GL-CRIT-0055: Sanitize error messages
    return sanitizeErrorMessage(String((data as any).error), fallback);
  }
  return fallback;
}

export async function fetchStore(storeId: string): Promise<StoreRecord> {
  const base = requireApiBase();

  const res = await fetchWithTimeout(`${base}/api/v1/admin/stores/${encodeURIComponent(storeId)}`, {
    method: "GET",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...getAuthHeaders(),
    }
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  const data = await res.json();
  return (data?.store ?? {}) as StoreRecord;
}

// ADMIN-PAGINATION-001: Paginated response type
export type PaginatedResponse<T> = { items: T[]; total: number; limit: number; offset: number };

export async function fetchStores(params?: { limit?: number; offset?: number }): Promise<PaginatedResponse<StoreRecord>> {
  const base = requireApiBase();

  const url = new URL(`${base}/api/v1/admin/stores`);
  if (params?.limit) url.searchParams.set("limit", String(params.limit));
  if (params?.offset) url.searchParams.set("offset", String(params.offset));

  const res = await fetchWithTimeout(url.toString(), {
    method: "GET",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...getAuthHeaders(),
    }
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  const data = await res.json();
  return {
    items: Array.isArray(data?.stores) ? (data.stores as StoreRecord[]) : [],
    total: data?.total ?? 0,
    limit: data?.limit ?? 50,
    offset: data?.offset ?? 0,
  };
}

export async function createStore(input: { storeName: string; storeId?: string }): Promise<StoreRecord> {
  const base = requireApiBase();

  const payload: Record<string, unknown> = { storeName: input.storeName };
  if (input.storeId) payload.storeId = input.storeId;

  const res = await fetchWithTimeout(`${base}/api/v1/admin/stores`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  const data = await res.json();
  return (data?.store ?? {}) as StoreRecord;
}

// P1-SADM-002: Extended store update input with contact fields
export type StoreUpdateInput = {
  upiVpa?: string;
  storeName?: string;
  address?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  allowedPaymentMethods?: string[]; // SA-P1-006
};

export async function updateStore(
  storeId: string,
  input: StoreUpdateInput
): Promise<StoreRecord> {
  const base = requireApiBase();

  const res = await fetchWithTimeout(`${base}/api/v1/admin/stores/${encodeURIComponent(storeId)}`, {
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

  const data = await res.json();
  return (data?.store ?? {}) as StoreRecord;
}

// =============================================================================
// SA-P0-001: Store Suspension / Reactivation
// =============================================================================

export type StoreStatusHistoryEntry = {
  id: string;
  old_status: string | null;
  new_status: string;
  reason: string | null;
  changed_by: string | null;
  changed_by_type: string | null;
  changed_at: string;
};

/**
 * Change store status (suspend/reactivate) via state machine
 */
export async function changeStoreStatus(
  storeId: string,
  status: string,
  reason?: string
): Promise<{ store: StoreRecord; previous_status: string; status_history: StoreStatusHistoryEntry[] }> {
  const base = requireApiBase();

  const res = await fetchWithTimeout(
    `${base}/api/v1/admin/stores/${encodeURIComponent(storeId)}/status`,
    {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify({ status, reason }),
    }
  );

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  return res.json();
}

/**
 * Fetch store status change history (audit trail)
 */
export async function fetchStoreStatusHistory(
  storeId: string
): Promise<StoreStatusHistoryEntry[]> {
  const base = requireApiBase();

  const res = await fetchWithTimeout(
    `${base}/api/v1/admin/stores/${encodeURIComponent(storeId)}/status-history`,
    {
      method: "GET",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...getAuthHeaders(),
      },
    }
  );

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  const data = await res.json();
  return Array.isArray(data?.history) ? data.history : [];
}
