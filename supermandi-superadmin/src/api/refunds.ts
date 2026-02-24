// T-219: Refund Management API client for SuperAdmin
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '') as string;
import { getAuthHeaders, fetchWithTimeout } from "./authToken";

export type RefundStatus = "initiated" | "processing" | "processed" | "failed" | "cancelled";

export interface RefundRequest {
  id: string;
  storeId: string;
  storeName?: string;
  orderId: string;
  paymentId: string;
  refundAmount: number;
  reason: string;
  status: RefundStatus;
  razorpayRefundId: string | null;
  processedAt: string | null;
  failureReason: string | null;
  createdAt: string;
  customerName?: string;
  customerPhone?: string;
}

export interface RefundListResponse {
  data: RefundRequest[];
  total: number;
  limit: number;
  offset: number;
}

function base(): string {
  return API_BASE || "";
}

export async function fetchRefunds(params?: {
  status?: RefundStatus;
  storeId?: string;
  limit?: number;
  offset?: number;
}): Promise<RefundListResponse> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.storeId) qs.set("storeId", params.storeId);
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.offset) qs.set("offset", String(params.offset));
  const qStr = qs.toString() ? `?${qs.toString()}` : "";
  const res = await fetchWithTimeout(`${base()}/api/v1/admin/refunds${qStr}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to load refunds. Please try again.');
  const json = await res.json();
  return { data: json.data || [], total: json.pagination?.total || 0, limit: json.pagination?.limit || 50, offset: json.pagination?.offset || 0 };
}

export async function approveRefund(refundId: string): Promise<void> {
  const res = await fetchWithTimeout(`${base()}/api/v1/admin/refunds/${encodeURIComponent(refundId)}/approve`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to approve refund. Please try again.');
}

export async function rejectRefund(refundId: string, reason: string): Promise<void> {
  const res = await fetchWithTimeout(`${base()}/api/v1/admin/refunds/${encodeURIComponent(refundId)}/reject`, {
    method: "POST",
    headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) throw new Error('Failed to reject refund. Please try again.');
}
