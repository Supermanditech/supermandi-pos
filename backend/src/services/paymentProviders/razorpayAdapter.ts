/**
 * V3-FIX-176: Razorpay payment provider adapter
 * Creates Razorpay orders for procurement checkout.
 *
 * Required env vars (set before GCP deployment):
 *   RAZORPAY_KEY_ID      — from dashboard.razorpay.com
 *   RAZORPAY_KEY_SECRET  — from dashboard.razorpay.com
 *
 * GCP Secret Manager refs:
 *   razorpay-key-id
 *   razorpay-key-secret
 */

import { log } from "../../lib/logger";

export interface RazorpayOrderResult {
  orderId: string;
  checkoutUrl: string;
  amount: number;
  currency: string;
}

export async function createRazorpayOrder(params: {
  amountMinor: number;
  currency?: string;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<RazorpayOrderResult> {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    log.warn("[Razorpay] RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET not set — using stub mode");
    return {
      orderId: `rzp_stub_${Date.now()}`,
      checkoutUrl: `https://checkout.razorpay.com/v1/checkout.js?key=${keyId || 'MISSING'}&amount=${params.amountMinor}&currency=${params.currency || 'INR'}`,
      amount: params.amountMinor,
      currency: params.currency || 'INR',
    };
  }

  try {
    const Razorpay = require("razorpay");
    const instance = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const order = await instance.orders.create({
      amount: params.amountMinor,
      currency: params.currency || "INR",
      receipt: params.receipt,
      notes: params.notes || {},
    });

    log.info(`[Razorpay] Order created: ${order.id}, amount=${order.amount}`);
    return {
      orderId: order.id,
      checkoutUrl: `https://api.razorpay.com/v1/checkout/embedded?order_id=${order.id}&key_id=${keyId}`,
      amount: order.amount,
      currency: order.currency,
    };
  } catch (err: any) {
    log.error(`[Razorpay] Order creation failed: ${err.message}`);
    throw new Error(`Razorpay order failed: ${err.message}`);
  }
}

export async function verifyRazorpayPayment(params: {
  orderId: string;
  paymentId: string;
  signature: string;
}): Promise<boolean> {
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) return false;

  try {
    const Razorpay = require("razorpay");
    const isValid = Razorpay.validateWebhookSignature(
      `${params.orderId}|${params.paymentId}`,
      params.signature,
      keySecret
    );
    return isValid;
  } catch {
    return false;
  }
}
