// GL-WF-034: Email Service for OTP Verification
// GO-LIVE: Production email sending with Resend (primary) and SMTP (fallback)
// CRITICAL: This service must never lie about email delivery status

import crypto from 'crypto';

// =============================================================================
// TYPES
// =============================================================================

export interface EmailConfig {
  provider: 'resend' | 'smtp' | 'disabled';
  from: string;
  resendApiKey?: string;
  smtp?: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
  };
}

export interface SendEmailResult {
  sent: boolean;
  messageId?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface VerificationEmailData {
  to: string;
  code: string;
  expiryMinutes: number;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

function getEmailConfig(): EmailConfig {
  const provider = (process.env.EMAIL_PROVIDER || 'disabled').toLowerCase() as EmailConfig['provider'];
  const from = process.env.EMAIL_FROM || 'SuperMandi <noreply@supermandi.com>';

  const config: EmailConfig = {
    provider,
    from,
  };

  if (provider === 'resend') {
    config.resendApiKey = process.env.RESEND_API_KEY;
    if (!config.resendApiKey) {
      console.error('[EmailService] RESEND_API_KEY is required when EMAIL_PROVIDER=resend');
    }
  }

  if (provider === 'smtp') {
    config.smtp = {
      host: process.env.SMTP_HOST || '',
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    };
    if (!config.smtp.host || !config.smtp.user) {
      console.error('[EmailService] SMTP_HOST and SMTP_USER are required when EMAIL_PROVIDER=smtp');
    }
  }

  return config;
}

// =============================================================================
// OTP GENERATION (SECURE)
// =============================================================================

/**
 * Generate a cryptographically secure 6-digit OTP
 * Uses crypto.randomInt() for secure random generation
 */
export function generateSecureOTP(): string {
  return crypto.randomInt(100000, 999999).toString();
}

/**
 * Hash OTP for secure storage
 * Uses SHA-256 for one-way hashing
 */
export function hashOTP(otp: string): string {
  return crypto.createHash('sha256').update(otp).digest('hex');
}

/**
 * Verify OTP against stored hash
 * Uses timing-safe comparison to prevent timing attacks
 */
export function verifyOTPHash(otp: string, hash: string): boolean {
  const otpHash = hashOTP(otp);
  if (otpHash.length !== hash.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(otpHash), Buffer.from(hash));
}

// =============================================================================
// EMAIL HTML TEMPLATES
// =============================================================================

function getVerificationEmailHtml(code: string, expiryMinutes: number): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your SuperMandi Verification Code</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" max-width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 32px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">SuperMandi</h1>
              <p style="color: rgba(255, 255, 255, 0.9); margin: 8px 0 0 0; font-size: 14px;">Supplier Portal</p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px 32px;">
              <h2 style="color: #1f2937; margin: 0 0 16px 0; font-size: 20px; font-weight: 600;">Your Verification Code</h2>
              <p style="color: #4b5563; margin: 0 0 32px 0; font-size: 15px; line-height: 1.6;">
                Use the code below to verify your email address. This code will expire in <strong>${expiryMinutes} minutes</strong>.
              </p>

              <!-- OTP Code Box -->
              <div style="background-color: #f9fafb; border: 2px dashed #d1d5db; border-radius: 8px; padding: 24px; text-align: center; margin-bottom: 32px;">
                <span style="font-family: 'Courier New', monospace; font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #10b981;">
                  ${code}
                </span>
              </div>

              <!-- Security Note -->
              <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 0 8px 8px 0;">
                <p style="color: #92400e; margin: 0; font-size: 13px; line-height: 1.5;">
                  <strong>Security Notice:</strong> If you didn't request this verification code, please ignore this email. Never share this code with anyone. SuperMandi staff will never ask for your verification code.
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 24px 32px; border-top: 1px solid #e5e7eb;">
              <p style="color: #6b7280; margin: 0; font-size: 12px; text-align: center; line-height: 1.5;">
                This email was sent by SuperMandi. If you have any questions, contact our support team.<br>
                &copy; ${new Date().getFullYear()} SuperMandi. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
}

function getVerificationEmailText(code: string, expiryMinutes: number): string {
  return `
SUPERMANDI - Email Verification

Your verification code is: ${code}

This code will expire in ${expiryMinutes} minutes.

SECURITY NOTICE:
If you didn't request this verification code, please ignore this email.
Never share this code with anyone. SuperMandi staff will never ask for your verification code.

---
This email was sent by SuperMandi.
© ${new Date().getFullYear()} SuperMandi. All rights reserved.
`;
}

// =============================================================================
// EMAIL SENDING PROVIDERS
// =============================================================================

/**
 * Send email via Resend API
 */
async function sendViaResend(
  config: EmailConfig,
  to: string,
  subject: string,
  html: string,
  text: string
): Promise<SendEmailResult> {
  if (!config.resendApiKey) {
    return {
      sent: false,
      errorCode: 'MISSING_API_KEY',
      errorMessage: 'Resend API key is not configured',
    };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: config.from,
        to: [to],
        subject,
        html,
        text,
      }),
    });

    const data = await response.json() as { id?: string; name?: string; message?: string };

    if (!response.ok) {
      console.error('[EmailService] Resend API error:', data);
      return {
        sent: false,
        errorCode: data.name || 'RESEND_ERROR',
        errorMessage: data.message || 'Failed to send email via Resend',
      };
    }

    console.log(`[EmailService] Email sent via Resend to ${to}, messageId: ${data.id}`);
    return {
      sent: true,
      messageId: data.id || 'unknown',
    };
  } catch (error) {
    console.error('[EmailService] Resend request failed:', error);
    return {
      sent: false,
      errorCode: 'NETWORK_ERROR',
      errorMessage: error instanceof Error ? error.message : 'Network request failed',
    };
  }
}

/**
 * Send email via SMTP (Nodemailer)
 * Note: Requires nodemailer to be installed
 */
async function sendViaSMTP(
  config: EmailConfig,
  to: string,
  subject: string,
  html: string,
  text: string
): Promise<SendEmailResult> {
  if (!config.smtp?.host || !config.smtp?.user) {
    return {
      sent: false,
      errorCode: 'MISSING_SMTP_CONFIG',
      errorMessage: 'SMTP configuration is incomplete',
    };
  }

  try {
    // Dynamic import to avoid requiring nodemailer if not using SMTP
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodemailer = require('nodemailer') as typeof import('nodemailer');

    const transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass,
      },
    });

    const info = await transporter.sendMail({
      from: config.from,
      to,
      subject,
      text,
      html,
    });

    console.log(`[EmailService] Email sent via SMTP to ${to}, messageId: ${info.messageId}`);
    return {
      sent: true,
      messageId: info.messageId as string,
    };
  } catch (error) {
    // Handle nodemailer not being installed
    if (error instanceof Error && error.message.includes('Cannot find module')) {
      console.error('[EmailService] nodemailer is not installed. Run: pnpm add nodemailer');
      return {
        sent: false,
        errorCode: 'NODEMAILER_NOT_INSTALLED',
        errorMessage: 'SMTP provider requires nodemailer. Contact administrator.',
      };
    }
    console.error('[EmailService] SMTP send failed:', error);
    return {
      sent: false,
      errorCode: 'SMTP_ERROR',
      errorMessage: error instanceof Error ? error.message : 'Failed to send email via SMTP',
    };
  }
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Check if email service is configured and ready
 */
export function isEmailServiceEnabled(): boolean {
  const config = getEmailConfig();
  if (config.provider === 'disabled') {
    return false;
  }
  if (config.provider === 'resend') {
    return !!config.resendApiKey;
  }
  if (config.provider === 'smtp') {
    return !!(config.smtp?.host && config.smtp?.user);
  }
  return false;
}

/**
 * Get current email provider info (for health checks)
 */
export function getEmailProviderInfo(): { provider: string; configured: boolean } {
  const config = getEmailConfig();
  return {
    provider: config.provider,
    configured: isEmailServiceEnabled(),
  };
}

/**
 * Send verification email with OTP code
 * CRITICAL: Returns honest result - never lies about delivery status
 */
export async function sendVerificationEmail(
  data: VerificationEmailData
): Promise<SendEmailResult> {
  const config = getEmailConfig();

  // Log only in non-production for debugging (never log OTP in production)
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[EmailService] DEV: Sending verification email to ${data.to}`);
  } else {
    console.log(`[EmailService] Sending verification email to ${data.to}`);
  }

  // Check if email is disabled
  if (config.provider === 'disabled') {
    console.warn('[EmailService] Email provider is disabled');
    return {
      sent: false,
      errorCode: 'EMAIL_DISABLED',
      errorMessage: 'Email service is not configured. Contact administrator.',
    };
  }

  const subject = 'Your SuperMandi verification code';
  const html = getVerificationEmailHtml(data.code, data.expiryMinutes);
  const text = getVerificationEmailText(data.code, data.expiryMinutes);

  // Try primary provider (Resend)
  if (config.provider === 'resend') {
    const result = await sendViaResend(config, data.to, subject, html, text);
    if (result.sent) {
      return result;
    }

    // Resend failed - check if SMTP fallback is configured
    const smtpConfig = getEmailConfig();
    if (smtpConfig.smtp?.host && smtpConfig.smtp?.user) {
      console.log('[EmailService] Resend failed, trying SMTP fallback...');
      return sendViaSMTP(smtpConfig, data.to, subject, html, text);
    }

    return result;
  }

  // SMTP provider
  if (config.provider === 'smtp') {
    return sendViaSMTP(config, data.to, subject, html, text);
  }

  return {
    sent: false,
    errorCode: 'UNKNOWN_PROVIDER',
    errorMessage: `Unknown email provider: ${config.provider}`,
  };
}

// =============================================================================
// RATE LIMITING (In-Memory for now, should use Redis in production)
// =============================================================================

// Email rate limiting: 3 per minute per email, 10 per hour
const emailRateLimits = new Map<string, { minute: number[]; hour: number[] }>();

const RATE_LIMIT_PER_MINUTE = 3;
const RATE_LIMIT_PER_HOUR = 10;

/**
 * Check if email sending is rate limited
 * Returns error message if rate limited, null if OK
 */
export function checkEmailRateLimit(email: string): string | null {
  const now = Date.now();
  const oneMinuteAgo = now - 60 * 1000;
  const oneHourAgo = now - 60 * 60 * 1000;

  let limits = emailRateLimits.get(email);
  if (!limits) {
    limits = { minute: [], hour: [] };
    emailRateLimits.set(email, limits);
  }

  // Clean old entries
  limits.minute = limits.minute.filter(t => t > oneMinuteAgo);
  limits.hour = limits.hour.filter(t => t > oneHourAgo);

  // Check rate limits
  if (limits.minute.length >= RATE_LIMIT_PER_MINUTE) {
    const waitSeconds = Math.ceil((limits.minute[0] + 60 * 1000 - now) / 1000);
    return `Too many requests. Please wait ${waitSeconds} seconds.`;
  }

  if (limits.hour.length >= RATE_LIMIT_PER_HOUR) {
    const waitMinutes = Math.ceil((limits.hour[0] + 60 * 60 * 1000 - now) / 60000);
    return `Too many requests. Please try again in ${waitMinutes} minutes.`;
  }

  return null;
}

/**
 * Record an email send attempt for rate limiting
 */
export function recordEmailSend(email: string): void {
  const now = Date.now();
  let limits = emailRateLimits.get(email);
  if (!limits) {
    limits = { minute: [], hour: [] };
    emailRateLimits.set(email, limits);
  }
  limits.minute.push(now);
  limits.hour.push(now);
}

// Cleanup old rate limit entries periodically
setInterval(() => {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  for (const [email, limits] of emailRateLimits.entries()) {
    limits.hour = limits.hour.filter(t => t > oneHourAgo);
    if (limits.hour.length === 0) {
      emailRateLimits.delete(email);
    }
  }
}, 5 * 60 * 1000); // Cleanup every 5 minutes
