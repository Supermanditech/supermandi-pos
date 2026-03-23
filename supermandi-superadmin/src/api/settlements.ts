// GCP-STG-0355: Settlement Management API client for SuperAdmin
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '') as string;
import { getAuthHeaders, fetchWithTimeout } from "./authToken";

export type SettlementStatus = "pending" | "approved" | "scheduled" | "paid" | "reconciled" | "disputed" | "cancelled";

export interface SettlementRecord {
  id: string;
  supplierId: string;
  supplierName?: string;
  storeId: string;
  storeName?: string;
  orderId?: string;
  billingModel: string;
  grossAmountMinor: number;
  commissionMinor: number;
  commissionPercent: number;
  gstOnCommissionMinor: number;
  tdsMinor: number;
  netPayoutMinor: number;
  status: SettlementStatus;
  settlementDate?: string;
  payoutReference?: string;
  payoutUtr?: string;
  paidAt?: string;
  createdAt: string;
}

export interface SettlementSummary {
  totalPendingMinor: number;
  totalApprovedMinor: number;
  totalPaidMinor: number;
  pendingCount: number;
  approvedCount: number;
  paidCount: number;
}

export interface SettlementListResponse {
  data: SettlementRecord[];
  total: number;
}

function base(): string {
  return API_BASE || "";
}

export async function fetchSettlements(params?: {
  supplierId?: string;
  status?: SettlementStatus;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
}): Promise<SettlementListResponse> {
  const qs = new URLSearchParams();
  if (params?.supplierId) qs.set("supplierId", params.supplierId);
  if (params?.status) qs.set("status", params.status);
  if (params?.fromDate) qs.set("fromDate", params.fromDate);
  if (params?.toDate) qs.set("toDate", params.toDate);
  if (params?.limit) qs.set("limit", String(params.limit));
  // R3-API-003: offset=0 is falsy but valid
  if (params?.offset != null) qs.set("offset", String(params.offset));
  const qStr = qs.toString() ? `?${qs.toString()}` : "";
  const res = await fetchWithTimeout(`${base()}/api/v1/admin/settlements${qStr}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("Failed to load settlements. Please try again.");
  const json = await res.json();
  return { data: json.data || [], total: json.total || 0 };
}

export async function fetchSettlementSummary(supplierId?: string): Promise<SettlementSummary> {
  const qs = supplierId ? `?supplierId=${encodeURIComponent(supplierId)}` : "";
  const res = await fetchWithTimeout(`${base()}/api/v1/admin/settlements/summary${qs}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("Failed to load settlement summary. Please try again.");
  const json = await res.json();
  return json.data || { totalPendingMinor: 0, totalApprovedMinor: 0, totalPaidMinor: 0, pendingCount: 0, approvedCount: 0, paidCount: 0 };
}

export async function approveSettlement(id: string): Promise<void> {
  const res = await fetchWithTimeout(`${base()}/api/v1/admin/settlements/${encodeURIComponent(id)}/approve`, {
    method: "POST",
    headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error || "Failed to approve settlement. Please try again.");
  }
}

export async function bulkApproveSettlements(supplierId: string): Promise<number> {
  const res = await fetchWithTimeout(`${base()}/api/v1/admin/settlements/bulk-approve`, {
    method: "POST",
    headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ supplierId }),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error || "Failed to bulk approve settlements. Please try again.");
  }
  const json = await res.json();
  return json.approvedCount || 0;
}

export async function markSettlementPaid(
  id: string,
  payoutReference: string,
  payoutUtr?: string,
  payoutMethod?: string,
): Promise<void> {
  const res = await fetchWithTimeout(`${base()}/api/v1/admin/settlements/${encodeURIComponent(id)}/mark-paid`, {
    method: "POST",
    headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ payoutReference, payoutUtr, payoutMethod }),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error || "Failed to mark settlement as paid. Please try again.");
  }
}
