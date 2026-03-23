/**
 * V3-FIX-176: Procurement Payment Service
 * Handles retailer-to-SuperMandi payment intent creation and provider abstraction.
 *
 * Provider adapters: Razorpay (npm SDK), PhonePe (PG API), Pine Labs (redirect API).
 * Each adapter falls back gracefully when credentials are not configured.
 */

import { randomUUID } from "crypto";
import type { PoolClient } from "pg";
import { log } from "../lib/logger";
import { createRazorpayOrder } from "./paymentProviders/razorpayAdapter";
import { createPhonePePayment } from "./paymentProviders/phonepeAdapter";
import { createPineLabsPayment } from "./paymentProviders/pinelabsAdapter";

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

  const callbackBaseUrl = process.env.PAYMENT_CALLBACK_URL || 'https://staging.supermandi.tech/api/v1/orders/procurement/payment-callback';

  // ── PhonePe UPI ──
  if (provider === 'PHONEPE') {
    try {
      const result = await createPhonePePayment({
        amountMinor: input.amountMinor,
        merchantTransactionId: id,
        merchantUserId: input.storeId,
        callbackUrl: callbackBaseUrl,
        redirectUrl: `${callbackBaseUrl}?intentId=${id}&provider=phonepe`,
      });
      await client.query(
        `UPDATE procurement.payment_intents SET status = 'pending', provider_order_id = $2, updated_at = NOW() WHERE id = $1`,
        [id, result.merchantTransactionId]
      );
      return { id, status: 'pending' as PaymentIntentStatus, provider,
        redirectUrl: result.redirectUrl,
        qrData: result.instrumentResponse?.qrData };
    } catch (err: any) {
      log.error(`[PhonePe] Failed: ${err.message}`);
      // Fall through to UPI deep link
    }
  }

  // ── UPI Direct (fallback when PhonePe not configured) ──
  if (provider === 'UPI_DIRECT' || (provider === 'PHONEPE' && !process.env.PHONEPE_MERCHANT_ID)) {
    const merchantVpa = process.env.SUPERMANDI_UPI_VPA || 'supermandi@icici';
    const merchantName = 'SuperMandi Tech Pvt Ltd';
    const upiDeepLink = `upi://pay?pa=${merchantVpa}&pn=${encodeURIComponent(merchantName)}&am=${amountRupees}&cu=INR&tn=Order-${input.orderId.substring(0, 8)}`;
    const qrData = `upi://pay?pa=${merchantVpa}&pn=${encodeURIComponent(merchantName)}&am=${amountRupees}&cu=INR`;
    await client.query(
      `UPDATE procurement.payment_intents SET status = 'pending', provider_order_id = $2, updated_at = NOW() WHERE id = $1`,
      [id, `UPI-${id.substring(0, 8)}`]
    );
    return { id, status: 'pending' as PaymentIntentStatus, provider: 'UPI_DIRECT', redirectUrl: upiDeepLink, qrData };
  }

  // ── Razorpay ──
  if (provider === 'RAZORPAY') {
    try {
      const rzpOrder = await createRazorpayOrder({
        amountMinor: input.amountMinor,
        receipt: `order-${input.orderId.substring(0, 20)}`,
        notes: { orderId: input.orderId, storeId: input.storeId },
      });
      await client.query(
        `UPDATE procurement.payment_intents SET status = 'pending', provider_order_id = $2, updated_at = NOW() WHERE id = $1`,
        [id, rzpOrder.orderId]
      );
      return { id, status: 'pending' as PaymentIntentStatus, provider, redirectUrl: rzpOrder.checkoutUrl };
    } catch (err: any) {
      log.error(`[Razorpay] Failed: ${err.message}`);
      await client.query(`UPDATE procurement.payment_intents SET status = 'failed', updated_at = NOW() WHERE id = $1`, [id]);
      return { id, status: 'failed' as PaymentIntentStatus, provider };
    }
  }

  // ── Pine Labs ──
  if (provider === 'PINE_LABS') {
    try {
      const plResult = await createPineLabsPayment({
        amountMinor: input.amountMinor,
        orderId: input.orderId,
        returnUrl: `${callbackBaseUrl}?intentId=${id}&provider=pinelabs`,
      });
      await client.query(
        `UPDATE procurement.payment_intents SET status = 'pending', provider_order_id = $2, updated_at = NOW() WHERE id = $1`,
        [id, plResult.transactionId]
      );
      return { id, status: 'pending' as PaymentIntentStatus, provider, redirectUrl: plResult.redirectUrl };
    } catch (err: any) {
      log.error(`[PineLabs] Failed: ${err.message}`);
      await client.query(`UPDATE procurement.payment_intents SET status = 'failed', updated_at = NOW() WHERE id = $1`, [id]);
      return { id, status: 'failed' as PaymentIntentStatus, provider };
    }
  }

  // ── SuperMandi Credit ──
  if (provider === 'SUPERMANDI_CREDIT') {
    await client.query(
      `UPDATE procurement.payment_intents SET status = 'authorized', updated_at = NOW() WHERE id = $1`,
      [id]
    );
    return { id, status: 'authorized' as PaymentIntentStatus, provider };
  }

  // ── BNPL (GCP-STG-0411: SuperMandi as credit provider) ──
  if (provider === 'BNPL') {
    // Check credit line exists and is approved
    const creditLineResult = await client.query(
      `SELECT id, approved_limit_minor, used_minor, status
       FROM payments.bnpl_credit_lines
       WHERE store_id = $1
       FOR UPDATE`,
      [input.storeId]
    );

    if (creditLineResult.rows.length === 0) {
      await client.query(
        `UPDATE procurement.payment_intents SET status = 'failed', updated_at = NOW() WHERE id = $1`,
        [id]
      );
      log.warn(`[GCP-STG-0411] BNPL: no credit line for store=${input.storeId}`);
      return { id, status: 'failed' as PaymentIntentStatus, provider };
    }

    const creditLine = creditLineResult.rows[0];

    if (creditLine.status !== 'approved') {
      await client.query(
        `UPDATE procurement.payment_intents SET status = 'failed', updated_at = NOW() WHERE id = $1`,
        [id]
      );
      log.warn(`[GCP-STG-0411] BNPL: credit line not approved (status=${creditLine.status}) for store=${input.storeId}`);
      return { id, status: 'failed' as PaymentIntentStatus, provider };
    }

    const available = creditLine.approved_limit_minor - creditLine.used_minor;
    if (available < input.amountMinor) {
      await client.query(
        `UPDATE procurement.payment_intents SET status = 'failed', updated_at = NOW() WHERE id = $1`,
        [id]
      );
      log.warn(`[GCP-STG-0411] BNPL: insufficient credit (available=${available}, requested=${input.amountMinor}) for store=${input.storeId}`);
      return { id, status: 'failed' as PaymentIntentStatus, provider };
    }

    // Deduct from credit line
    await client.query(
      `UPDATE payments.bnpl_credit_lines
       SET used_minor = used_minor + $1, updated_at = NOW()
       WHERE store_id = $2`,
      [input.amountMinor, input.storeId]
    );

    // Mark payment as approved
    await client.query(
      `UPDATE procurement.payment_intents SET status = 'authorized', provider_order_id = $2, updated_at = NOW() WHERE id = $1`,
      [id, `BNPL-${id.substring(0, 8)}`]
    );

    log.info(`[GCP-STG-0411] BNPL authorized: store=${input.storeId}, amount=${input.amountMinor}, remaining=${available - input.amountMinor}`);
    return { id, status: 'authorized' as PaymentIntentStatus, provider };
  }

  // ── MANUAL (Cash) ──
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
