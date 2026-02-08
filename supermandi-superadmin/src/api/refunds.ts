// SA-P0-006: Admin refund approval queue API
import { getAuthHeaders, fetchWithTimeout } from "./authToken";
import { sanitizeErrorMessage } from "./errorSanitizer";

const API_BASE = import.meta.env.VITE_API_BASE_URL as string | undefined;

function requireApiBase(): string {
  if (!API_BASE) {
    throw new Error("VITE_API_BASE_URL is missing");
  }
  return API_BASE;
}

export type PendingRefund = {
  id: string;
  original_sale_id: string;
  store_id: string;
  refund_type: "FULL" | "PARTIAL";
  amount_minor: number;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  items: Array<{ variantId: string; quantity: number; priceMinor: number; name?: string }> | null;
  requested_by_device_id: string | null;
  created_at: string;
  bill_ref: string;
  sale_total_minor: number;
  sale_status: string;
};

export type PendingRefundsResponse = {
  data: PendingRefund[];
  total: number;
  limit: number;
  offset: number;
};

export async function fetchPendingRefunds(params?: {
  limit?: number;
  offset?: number;
}): Promise<PendingRefundsResponse> {
  const base = requireApiBase();
  const qs = new URLSearchParams();
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.offset) qs.set("offset", String(params.offset));

  const res = await fetchWithTimeout(`${base}/api/v1/admin/refunds/pending?${qs.toString()}`, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...getAuthHeaders(),
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const fallback = `Request failed (${res.status})`;
    const rawError =
      data && typeof data === "object" && "error" in data ? String((data as any).error) : null;
    throw new Error(sanitizeErrorMessage(rawError, fallback));
  }
  return data as PendingRefundsResponse;
}

export async function approveRefund(refundId: string): Promise<{ success: boolean; refundId: string; approvedBy: string }> {
  const base = requireApiBase();
  const res = await fetchWithTimeout(`${base}/api/v1/admin/refunds/${refundId}/approve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({}),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const fallback = `Approve failed (${res.status})`;
    const rawError =
      data && typeof data === "object" && "error" in data ? String((data as any).error) : null;
    throw new Error(sanitizeErrorMessage(rawError, fallback));
  }
  return data as { success: boolean; refundId: string; approvedBy: string };
}

export async function rejectRefund(
  refundId: string,
  reason: string
): Promise<{ success: boolean; refundId: string; rejectedBy: string }> {
  const base = requireApiBase();
  const res = await fetchWithTimeout(`${base}/api/v1/admin/refunds/${refundId}/reject`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ reason }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const fallback = `Reject failed (${res.status})`;
    const rawError =
      data && typeof data === "object" && "error" in data ? String((data as any).error) : null;
    throw new Error(sanitizeErrorMessage(rawError, fallback));
  }
  return data as { success: boolean; refundId: string; rejectedBy: string };
}
