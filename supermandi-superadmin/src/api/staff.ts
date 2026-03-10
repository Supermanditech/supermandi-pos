// SA-P1-001: SuperAdmin store staff API client
import { getAuthHeaders, fetchWithTimeout } from "./authToken";
import { sanitizeErrorMessage } from "./errorSanitizer";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '') as string;

function requireApiBase(): string {
  return API_BASE;
}

export type StaffMember = {
  id: string;
  name: string;
  phone: string;
  role: "CASHIER" | "STOCK_MANAGER" | "MANAGER";
  is_active: boolean;
  created_at: string;
  sales_count: number;
  stock_in_count: number;
};

export type StaffListResponse = {
  staff: StaffMember[];
};

export async function fetchStoreStaff(storeId: string): Promise<StaffListResponse> {
  const base = requireApiBase();
  // STG-804: Encode path params to prevent URL traversal
  const res = await fetchWithTimeout(`${base}/api/v1/admin/stores/${encodeURIComponent(storeId)}/staff`, {
    cache: "no-store",
    headers: { Accept: "application/json", ...getAuthHeaders() },
  });
  const data = await res.json().catch(() => ({ _parseError: true }));
  if (!res.ok) {
    if (res.status === 401) throw new Error("Unauthorized");
    throw new Error(sanitizeErrorMessage(data?.error ? String(data.error) : null, `Request failed (${res.status})`));
  }
  return data as StaffListResponse;
}

export async function createStaff(storeId: string, input: {
  name: string;
  phone: string;
  pin: string;
  role: string;
}): Promise<{ staff: StaffMember }> {
  const base = requireApiBase();
  const res = await fetchWithTimeout(`${base}/api/v1/admin/stores/${encodeURIComponent(storeId)}/staff`, {
    method: "POST",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({ _parseError: true }));
  if (!res.ok) {
    if (res.status === 401) throw new Error("Unauthorized");
    const msg = data?.error?.message || data?.error || `Request failed (${res.status})`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return data as { staff: StaffMember };
}

export async function updateStaff(storeId: string, staffId: string, input: {
  name?: string;
  role?: string;
  is_active?: boolean;
}): Promise<{ staff: StaffMember }> {
  const base = requireApiBase();
  const res = await fetchWithTimeout(`${base}/api/v1/admin/stores/${encodeURIComponent(storeId)}/staff/${encodeURIComponent(staffId)}`, {
    method: "PATCH",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({ _parseError: true }));
  if (!res.ok) {
    if (res.status === 401) throw new Error("Unauthorized");
    const msg = data?.error?.message || data?.error || `Request failed (${res.status})`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return data as { staff: StaffMember };
}

export async function resetStaffPin(storeId: string, staffId: string, pin: string): Promise<void> {
  const base = requireApiBase();
  const res = await fetchWithTimeout(`${base}/api/v1/admin/stores/${encodeURIComponent(storeId)}/staff/${encodeURIComponent(staffId)}/reset-pin`, {
    method: "POST",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ pin }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ _parseError: true }));
    if (res.status === 401) throw new Error("Unauthorized");
    const msg = data?.error?.message || data?.error || `Request failed (${res.status})`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
}
