/**
 * V3-FIX-176: PhonePe payment provider adapter
 * Creates PhonePe payment requests for UPI procurement checkout.
 *
 * Required env vars (set before GCP deployment):
 *   PHONEPE_MERCHANT_ID   — from business.phonepe.com
 *   PHONEPE_SALT_KEY      — from business.phonepe.com
 *   PHONEPE_SALT_INDEX    — salt index (default: 1)
 *   PHONEPE_ENV           — 'PRODUCTION' or 'UAT' (default: UAT)
 *
 * GCP Secret Manager refs:
 *   phonepe-merchant-id
 *   phonepe-salt-key
 */

import crypto from "crypto";
import { log } from "../../lib/logger";

const PHONEPE_UAT_BASE = "https://api-preprod.phonepe.com/apis/pg-sandbox";
const PHONEPE_PROD_BASE = "https://api.phonepe.com/apis/hermes";

export interface PhonePePaymentResult {
  merchantTransactionId: string;
  redirectUrl: string;
  instrumentResponse?: {
    qrData?: string;
    deepLink?: string;
  };
}

export async function createPhonePePayment(params: {
  amountMinor: number;
  merchantTransactionId: string;
  merchantUserId: string;
  callbackUrl: string;
  redirectUrl: string;
}): Promise<PhonePePaymentResult> {
  const merchantId = process.env.PHONEPE_MERCHANT_ID;
  const saltKey = process.env.PHONEPE_SALT_KEY;
  const saltIndex = process.env.PHONEPE_SALT_INDEX || "1";
  const env = process.env.PHONEPE_ENV || "UAT";

  if (!merchantId || !saltKey) {
    log.warn("[PhonePe] PHONEPE_MERCHANT_ID or PHONEPE_SALT_KEY not set — using stub mode");
    const merchantVpa = process.env.SUPERMANDI_UPI_VPA || "supermandi@icici";
    const amountRupees = (params.amountMinor / 100).toFixed(2);
    return {
      merchantTransactionId: params.merchantTransactionId,
      redirectUrl: `upi://pay?pa=${merchantVpa}&pn=SuperMandi%20Tech&am=${amountRupees}&cu=INR&tn=${params.merchantTransactionId}`,
      instrumentResponse: {
        deepLink: `upi://pay?pa=${merchantVpa}&pn=SuperMandi%20Tech&am=${amountRupees}&cu=INR`,
        qrData: `upi://pay?pa=${merchantVpa}&pn=SuperMandi%20Tech&am=${amountRupees}&cu=INR`,
      },
    };
  }

  const baseUrl = env === "PRODUCTION" ? PHONEPE_PROD_BASE : PHONEPE_UAT_BASE;

  const payload = {
    merchantId,
    merchantTransactionId: params.merchantTransactionId,
    merchantUserId: params.merchantUserId,
    amount: params.amountMinor,
    redirectUrl: params.redirectUrl,
    redirectMode: "REDIRECT",
    callbackUrl: params.callbackUrl,
    paymentInstrument: { type: "PAY_PAGE" },
  };

  const base64Payload = Buffer.from(JSON.stringify(payload)).toString("base64");
  const checksumString = base64Payload + "/pg/v1/pay" + saltKey;
  const checksum = crypto.createHash("sha256").update(checksumString).digest("hex") + "###" + saltIndex;

  try {
    const response = await fetch(`${baseUrl}/pg/v1/pay`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-VERIFY": checksum,
      },
      body: JSON.stringify({ request: base64Payload }),
    });

    const data = await response.json() as any;

    if (!data.success) {
      throw new Error(data.message || "PhonePe payment initiation failed");
    }

    log.info(`[PhonePe] Payment initiated: ${params.merchantTransactionId}`);
    return {
      merchantTransactionId: params.merchantTransactionId,
      redirectUrl: data.data?.instrumentResponse?.redirectInfo?.url || "",
      instrumentResponse: {
        qrData: data.data?.instrumentResponse?.qrData,
        deepLink: data.data?.instrumentResponse?.redirectInfo?.url,
      },
    };
  } catch (err: any) {
    log.error(`[PhonePe] Payment initiation failed: ${err.message}`);
    throw new Error(`PhonePe payment failed: ${err.message}`);
  }
}

export async function checkPhonePeStatus(merchantTransactionId: string): Promise<{
  status: "SUCCESS" | "PENDING" | "FAILED";
  paymentId?: string;
}> {
  const merchantId = process.env.PHONEPE_MERCHANT_ID;
  const saltKey = process.env.PHONEPE_SALT_KEY;
  const saltIndex = process.env.PHONEPE_SALT_INDEX || "1";
  const env = process.env.PHONEPE_ENV || "UAT";

  if (!merchantId || !saltKey) {
    return { status: "PENDING" };
  }

  const baseUrl = env === "PRODUCTION" ? PHONEPE_PROD_BASE : PHONEPE_UAT_BASE;
  const path = `/pg/v1/status/${merchantId}/${merchantTransactionId}`;
  const checksumString = path + saltKey;
  const checksum = crypto.createHash("sha256").update(checksumString).digest("hex") + "###" + saltIndex;

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "GET",
      headers: { "X-VERIFY": checksum, "X-MERCHANT-ID": merchantId },
    });
    const data = await response.json() as any;
    const code = data.code;
    if (code === "PAYMENT_SUCCESS") return { status: "SUCCESS", paymentId: data.data?.transactionId };
    if (code === "PAYMENT_PENDING") return { status: "PENDING" };
    return { status: "FAILED" };
  } catch {
    return { status: "PENDING" };
  }
}
