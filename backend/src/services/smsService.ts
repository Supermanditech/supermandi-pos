import { log } from "../lib/logger";
/**
 * RO-008: SMS Service — Pluggable SMS Provider
 *
 * Provider configured via SMS_PROVIDER env var.
 * SMS_DISABLED=true → skips without error.
 * Rate limited: 2/min per phone number.
 */

// =============================================================================
// TYPES
// =============================================================================

export interface SendSmsResult {
  sent: boolean;
  messageId?: string;
  errorCode?: string;
  errorMessage?: string;
}

// =============================================================================
// RATE LIMITING: 2 per minute per phone
// =============================================================================

const smsRateLimits = new Map<string, number[]>();
const SMS_RATE_LIMIT_PER_MINUTE = 2;
// T-208: Add per-hour limit to prevent abuse over longer windows
const SMS_RATE_LIMIT_PER_HOUR = 5;

function checkSmsRateLimit(phone: string): string | null {
  const now = Date.now();
  const oneMinuteAgo = now - 60 * 1000;
  const oneHourAgo = now - 60 * 60 * 1000;

  let timestamps = smsRateLimits.get(phone);
  if (!timestamps) {
    timestamps = [];
    smsRateLimits.set(phone, timestamps);
  }

  // Clean entries older than 1 hour
  timestamps = timestamps.filter((t) => t > oneHourAgo);
  smsRateLimits.set(phone, timestamps);

  // Check per-minute limit
  const recentMinute = timestamps.filter((t) => t > oneMinuteAgo);
  if (recentMinute.length >= SMS_RATE_LIMIT_PER_MINUTE) {
    const waitSeconds = Math.ceil((recentMinute[0] + 60 * 1000 - now) / 1000);
    return `SMS rate limited. Wait ${waitSeconds}s.`;
  }

  // T-208: Check per-hour limit
  if (timestamps.length >= SMS_RATE_LIMIT_PER_HOUR) {
    const waitMinutes = Math.ceil((timestamps[0] + 60 * 60 * 1000 - now) / 60000);
    return `Too many SMS sent. Wait ${waitMinutes} minute(s).`;
  }

  return null;
}

function recordSmsSend(phone: string): void {
  let timestamps = smsRateLimits.get(phone);
  if (!timestamps) {
    timestamps = [];
    smsRateLimits.set(phone, timestamps);
  }
  timestamps.push(Date.now());
}

// Cleanup every 10 minutes (T-208: extended window to match hourly limit)
setInterval(() => {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  for (const [phone, timestamps] of smsRateLimits.entries()) {
    const filtered = timestamps.filter((t) => t > oneHourAgo);
    if (filtered.length === 0) {
      smsRateLimits.delete(phone);
    } else {
      smsRateLimits.set(phone, filtered);
    }
  }
}, 10 * 60 * 1000);

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Check if SMS service is enabled (not disabled + provider configured).
 */
export function isSmsServiceEnabled(): boolean {
  if (process.env.SMS_DISABLED === "true") return false;
  const provider = process.env.SMS_PROVIDER;
  return !!provider && provider !== "disabled";
}

/**
 * Send an SMS message.
 *
 * - Returns { sent: false } if SMS_DISABLED or no provider configured.
 * - Rate limited: 2/min per phone.
 * - Provider-specific logic is pluggable (currently log-only).
 */
export async function sendSms(
  phone: string,
  message: string
): Promise<SendSmsResult> {
  // Check disabled
  if (process.env.SMS_DISABLED === "true") {
    log.info(`[SmsService] SMS disabled — skipping send to ${phone}`);
    return { sent: false, errorCode: "SMS_DISABLED", errorMessage: "SMS is disabled" };
  }

  const provider = (process.env.SMS_PROVIDER || "disabled").toLowerCase();
  if (provider === "disabled" || !provider) {
    log.warn(`[SmsService] No SMS provider configured — skipping send to ${phone}`);
    return { sent: false, errorCode: "NO_PROVIDER", errorMessage: "SMS provider not configured" };
  }

  // Rate limit check
  const rateLimitMsg = checkSmsRateLimit(phone);
  if (rateLimitMsg) {
    log.warn(`[SmsService] Rate limited for ${phone}: ${rateLimitMsg}`);
    return { sent: false, errorCode: "RATE_LIMITED", errorMessage: rateLimitMsg };
  }

  try {
    let result: SendSmsResult;

    switch (provider) {
      // Future: add real providers here (twilio, msg91, gupshup, etc.)
      // case "twilio": result = await sendViaTwilio(phone, message); break;
      // case "msg91": result = await sendViaMsg91(phone, message); break;
      default:
        // Log-only provider for development / unrecognized providers
        log.info(`[SmsService] [${provider}] → ${phone}: ${message}`);
        result = { sent: true, messageId: `log-${Date.now()}` };
        break;
    }

    if (result.sent) {
      recordSmsSend(phone);
    }

    return result;
  } catch (err) {
    log.error(`[SmsService] Send failed to ${phone}:`, err instanceof Error ? err.message : err);
    return {
      sent: false,
      errorCode: "SEND_FAILED",
      errorMessage: err instanceof Error ? err.message : "SMS send failed",
    };
  }
}
