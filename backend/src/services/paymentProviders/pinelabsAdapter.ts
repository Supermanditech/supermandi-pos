/**
 * V3-FIX-176: Pine Labs payment provider adapter
 * Creates Pine Labs payment transactions for card/UPI procurement checkout.
 *
 * Required env vars (set before GCP deployment):
 *   PINE_LABS_MERCHANT_ID    — from Pine Labs dashboard
 *   PINE_LABS_ACCESS_CODE    — API access code
 *   PINE_LABS_SECRET         — API secret for signature
 *   PINE_LABS_ENV            — 'PRODUCTION' or 'STAGING' (default: STAGING)
 *
 * GCP Secret Manager refs:
 *   pine-labs-merchant-id
 *   pine-labs-access-code
 *   pine-labs-secret
 */

import crypto from "crypto";
import { log } from "../../lib/logger";

const PINE_LABS_STAGING_BASE = "https://sandbox.pinelabs.com/PinePGRedirect/v1";
const PINE_LABS_PROD_BASE = "https://pinepg.in/PinePGRedirect/v1";

export interface PineLabsPaymentResult {
  transactionId: string;
  redirectUrl: string;
  status: "INITIATED" | "FAILED";
}

export async function createPineLabsPayment(params: {
  amountMinor: number;
  orderId: string;
  customerEmail?: string;
  customerPhone?: string;
  returnUrl: string;
}): Promise<PineLabsPaymentResult> {
  const merchantId = process.env.PINE_LABS_MERCHANT_ID;
  const accessCode = process.env.PINE_LABS_ACCESS_CODE;
  const secret = process.env.PINE_LABS_SECRET;
  const env = process.env.PINE_LABS_ENV || "STAGING";

  if (!merchantId || !accessCode || !secret) {
    log.warn("[PineLabs] Credentials not set — using stub mode");
    return {
      transactionId: `pl_stub_${Date.now()}`,
      redirectUrl: `https://checkout.supermandi.tech/pay/pinelabs/${params.orderId}?amount=${params.amountMinor}`,
      status: "INITIATED",
    };
  }

  const baseUrl = env === "PRODUCTION" ? PINE_LABS_PROD_BASE : PINE_LABS_STAGING_BASE;

  const payload: Record<string, string> = {
    ppc_MerchantID: merchantId,
    ppc_MerchantAccessCode: accessCode,
    ppc_Amount: String(params.amountMinor),
    ppc_UniqueMerchantTxnID: params.orderId.substring(0, 30),
    ppc_NavigationMode: "2", // redirect mode
    ppc_ReturnURL: params.returnUrl,
    ppc_TransactionType: "1", // sale
  };

  if (params.customerEmail) payload.ppc_CustomerEmail = params.customerEmail;
  if (params.customerPhone) payload.ppc_CustomerMobile = params.customerPhone;

  // Generate hash
  const hashString = Object.keys(payload).sort().map(k => payload[k]).join("");
  const hash = crypto.createHmac("sha256", secret).update(hashString).digest("hex").toUpperCase();
  payload.ppc_DIA_SECRET = hash;

  try {
    const formBody = Object.entries(payload).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
    // Pine Labs uses form-post redirect, so we return the redirect URL with params
    const redirectUrl = `${baseUrl}/pay?${formBody}`;

    log.info(`[PineLabs] Payment initiated: order=${params.orderId}`);
    return {
      transactionId: payload.ppc_UniqueMerchantTxnID,
      redirectUrl,
      status: "INITIATED",
    };
  } catch (err: any) {
    log.error(`[PineLabs] Payment initiation failed: ${err.message}`);
    throw new Error(`PineLabs payment failed: ${err.message}`);
  }
}

export async function verifyPineLabsCallback(params: Record<string, string>): Promise<{
  success: boolean;
  transactionId?: string;
  amount?: number;
}> {
  const secret = process.env.PINE_LABS_SECRET;
  if (!secret) return { success: false };

  const responseCode = params.ppc_TxnResponseCode;
  const txnId = params.ppc_UniqueMerchantTxnID;
  const amount = parseInt(params.ppc_Amount || "0");

  // Verify hash
  const receivedHash = params.ppc_DIA_SECRET;
  const hashFields = { ...params };
  delete hashFields.ppc_DIA_SECRET;
  const hashString = Object.keys(hashFields).sort().map(k => hashFields[k]).join("");
  const expectedHash = crypto.createHmac("sha256", secret).update(hashString).digest("hex").toUpperCase();

  if (receivedHash !== expectedHash) {
    log.warn(`[PineLabs] Hash mismatch for txn ${txnId}`);
    return { success: false };
  }

  return {
    success: responseCode === "1",
    transactionId: txnId,
    amount,
  };
}
