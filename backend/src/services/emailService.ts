// GL-WF-034: Email Service for OTP Verification
// GO-LIVE: Production email sending with Resend (primary) and SMTP (fallback)
// CRITICAL: This service must never lie about email delivery status

import crypto from 'crypto';
import { log } from "../lib/logger";
import { getRedis } from "../db/redis";

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
  const from = process.env.EMAIL_FROM || 'SuperMandi <noreply@supermandi.tech>';

  const config: EmailConfig = {
    provider,
    from,
  };

  if (provider === 'resend') {
    config.resendApiKey = process.env.RESEND_API_KEY;
    if (!config.resendApiKey) {
      log.error('[EmailService] RESEND_API_KEY is required when EMAIL_PROVIDER=resend');
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
      log.error('[EmailService] SMTP_HOST and SMTP_USER are required when EMAIL_PROVIDER=smtp');
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
// GO-LIVE-085 & GO-LIVE-086: SECURE PASSWORD RESET TOKEN
// =============================================================================

/**
 * GO-LIVE-086: Generate a cryptographically secure password reset token
 * Uses 32-byte random hex string instead of 6-digit code
 * This provides 256 bits of entropy vs ~20 bits for 6-digit codes
 */
export function generateSecureResetToken(): string {
  return crypto.randomBytes(32).toString('hex'); // 64 character hex string
}

/**
 * GO-LIVE-085: Hash password reset token for secure storage
 * Uses SHA-256 for one-way hashing
 */
export function hashResetToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * GO-LIVE-085: Verify reset token against stored hash
 * Uses timing-safe comparison to prevent timing attacks
 */
export function verifyResetTokenHash(token: string, hash: string): boolean {
  const tokenHash = hashResetToken(token);
  if (tokenHash.length !== hash.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(tokenHash), Buffer.from(hash));
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
      log.error('[EmailService] Resend API error:', data);
      return {
        sent: false,
        errorCode: data.name || 'RESEND_ERROR',
        errorMessage: data.message || 'Failed to send email via Resend',
      };
    }

    log.info(`[EmailService] Email sent via Resend to ${to}, messageId: ${data.id}`);
    return {
      sent: true,
      messageId: data.id || 'unknown',
    };
  } catch (error) {
    log.error('[EmailService] Resend request failed:', error);
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

    log.info(`[EmailService] Email sent via SMTP to ${to}, messageId: ${info.messageId}`);
    return {
      sent: true,
      messageId: info.messageId as string,
    };
  } catch (error) {
    // Handle nodemailer not being installed
    if (error instanceof Error && error.message.includes('Cannot find module')) {
      log.error('[EmailService] nodemailer is not installed. Run: pnpm add nodemailer');
      return {
        sent: false,
        errorCode: 'NODEMAILER_NOT_INSTALLED',
        errorMessage: 'SMTP provider requires nodemailer. Contact administrator.',
      };
    }
    log.error('[EmailService] SMTP send failed:', error);
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
    log.info(`[EmailService] DEV: Sending verification email to ${data.to}`);
  } else {
    log.info(`[EmailService] Sending verification email to ${data.to}`);
  }

  // Check if email is disabled
  if (config.provider === 'disabled') {
    log.warn('[EmailService] Email provider is disabled');
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
      log.info('[EmailService] Resend failed, trying SMTP fallback...');
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
// GO-LIVE-145: Password Reset Email
// =============================================================================

/**
 * Send password reset email
 * @param to - Recipient email
 * @param resetToken - The reset token (plain text, will be included in link)
 * @param businessName - Business name for personalization
 * @param portalType - STG-433: Which portal the reset link should point to
 */
export async function sendPasswordResetEmail(
  to: string,
  resetToken: string,
  businessName?: string,
  portalType: 'retailer' | 'supplier' = 'supplier',
): Promise<SendEmailResult> {
  const config = getEmailConfig();

  log.info(`[EmailService] GO-LIVE-145: Sending password reset email to ${to}`);

  if (config.provider === 'disabled') {
    log.warn('[EmailService] Email provider is disabled - cannot send password reset');
    return {
      sent: false,
      errorCode: 'EMAIL_DISABLED',
      errorMessage: 'Email service is not configured',
    };
  }

  // STG-433: Build portal-specific reset URL
  // Deploy env vars: RETAILER_ADMIN_URL, SUPPLIER_PORTAL_URL, PORTAL_BASE_URL, FRONTEND_URL
  const portalBase = process.env.PORTAL_BASE_URL || process.env.FRONTEND_URL || 'https://supermandi.tech';
  const frontendUrl = portalType === 'retailer'
    ? (process.env.RETAILER_ADMIN_URL || `${portalBase}/retailer`)
    : (process.env.SUPPLIER_PORTAL_URL || `${portalBase}/supplier`);
  const resetUrl = `${frontendUrl}/reset-password?token=${encodeURIComponent(resetToken)}`;

  const subject = 'Reset your SuperMandi password';
  const greeting = businessName ? `Hello ${businessName}` : 'Hello';

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; }
    .container { background: #f9f9f9; border-radius: 8px; padding: 30px; }
    .header { color: #2563eb; font-size: 24px; margin-bottom: 20px; }
    .button { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    .warning { color: #666; font-size: 14px; margin-top: 20px; }
    .footer { color: #999; font-size: 12px; margin-top: 30px; border-top: 1px solid #ddd; padding-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">SuperMandi Password Reset</div>
    <p>${greeting},</p>
    <p>A password reset was requested for your SuperMandi ${portalType} account.</p>
    <p>Click the button below to reset your password:</p>
    <a href="${resetUrl}" class="button">Reset Password</a>
    <p>Or copy this link: ${resetUrl}</p>
    <p class="warning">This link will expire in 1 hour. If you didn't request this, please ignore this email.</p>
  </div>
  <div class="footer">
    &copy; ${new Date().getFullYear()} SuperMandi. All rights reserved.
  </div>
</body>
</html>`;

  const text = `${greeting},

A password reset was requested for your SuperMandi ${portalType} account.

Click here to reset your password: ${resetUrl}

This link will expire in 1 hour. If you didn't request this, please ignore this email.

- The SuperMandi Team`;

  if (config.provider === 'resend') {
    const result = await sendViaResend(config, to, subject, html, text);
    if (result.sent) return result;

    // Try SMTP fallback
    if (config.smtp?.host && config.smtp?.user) {
      log.info('[EmailService] Resend failed, trying SMTP fallback...');
      return sendViaSMTP(config, to, subject, html, text);
    }
    return result;
  }

  if (config.provider === 'smtp') {
    return sendViaSMTP(config, to, subject, html, text);
  }

  return {
    sent: false,
    errorCode: 'UNKNOWN_PROVIDER',
    errorMessage: `Unknown email provider: ${config.provider}`,
  };
}

// =============================================================================
// RATE LIMITING
// ISSUE-176: Redis-backed when available, in-memory fallback
// GO-LIVE-135: Tightened rate limits to prevent OTP abuse
// =============================================================================

// In-memory fallback (used when Redis unavailable)
const emailRateLimits = new Map<string, { minute: number[]; hour: number[] }>();

// GO-LIVE-135: Reduced limits to be more restrictive
// GCP-STG-0002: RATE_LIMIT_MULTIPLIER env var scales limits for staging (default 1)
const RATE_LIMIT_MULTIPLIER = Math.max(1, parseInt(process.env.RATE_LIMIT_MULTIPLIER || '1', 10) || 1);
const RATE_LIMIT_PER_MINUTE = 2 * RATE_LIMIT_MULTIPLIER;
const RATE_LIMIT_PER_HOUR = 5 * RATE_LIMIT_MULTIPLIER;

/**
 * Check if email sending is rate limited
 * ISSUE-176: Uses Redis when available (survives restarts), falls back to in-memory
 * Returns error message if rate limited, null if OK
 */
export async function checkEmailRateLimit(email: string): Promise<string | null> {
  const redis = getRedis();
  if (redis) {
    try {
      return await checkEmailRateLimitRedis(email, redis);
    } catch (err) {
      log.warn(`[EmailRateLimit] Redis error, falling back to in-memory: ${err}`);
    }
  }
  return checkEmailRateLimitMemory(email);
}

async function checkEmailRateLimitRedis(email: string, redis: import('ioredis').default): Promise<string | null> {
  const now = Date.now();
  const minuteKey = `email_rl:min:${email}`;
  const hourKey = `email_rl:hr:${email}`;

  // Count requests in last minute
  await redis.zremrangebyscore(minuteKey, 0, now - 60 * 1000);
  const minuteCount = await redis.zcard(minuteKey);
  if (minuteCount >= RATE_LIMIT_PER_MINUTE) {
    const oldest = await redis.zrange(minuteKey, 0, 0, 'WITHSCORES');
    const waitSeconds = oldest.length >= 2 ? Math.ceil((Number(oldest[1]) + 60000 - now) / 1000) : 60;
    return `Too many requests. Please wait ${waitSeconds} seconds.`;
  }

  // Count requests in last hour
  await redis.zremrangebyscore(hourKey, 0, now - 60 * 60 * 1000);
  const hourCount = await redis.zcard(hourKey);
  if (hourCount >= RATE_LIMIT_PER_HOUR) {
    const oldest = await redis.zrange(hourKey, 0, 0, 'WITHSCORES');
    const waitMinutes = oldest.length >= 2 ? Math.ceil((Number(oldest[1]) + 3600000 - now) / 60000) : 60;
    return `Too many requests. Please try again in ${waitMinutes} minutes.`;
  }

  return null;
}

function checkEmailRateLimitMemory(email: string): string | null {
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
 * ISSUE-176: Redis-backed when available
 */
export async function recordEmailSend(email: string): Promise<void> {
  const redis = getRedis();
  if (redis) {
    try {
      const now = Date.now();
      const minuteKey = `email_rl:min:${email}`;
      const hourKey = `email_rl:hr:${email}`;
      const pipeline = redis.pipeline();
      pipeline.zadd(minuteKey, now, `${now}`);
      pipeline.expire(minuteKey, 120); // 2 min TTL
      pipeline.zadd(hourKey, now, `${now}`);
      pipeline.expire(hourKey, 3700); // ~1 hour TTL
      await pipeline.exec();
      return;
    } catch (err) {
      log.warn(`[EmailRateLimit] Redis record error, falling back to in-memory: ${err}`);
    }
  }
  // In-memory fallback
  const now = Date.now();
  let limits = emailRateLimits.get(email);
  if (!limits) {
    limits = { minute: [], hour: [] };
    emailRateLimits.set(email, limits);
  }
  limits.minute.push(now);
  limits.hour.push(now);
}

// =============================================================================
// STAGING-FIX-014: Registration Confirmation Email
// =============================================================================

function getRegistrationConfirmationHtml(businessName: string, entityType: string, applicationId: string): string {
  const portalLabel = entityType === 'supplier' ? 'Supplier' : 'Retailer';
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Application Received - SuperMandi</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" max-width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 32px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">SuperMandi</h1>
              <p style="color: rgba(255, 255, 255, 0.9); margin: 8px 0 0 0; font-size: 14px;">${portalLabel} Portal</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 32px;">
              <h2 style="color: #1f2937; margin: 0 0 16px 0; font-size: 20px; font-weight: 600;">Application Received!</h2>
              <p style="color: #4b5563; margin: 0 0 24px 0; font-size: 15px; line-height: 1.6;">
                Dear <strong>${businessName}</strong>,
              </p>
              <p style="color: #4b5563; margin: 0 0 24px 0; font-size: 15px; line-height: 1.6;">
                Thank you for registering as a ${portalLabel.toLowerCase()} on SuperMandi. We have received your application and KYC documents.
              </p>
              <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                <p style="color: #166534; margin: 0 0 8px 0; font-size: 14px; font-weight: 600;">Application Details:</p>
                <p style="color: #15803d; margin: 0; font-size: 13px;">Application ID: <strong>${applicationId}</strong></p>
                <p style="color: #15803d; margin: 4px 0 0 0; font-size: 13px;">Status: <strong>Under Review</strong></p>
              </div>
              <p style="color: #4b5563; margin: 0 0 24px 0; font-size: 15px; line-height: 1.6;">
                Our team will review your application and documents. You will receive an email notification once your application is approved.
              </p>
              <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 16px; border-radius: 0 8px 8px 0;">
                <p style="color: #1e40af; margin: 0; font-size: 13px; line-height: 1.5;">
                  <strong>What happens next?</strong><br>
                  1. Our team reviews your documents (1-2 business days)<br>
                  2. You receive an approval email<br>
                  3. Login to your ${portalLabel.toLowerCase()} portal and start using SuperMandi
                </p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f9fafb; padding: 24px 32px; border-top: 1px solid #e5e7eb;">
              <p style="color: #6b7280; margin: 0; font-size: 12px; text-align: center; line-height: 1.5;">
                This email was sent by SuperMandi. If you have questions, contact support.<br>
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

/**
 * Send registration confirmation email after KYC submission.
 * Non-blocking: failures are logged but don't break the registration flow.
 */
export async function sendRegistrationConfirmationEmail(
  to: string,
  businessName: string,
  entityType: string,
  applicationId: string
): Promise<SendEmailResult> {
  const config = getEmailConfig();

  log.info(`[EmailService] Sending registration confirmation to ${to} for ${entityType} app ${applicationId}`);

  if (config.provider === 'disabled') {
    log.warn('[EmailService] Email provider is disabled — registration confirmation not sent');
    return { sent: false, errorCode: 'EMAIL_DISABLED', errorMessage: 'Email service not configured' };
  }

  const subject = `SuperMandi - Application Received (${entityType === 'supplier' ? 'Supplier' : 'Retailer'})`;
  const html = getRegistrationConfirmationHtml(businessName, entityType, applicationId);
  const text = `Dear ${businessName},\n\nThank you for registering on SuperMandi. Your application (ID: ${applicationId}) has been received and is under review.\n\nOur team will review your documents within 1-2 business days.\n\n- SuperMandi Team`;

  try {
    if (config.provider === 'resend') {
      return await sendViaResend(config, to, subject, html, text);
    }
    if (config.provider === 'smtp') {
      return await sendViaSMTP(config, to, subject, html, text);
    }
    return { sent: false, errorCode: 'UNKNOWN_PROVIDER', errorMessage: `Unknown provider: ${config.provider}` };
  } catch (err) {
    log.error('[EmailService] Registration confirmation email failed:', err);
    return { sent: false, errorCode: 'SEND_FAILED', errorMessage: 'Failed to send email' };
  }
}

// =============================================================================
// GCP-STG-0462: Email config validation at startup
// =============================================================================

/**
 * GCP-STG-0462: Validate email configuration at startup.
 * Logs warnings for missing config — does NOT crash the process.
 * Call from app.ts during startup.
 */
export function validateEmailConfig(): void {
  const provider = (process.env.EMAIL_PROVIDER || 'disabled').toLowerCase();

  if (provider === 'disabled') {
    log.warn('[EmailService] GCP-STG-0462: EMAIL_PROVIDER is disabled — no emails will be sent');
    return;
  }

  if (provider === 'resend') {
    if (!process.env.RESEND_API_KEY) {
      log.warn('[EmailService] GCP-STG-0462: EMAIL_PROVIDER=resend but RESEND_API_KEY is not set — email sending will fail');
    } else {
      log.info('[EmailService] GCP-STG-0462: Email config OK (provider=resend)');
    }
    return;
  }

  if (provider === 'smtp') {
    if (!process.env.SMTP_HOST) {
      log.warn('[EmailService] GCP-STG-0462: EMAIL_PROVIDER=smtp but SMTP_HOST is not set — email sending will fail');
    } else {
      log.info('[EmailService] GCP-STG-0462: Email config OK (provider=smtp)');
    }
    return;
  }

  log.warn(`[EmailService] GCP-STG-0462: Unknown EMAIL_PROVIDER="${provider}" — email sending will fail`);
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
