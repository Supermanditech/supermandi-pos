// T-254: Razorpay Order Service for SELL UPI payments
// Creates Razorpay orders for payment tracking via gateway
// Pattern matches supplierPayoutService.ts (raw fetch, Basic auth)

import crypto from "crypto";

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || "";
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "";
const RAZORPAY_API_BASE = "https://api.razorpay.com/v1";

/**
 * Check if Razorpay is configured for order creation (SELL flow)
 * Only requires keyId + keySecret (not accountNumber — that's for payouts)
 */
export function isRazorpayOrdersConfigured(): boolean {
  return !!(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET);
}

interface RazorpayOrder {
  id: string;
  entity: string;
  amount: number;
  currency: string;
  receipt: string;
  status: string;
}

/**
 * Create a Razorpay order for SELL UPI payment tracking
 * Returns null if Razorpay is not configured (graceful degradation)
 */
export async function createRazorpayOrder(params: {
  amountPaise: number;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<RazorpayOrder | null> {
  if (!isRazorpayOrdersConfigured()) {
    return null;
  }

  const auth = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString("base64");

  const response = await fetch(`${RAZORPAY_API_BASE}/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify({
      amount: params.amountPaise,
      currency: "INR",
      receipt: params.receipt,
      notes: params.notes || {},
    }),
    signal: AbortSignal.timeout(30000),
  });

  const data = (await response.json()) as RazorpayOrder & { error?: { description?: string } };

  if (!response.ok) {
    const errorMsg = data.error?.description || `Razorpay order API error: ${response.status}`;
    throw new Error(errorMsg);
  }

  return data;
}

/**
 * Fetch a Razorpay order by ID to check status
 */
export async function fetchRazorpayOrder(orderId: string): Promise<RazorpayOrder | null> {
  if (!isRazorpayOrdersConfigured()) {
    return null;
  }

  const auth = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString("base64");

  const response = await fetch(`${RAZORPAY_API_BASE}/orders/${orderId}`, {
    method: "GET",
    headers: {
      Authorization: `Basic ${auth}`,
    },
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as RazorpayOrder;
}

/**
 * Fetch payments associated with a Razorpay order
 * Used for UTR extraction and reconciliation
 */
export async function fetchOrderPayments(orderId: string): Promise<Array<{
  id: string;
  amount: number;
  status: string;
  method: string;
  vpa?: string;
  acquirer_data?: { utr?: string };
}>> {
  if (!isRazorpayOrdersConfigured()) {
    return [];
  }

  const auth = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString("base64");

  const response = await fetch(`${RAZORPAY_API_BASE}/orders/${orderId}/payments`, {
    method: "GET",
    headers: {
      Authorization: `Basic ${auth}`,
    },
  });

  if (!response.ok) {
    return [];
  }

  const data = (await response.json()) as { items: Array<any> };
  return data.items || [];
}
