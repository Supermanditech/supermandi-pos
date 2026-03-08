/**
 * RO-008: Notification Service — Onboarding SMS + Email
 *
 * Orchestrates sending SMS and Email after successful registration.
 * Failures are logged as warnings — never blocks registration.
 */

import { sendSms, isSmsServiceEnabled } from "./smsService";
import {
  isEmailServiceEnabled,
  type SendEmailResult,
} from "./emailService";
import { sendTextMessage, isWhatsAppConfigured } from "./whatsappService";
import { getOnboardingConfig } from "../config/onboardingConfig";
import { log } from "../lib/logger";

// =============================================================================
// TYPES
// =============================================================================

export interface OnboardingNotificationInput {
  phone: string;
  email?: string;
  storeCode: string;
  ownerName: string;
}

export interface OnboardingNotificationResult {
  smsSent: boolean;
  smsError?: string;
  emailSent: boolean;
  emailError?: string;
}

// =============================================================================
// INTERNAL: Email sending via Resend/SMTP
// =============================================================================

/**
 * Send a generic email using the existing email infrastructure.
 * Re-uses the Resend/SMTP providers from emailService.
 */
async function sendGenericEmail(
  to: string,
  subject: string,
  html: string,
  text: string
): Promise<SendEmailResult> {
  const provider = (process.env.EMAIL_PROVIDER || "disabled").toLowerCase();

  if (provider === "disabled") {
    return { sent: false, errorCode: "EMAIL_DISABLED", errorMessage: "Email is disabled" };
  }

  if (provider === "resend") {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return { sent: false, errorCode: "MISSING_API_KEY", errorMessage: "Resend API key not configured" };
    }

    const from = process.env.EMAIL_FROM || "SuperMandi <noreply@supermandi.tech>";
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [to], subject, html, text }),
    });

    const data = (await response.json()) as { id?: string; name?: string; message?: string };
    if (!response.ok) {
      log.error("[NotificationService] Resend API error:", data);
      return { sent: false, errorCode: data.name || "RESEND_ERROR", errorMessage: data.message || "Resend error" };
    }

    return { sent: true, messageId: data.id || "unknown" };
  }

  // SMTP fallback uses nodemailer — same pattern as emailService
  if (provider === "smtp") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const nodemailer = require("nodemailer") as typeof import("nodemailer");
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || "",
        port: parseInt(process.env.SMTP_PORT || "587", 10),
        secure: process.env.SMTP_SECURE === "true",
        auth: { user: process.env.SMTP_USER || "", pass: process.env.SMTP_PASS || "" },
      });

      const from = process.env.EMAIL_FROM || "SuperMandi <noreply@supermandi.tech>";
      const info = await transporter.sendMail({ from, to, subject, text, html });
      return { sent: true, messageId: info.messageId as string };
    } catch (err) {
      return {
        sent: false,
        errorCode: "SMTP_ERROR",
        errorMessage: err instanceof Error ? err.message : "SMTP send failed",
      };
    }
  }

  return { sent: false, errorCode: "UNKNOWN_PROVIDER", errorMessage: `Unknown provider: ${provider}` };
}

// =============================================================================
// SMS TEMPLATE
// =============================================================================

function buildOnboardingSms(storeCode: string, portalUrl: string, posAppUrl: string): string {
  // RO-008: No PII beyond phone itself — no GSTIN in SMS
  return `Welcome to SuperMandi! Your store code: ${storeCode}. Manage: ${portalUrl} | POS: ${posAppUrl}`;
}

// =============================================================================
// EMAIL TEMPLATE
// =============================================================================

function buildOnboardingEmailHtml(
  ownerName: string,
  storeCode: string,
  portalUrl: string,
  posAppUrl: string
): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to SuperMandi</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 32px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">SuperMandi</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 14px;">Welcome aboard!</p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px 32px;">
              <h2 style="color: #1f2937; margin: 0 0 16px 0; font-size: 20px; font-weight: 600;">
                Hello ${ownerName},
              </h2>
              <p style="color: #4b5563; margin: 0 0 24px 0; font-size: 15px; line-height: 1.6;">
                Your store has been successfully registered on SuperMandi. Here's everything you need to get started.
              </p>

              <!-- Store Code Box -->
              <div style="background-color: #f0fdf4; border: 2px solid #86efac; border-radius: 8px; padding: 24px; text-align: center; margin-bottom: 24px;">
                <p style="color: #166534; margin: 0 0 8px 0; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Your Store Code</p>
                <span style="font-family: 'Courier New', monospace; font-size: 32px; font-weight: 700; letter-spacing: 4px; color: #15803d;">
                  ${storeCode}
                </span>
              </div>

              <!-- Setup Steps -->
              <h3 style="color: #1f2937; margin: 0 0 16px 0; font-size: 16px; font-weight: 600;">Next Steps</h3>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                <tr>
                  <td style="padding: 12px 16px; background-color: #f9fafb; border-radius: 8px; margin-bottom: 8px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="32" style="vertical-align: top;">
                          <span style="display: inline-block; width: 24px; height: 24px; background-color: #10b981; color: white; border-radius: 50%; text-align: center; line-height: 24px; font-size: 12px; font-weight: 700;">1</span>
                        </td>
                        <td style="padding-left: 12px;">
                          <p style="color: #1f2937; margin: 0; font-size: 14px; font-weight: 600;">Manage Your Store Online</p>
                          <p style="color: #6b7280; margin: 4px 0 0 0; font-size: 13px;">
                            Visit the Retailer Portal to manage inventory, view orders, and more.
                          </p>
                          <a href="${portalUrl}" style="display: inline-block; margin-top: 8px; color: #10b981; font-size: 13px; font-weight: 600; text-decoration: none;">
                            Open Retailer Portal &rarr;
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                <tr>
                  <td style="padding: 12px 16px; background-color: #f9fafb; border-radius: 8px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="32" style="vertical-align: top;">
                          <span style="display: inline-block; width: 24px; height: 24px; background-color: #10b981; color: white; border-radius: 50%; text-align: center; line-height: 24px; font-size: 12px; font-weight: 700;">2</span>
                        </td>
                        <td style="padding-left: 12px;">
                          <p style="color: #1f2937; margin: 0; font-size: 14px; font-weight: 600;">Download the POS App</p>
                          <p style="color: #6b7280; margin: 4px 0 0 0; font-size: 13px;">
                            Install the SuperMandi POS app on your billing device to start selling.
                          </p>
                          <a href="${posAppUrl}" style="display: inline-block; margin-top: 8px; color: #10b981; font-size: 13px; font-weight: 600; text-decoration: none;">
                            Download POS App &rarr;
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Info Note -->
              <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 16px; border-radius: 0 8px 8px 0;">
                <p style="color: #1e40af; margin: 0; font-size: 13px; line-height: 1.5;">
                  <strong>Tip:</strong> Save your store code <strong>${storeCode}</strong> — you'll need it to enroll POS devices to your store.
                </p>
              </div>

              <!-- Support -->
              <p style="color: #6b7280; margin: 16px 0 0; font-size: 13px; line-height: 1.6;">
                Need help? Email us at <a href="mailto:${SUPPORT_EMAIL}" style="color:#10b981;text-decoration:none;">${SUPPORT_EMAIL}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 24px 32px; border-top: 1px solid #e5e7eb;">
              <p style="color: #6b7280; margin: 0; font-size: 12px; text-align: center; line-height: 1.5;">
                This email was sent by SuperMandi because you registered a store.<br>
                If you did not register, please ignore this email.<br>
                &copy; ${new Date().getFullYear()} SuperMandi. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildOnboardingEmailText(
  ownerName: string,
  storeCode: string,
  portalUrl: string,
  posAppUrl: string
): string {
  return `SUPERMANDI - Welcome aboard!

Hello ${ownerName},

Your store has been successfully registered on SuperMandi.

YOUR STORE CODE: ${storeCode}

NEXT STEPS:

1. Manage Your Store Online
   Visit the Retailer Portal: ${portalUrl}

2. Download the POS App
   Install on your billing device: ${posAppUrl}

TIP: Save your store code ${storeCode} — you'll need it to enroll POS devices.

Need help? Email us at ${SUPPORT_EMAIL}

---
This email was sent by SuperMandi because you registered a store.
If you did not register, please ignore this email.
© ${new Date().getFullYear()} SuperMandi. All rights reserved.
`;
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Send onboarding links (SMS + Email) after successful registration.
 *
 * Non-blocking: failures are logged as warnings, never thrown.
 * Call this AFTER registration completes — do not await in the main flow
 * if you want fire-and-forget behavior.
 */
export async function sendOnboardingLinks(
  input: OnboardingNotificationInput
): Promise<OnboardingNotificationResult> {
  const config = getOnboardingConfig();
  // portalBaseUrl = PORTAL_BASE_URL env var (e.g., "https://staging.supermandi.tech")
  // Retailer portal lives at /retailer/ path on the main domain
  const baseDomain = config.portalBaseUrl || "https://supermandi.tech";
  const portalUrl = `${baseDomain}/retailer/`;
  const posAppUrl = config.posAppDownloadUrl || POS_DOWNLOAD_URL;

  const result: OnboardingNotificationResult = {
    smsSent: false,
    emailSent: false,
  };

  // --- SMS ---
  if (isSmsServiceEnabled()) {
    try {
      const smsText = buildOnboardingSms(input.storeCode, portalUrl, posAppUrl);
      const smsResult = await sendSms(input.phone, smsText);
      result.smsSent = smsResult.sent;
      if (!smsResult.sent) {
        result.smsError = smsResult.errorMessage;
        log.warn(`[NotificationService] SMS not sent to ${input.phone}: ${smsResult.errorMessage}`);
      } else {
        log.info(`[NotificationService] Onboarding SMS sent to ${input.phone}`);
      }
    } catch (err) {
      result.smsError = err instanceof Error ? err.message : "SMS send failed";
      log.warn(`[NotificationService] SMS exception for ${input.phone}:`, result.smsError);
    }
  } else {
    log.info(`[NotificationService] SMS disabled — skipping onboarding SMS to ${input.phone}`);
  }

  // --- Email ---
  if (input.email && isEmailServiceEnabled()) {
    try {
      const subject = "Welcome to SuperMandi — Your Store is Ready!";
      const html = buildOnboardingEmailHtml(input.ownerName, input.storeCode, portalUrl, posAppUrl);
      const text = buildOnboardingEmailText(input.ownerName, input.storeCode, portalUrl, posAppUrl);

      const emailResult = await sendGenericEmail(input.email, subject, html, text);
      result.emailSent = emailResult.sent;
      if (!emailResult.sent) {
        result.emailError = emailResult.errorMessage;
        log.warn(`[NotificationService] Email not sent to ${input.email}: ${emailResult.errorMessage}`);
      } else {
        log.info(`[NotificationService] Onboarding email sent to ${input.email}`);
      }
    } catch (err) {
      result.emailError = err instanceof Error ? err.message : "Email send failed";
      log.warn(`[NotificationService] Email exception for ${input.email}:`, result.emailError);
    }
  } else if (input.email && !isEmailServiceEnabled()) {
    log.info(`[NotificationService] Email disabled — skipping onboarding email to ${input.email}`);
  }

  return result;
}

// =============================================================================
// DRX-003: ENROLLMENT CODE NOTIFICATION
// =============================================================================

export interface EnrollmentCodeNotificationInput {
  phone: string;
  email?: string;
  ownerName: string;
  storeCode: string;
  enrollmentCode: string;
  expiresAt: string;
}

/**
 * Send enrollment code to retailer via SMS + Email.
 * Used by SuperAdmin "Send Enrollment Code" action.
 */
export async function sendEnrollmentCode(
  input: EnrollmentCodeNotificationInput
): Promise<OnboardingNotificationResult> {
  const result: OnboardingNotificationResult = {
    smsSent: false,
    emailSent: false,
  };

  const expiresIn = Math.round(
    (new Date(input.expiresAt).getTime() - Date.now()) / 60000
  );
  const expiresLabel = expiresIn > 0 ? `Expires in ${expiresIn} min.` : "Expires soon.";

  // --- SMS ---
  if (isSmsServiceEnabled()) {
    try {
      const smsText = `SuperMandi: Your POS enrollment code is ${input.enrollmentCode}. ${expiresLabel} Open your POS app and enter this code to link your device.`;
      const smsResult = await sendSms(input.phone, smsText);
      result.smsSent = smsResult.sent;
      if (!smsResult.sent) {
        result.smsError = smsResult.errorMessage;
      }
    } catch (err) {
      result.smsError = err instanceof Error ? err.message : "SMS failed";
    }
  }

  // --- Email ---
  if (input.email && isEmailServiceEnabled()) {
    try {
      const subject = `SuperMandi — Your POS Enrollment Code: ${input.enrollmentCode}`;
      const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background-color:#f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:600px;background-color:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
        <tr><td style="background:linear-gradient(135deg,#10b981 0%,#059669 100%);padding:32px;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:28px;">SuperMandi</h1>
          <p style="color:rgba(255,255,255,0.9);margin:8px 0 0 0;font-size:14px;">POS Device Enrollment</p>
        </td></tr>
        <tr><td style="padding:40px 32px;">
          <h2 style="color:#1f2937;margin:0 0 16px;font-size:20px;">Hello ${input.ownerName},</h2>
          <p style="color:#4b5563;margin:0 0 24px;font-size:15px;line-height:1.6;">
            Use the code below to enroll your POS device for store <strong>${input.storeCode}</strong>.
          </p>
          <div style="background-color:#f0fdf4;border:2px dashed #86efac;border-radius:8px;padding:24px;text-align:center;margin-bottom:24px;">
            <p style="color:#166534;margin:0 0 8px;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Enrollment Code</p>
            <span style="font-family:'Courier New',monospace;font-size:36px;font-weight:700;letter-spacing:4px;color:#15803d;">
              ${input.enrollmentCode}
            </span>
          </div>
          <div style="background-color:#fef3c7;border-left:4px solid #f59e0b;padding:16px;border-radius:0 8px 8px 0;">
            <p style="color:#92400e;margin:0;font-size:13px;line-height:1.5;">
              <strong>${expiresLabel}</strong> Open the SuperMandi POS app on your device and enter this code when prompted.
            </p>
          </div>
        </td></tr>
        <tr><td style="background-color:#f9fafb;padding:24px 32px;border-top:1px solid #e5e7eb;">
          <p style="color:#6b7280;margin:0;font-size:12px;text-align:center;">&copy; ${new Date().getFullYear()} SuperMandi. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
      const text = `SuperMandi POS Enrollment\n\nHello ${input.ownerName},\n\nYour POS enrollment code for store ${input.storeCode}: ${input.enrollmentCode}\n\n${expiresLabel}\n\nOpen the SuperMandi POS app and enter this code to link your device.`;
      const emailResult = await sendGenericEmail(input.email, subject, html, text);
      result.emailSent = emailResult.sent;
      if (!emailResult.sent) {
        result.emailError = emailResult.errorMessage;
      }
    } catch (err) {
      result.emailError = err instanceof Error ? err.message : "Email failed";
    }
  }

  return result;
}

// =============================================================================
// #330/#333: WELCOME NOTIFICATION (WhatsApp + SMS + Email) — no activation code
// Activation code auto-fetched by POS via phone lookup, not sent in message.
//
// URLs are env-configurable for GCP parity (staging vs production).
// PORTAL_BASE_URL and POS_APP_DOWNLOAD_URL are set in deploy.yml per environment.
// =============================================================================

const DEFAULT_POS_DOWNLOAD_URL = "https://play.google.com/apps/testing/com.supermanditech.supermandipos";
const POS_DOWNLOAD_URL = process.env.POS_APP_DOWNLOAD_URL || DEFAULT_POS_DOWNLOAD_URL;

const SUPPORT_EMAIL = "hello@supermandi.tech";

function getWelcomeUrls() {
  // PORTAL_BASE_URL = "https://staging.supermandi.tech" (staging) or "https://supermandi.tech" (prod)
  // Retailer portal lives at /retailer/ path on the main domain
  const baseDomain = process.env.PORTAL_BASE_URL || "https://supermandi.tech";
  return {
    portalUrl: `${baseDomain}/retailer/`,
    registerUrl: `${baseDomain}/retailer/register`,
    websiteUrl: baseDomain,
    posDownloadUrl: POS_DOWNLOAD_URL,
  };
}

/** Mask phone for display: +91XXXXXXX383 */
function maskPhone(phone: string): string {
  if (phone.length <= 4) return phone;
  const last4 = phone.slice(-4);
  const prefix = phone.slice(0, phone.length - 10 > 0 ? phone.length - 10 : 0);
  return `${prefix}XXXXXX${last4}`;
}

export interface WelcomeNotificationInput {
  phone: string;
  email?: string;
  ownerName: string;
  storeName: string;
  storeCode: string;
  activationCode?: string;
}

export interface WelcomeNotificationResult {
  whatsappSent: boolean;
  whatsappError?: string;
  smsSent: boolean;
  smsError?: string;
  emailSent: boolean;
  emailError?: string;
}

/**
 * Send welcome message to retailer after SuperAdmin approval.
 * Contains download links + portal URL. Activation code NOT included —
 * POS fetches code automatically via phone number lookup.
 */
export async function sendWelcomeNotification(
  input: WelcomeNotificationInput
): Promise<WelcomeNotificationResult> {
  const urls = getWelcomeUrls();
  const result: WelcomeNotificationResult = {
    whatsappSent: false,
    smsSent: false,
    emailSent: false,
  };

  // --- WhatsApp (primary channel) ---
  if (isWhatsAppConfigured()) {
    try {
      const waMsg = buildWelcomeWhatsApp(input, urls);
      const waResult = await sendTextMessage({ to: input.phone, body: waMsg });
      result.whatsappSent = waResult.sent;
      if (!waResult.sent) {
        result.whatsappError = waResult.errorMessage;
        log.warn(`[NotificationService] WhatsApp welcome not sent to ${input.phone}: ${waResult.errorMessage}`);
      } else {
        log.info(`[NotificationService] WhatsApp welcome sent to ${input.phone}`);
      }
    } catch (err) {
      result.whatsappError = err instanceof Error ? err.message : "WhatsApp failed";
      log.warn(`[NotificationService] WhatsApp exception for ${input.phone}:`, result.whatsappError);
    }
  }

  // --- SMS (fallback) ---
  if (isSmsServiceEnabled()) {
    try {
      const smsText = `SuperMandi: Your store "${input.storeName}" is approved! Download the POS app: ${urls.posDownloadUrl} — enter your registered phone to activate.${input.activationCode ? ` Code: ${input.activationCode}` : ""}`;
      const smsResult = await sendSms(input.phone, smsText);
      result.smsSent = smsResult.sent;
      if (!smsResult.sent) {
        result.smsError = smsResult.errorMessage;
      }
    } catch (err) {
      result.smsError = err instanceof Error ? err.message : "SMS failed";
    }
  }

  // --- Email ---
  if (input.email && isEmailServiceEnabled()) {
    try {
      const subject = `Congratulations! Your Store "${input.storeName}" is Approved — SuperMandi`;
      const html = buildWelcomeEmailHtml(input, urls);
      const text = buildWelcomeEmailText(input, urls);
      const emailResult = await sendGenericEmail(input.email, subject, html, text);
      result.emailSent = emailResult.sent;
      if (!emailResult.sent) {
        result.emailError = emailResult.errorMessage;
      }
    } catch (err) {
      result.emailError = err instanceof Error ? err.message : "Email failed";
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// WhatsApp welcome message — professional, device-specific instructions
// ---------------------------------------------------------------------------
function buildWelcomeWhatsApp(
  input: WelcomeNotificationInput,
  urls: ReturnType<typeof getWelcomeUrls>
): string {
  const maskedPhone = maskPhone(input.phone);
  const lines = [
    `Dear ${input.ownerName},`,
    ``,
    `Congratulations! Your store *"${input.storeName}"* (${input.storeCode}) has been approved on SuperMandi.`,
    ``,
  ];
  if (input.activationCode) {
    lines.push(
      `*Your Activation Code:* ${input.activationCode}`,
      `(Use this if automatic activation does not work)`,
      ``,
    );
  }
  lines.push(
    `*How to activate your POS:*`,
    ``,
    `1. Download the SuperMandi POS app:`,
    `   ${urls.posDownloadUrl}`,
    `2. Open the app and enter your registered phone number (${maskedPhone})`,
    `3. Your store will be activated automatically`,
    ``,
    `*Manage your store online:*`,
    `${urls.portalUrl}`,
    ``,
    `For any assistance, email ${SUPPORT_EMAIL} or visit ${urls.websiteUrl}`,
    ``,
    `Warm regards,`,
    `SuperMandi Tech Pvt Ltd`,
  );
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Email (HTML) — professional layout with device-specific instructions
// ---------------------------------------------------------------------------
function buildWelcomeEmailHtml(
  input: WelcomeNotificationInput,
  urls: ReturnType<typeof getWelcomeUrls>
): string {
  const maskedPhone = maskPhone(input.phone);
  const activationCodeBlock = input.activationCode
    ? `<div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:20px;text-align:center;margin-bottom:16px;">
            <p style="color:#92400e;margin:0 0 8px;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Activation Code (if needed)</p>
            <span style="font-family:'Courier New',monospace;font-size:28px;font-weight:700;letter-spacing:4px;color:#b45309;">${input.activationCode}</span>
            <p style="color:#92400e;margin:8px 0 0;font-size:12px;">Use this code only if automatic activation does not work.</p>
          </div>`
    : "";
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background-color:#f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:600px;background-color:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#10b981 0%,#059669 100%);padding:32px;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:28px;font-weight:700;">SuperMandi</h1>
          <p style="color:rgba(255,255,255,0.9);margin:8px 0 0;font-size:14px;">Your Store is Approved!</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:40px 32px;">
          <h2 style="color:#1f2937;margin:0 0 16px;font-size:20px;font-weight:600;">Dear ${input.ownerName},</h2>
          <p style="color:#4b5563;margin:0 0 24px;font-size:15px;line-height:1.6;">
            Congratulations! Your store <strong>&ldquo;${input.storeName}&rdquo;</strong> (${input.storeCode}) has been approved on SuperMandi. You are now ready to start billing your customers digitally.
          </p>

          ${activationCodeBlock}

          <!-- How to activate -->
          <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:20px;margin-bottom:16px;">
            <h3 style="color:#166534;margin:0 0 12px;font-size:15px;font-weight:600;">How to Activate Your POS</h3>
            <ol style="color:#4b5563;margin:0 0 16px;padding-left:20px;font-size:14px;line-height:1.8;">
              <li>Download the SuperMandi POS app using the button below</li>
              <li>Open the app and enter your registered phone number (<strong>${maskedPhone}</strong>)</li>
              <li>Your store will be activated automatically</li>
            </ol>
            <div style="text-align:center;">
              <a href="${urls.posDownloadUrl}" style="display:inline-block;padding:10px 20px;background:#10b981;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;font-size:13px;">Download SuperMandi POS App</a>
            </div>
          </div>

          <!-- Portal link -->
          <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;text-align:center;margin-bottom:24px;">
            <p style="color:#4b5563;margin:0 0 8px;font-size:14px;">Manage your store, inventory, and orders online:</p>
            <a href="${urls.portalUrl}" style="color:#10b981;font-weight:600;font-size:14px;text-decoration:none;">${urls.portalUrl}</a>
          </div>

          <!-- Support -->
          <p style="color:#6b7280;margin:0;font-size:13px;line-height:1.6;">
            For any assistance, email <a href="mailto:${SUPPORT_EMAIL}" style="color:#10b981;text-decoration:none;">${SUPPORT_EMAIL}</a> or visit <a href="${urls.websiteUrl}" style="color:#10b981;text-decoration:none;">${urls.websiteUrl}</a>
          </p>
        </td></tr>

        <!-- Sign-off -->
        <tr><td style="padding:0 32px 32px;">
          <p style="color:#4b5563;margin:0;font-size:14px;line-height:1.6;">
            Warm regards,<br>
            <strong>SuperMandi Tech Pvt Ltd</strong>
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background-color:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb;">
          <p style="color:#9ca3af;margin:0;font-size:11px;text-align:center;line-height:1.5;">
            &copy; ${year} SuperMandi Tech Pvt Ltd. All rights reserved.<br>
            <a href="${urls.websiteUrl}" style="color:#9ca3af;">${urls.websiteUrl}</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Supplier Approval Notification
// REQ.SUPERADMIN.APPROVAL_MATRIX: Parity — supplier gets email on approval, same as retailer.
// ---------------------------------------------------------------------------
export interface SupplierApprovalNotificationInput {
  email: string;
  contactName?: string;
  businessName: string;
  supplierId: string;
}

export interface SupplierApprovalNotificationResult {
  emailSent: boolean;
  emailError?: string;
}

export async function sendSupplierApprovalNotification(
  input: SupplierApprovalNotificationInput
): Promise<SupplierApprovalNotificationResult> {
  const result: SupplierApprovalNotificationResult = { emailSent: false };

  if (!isEmailServiceEnabled()) return result;

  // REQ.REGRESSION.BACKEND.SUPPLIER_APPROVAL_URL_ENV_PARITY: derive from PORTAL_BASE_URL so
  // staging links point to staging domain, not production. Mirrors retailer onboarding pattern.
  const baseDomain = process.env.PORTAL_BASE_URL || 'https://supermandi.tech';
  const portalUrl = process.env.SUPPLIER_PORTAL_URL || `${baseDomain}/supplier/`;
  const websiteUrl = process.env.WEBSITE_URL || baseDomain;
  const year = new Date().getFullYear();
  const name = input.contactName || input.businessName;
  const subject = `Your SuperMandi Supplier Account is Approved — Welcome Aboard!`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 0;">
<tr><td align="center">
  <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <tr><td style="background:#16a34a;padding:28px 32px;text-align:center;">
      <h1 style="margin:0;color:#ffffff;font-size:24px;letter-spacing:1px;">SuperMandi</h1>
    </td></tr>
    <tr><td style="padding:32px;">
      <h2 style="color:#111827;margin:0 0 16px;">Your Supplier Account is Approved!</h2>
      <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">Dear ${name},</p>
      <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 24px;">
        Congratulations! Your supplier account for <strong>${input.businessName}</strong> has been approved on SuperMandi.
        You can now log in to the Supplier Portal to manage your products, orders, and inventory.
      </p>
      <div style="text-align:center;margin:24px 0;">
        <a href="${portalUrl}" style="display:inline-block;background:#16a34a;color:#ffffff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;">Go to Supplier Portal</a>
      </div>
      <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:24px 0 0;">
        If you have any questions, visit <a href="${websiteUrl}" style="color:#16a34a;">${websiteUrl}</a>
      </p>
    </td></tr>
    <tr><td style="background:#f3f4f6;padding:16px 32px;text-align:center;">
      <p style="margin:0;color:#9ca3af;font-size:12px;">&copy; ${year} SuperMandi Tech Pvt Ltd. All rights reserved.</p>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;

  const text = `SUPERMANDI — Your Supplier Account is Approved!

Dear ${name},

Congratulations! Your supplier account for "${input.businessName}" has been approved on SuperMandi.

Log in to the Supplier Portal to get started:
${portalUrl}

For any assistance, visit ${websiteUrl}

Warm regards,
SuperMandi Tech Pvt Ltd

---
© ${year} SuperMandi Tech Pvt Ltd. All rights reserved.
`;

  try {
    const emailResult = await sendGenericEmail(input.email, subject, html, text);
    result.emailSent = emailResult.sent;
    if (!emailResult.sent) {
      result.emailError = emailResult.errorMessage;
      log.warn(`[NotificationService] Supplier approval email not sent to ${input.email}: ${emailResult.errorMessage}`);
    } else {
      log.info(`[NotificationService] Supplier approval email sent to ${input.email}`);
    }
  } catch (err) {
    result.emailError = err instanceof Error ? err.message : 'Email failed';
    log.warn(`[NotificationService] Supplier approval email error for ${input.email}:`, result.emailError);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Email (plain text) — fallback for clients that don't render HTML
// ---------------------------------------------------------------------------
function buildWelcomeEmailText(
  input: WelcomeNotificationInput,
  urls: ReturnType<typeof getWelcomeUrls>
): string {
  const maskedPhone = maskPhone(input.phone);
  const activationLine = input.activationCode
    ? `\nACTIVATION CODE (if needed): ${input.activationCode}\nUse this code only if automatic activation does not work.\n`
    : "";
  const year = new Date().getFullYear();
  return `SUPERMANDI — Your Store is Approved!

Dear ${input.ownerName},

Congratulations! Your store "${input.storeName}" (${input.storeCode}) has been approved on SuperMandi. You are now ready to start billing your customers digitally.
${activationLine}
HOW TO ACTIVATE YOUR POS
=========================

1. Download the SuperMandi POS app: ${urls.posDownloadUrl}
2. Open the app and enter your registered phone number (${maskedPhone})
3. Your store will be activated automatically

MANAGE YOUR STORE ONLINE
=========================
${urls.portalUrl}

For any assistance, email ${SUPPORT_EMAIL} or visit ${urls.websiteUrl}

Warm regards,
SuperMandi Tech Pvt Ltd

---
© ${year} SuperMandi Tech Pvt Ltd. All rights reserved.
${urls.websiteUrl}
`;
}
