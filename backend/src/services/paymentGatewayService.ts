// GCP-STG-0088: Payment Gateway Abstraction Layer
// Unified interface for PhonePe, PineLabs, and Razorpay
// Handles gateway selection, webhook verification, and status sync

import crypto from "crypto";
import type { Pool, PoolClient } from "pg";
import { log } from "../lib/logger";

// =============================================================================
// Types
// =============================================================================

export type GatewayProvider = "PHONEPE" | "PINE_LABS" | "RAZORPAY" | "UPI_DIRECT";

export interface GatewayConfig {
  defaultGateway: GatewayProvider;
  enabledGateways: GatewayProvider[];
  gatewaySettings?: Record<string, unknown>;
}

export interface GatewayStatus {
  provider: GatewayProvider;
  configured: boolean;
  enabled: boolean;
  details: string;
}

export interface WebhookVerificationResult {
  valid: boolean;
  provider: GatewayProvider;
  transactionId?: string;
  status?: string;
  amountMinor?: number;
  error?: string;
}

// =============================================================================
// Gateway Configuration
// =============================================================================

const DEFAULT_GATEWAY_CONFIG: GatewayConfig = {
  defaultGateway: "UPI_DIRECT",
  enabledGateways: ["UPI_DIRECT", "RAZORPAY"],
};

/**
 * Get gateway config for a store. Falls back to default if not configured.
 */
export async function getStoreGatewayConfig(
  pool: Pool,
  storeId: string
): Promise<GatewayConfig> {
  try {
    const result = await pool.query(
      `SELECT payment_gateway_config FROM platform.stores WHERE id = $1::uuid`,
      [storeId]
    );
    if (result.rows.length > 0 && result.rows[0].payment_gateway_config) {
      return { ...DEFAULT_GATEWAY_CONFIG, ...result.rows[0].payment_gateway_config };
    }
  } catch {
    // Column may not exist yet
  }
  return DEFAULT_GATEWAY_CONFIG;
}

/**
 * Update gateway config for a store.
 */
export async function updateStoreGatewayConfig(
  pool: Pool,
  storeId: string,
  config: Partial<GatewayConfig>
): Promise<void> {
  const current = await getStoreGatewayConfig(pool, storeId);
  const merged = { ...current, ...config };

  // Validate
  const validGateways: GatewayProvider[] = ["PHONEPE", "PINE_LABS", "RAZORPAY", "UPI_DIRECT"];
  if (!validGateways.includes(merged.defaultGateway)) {
    throw new Error(`Invalid default gateway: ${merged.defaultGateway}`);
  }
  for (const gw of merged.enabledGateways) {
    if (!validGateways.includes(gw)) {
      throw new Error(`Invalid gateway in enabled list: ${gw}`);
    }
  }
  if (!merged.enabledGateways.includes(merged.defaultGateway)) {
    throw new Error("Default gateway must be in the enabled gateways list");
  }

  await pool.query(
    `UPDATE platform.stores SET payment_gateway_config = $1::jsonb WHERE id = $2::uuid`,
    [JSON.stringify(merged), storeId]
  );
}

// =============================================================================
// Gateway Status Check
// =============================================================================

export function getGatewayStatuses(): GatewayStatus[] {
  return [
    {
      provider: "RAZORPAY",
      configured: !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
      enabled: true,
      details: process.env.RAZORPAY_KEY_ID ? `Key: ${process.env.RAZORPAY_KEY_ID.substring(0, 8)}...` : "Not configured",
    },
    {
      provider: "PHONEPE",
      configured: !!(process.env.PHONEPE_MERCHANT_ID && process.env.PHONEPE_SALT_KEY),
      enabled: true,
      details: process.env.PHONEPE_MERCHANT_ID ? `Merchant: ${process.env.PHONEPE_MERCHANT_ID}` : "Not configured",
    },
    {
      provider: "PINE_LABS",
      configured: !!(process.env.PINE_LABS_MERCHANT_ID && process.env.PINE_LABS_SECRET),
      enabled: true,
      details: process.env.PINE_LABS_MERCHANT_ID ? `Merchant: ${process.env.PINE_LABS_MERCHANT_ID}` : "Not configured",
    },
    {
      provider: "UPI_DIRECT",
      configured: true, // Always available as fallback
      enabled: true,
      details: `VPA: ${process.env.SUPERMANDI_UPI_VPA || "supermandi@icici"}`,
    },
  ];
}

// =============================================================================
// PhonePe Webhook Verification
// =============================================================================

export function verifyPhonePeCallback(
  responseBase64: string,
  xVerify: string
): WebhookVerificationResult {
  const saltKey = process.env.PHONEPE_SALT_KEY;
  const saltIndex = process.env.PHONEPE_SALT_INDEX || "1";

  if (!saltKey) {
    log.warn("[PhonePe] Salt key not configured — accepting callback in dev mode");
    if (process.env.NODE_ENV === "production") {
      return { valid: false, provider: "PHONEPE", error: "Salt key not configured" };
    }
  }

  try {
    // Verify X-VERIFY header: SHA256(response + "/pg/v1/status" + saltKey) + ### + saltIndex
    if (saltKey && xVerify) {
      const hash = crypto.createHash("sha256")
        .update(responseBase64 + "/pg/v1/status/" + saltKey)
        .digest("hex");
      const expectedVerify = `${hash}###${saltIndex}`;

      if (xVerify !== expectedVerify) {
        return { valid: false, provider: "PHONEPE", error: "Signature mismatch" };
      }
    }

    // Decode response
    const decoded = JSON.parse(Buffer.from(responseBase64, "base64").toString("utf-8"));
    const data = decoded.data || {};

    return {
      valid: true,
      provider: "PHONEPE",
      transactionId: data.merchantTransactionId,
      status: decoded.code === "PAYMENT_SUCCESS" ? "paid" : decoded.code === "PAYMENT_PENDING" ? "pending" : "failed",
      amountMinor: data.amount,
    };
  } catch (err: any) {
    return { valid: false, provider: "PHONEPE", error: err.message };
  }
}

// =============================================================================
// PineLabs Webhook Verification
// =============================================================================

export function verifyPineLabsCallback(
  payload: Record<string, string>
): WebhookVerificationResult {
  const secret = process.env.PINE_LABS_SECRET;

  if (!secret) {
    log.warn("[PineLabs] Secret not configured — accepting callback in dev mode");
    if (process.env.NODE_ENV === "production") {
      return { valid: false, provider: "PINE_LABS", error: "Secret not configured" };
    }
  }

  try {
    // PineLabs sends response hash in 'pine_pg_hash' field
    if (secret && payload.pine_pg_hash) {
      const dataToHash = [
        payload.pine_pg_txn_status,
        payload.pine_pg_transaction_id,
        payload.pine_pg_amount,
        payload.pine_pg_order_id,
      ].join("|");
      const expectedHash = crypto.createHmac("sha256", secret).update(dataToHash).digest("hex");

      if (payload.pine_pg_hash !== expectedHash) {
        return { valid: false, provider: "PINE_LABS", error: "Hash mismatch" };
      }
    }

    const txnStatus = payload.pine_pg_txn_status;
    let status: string;
    if (txnStatus === "4" || txnStatus === "SUCCESS") status = "paid";
    else if (txnStatus === "2" || txnStatus === "PENDING") status = "pending";
    else status = "failed";

    return {
      valid: true,
      provider: "PINE_LABS",
      transactionId: payload.pine_pg_order_id || payload.pine_pg_transaction_id,
      status,
      amountMinor: payload.pine_pg_amount ? parseInt(payload.pine_pg_amount, 10) : undefined,
    };
  } catch (err: any) {
    return { valid: false, provider: "PINE_LABS", error: err.message };
  }
}

// =============================================================================
// Log Webhook for Audit
// =============================================================================

export async function logWebhookEvent(
  pool: Pool,
  provider: string,
  eventType: string,
  intentId: string | null,
  providerTxnId: string | null,
  status: string,
  payload: any,
  error?: string
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO procurement.payment_webhook_logs
       (provider, event_type, payment_intent_id, provider_transaction_id, status, raw_payload, error_message, processed_at)
       VALUES ($1, $2, $3::uuid, $4, $5, $6::jsonb, $7, NOW())`,
      [provider, eventType, intentId, providerTxnId, status, JSON.stringify(payload), error || null]
    );
  } catch (err: any) {
    log.error(`[webhook-log] Failed to log ${provider} event:`, err?.message);
  }
}

// =============================================================================
// Resolve Best Gateway for Transaction
// =============================================================================

/**
 * Select the best payment gateway for a transaction based on:
 * 1. Store's configured gateway preference
 * 2. Payment mode (UPI → PhonePe/UPI_DIRECT, Card → PineLabs/Razorpay)
 * 3. Gateway availability (credentials configured)
 */
export function resolveGateway(
  mode: string,
  storeConfig: GatewayConfig,
  explicitProvider?: string
): GatewayProvider {
  if (explicitProvider && storeConfig.enabledGateways.includes(explicitProvider as GatewayProvider)) {
    return explicitProvider as GatewayProvider;
  }

  // Mode-specific preference
  const modePreference: Record<string, GatewayProvider[]> = {
    UPI: ["PHONEPE", "UPI_DIRECT", "RAZORPAY"],
    BANK: ["RAZORPAY", "PINE_LABS"],
    CARD: ["PINE_LABS", "RAZORPAY"],
    CASH: ["UPI_DIRECT"],
    BNPL: ["UPI_DIRECT"],
    CREDIT: ["UPI_DIRECT"],
  };

  const preferences = modePreference[mode] || ["UPI_DIRECT"];
  const statuses = getGatewayStatuses();

  // Find first enabled + configured + in store's allowed list
  for (const pref of preferences) {
    if (
      storeConfig.enabledGateways.includes(pref) &&
      statuses.find((s) => s.provider === pref && s.configured)
    ) {
      return pref;
    }
  }

  // Fall back to store default
  return storeConfig.defaultGateway;
}
