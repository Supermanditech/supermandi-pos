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
  autoApproveProducts?: boolean;  // T-066
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
  // R3-API-003: offset=0 is falsy but valid
  if (params?.offset != null) url.searchParams.set("offset", String(params.offset));

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
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
  createdAt: string;
  supplierId: string;
  supplierName: string;
  // V3-FIX-174: Commercial contract fields from supplier draft
  ptrMinor?: number | null;
  ptsMinor?: number | null;
  tradeDiscountPct?: number | null;
  scheme?: string | null;
  deliverySlaDays?: number | null;
  deliveryTerms?: string | null;
  creditDays?: number | null;
  financeEligible?: boolean | null;
  bnplEligible?: boolean | null;
  bnplMaxDays?: number | null;
  superMandiMarginMinor?: number | null;
  marginPercent?: number | null;
  hsnCode?: string | null;
  gstRate?: number | null;
};

export type ProductEditInput = {
  editedName?: string;
  editedCategory?: string;
  superMandiMarginMinor?: number;  // Fixed margin in paise (mutually exclusive with marginPercent)
  marginPercent?: number;          // Percentage margin (mutually exclusive with superMandiMarginMinor)
  bnplEligible?: boolean;
  bnplMaxDays?: number;
  // T-070: Invoice configuration
  invoiceModel?: "buy_resell" | "platform_fee";
  hsnCode?: string;
  gstRate?: number;  // 0, 5, 12, 18, or 28
  // V3-FIX-174: Full commercial contract editing
  ptrMinor?: number;
  ptsMinor?: number;
  tradeDiscountPct?: number;
  scheme?: string;
  deliverySlaDays?: number;
  deliveryTerms?: string;
  creditDays?: number;
  financeEligible?: boolean;
  moqTiers?: string; // JSON string
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
  // T-070: Invoice config in response
  invoiceModel?: string;
  hsnCode?: string | null;
  gstRate?: number;
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
    },
    body: JSON.stringify({}),
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
// T-068: Product Publishing
// =============================================================================

/**
 * T-068: Publish an approved product to all linked stores
 */
export async function publishProduct(productId: string): Promise<{
  productId: string;
  productName: string;
  supplierName: string;
  publishedToStores: number;
}> {
  const base = requireApiBase();
  const res = await fetchWithTimeout(`${base}/api/v1/admin/products/${encodeURIComponent(productId)}/publish`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({})
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

/**
 * T-068: Bulk publish all approved products from a supplier to linked stores
 */
export async function publishBulkProducts(supplierId: string): Promise<{
  supplierId: string;
  productsProcessed: number;
  totalPublishedToStores: number;
}> {
  const base = requireApiBase();
  const res = await fetchWithTimeout(`${base}/api/v1/admin/products/publish-bulk`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ supplierId })
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

/**
 * T-066: Toggle auto-approval for a supplier's products
 */
export async function toggleAutoApproval(supplierId: string, enabled: boolean): Promise<{
  supplierId: string;
  autoApproveProducts: boolean;
  message: string;
}> {
  const base = requireApiBase();
  const res = await fetchWithTimeout(`${base}/api/v1/admin/suppliers/${encodeURIComponent(supplierId)}/auto-approve`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ enabled })
  });
  if (!res.ok) throw new Error(await parseError(res));
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
  return Array.isArray(data?.status_history) ? data.status_history : Array.isArray(data?.history) ? data.history : [];
}

// =============================================================================
// T-188: Batch Product Approval/Rejection
// =============================================================================

export interface BatchActionResult {
  processed: number;
  succeeded: number;
  failed: number;
  errors: Array<{ productId: string; error: string }>;
}

/**
 * T-188: Batch approve or reject multiple products at once
 * POST /api/v1/admin/applications/products/batch-action
 */
export async function batchProductAction(
  productIds: string[],
  action: "approve" | "reject",
  reason?: string
): Promise<BatchActionResult> {
  const base = requireApiBase();

  const res = await fetchWithTimeout(`${base}/api/v1/admin/applications/products/batch-action`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...getAuthHeaders()
    },
    body: JSON.stringify({ productIds, action, rejectionReason: reason })
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  const json = await res.json();
  const data = json?.data ?? json;
  return {
    processed: data.processed ?? 0,
    succeeded: (data.processed ?? 0) - (data.failed ?? 0),
    failed: data.failed ?? 0,
    errors: data.errors ?? [],
  };
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
