const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '') as string;
import { getAuthHeaders, fetchWithTimeout } from "./authToken";
import { parseError } from "./errorSanitizer";

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
  creditEnabled?: boolean; // ISSUE-063
  credit_enabled?: boolean; // ISSUE-063 (snake_case from DB)
  creditLimit?: number; // ISSUE-063
  credit_limit?: number; // ISSUE-063 (snake_case from DB)
  gstin?: string | null; // GCP-STG-0121
  created_at?: string | null;
  updated_at?: string | null;
};

function requireApiBase(): string {
  return API_BASE;
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
  // R4-AC-003: Validate response shape instead of returning {} as StoreRecord
  if (!data?.store || typeof data.store !== "object") {
    throw new Error("Invalid store response: missing store data");
  }
  return data.store as StoreRecord;
}

// ADMIN-PAGINATION-001: Paginated response type
export type PaginatedResponse<T> = { items: T[]; total: number; limit: number; offset: number };

export async function fetchStores(params?: { limit?: number; offset?: number }): Promise<PaginatedResponse<StoreRecord>> {
  const base = requireApiBase();

  const url = new URL(`${base}/api/v1/admin/stores`, window.location.origin);
  if (params?.limit) url.searchParams.set("limit", String(params.limit));
  // R3-API-003: offset=0 is falsy but valid
  if (params?.offset != null) url.searchParams.set("offset", String(params.offset));

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
  // R4-AC-003: Validate response shape instead of returning {} as StoreRecord
  if (!data?.store || typeof data.store !== "object") {
    throw new Error("Invalid store response: missing store data");
  }
  return data.store as StoreRecord;
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
  creditEnabled?: boolean; // ISSUE-063
  creditLimit?: number; // ISSUE-063
  gstin?: string; // GCP-STG-0121
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
  // R4-AC-003: Validate response shape instead of returning {} as StoreRecord
  if (!data?.store || typeof data.store !== "object") {
    throw new Error("Invalid store response: missing store data");
  }
  return data.store as StoreRecord;
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

// =============================================================================
// SA-P1-014: Store Settings (read-only audit view)
// =============================================================================

export type StoreSettings = {
  // Identity
  storeId: string;
  name: string;
  code: string;
  storeType: string | null;
  // Status
  status: string;
  statusReason: string | null;
  statusUpdatedAt: string | null;
  // Contact / Address
  address: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  location: string | null;
  // Payment settings
  upiVpa: string | null;
  upiVpaUpdatedAt: string | null;
  allowedPaymentMethods: string[];
  // Credit / BNPL
  creditEnabled: boolean;
  creditLimit: number;
  bnplEnabled: boolean;
  bnplCreditLimit: number;
  bnplMaxDays: number;
  // SA-P0-002: Discount limits
  maxDiscountPercent: number;
  // Readiness flags
  deviceBound: boolean;
  kycComplete: boolean;
  upiComplete: boolean;
  adminApproved: boolean;
  // Device info
  activeDeviceCount: number;
  posDeviceId: string | null;
  kycStatus: string | null;
  // Other settings
  timezone: string;
  currency: string;
  scanLookupV2Enabled: boolean;
  // Feature flags
  featureFlags: Array<{ flag_key: string; enabled: boolean; scope_type: string; description: string | null }>;
  // Timestamps
  createdAt: string;
  updatedAt: string;
};

/**
 * Fetch store settings (read-only audit view)
 */
export async function fetchStoreSettings(storeId: string): Promise<StoreSettings> {
  const base = requireApiBase();

  const res = await fetchWithTimeout(
    `${base}/api/v1/admin/stores/${encodeURIComponent(storeId)}/settings`,
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
  if (!data?.settings || typeof data.settings !== "object") {
    throw new Error("Invalid store settings response: missing settings data");
  }
  return data.settings as StoreSettings;
}

// =============================================================================
// SA-P2-007: BNPL Limit Adjustment
// =============================================================================

export type BnplUpdateInput = {
  bnplEnabled?: boolean;
  bnplCreditLimit?: number;
  bnplMaxDays?: number;
  creditEnabled?: boolean;
  creditLimit?: number;
};

export type BnplUpdateResult = {
  id: string;
  name: string;
  code: string;
  status: string;
  creditEnabled: boolean;
  creditLimit: number;
  bnplEnabled: boolean;
  bnplCreditLimit: number;
  bnplMaxDays: number;
  updatedAt: string;
};

/**
 * Update BNPL/credit settings for a store
 */
export async function updateStoreBnpl(
  storeId: string,
  input: BnplUpdateInput
): Promise<BnplUpdateResult> {
  const base = requireApiBase();

  const res = await fetchWithTimeout(
    `${base}/api/v1/admin/stores/${encodeURIComponent(storeId)}/bnpl`,
    {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify(input),
    }
  );

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  const data = await res.json();
  if (!data?.store || typeof data.store !== "object") {
    throw new Error("Invalid BNPL update response: missing store data");
  }
  return data.store as BnplUpdateResult;
}

// =============================================================================
// SA-P0-002: Store Discount Limit
// =============================================================================

export type DiscountLimitUpdateResult = {
  id: string;
  name: string;
  code: string;
  status: string;
  maxDiscountPercent: number;
  updatedAt: string;
};

/**
 * Update the maximum discount percentage for a store
 */
export async function updateStoreDiscountLimit(
  storeId: string,
  maxDiscountPercent: number
): Promise<DiscountLimitUpdateResult> {
  const base = requireApiBase();

  const res = await fetchWithTimeout(
    `${base}/api/v1/admin/stores/${encodeURIComponent(storeId)}/discount-limit`,
    {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify({ maxDiscountPercent }),
    }
  );

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  const data = await res.json();
  if (!data?.store || typeof data.store !== "object") {
    throw new Error("Invalid discount limit update response: missing store data");
  }
  return data.store as DiscountLimitUpdateResult;
}

// =============================================================================
// GCP-STG-0358: Invoice Template Settings
// =============================================================================

export type InvoiceSettings = {
  logoUrl: string | null;
  headerText: string | null;
  footerText: string | null;
  termsAndConditions: string | null;
  showGstin: boolean;
  showHsn: boolean;
  autoSendWhatsApp: boolean;
  autoSendOnSale: boolean;
  autoSendOnPo: boolean;
  autoSendOnGrn: boolean;
};

/**
 * Fetch invoice template settings for a store
 */
export async function fetchInvoiceSettings(storeId: string): Promise<InvoiceSettings> {
  const base = requireApiBase();

  const res = await fetchWithTimeout(
    `${base}/api/v1/admin/stores/${encodeURIComponent(storeId)}/invoice-settings`,
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
  return (data?.invoiceSettings ?? {}) as InvoiceSettings;
}

/**
 * Update invoice template settings for a store
 */
export async function updateInvoiceSettings(
  storeId: string,
  settings: Partial<InvoiceSettings>
): Promise<void> {
  const base = requireApiBase();

  const res = await fetchWithTimeout(
    `${base}/api/v1/admin/stores/${encodeURIComponent(storeId)}/invoice-settings`,
    {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify(settings),
    }
  );

  if (!res.ok) {
    throw new Error(await parseError(res));
  }
}

// GCP-STG-0384: Per-store stock level browser
export type StoreStockItem = {
  productId: string;
  productName: string;
  currentQty: number;
  updatedAt: string;
};

export type StoreStockResponse = {
  items: StoreStockItem[];
  total: number;
  limit: number;
  offset: number;
};

export async function fetchStoreStock(storeId: string, limit = 100, offset = 0): Promise<StoreStockResponse> {
  const base = requireApiBase();
  const res = await fetchWithTimeout(
    `${base}/api/v1/admin/stores/${encodeURIComponent(storeId)}/stock?limit=${limit}&offset=${offset}`,
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
  return res.json();
}
