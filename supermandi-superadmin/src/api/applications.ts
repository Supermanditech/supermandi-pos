/**
 * STAGING-FIX-014: Application Approval API Client
 *
 * SuperAdmin API functions for listing, reviewing, approving,
 * and rejecting registration applications (both retailer and supplier).
 */

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '') as string;
import { getAuthHeaders, fetchWithTimeout } from "./authToken";
import { sanitizeErrorMessage } from "./errorSanitizer";

export type ApplicationStatus = 'DRAFT' | 'KYC_SUBMITTED' | 'PAYMENTS_SUBMITTED' | 'ACTIVE' | 'NEEDS_FIX' | 'EXPIRED';

export type Application = {
  id: string;
  entityType: 'retailer' | 'supplier';
  phone: string;
  email?: string | null;
  businessName: string;
  ownerName: string;
  gstin: string;
  addressLine1?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  status: ApplicationStatus;
  adminNotes?: string | null;
  rejectionReason?: string | null;
  documentUrls?: Record<string, string> | null;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string | null;
};

export type ApplicationDocument = {
  id: string;
  documentType: string;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  status: string;
  createdAt: string;
};

export type ApplicationDetail = {
  application: Application & {
    addressLine2?: string | null;
    upiVpa?: string | null;
    bankAccountNumber?: string | null;
    bankIfsc?: string | null;
    bankName?: string | null;
    approvedStoreId?: string | null;
    approvedSupplierId?: string | null;
    reviewedAt?: string | null;
  };
  documents: ApplicationDocument[];
  statusHistory: Array<{
    oldStatus: string;
    newStatus: string;
    reason?: string | null;
    createdAt: string;
  }>;
};

function requireApiBase(): string {
  return API_BASE;
}

async function parseError(res: Response): Promise<string> {
  const fallback = `Request failed (${res.status})`;
  const data = await res.json().catch(() => ({}));
  if (data && typeof data === "object" && "error" in data) {
    const err = (data as any).error;
    const msg = typeof err === 'string' ? err : err?.message || fallback;
    return sanitizeErrorMessage(String(msg), fallback);
  }
  return fallback;
}

/**
 * Fetch pending applications with optional filters.
 */
export async function fetchApplications(params?: {
  entityType?: string;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: Application[]; total: number; limit: number; offset: number }> {
  const base = requireApiBase();
  const url = new URL(`${base}/api/v1/admin/applications`, window.location.origin);
  if (params?.entityType) url.searchParams.set("entity_type", params.entityType);
  if (params?.status) url.searchParams.set("status", params.status);
  if (params?.limit) url.searchParams.set("limit", String(params.limit));
  if (params?.offset) url.searchParams.set("offset", String(params.offset));

  const res = await fetchWithTimeout(url.toString(), {
    method: "GET",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...getAuthHeaders(),
    },
  });

  if (!res.ok) throw new Error(await parseError(res));

  const data = await res.json();
  return {
    items: Array.isArray(data?.data) ? data.data : [],
    total: data?.total ?? 0,
    limit: data?.limit ?? 50,
    offset: data?.offset ?? 0,
  };
}

/**
 * Fetch full application detail including documents and status history.
 */
export async function fetchApplicationDetail(id: string): Promise<ApplicationDetail> {
  const base = requireApiBase();
  const res = await fetchWithTimeout(`${base}/api/v1/admin/applications/${encodeURIComponent(id)}`, {
    method: "GET",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...getAuthHeaders(),
    },
  });

  if (!res.ok) throw new Error(await parseError(res));
  return await res.json();
}

/**
 * Approve an application. Creates store (retailer) or supplier record.
 */
export async function approveApplication(
  id: string,
  input?: { notes?: string }
): Promise<{ success: boolean; approvedEntityId?: string; message?: string }> {
  const base = requireApiBase();
  const res = await fetchWithTimeout(`${base}/api/v1/admin/applications/${encodeURIComponent(id)}/approve`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify(input || {}),
  });

  if (!res.ok) throw new Error(await parseError(res));
  return await res.json();
}

/**
 * Reject an application with a reason.
 */
export async function rejectApplication(
  id: string,
  input: { reason: string }
): Promise<{ success: boolean; message?: string }> {
  const base = requireApiBase();
  const res = await fetchWithTimeout(`${base}/api/v1/admin/applications/${encodeURIComponent(id)}/reject`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) throw new Error(await parseError(res));
  return await res.json();
}
