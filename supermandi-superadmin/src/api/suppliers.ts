const API_BASE = import.meta.env.VITE_API_BASE_URL as string | undefined;
import { getAdminToken } from "./authToken";

export type PendingSupplierRequest = {
  id: string;
  storeId: string;
  storeName?: string | null;
  // Request info
  requestedGstin?: string | null;
  requestedName?: string | null;
  requestedPhone?: string | null;
  requestedEmail?: string | null;
  // Status
  status: "pending" | "approved" | "rejected";
  reviewNotes?: string | null;
  // Timestamps
  createdAt: string;
  reviewedAt?: string | null;
};

export type VerifiedSupplier = {
  id: string;
  gstin: string;
  businessName: string;
  tradeName?: string | null;
  primaryPhone?: string | null;
  primaryEmail?: string | null;
  city?: string | null;
  state?: string | null;
  verificationStatus: string;
  status: string;
  rating?: number;
};

function requireApiBase(): string {
  if (!API_BASE) {
    throw new Error("VITE_API_BASE_URL is missing (set it in .env / hosting env vars)");
  }
  return API_BASE;
}

async function parseError(res: Response): Promise<string> {
  const data = await res.json().catch(() => ({}));
  if (data && typeof data === "object" && "error" in data) {
    return String((data as any).error);
  }
  return `Request failed (${res.status})`;
}

export async function fetchPendingSuppliers(): Promise<PendingSupplierRequest[]> {
  const base = requireApiBase();
  const token = getAdminToken();

  const res = await fetch(`${base}/api/v1/admin/pending-suppliers`, {
    method: "GET",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(token ? { "x-admin-token": token } : {})
    }
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  const data = await res.json();
  // Backend returns data directly (not wrapped in .requests)
  return Array.isArray(data?.data) ? (data.data as PendingSupplierRequest[]) : [];
}

export async function fetchVerifiedSuppliers(search?: string): Promise<VerifiedSupplier[]> {
  const base = requireApiBase();
  const token = getAdminToken();

  const url = new URL(`${base}/api/v1/admin/verified-suppliers`);
  if (search) url.searchParams.set("search", search);

  const res = await fetch(url.toString(), {
    method: "GET",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(token ? { "x-admin-token": token } : {})
    }
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  const data = await res.json();
  // Backend returns data directly (not wrapped in .suppliers)
  return Array.isArray(data?.data) ? (data.data as VerifiedSupplier[]) : [];
}

/**
 * Verify a pending supplier request
 * Two modes:
 * 1. { supplierId: string } - Link to existing verified supplier
 * 2. { verifySupplier: true } - Verify the retailer-created supplier directly
 */
export async function verifySupplierRequest(
  requestId: string,
  input: { supplierId?: string; verifySupplier?: boolean; notes?: string }
): Promise<{ success: boolean }> {
  const base = requireApiBase();
  const token = getAdminToken();

  const res = await fetch(`${base}/api/v1/admin/pending-suppliers/${encodeURIComponent(requestId)}/verify`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(token ? { "x-admin-token": token } : {})
    },
    body: JSON.stringify(input)
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  return { success: true };
}

export async function rejectSupplierRequest(
  requestId: string,
  input: { reason?: string }
): Promise<{ success: boolean }> {
  const base = requireApiBase();
  const token = getAdminToken();

  // Backend expects 'notes', not 'reason'
  const res = await fetch(`${base}/api/v1/admin/pending-suppliers/${encodeURIComponent(requestId)}/reject`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(token ? { "x-admin-token": token } : {})
    },
    body: JSON.stringify({ notes: input.reason })
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  return { success: true };
}
