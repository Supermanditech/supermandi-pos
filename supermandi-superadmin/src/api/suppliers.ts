const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '') as string;
import { getAuthHeaders, fetchWithTimeout } from "./authToken";
import { parseError } from "./errorSanitizer";

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
  return API_BASE;
}

// ADMIN-PAGINATION-001: Paginated response type
export type PaginatedResponse<T> = { items: T[]; total: number; limit: number; offset: number };

export async function fetchPendingSuppliers(params?: { limit?: number; offset?: number }): Promise<PaginatedResponse<PendingSupplierRequest>> {
  const base = requireApiBase();
  const url = new URL(`${base}/api/v1/admin/pending-suppliers`, window.location.origin);
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
    items: Array.isArray(data?.data) ? (data.data as PendingSupplierRequest[]) : [],
    total: data?.total ?? 0,
    limit: data?.limit ?? 50,
    offset: data?.offset ?? 0,
  };
}

export async function fetchVerifiedSuppliers(params?: { search?: string; limit?: number; offset?: number }): Promise<PaginatedResponse<VerifiedSupplier>> {
  const base = requireApiBase();

  const url = new URL(`${base}/api/v1/admin/verified-suppliers`, window.location.origin);
  if (params?.search) url.searchParams.set("search", params.search);
  if (params?.limit) url.searchParams.set("limit", String(params.limit));
  if (params?.offset) url.searchParams.set("offset", String(params.offset));

  const res = await fetchWithTimeout(url.toString(), {
    method: "GET",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...getAuthHeaders()
    }
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  const data = await res.json();
  return {
    items: Array.isArray(data?.data) ? (data.data as VerifiedSupplier[]) : [],
    total: data?.total ?? 0,
    limit: data?.limit ?? 50,
    offset: data?.offset ?? 0,
  };
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
  
  const res = await fetchWithTimeout(`${base}/api/v1/admin/pending-suppliers/${encodeURIComponent(requestId)}/verify`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...getAuthHeaders()
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
  
  // Backend expects 'notes', not 'reason'
  const res = await fetchWithTimeout(`${base}/api/v1/admin/pending-suppliers/${encodeURIComponent(requestId)}/reject`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...getAuthHeaders()
    },
    body: JSON.stringify({ notes: input.reason })
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  return { success: true };
}

// =============================================================================
// SA-1.3-001 to SA-1.3-003: Product Approval & Margin/BNPL Configuration
// =============================================================================

export type PendingProduct = {
  id: string;
  productName: string;
  skuCode?: string | null;
  barcode?: string | null;
  purchasePrice: number;
  mrp: number;
  moq?: number;
  createdAt: string;
  supplierId: string;
  supplierName: string;
};

export type ProductEditInput = {
  editedName?: string;
  editedCategory?: string;
  superMandiMarginMinor?: number;  // Fixed margin in paise (mutually exclusive with marginPercent)
  marginPercent?: number;          // Percentage margin (mutually exclusive with superMandiMarginMinor)
  bnplEligible?: boolean;
  bnplMaxDays?: number;
};

export type ProductEditResponse = {
  productId: string;
  editedName: string;
  editedCategory?: string | null;
  superMandiMarginMinor?: number | null;
  marginPercent?: number | null;
  bnplEligible: boolean;
  bnplMaxDays: number;
  purchasePrice: number;
  retailerPrice: number;
};

/**
 * Fetch products pending admin approval (SA-1.3-001)
 */
export async function fetchPendingProducts(): Promise<PendingProduct[]> {
  const base = requireApiBase();
  
  const res = await fetchWithTimeout(`${base}/api/v1/admin/products/pending`, {
    method: "GET",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...getAuthHeaders()
    }
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  const data = await res.json();
  return Array.isArray(data?.data) ? (data.data as PendingProduct[]) : [];
}

/**
 * Approve a pending product (SA-1.3-002)
 */
export async function approveProduct(productId: string): Promise<{ productId: string; approvalStatus: string; approvedAt: string }> {
  const base = requireApiBase();
  
  const res = await fetchWithTimeout(`${base}/api/v1/admin/products/${encodeURIComponent(productId)}/approve`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...getAuthHeaders()
    }
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  return res.json();
}

/**
 * Reject a pending product (SA-1.3-002)
 */
export async function rejectProduct(productId: string, reason: string): Promise<{ productId: string; approvalStatus: string }> {
  const base = requireApiBase();
  
  const res = await fetchWithTimeout(`${base}/api/v1/admin/products/${encodeURIComponent(productId)}/reject`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...getAuthHeaders()
    },
    body: JSON.stringify({ reason })
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  return res.json();
}

// =============================================================================
// SA-P1-005: Supplier Suspension / Reactivation
// =============================================================================

export type SupplierStatusHistoryEntry = {
  id: string;
  previousStatus: string;
  newStatus: string;
  reason: string | null;
  changedBy: string | null;
  changedByType: string | null;
  createdAt: string;
};

/**
 * Change supplier verification status (suspend/reactivate) via state machine
 */
export async function changeSupplierStatus(
  supplierId: string,
  status: string,
  reason?: string
): Promise<{ supplier: VerifiedSupplier; previousStatus: string; newStatus: string }> {
  const base = requireApiBase();

  const res = await fetchWithTimeout(
    `${base}/api/v1/admin/suppliers/${encodeURIComponent(supplierId)}/verification-status`,
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
 * Fetch supplier status change history (audit trail)
 */
export async function fetchSupplierStatusHistory(
  supplierId: string
): Promise<SupplierStatusHistoryEntry[]> {
  const base = requireApiBase();

  const res = await fetchWithTimeout(
    `${base}/api/v1/admin/suppliers/${encodeURIComponent(supplierId)}/status-history`,
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

/**
 * Edit product details, set margin, and configure BNPL (SA-1.3-003)
 */
export async function editProduct(productId: string, input: ProductEditInput): Promise<ProductEditResponse> {
  const base = requireApiBase();

  const res = await fetchWithTimeout(`${base}/api/v1/admin/products/${encodeURIComponent(productId)}/edit`, {
    method: "PUT",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...getAuthHeaders()
    },
    body: JSON.stringify(input)
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  return res.json();
}

// =============================================================================
// SA-P1-008: Supplier Bank Detail Re-Verification
// =============================================================================

export type BankChangeEntry = {
  id: string;
  businessName: string;
  gstin: string;
  phone: string | null;
  email: string | null;
  bankAccountMasked: string | null;
  bankIfsc: string | null;
  bankAccountName: string | null;
  bankVerificationStatus: string;
  updatedAt: string;
};

/**
 * Fetch suppliers with pending bank detail verifications
 */
export async function fetchBankChanges(): Promise<BankChangeEntry[]> {
  const base = requireApiBase();

  const res = await fetchWithTimeout(`${base}/api/v1/admin/suppliers/bank-changes`, {
    method: "GET",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...getAuthHeaders(),
    },
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  const json = await res.json();
  return Array.isArray(json?.data) ? (json.data as BankChangeEntry[]) : [];
}

/**
 * Approve or reject a supplier's bank detail change
 */
export async function verifyBankDetails(
  supplierId: string,
  action: "approve" | "reject",
  reason?: string
): Promise<{ supplierId: string; bankVerificationStatus: string; action: string }> {
  const base = requireApiBase();

  const res = await fetchWithTimeout(
    `${base}/api/v1/admin/suppliers/${encodeURIComponent(supplierId)}/bank-verify`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify({ action, reason }),
    }
  );

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  return res.json();
}
