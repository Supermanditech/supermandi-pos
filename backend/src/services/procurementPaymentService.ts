/**
 * V3-FIX-176: Procurement Payment Service
 * Handles retailer-to-SuperMandi payment intent creation and provider abstraction.
 *
 * Provider adapters for PhonePe, Pine Labs, Razorpay are stubbed —
 * the contract is integration-ready but not hardcoded to one partner.
 */

import { randomUUID } from "crypto";
import type { PoolClient } from "pg";
import { log } from "../lib/logger";

export type PaymentProvider = 'PHONEPE' | 'PINE_LABS' | 'RAZORPAY' | 'BNPL' | 'SUPERMANDI_CREDIT' | 'MANUAL' | 'UPI_DIRECT';
export type PaymentMode = 'UPI' | 'BANK' | 'BNPL' | 'CREDIT' | 'CASH' | 'CARD';
export type PaymentIntentStatus = 'created' | 'pending' | 'authorized' | 'paid' | 'failed' | 'refunded' | 'expired';

export interface CreatePaymentIntentInput {
  storeId: string;
  orderId: string;
  amountMinor: number;
  currency?: string;
  mode: PaymentMode;
  provider?: PaymentProvider;
  metadata?: Record<string, unknown>;
}

export interface PaymentIntentResult {
  id: string;
  status: PaymentIntentStatus;
  provider: PaymentProvider;
  providerOrderId?: string;
  redirectUrl?: string;
  qrData?: string;
}

/**
 * Resolve payment provider from mode.
 * In production, this would use store config and provider availability.
 */
function resolveProvider(mode: PaymentMode, explicitProvider?: PaymentProvider): PaymentProvider {
  if (explicitProvider) return explicitProvider;
  switch (mode) {
    case 'UPI': return 'UPI_DIRECT';
    case 'BANK': return 'RAZORPAY';
    case 'BNPL': return 'BNPL';
    case 'CREDIT': return 'SUPERMANDI_CREDIT';
    case 'CASH': return 'MANUAL';
    case 'CARD': return 'RAZORPAY';
    default: return 'MANUAL';
  }
}

/**
 * Create a procurement payment intent.
 * This is the canonical entry point for all retailer-to-SuperMandi payments.
 */
export async function createPaymentIntent(
  client: PoolClient,
  input: CreatePaymentIntentInput
): Promise<PaymentIntentResult> {
  const id = randomUUID();
  const provider = resolveProvider(input.mode, input.provider);
  const currency = input.currency ?? 'INR';

  await client.query(
    `INSERT INTO procurement.payment_intents
     (id, store_id, order_id, amount_minor, currency, provider, status, mode, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, 'created', $7, $8)`,
    [id, input.storeId, input.orderId, input.amountMinor, currency, provider, input.mode, JSON.stringify(input.metadata ?? {})]
  );

  log.info(`[V3-FIX-176] Payment intent created: ${id}, order=${input.orderId}, amount=${input.amountMinor}, mode=${input.mode}, provider=${provider}`);

  // V3-FIX-176: Provider-specific initialization
  // Each provider returns actionable data for the checkout UI
  const amountRupees = (input.amountMinor / 100).toFixed(2);

  if (provider === 'UPI_DIRECT') {
    // Generate UPI deep link for SuperMandi merchant
    const merchantVpa = process.env.SUPERMANDI_UPI_VPA || 'supermandi@icici';
    const merchantName = 'SuperMandi Tech Pvt Ltd';
    const upiDeepLink = `upi://pay?pa=${merchantVpa}&pn=${encodeURIComponent(merchantName)}&am=${amountRupees}&cu=INR&tn=Order-${input.orderId.substring(0, 8)}`;
    const qrData = `upi://pay?pa=${merchantVpa}&pn=${encodeURIComponent(merchantName)}&am=${amountRupees}&cu=INR`;
    await client.query(
      `UPDATE procurement.payment_intents SET status = 'pending', provider_order_id = $2, updated_at = NOW() WHERE id = $1`,
      [id, `UPI-${id.substring(0, 8)}`]
    );
    return { id, status: 'pending' as PaymentIntentStatus, provider, redirectUrl: upiDeepLink, qrData };
  }

  if (provider === 'SUPERMANDI_CREDIT') {
    // Credit approval is instant for eligible stores — mark as authorized
    await client.query(
      `UPDATE procurement.payment_intents SET status = 'authorized', updated_at = NOW() WHERE id = $1`,
      [id]
    );
    return { id, status: 'authorized' as PaymentIntentStatus, provider };
  }

  if (provider === 'BNPL') {
    // BNPL requires partner approval — stays pending
    await client.query(
      `UPDATE procurement.payment_intents SET status = 'pending', updated_at = NOW() WHERE id = $1`,
      [id]
    );
    return { id, status: 'pending' as PaymentIntentStatus, provider };
  }

  // RAZORPAY / PINE_LABS / other — would create provider order, stays pending
  return { id, status: 'created' as PaymentIntentStatus, provider };
}

/**
 * Update payment intent status (callback/webhook handler).
 */
export async function updatePaymentIntentStatus(
  client: PoolClient,
  intentId: string,
  status: PaymentIntentStatus,
  providerPaymentId?: string
): Promise<void> {
  await client.query(
    `UPDATE procurement.payment_intents
     SET status = $2, provider_payment_id = COALESCE($3, provider_payment_id), updated_at = NOW()
     WHERE id = $1`,
    [intentId, status, providerPaymentId ?? null]
  );
  log.info(`[V3-FIX-176] Payment intent ${intentId} → ${status}`);
}

/**
 * Get payment intent for an order.
 */
export async function getPaymentIntentForOrder(
  client: PoolClient,
  orderId: string
): Promise<PaymentIntentResult | null> {
  const result = await client.query(
    `SELECT id, status, provider, provider_order_id, provider_payment_id
     FROM procurement.payment_intents
     WHERE order_id = $1
     ORDER BY created_at DESC LIMIT 1`,
    [orderId]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    id: row.id,
    status: row.status,
    provider: row.provider,
    providerOrderId: row.provider_order_id,
  };
}
