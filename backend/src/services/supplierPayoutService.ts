// SM-018: Supplier Payout Service
// Processes scheduled payouts to suppliers via Razorpay

import { Pool } from "pg";
import crypto from "crypto";

// Environment configuration
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || "";
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "";
const RAZORPAY_ACCOUNT_NUMBER = process.env.RAZORPAY_ACCOUNT_NUMBER || "";
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || "";

interface ScheduledPayout {
  id: string;
  supplierId: string;
  purchaseOrderId: string;
  paymentId: string;
  amountMinor: number;
  payoutMethod: string;
  payoutAccountId: string | null;
  supplierUpiVpa: string | null;
  supplierName: string;
  razorpayFundAccountId: string | null;
  razorpayContactId: string | null;
}

interface PayoutResult {
  success: boolean;
  payoutId?: string;
  utr?: string;
  status?: string;
  error?: string;
}

/**
 * Check if Razorpay is configured
 */
export function isRazorpayConfigured(): boolean {
  return !!(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET && RAZORPAY_ACCOUNT_NUMBER);
}

/**
 * Create Razorpay payout via API
 * In production, this calls the actual Razorpay Payout API
 */
async function callRazorpayPayoutApi(params: {
  fundAccountId: string;
  amount: number;
  mode: "UPI" | "IMPS" | "NEFT";
  referenceId: string;
  narration: string;
}): Promise<PayoutResult> {
  if (!isRazorpayConfigured()) {
    // GO-LIVE-119: NEVER return mock success in production - suppliers would not receive money
    const isProduction = process.env.NODE_ENV === "production";
    if (isProduction) {
      console.error("[SM-018] GO-LIVE-119: CRITICAL - Razorpay not configured in production! Payout cannot proceed.");
      return {
        success: false,
        error: "Payment gateway not configured - please contact support",
      };
    }

    // Only allow mock response in development/testing
    console.log("[SM-018] Razorpay not configured (dev mode), using mock payout");
    const mockPayoutId = `pout_mock_${Date.now().toString(36)}`;
    const mockUtr = `UTR${Date.now()}`;
    return {
      success: true,
      payoutId: mockPayoutId,
      utr: mockUtr,
      status: "processed",
    };
  }

  try {
    // Razorpay Payout API call
    const auth = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString("base64");

    const response = await fetch("https://api.razorpay.com/v1/payouts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({
        account_number: RAZORPAY_ACCOUNT_NUMBER,
        fund_account_id: params.fundAccountId,
        amount: params.amount,
        currency: "INR",
        mode: params.mode,
        purpose: "vendor_bill",
        reference_id: params.referenceId,
        narration: params.narration,
        queue_if_low_balance: true,
      }),
    });

    const data = (await response.json()) as {
      id?: string;
      utr?: string;
      status?: string;
      error?: { description?: string };
    };

    if (!response.ok) {
      console.error("[SM-018] Razorpay payout failed:", data);
      return {
        success: false,
        error: data.error?.description || "Payout API error",
      };
    }

    return {
      success: true,
      payoutId: data.id,
      utr: data.utr,
      status: data.status,
    };
  } catch (error: any) {
    console.error("[SM-018] Razorpay payout exception:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Process a single scheduled payout
 */
export async function processScheduledPayout(
  pool: Pool,
  payout: ScheduledPayout
): Promise<PayoutResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // GO-LIVE-118: Reconciliation verification - verify payout amount matches order total
    const orderResult = await client.query(
      `SELECT total_amount FROM orders.purchase_orders WHERE id = $1`,
      [payout.purchaseOrderId]
    );
    const orderTotal = orderResult.rows[0]?.total_amount;

    if (orderTotal !== undefined && payout.amountMinor !== orderTotal) {
      console.error(
        `[SM-018] GO-LIVE-118: CRITICAL - Payout reconciliation mismatch! ` +
        `payoutId=${payout.id}, payoutAmount=${payout.amountMinor}, orderTotal=${orderTotal}`
      );
      // Fail the payout if amounts don't match - this indicates data corruption
      await client.query(
        `UPDATE payments.supplier_payouts
         SET status = 'failed', failure_reason = $1
         WHERE id = $2`,
        [`Reconciliation mismatch: payout=${payout.amountMinor}, order=${orderTotal}`, payout.id]
      );
      await client.query("COMMIT");
      return {
        success: false,
        error: `Reconciliation mismatch: payout amount (${payout.amountMinor}) does not match order total (${orderTotal})`,
      };
    }

    // Determine payout mode
    const mode = payout.payoutMethod === "UPI" ? "UPI" : "IMPS";

    // Get fund account ID (either from supplier or create on-the-fly)
    let fundAccountId = payout.razorpayFundAccountId;

    if (!fundAccountId && payout.supplierUpiVpa) {
      // For MVP, we'll use a mock fund account or create one
      // In production, fund accounts should be pre-created during supplier onboarding
      console.log(`[SM-018] Using UPI VPA directly for supplier: ${payout.supplierUpiVpa}`);
      fundAccountId = `fa_mock_${payout.supplierId.substring(0, 8)}`;
    }

    if (!fundAccountId) {
      await client.query("ROLLBACK");
      return {
        success: false,
        error: "No fund account configured for supplier",
      };
    }

    // Update payout status to processing
    await client.query(
      `UPDATE payments.supplier_payouts
       SET status = 'processing', processed_at = NOW()
       WHERE id = $1`,
      [payout.id]
    );

    // Call Razorpay Payout API
    const referenceId = `SM_PAYOUT_${payout.id.substring(0, 8)}`;
    const narration = `Payment for PO ${payout.purchaseOrderId.substring(0, 8)}`;

    const result = await callRazorpayPayoutApi({
      fundAccountId,
      amount: payout.amountMinor,
      mode,
      referenceId,
      narration,
    });

    if (result.success) {
      // Update payout record with success
      await client.query(
        `UPDATE payments.supplier_payouts
         SET status = $1, payout_utr = $2, payout_account_id = $3
         WHERE id = $4`,
        [result.status === "processed" ? "completed" : "processing", result.utr, result.payoutId, payout.id]
      );

      // Update buy_payments with payout info
      await client.query(
        `UPDATE payments.buy_payments
         SET payout_id = $1, payout_utr = $2, status = 'settled'
         WHERE id = $3`,
        [result.payoutId, result.utr, payout.paymentId]
      );

      // Update order payment status
      await client.query(
        `UPDATE orders.purchase_orders
         SET payment_status = 'settled'
         WHERE id = $1`,
        [payout.purchaseOrderId]
      );

      await client.query("COMMIT");
      console.log(`[SM-018] Payout completed: payoutId=${payout.id}, razorpayId=${result.payoutId}, utr=${result.utr}`);
    } else {
      // Update payout record with failure
      await client.query(
        `UPDATE payments.supplier_payouts
         SET status = 'failed', failure_reason = $1
         WHERE id = $2`,
        [result.error, payout.id]
      );
      await client.query("COMMIT");
      console.error(`[SM-018] Payout failed: payoutId=${payout.id}, error=${result.error}`);
    }

    return result;
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("[SM-018] Process payout error:", error.message);
    return {
      success: false,
      error: error.message,
    };
  } finally {
    client.release();
  }
}

/**
 * Fetch all scheduled payouts ready for processing
 */
export async function getScheduledPayouts(pool: Pool): Promise<ScheduledPayout[]> {
  try {
    const result = await pool.query(`
      SELECT
        sp.id,
        sp.supplier_id as "supplierId",
        sp.purchase_order_id as "purchaseOrderId",
        sp.payment_id as "paymentId",
        sp.amount_minor as "amountMinor",
        sp.payout_method as "payoutMethod",
        sp.payout_account_id as "payoutAccountId",
        s.upi_vpa as "supplierUpiVpa",
        COALESCE(s.business_name, s.trade_name, 'Supplier') as "supplierName",
        s.razorpay_fund_account_id as "razorpayFundAccountId",
        s.razorpay_contact_id as "razorpayContactId"
      FROM payments.supplier_payouts sp
      JOIN supplier.suppliers s ON s.id = sp.supplier_id
      WHERE sp.status = 'scheduled'
      ORDER BY sp.scheduled_at ASC
      LIMIT 100
    `);
    return result.rows;
  } catch (error: any) {
    console.error("[SM-018] Get scheduled payouts error:", error.message);
    return [];
  }
}

/**
 * Process all scheduled payouts (batch processing)
 */
export async function processAllScheduledPayouts(pool: Pool): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  const payouts = await getScheduledPayouts(pool);
  console.log(`[SM-018] Processing ${payouts.length} scheduled payouts`);

  let succeeded = 0;
  let failed = 0;

  for (const payout of payouts) {
    const result = await processScheduledPayout(pool, payout);
    if (result.success) {
      succeeded++;
    } else {
      failed++;
    }
    // Small delay between payouts to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return {
    processed: payouts.length,
    succeeded,
    failed,
  };
}

/**
 * Verify Razorpay webhook signature
 */
export function verifyWebhookSignature(body: string, signature: string): boolean {
  if (!RAZORPAY_WEBHOOK_SECRET) {
    // GO-LIVE-119: Never skip verification in production - attackers could send fake events
    const isProduction = process.env.NODE_ENV === "production";
    if (isProduction) {
      console.error("[SM-018] GO-LIVE-119: CRITICAL - Webhook secret not configured in production!");
      return false; // Reject webhooks in production without proper verification
    }
    console.warn("[SM-018] Webhook secret not configured (dev mode), skipping verification");
    return true; // Only allow in development
  }

  const expectedSignature = crypto
    .createHmac("sha256", RAZORPAY_WEBHOOK_SECRET)
    .update(body)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Handle Razorpay payout webhook event
 */
export async function handlePayoutWebhook(
  pool: Pool,
  event: string,
  payload: {
    payout?: {
      id: string;
      entity: string;
      status: string;
      utr?: string;
      reference_id?: string;
      failure_reason?: string;
    };
  }
): Promise<boolean> {
  console.log(`[SM-018] Handling webhook event: ${event}`);

  if (!payload.payout) {
    console.warn("[SM-018] Webhook missing payout payload");
    return false;
  }

  const { id: razorpayPayoutId, status, utr, reference_id, failure_reason } = payload.payout;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Find the payout record by Razorpay payout ID
    const payoutResult = await client.query(
      `SELECT sp.id, sp.payment_id, sp.purchase_order_id
       FROM payments.supplier_payouts sp
       WHERE sp.payout_account_id = $1`,
      [razorpayPayoutId]
    );

    if (payoutResult.rows.length === 0) {
      console.warn(`[SM-018] Payout not found for Razorpay ID: ${razorpayPayoutId}`);
      await client.query("ROLLBACK");
      return false;
    }

    const payout = payoutResult.rows[0];

    if (event === "payout.processed" && status === "processed") {
      // Payout successful
      await client.query(
        `UPDATE payments.supplier_payouts
         SET status = 'completed', payout_utr = $1
         WHERE id = $2`,
        [utr, payout.id]
      );

      await client.query(
        `UPDATE payments.buy_payments
         SET payout_utr = $1, status = 'settled'
         WHERE id = $2`,
        [utr, payout.payment_id]
      );

      await client.query(
        `UPDATE orders.purchase_orders
         SET payment_status = 'settled'
         WHERE id = $1`,
        [payout.purchase_order_id]
      );

      console.log(`[SM-018] Payout webhook: completed, payoutId=${payout.id}, utr=${utr}`);
    } else if (event === "payout.failed" || event === "payout.reversed") {
      // Payout failed
      await client.query(
        `UPDATE payments.supplier_payouts
         SET status = 'failed', failure_reason = $1
         WHERE id = $2`,
        [failure_reason || "Unknown error", payout.id]
      );

      console.log(`[SM-018] Payout webhook: failed, payoutId=${payout.id}, reason=${failure_reason}`);
    }

    await client.query("COMMIT");
    return true;
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("[SM-018] Webhook handler error:", error.message);
    return false;
  } finally {
    client.release();
  }
}

export default {
  isRazorpayConfigured,
  processScheduledPayout,
  getScheduledPayouts,
  processAllScheduledPayouts,
  verifyWebhookSignature,
  handlePayoutWebhook,
};
