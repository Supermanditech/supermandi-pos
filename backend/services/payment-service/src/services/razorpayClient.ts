// Razorpay Client Wrapper
// SM-004: Razorpay SDK integration for payments and payouts
// T-253: Fixed timing attack in signature verification + replaced undefined SDK methods with raw fetch()

import Razorpay from 'razorpay';
import crypto from 'crypto';
import { config } from '../config';

const RAZORPAY_API_BASE = 'https://api.razorpay.com/v1';

/**
 * T-253: Helper for RazorpayX API calls (contacts, fund_accounts, payouts)
 * These endpoints are NOT available on the razorpay npm SDK — must use raw fetch().
 * Pattern matches supplierPayoutService.ts for consistency.
 */
async function razorpayXFetch<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
  const auth = Buffer.from(`${config.razorpay.keyId}:${config.razorpay.keySecret}`).toString('base64');

  const response = await fetch(`${RAZORPAY_API_BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json() as T & { error?: { description?: string } };

  if (!response.ok) {
    const errorMsg = (data as any)?.error?.description || `RazorpayX API error: ${response.status}`;
    throw new Error(errorMsg);
  }

  return data;
}

// Initialize Razorpay instance
let razorpayInstance: Razorpay | null = null;

/**
 * Get Razorpay instance (lazy initialization)
 */
function getRazorpay(): Razorpay {
  if (!razorpayInstance) {
    if (!config.razorpay.keyId || !config.razorpay.keySecret) {
      throw new Error('Razorpay credentials not configured');
    }
    razorpayInstance = new Razorpay({
      key_id: config.razorpay.keyId,
      key_secret: config.razorpay.keySecret,
    });
  }
  return razorpayInstance;
}

/**
 * Check if Razorpay is configured and can connect
 */
export async function checkRazorpayConnection(): Promise<boolean> {
  try {
    if (!config.razorpay.keyId || !config.razorpay.keySecret) {
      return false;
    }
    // Try to fetch account details to verify connection
    const rp = getRazorpay();
    // Note: In production, we'd call an actual API to verify
    // For now, we just check credentials are present
    return !!rp;
  } catch (error) {
    console.error('[RazorpayClient] Connection check failed:', error);
    return false;
  }
}

/**
 * Create a Razorpay order for collecting payment
 * Used for SELL flow (Consumer → Retailer)
 */
export async function createOrder(params: {
  amount: number;      // Amount in paise
  receipt: string;     // Unique receipt ID
  notes?: Record<string, string>;
}): Promise<{
  id: string;
  entity: string;
  amount: number;
  currency: string;
  receipt: string;
  status: string;
}> {
  const razorpay = getRazorpay();

  const order = await razorpay.orders.create({
    amount: params.amount,
    currency: 'INR',
    receipt: params.receipt,
    notes: params.notes,
  });

  return {
    id: order.id,
    entity: order.entity,
    amount: order.amount as number,
    currency: order.currency,
    receipt: order.receipt || params.receipt,
    status: order.status,
  };
}

/**
 * Fetch payment details by payment ID
 */
export async function fetchPayment(paymentId: string): Promise<{
  id: string;
  entity: string;
  amount: number;
  currency: string;
  status: string;
  method: string;
  orderId?: string;
  vpa?: string;
}> {
  const razorpay = getRazorpay();
  const payment = await razorpay.payments.fetch(paymentId);

  return {
    id: payment.id,
    entity: payment.entity,
    amount: payment.amount as number,
    currency: payment.currency,
    status: payment.status,
    method: payment.method,
    orderId: payment.order_id as string | undefined,
    vpa: payment.vpa as string | undefined,
  };
}

/**
 * Verify payment signature (for webhook verification)
 */
export function verifyPaymentSignature(params: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  // T-253: Use crypto.timingSafeEqual() to prevent timing attack
  // Pattern matches supplierPayoutService.ts:381
  const expectedSignature = crypto
    .createHmac('sha256', config.razorpay.keySecret)
    .update(`${params.orderId}|${params.paymentId}`)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(params.signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Create a payout to a fund account
 * Used for BUY flow (SuperMandi → Supplier)
 */
export async function createPayout(params: {
  fundAccountId: string;
  amount: number;      // Amount in paise
  mode: 'UPI' | 'IMPS' | 'NEFT';
  referenceId: string;
  narration?: string;
}): Promise<{
  id: string;
  entity: string;
  fundAccountId: string;
  amount: number;
  currency: string;
  mode: string;
  status: string;
  utr?: string;
}> {
  // T-253: RazorpayX Payouts API — not available on SDK, use raw fetch()
  const data = await razorpayXFetch<{
    id: string;
    entity: string;
    status: string;
    utr?: string;
  }>('/payouts', {
    account_number: config.razorpay.accountNumber,
    fund_account_id: params.fundAccountId,
    amount: params.amount,
    currency: 'INR',
    mode: params.mode,
    purpose: 'vendor_bill',
    reference_id: params.referenceId,
    narration: params.narration || 'SuperMandi Payment',
    queue_if_low_balance: true,
  });

  return {
    id: data.id,
    entity: data.entity,
    fundAccountId: params.fundAccountId,
    amount: params.amount,
    currency: 'INR',
    mode: params.mode,
    status: data.status,
    utr: data.utr,
  };
}

/**
 * Create a fund account for a supplier (for payouts)
 */
export async function createFundAccount(params: {
  contactId: string;
  accountType: 'bank_account' | 'vpa';
  bankAccount?: {
    name: string;
    ifsc: string;
    accountNumber: string;
  };
  vpa?: {
    address: string;
  };
}): Promise<{
  id: string;
  contactId: string;
  accountType: string;
  active: boolean;
}> {
  // T-253: RazorpayX Fund Accounts API — not available on SDK, use raw fetch()
  const body: Record<string, unknown> = {
    contact_id: params.contactId,
    account_type: params.accountType,
  };

  if (params.accountType === 'bank_account' && params.bankAccount) {
    body.bank_account = {
      name: params.bankAccount.name,
      ifsc: params.bankAccount.ifsc,
      account_number: params.bankAccount.accountNumber,
    };
  } else if (params.accountType === 'vpa' && params.vpa) {
    body.vpa = {
      address: params.vpa.address,
    };
  }

  const data = await razorpayXFetch<{
    id: string;
    active: boolean;
  }>('/fund_accounts', body);

  return {
    id: data.id,
    contactId: params.contactId,
    accountType: params.accountType,
    active: data.active,
  };
}

/**
 * Create a contact for a supplier (prerequisite for fund accounts)
 */
export async function createContact(params: {
  name: string;
  email?: string;
  contact?: string;
  type: 'vendor' | 'customer';
  referenceId: string;
}): Promise<{
  id: string;
  entity: string;
  name: string;
  type: string;
  active: boolean;
}> {
  // T-253: RazorpayX Contacts API — not available on SDK, use raw fetch()
  const data = await razorpayXFetch<{
    id: string;
    entity: string;
    active: boolean;
  }>('/contacts', {
    name: params.name,
    email: params.email,
    contact: params.contact,
    type: params.type,
    reference_id: params.referenceId,
  });

  return {
    id: data.id,
    entity: data.entity,
    name: params.name,
    type: params.type,
    active: data.active,
  };
}

export default {
  checkRazorpayConnection,
  createOrder,
  fetchPayment,
  verifyPaymentSignature,
  createPayout,
  createFundAccount,
  createContact,
};
