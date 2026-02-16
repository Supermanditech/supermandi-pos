// WA-001: WhatsApp Business Cloud API Service
// Pattern: razorpayOrderService.ts (raw fetch, env vars, graceful degradation)
// API: Meta Graph API v22.0

// ===== ENV CONFIG =====
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || "";
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "";
const WHATSAPP_API_VERSION = "v22.0";
const WHATSAPP_API_BASE = `https://graph.facebook.com/${WHATSAPP_API_VERSION}`;

// ===== GRACEFUL DEGRADATION =====
export function isWhatsAppConfigured(): boolean {
  return !!(WHATSAPP_ACCESS_TOKEN && WHATSAPP_PHONE_NUMBER_ID);
}

if (!isWhatsAppConfigured()) {
  const missing = [
    !WHATSAPP_ACCESS_TOKEN && "WHATSAPP_ACCESS_TOKEN",
    !WHATSAPP_PHONE_NUMBER_ID && "WHATSAPP_PHONE_NUMBER_ID",
  ].filter(Boolean);
  console.warn(
    `[WhatsAppService] WARNING: Not configured (missing: ${missing.join(", ")}). ` +
    `Cloud API messaging DISABLED. Deep link sharing still works.`
  );
}

// ===== RATE LIMITING =====
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_PER_MIN = 3;
const RATE_LIMIT_PER_HOUR = 10;

// Clean up old entries every 10 minutes
setInterval(() => {
  const cutoff = Date.now() - 3600_000;
  for (const [phone, timestamps] of rateLimitMap) {
    const recent = timestamps.filter((t) => t > cutoff);
    if (recent.length === 0) {
      rateLimitMap.delete(phone);
    } else {
      rateLimitMap.set(phone, recent);
    }
  }
}, 600_000);

function checkRateLimit(phone: string): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(phone) || [];

  const lastMinute = timestamps.filter((t) => t > now - 60_000).length;
  if (lastMinute >= RATE_LIMIT_PER_MIN) return false;

  const lastHour = timestamps.filter((t) => t > now - 3600_000).length;
  if (lastHour >= RATE_LIMIT_PER_HOUR) return false;

  timestamps.push(now);
  rateLimitMap.set(phone, timestamps);
  return true;
}

// ===== TYPES =====
export interface WhatsAppSendResult {
  sent: boolean;
  wamid?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface TemplateComponent {
  type: "body" | "header" | "button";
  parameters: Array<{ type: "text"; text: string }>;
}

// ===== PHONE NORMALIZATION =====
/**
 * Normalize phone to E.164 format for Indian numbers.
 * - Strips all non-digits
 * - If 10 digits, prepends "91"
 * - If starts with "0", removes leading "0" and prepends "91"
 * - Otherwise returns as-is
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");

  // 10-digit Indian mobile (must start with 6-9)
  if (digits.length === 10 && /^[6-9]/.test(digits)) {
    return `91${digits}`;
  }
  // 11-digit with leading 0 (Indian local format)
  if (digits.length === 11 && digits.startsWith("0") && /^[6-9]/.test(digits.slice(1))) {
    return `91${digits.slice(1)}`;
  }
  // 12-digit with 91 prefix (already E.164)
  if (digits.length === 12 && digits.startsWith("91") && /^[6-9]/.test(digits.slice(2))) {
    return digits;
  }
  // Return as-is for other formats (will be caught by length check in callers)
  return digits;
}

// ===== CORE SEND FUNCTIONS =====

/**
 * Send a template message via WhatsApp Cloud API.
 * Templates must be pre-approved by Meta.
 */
export async function sendTemplateMessage(params: {
  to: string;
  templateName: string;
  languageCode?: string;
  components?: TemplateComponent[];
}): Promise<WhatsAppSendResult> {
  if (!isWhatsAppConfigured()) {
    return { sent: false, errorCode: "NOT_CONFIGURED", errorMessage: "WhatsApp not configured" };
  }

  const phone = normalizePhone(params.to);
  if (phone.length < 10) {
    return { sent: false, errorCode: "INVALID_PHONE", errorMessage: "Phone number too short" };
  }

  if (!checkRateLimit(phone)) {
    return { sent: false, errorCode: "RATE_LIMITED", errorMessage: "Too many messages to this number" };
  }

  const body: Record<string, unknown> = {
    messaging_product: "whatsapp",
    to: phone,
    type: "template",
    template: {
      name: params.templateName,
      language: { code: params.languageCode || "en_US" },
      ...(params.components ? { components: params.components } : {}),
    },
  };

  return callMetaApi(body);
}

/**
 * Send a plain text message via WhatsApp Cloud API.
 * Can only be sent within 24-hour customer service window (after customer messages first)
 * or as a response to a customer-initiated conversation.
 */
export async function sendTextMessage(params: {
  to: string;
  body: string;
}): Promise<WhatsAppSendResult> {
  if (!isWhatsAppConfigured()) {
    return { sent: false, errorCode: "NOT_CONFIGURED", errorMessage: "WhatsApp not configured" };
  }

  const phone = normalizePhone(params.to);
  if (phone.length < 10) {
    return { sent: false, errorCode: "INVALID_PHONE", errorMessage: "Phone number too short" };
  }

  if (!checkRateLimit(phone)) {
    return { sent: false, errorCode: "RATE_LIMITED", errorMessage: "Too many messages to this number" };
  }

  const body = {
    messaging_product: "whatsapp",
    to: phone,
    type: "text",
    text: { body: params.body },
  };

  return callMetaApi(body);
}

/**
 * Convenience: Send bill receipt as a text message.
 * Uses text mode (works within customer service window).
 * For business-initiated messages, switch to template mode after Meta approves the bill_receipt template.
 */
export async function sendBillReceipt(params: {
  to: string;
  storeName: string;
  billRef: string;
  amount: string;
  paymentMode: string;
}): Promise<WhatsAppSendResult> {
  const text = [
    `Thank you for shopping at ${params.storeName}!`,
    "",
    `Bill #${params.billRef}`,
    `Amount: ${params.amount}`,
    `Payment: ${params.paymentMode}`,
    "",
    "Visit again! - SuperMandi POS",
  ].join("\n");

  return sendTextMessage({ to: params.to, body: text });
}

// ===== WEBHOOK VERIFICATION =====
export function getWebhookVerifyToken(): string {
  return WHATSAPP_VERIFY_TOKEN;
}

// ===== META API CALLER =====
async function callMetaApi(body: Record<string, unknown>): Promise<WhatsAppSendResult> {
  try {
    const url = `${WHATSAPP_API_BASE}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });

    const data = (await response.json()) as {
      messages?: Array<{ id: string }>;
      error?: { message: string; code: number; error_subcode?: number };
    };

    if (!response.ok || data.error) {
      const errMsg = data.error?.message || `Meta API error: ${response.status}`;
      const errCode = data.error?.code ? String(data.error.code) : String(response.status);
      console.error(`[WhatsAppService] Send failed: ${errMsg}`);
      return { sent: false, errorCode: errCode, errorMessage: errMsg };
    }

    const wamid = data.messages?.[0]?.id;
    return { sent: true, wamid };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[WhatsAppService] Request failed: ${message}`);
    return { sent: false, errorCode: "REQUEST_FAILED", errorMessage: message };
  }
}
