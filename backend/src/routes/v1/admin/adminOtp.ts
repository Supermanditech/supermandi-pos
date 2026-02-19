// GL-CRIT-0053: Admin 2FA OTP Verification
// This module provides email-based OTP verification for sensitive admin operations

import { Router, Request, Response } from "express";
import { requireAdminToken } from "../../../middleware/adminToken";
import crypto from "crypto";
import { getRedis } from "../../../db/redis";
import { log } from "../../../lib/logger";

export const adminOtpRouter = Router();

// =============================================================================
// T1-002: Redis-backed OTP storage with in-memory fallback
// Redis keys use prefix "supermandi:otp:" with TTL auto-expiry
// =============================================================================

const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const OTP_EXPIRY_S = 600;
const OTP_RATE_LIMIT_MS = 60 * 1000; // 1 minute between requests
const OTP_VERIFY_RATE_LIMIT_MS = 5000; // GO-LIVE-135: 5 seconds between verify attempts
const MAX_OTP_VERIFY_FAILURES = 5;
const OTP_LOCKOUT_MS = 30 * 60 * 1000; // GO-LIVE-135: 30 minute lockout
const IP_OTP_WINDOW_MS = 10 * 60 * 1000; // 10 minute window
const IP_OTP_MAX_ATTEMPTS = 10;

// In-memory fallback Maps (used only when Redis unavailable)
const _otpStore = new Map<string, { otp: string; expiresAt: number; purpose: string }>();
const _lastOtpRequest = new Map<string, number>();
const _lastOtpVerify = new Map<string, number>();
const _otpVerifyFailures = new Map<string, { count: number; lockedUntil: number }>();
const _ipOtpAttempts = new Map<string, { count: number; windowStart: number }>();

// Redis key helpers
const R = {
  otp: (email: string) => `supermandi:otp:data:${email}`,
  otpRate: (email: string) => `supermandi:otp:rate:${email}`,
  verifyRate: (email: string) => `supermandi:otp:vrate:${email}`,
  failures: (email: string) => `supermandi:otp:fail:${email}`,
  ip: (ip: string) => `supermandi:otp:ip:${ip}`,
  token2fa: (token: string) => `supermandi:otp:2fa:${token}`,
};

// Generic Redis get/set with fallback
async function rGet<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  if (redis) {
    try {
      const v = await redis.get(key);
      return v ? JSON.parse(v) : null;
    } catch { /* fall through */ }
  }
  return null;
}
async function rSet(key: string, value: unknown, ttlS: number): Promise<boolean> {
  const redis = getRedis();
  if (redis) {
    try {
      await redis.setex(key, ttlS, JSON.stringify(value));
      return true;
    } catch { /* fall through */ }
  }
  return false; // caller should use local fallback
}
async function rDel(key: string): Promise<void> {
  const redis = getRedis();
  if (redis) { try { await redis.del(key); } catch { /* ignore */ } }
}

// ITER4-P0-003: Timing-safe comparison for OTP to prevent timing attacks
function timingSafeCompare(a: string, b: string): boolean {
  if (!a || !b) return false;
  // Pad both to same length to prevent length-based timing leaks
  const maxLen = Math.max(a.length, b.length, 6);
  const bufA = Buffer.alloc(maxLen);
  const bufB = Buffer.alloc(maxLen);
  bufA.write(a);
  bufB.write(b);
  return crypto.timingSafeEqual(bufA, bufB) && a.length === b.length;
}

adminOtpRouter.use(requireAdminToken);

// GO-LIVE-051: Proper email validation regex (not just checking for "@")
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Generate a random OTP
 */
function generateOtp(): string {
  return crypto.randomInt(100000, 999999).toString();
}

/**
 * POST /api/v1/admin/otp/request
 * GL-CRIT-0053: Request OTP for admin verification
 *
 * Request body:
 * - email: The admin's email to send OTP to
 * - purpose: What the OTP is for (e.g., "create_platform_user", "delete_store")
 */
adminOtpRouter.post("/otp/request", async (req: Request, res: Response) => {
  const { email, purpose } = req.body as { email?: string; purpose?: string };

  // GO-LIVE-051: Use proper email regex validation
  if (!email || !EMAIL_REGEX.test(email.trim())) {
    return res.status(400).json({ error: "valid_email_required" });
  }

  if (!purpose) {
    return res.status(400).json({ error: "purpose_required" });
  }

  // T1-002: Rate limiting (Redis-backed with Map fallback)
  const lastRequest = (await rGet<number>(R.otpRate(email))) || _lastOtpRequest.get(email) || 0;
  if (Date.now() - lastRequest < OTP_RATE_LIMIT_MS) {
    const waitSeconds = Math.ceil((OTP_RATE_LIMIT_MS - (Date.now() - lastRequest)) / 1000);
    return res.status(429).json({
      error: "rate_limited",
      message: `Please wait ${waitSeconds} seconds before requesting another OTP.`
    });
  }

  // Generate OTP
  const otp = generateOtp();
  const expiresAt = Date.now() + OTP_EXPIRY_MS;

  // T1-002: Store OTP in Redis (TTL=10min) with Map fallback
  const otpData = { otp, expiresAt, purpose };
  if (!(await rSet(R.otp(email), otpData, OTP_EXPIRY_S))) {
    _otpStore.set(email, otpData);
  }
  const now = Date.now();
  if (!(await rSet(R.otpRate(email), now, 60))) {
    _lastOtpRequest.set(email, now);
  }

  // ITER3-P1-001: Only log OTP in development, never in production
  if (process.env.NODE_ENV !== 'production') {
    log.info(`[GL-CRIT-0053] DEV ONLY - OTP for ${email} (${purpose}): ${otp}`);
  } else {
    log.info(`[GL-CRIT-0053] OTP generated for ${email} (${purpose})`);
  }

  // Phase 8: Wire OTP to email service (was TODO, now implemented)
  if (process.env.EMAIL_PROVIDER && process.env.EMAIL_PROVIDER !== 'disabled') {
    try {
      const nodemailer = require("nodemailer") as typeof import("nodemailer");
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || "",
        port: parseInt(process.env.SMTP_PORT || "587", 10),
        secure: process.env.SMTP_SECURE === "true",
        auth: { user: process.env.SMTP_USER || "", pass: process.env.SMTP_PASS || "" },
      });
      const from = process.env.EMAIL_FROM || "SuperMandi <noreply@supermandi.tech>";
      await transporter.sendMail({
        from,
        to: email,
        subject: "SuperMandi Admin Verification Code",
        text: `Your verification code is: ${otp}\n\nIt expires in 10 minutes.\n\nIf you did not request this, please ignore this email.`,
        html: `<div style="font-family:sans-serif;max-width:400px;margin:auto;padding:20px;">
          <h2 style="color:#10b981;margin-bottom:16px;">SuperMandi Admin Verification</h2>
          <p>Your verification code is:</p>
          <div style="background:#f0fdf4;border:2px solid #86efac;border-radius:8px;padding:16px;text-align:center;margin:16px 0;">
            <span style="font-family:monospace;font-size:32px;font-weight:700;letter-spacing:4px;color:#15803d;">${otp}</span>
          </div>
          <p style="color:#6b7280;font-size:13px;">This code expires in 10 minutes. If you did not request this, please ignore this email.</p>
        </div>`,
      });
      log.info(`[GL-CRIT-0053] OTP email sent to ${email}`);
    } catch (emailErr) {
      log.warn(`[GL-CRIT-0053] OTP email failed for ${email}:`, emailErr);
      // Don't fail the OTP request — fallback to console logging
    }
  }

  return res.json({
    success: true,
    message: "OTP sent to email",
    expiresIn: OTP_EXPIRY_MS / 1000
  });
});

/**
 * POST /api/v1/admin/otp/verify
 * GL-CRIT-0053: Verify OTP for admin operations
 *
 * Request body:
 * - email: The admin's email
 * - otp: The OTP to verify
 * - purpose: The purpose this OTP was requested for
 *
 * Returns a verification token if successful
 */
adminOtpRouter.post("/otp/verify", async (req: Request, res: Response) => {
  const { email, otp, purpose } = req.body as { email?: string; otp?: string; purpose?: string };

  if (!email || !otp || !purpose) {
    return res.status(400).json({ error: "email_otp_purpose_required" });
  }

  // T1-002: IP-based rate limiting (Redis-backed with Map fallback)
  const clientIp = req.ip || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  let ipAttempts = (await rGet<{ count: number; windowStart: number }>(R.ip(clientIp))) || _ipOtpAttempts.get(clientIp) || null;
  if (!ipAttempts || now - ipAttempts.windowStart > IP_OTP_WINDOW_MS) {
    ipAttempts = { count: 0, windowStart: now };
  }

  if (ipAttempts.count >= IP_OTP_MAX_ATTEMPTS) {
    const waitSeconds = Math.ceil((ipAttempts.windowStart + IP_OTP_WINDOW_MS - now) / 1000);
    log.warn(`[GO-LIVE-135] IP ${clientIp} rate limited for OTP verify (${ipAttempts.count} attempts)`);
    return res.status(429).json({
      error: "ip_rate_limited",
      message: `Too many verification attempts from this location. Please wait ${waitSeconds} seconds.`
    });
  }
  ipAttempts.count += 1;
  if (!(await rSet(R.ip(clientIp), ipAttempts, 600))) {
    _ipOtpAttempts.set(clientIp, ipAttempts);
  }

  // T1-002: Check if email is locked out (Redis-backed)
  const failures = (await rGet<{ count: number; lockedUntil: number }>(R.failures(email!))) || _otpVerifyFailures.get(email!) || null;
  if (failures && Date.now() < failures.lockedUntil) {
    const waitSeconds = Math.ceil((failures.lockedUntil - Date.now()) / 1000);
    return res.status(429).json({
      error: "too_many_attempts",
      message: `Account temporarily locked. Please try again in ${Math.ceil(waitSeconds / 60)} minutes.`
    });
  }

  // T1-002: Rate limit verify attempts (Redis-backed)
  const lastVerify = (await rGet<number>(R.verifyRate(email!))) || _lastOtpVerify.get(email!) || 0;
  if (Date.now() - lastVerify < OTP_VERIFY_RATE_LIMIT_MS) {
    const waitSeconds = Math.ceil((OTP_VERIFY_RATE_LIMIT_MS - (Date.now() - lastVerify)) / 1000);
    return res.status(429).json({
      error: "rate_limited",
      message: `Please wait ${waitSeconds} seconds before trying again.`
    });
  }
  if (!(await rSet(R.verifyRate(email!), Date.now(), 5))) {
    _lastOtpVerify.set(email!, Date.now());
  }

  // T1-002: Load OTP from Redis with Map fallback
  const stored = (await rGet<{ otp: string; expiresAt: number; purpose: string }>(R.otp(email!))) || _otpStore.get(email!);

  if (!stored) {
    return res.status(400).json({ error: "otp_not_found", message: "No OTP found for this email. Please request a new one." });
  }

  if (Date.now() > stored.expiresAt) {
    await rDel(R.otp(email!));
    _otpStore.delete(email!);
    return res.status(400).json({ error: "otp_expired", message: "OTP has expired. Please request a new one." });
  }

  // ITER4-P0-003: Use timing-safe comparison for purpose
  if (!timingSafeCompare(stored.purpose, purpose)) {
    return res.status(400).json({ error: "otp_purpose_mismatch", message: "OTP was requested for a different purpose." });
  }

  // ITER4-P0-003: Use timing-safe comparison for OTP to prevent timing attacks
  if (!timingSafeCompare(stored.otp, otp)) {
    // T1-002: Track failures in Redis with Map fallback
    const currentFailures = (await rGet<{ count: number; lockedUntil: number }>(R.failures(email!))) || _otpVerifyFailures.get(email!) || { count: 0, lockedUntil: 0 };
    currentFailures.count += 1;
    if (currentFailures.count >= MAX_OTP_VERIFY_FAILURES) {
      currentFailures.lockedUntil = Date.now() + OTP_LOCKOUT_MS;
      log.warn(`[GL-CRIT-0053] OTP verify locked out for ${email} after ${currentFailures.count} failures`);
    }
    if (!(await rSet(R.failures(email!), currentFailures, 1800))) {
      _otpVerifyFailures.set(email!, currentFailures);
    }
    return res.status(400).json({ error: "invalid_otp", message: "Invalid OTP. Please check and try again." });
  }

  // T1-002: Clear failures on success (Redis + Map)
  await rDel(R.failures(email!));
  _otpVerifyFailures.delete(email!);

  // OTP is valid - delete it (single use)
  await rDel(R.otp(email!));
  _otpStore.delete(email!);

  // Generate a verification token (valid for 5 minutes)
  const verificationToken = crypto.randomBytes(32).toString("hex");
  const tokenExpiry = Date.now() + 5 * 60 * 1000;

  // T1-002: Store verification token in Redis (TTL=5min) with Map fallback
  const tokenData = { email, purpose, expiresAt: tokenExpiry };
  if (!(await rSet(R.token2fa(verificationToken), tokenData, 300))) {
    verifiedTokens.set(verificationToken, tokenData);
  }

  log.info(`[GL-CRIT-0053] OTP verified for ${email} (${purpose})`);

  return res.json({
    success: true,
    verificationToken,
    expiresIn: 300 // 5 minutes
  });
});

// Verification token store
const verifiedTokens = new Map<string, { email: string; purpose: string; expiresAt: number }>();

/**
 * Middleware to verify a 2FA token for sensitive operations
 * Use this in routes that require 2FA
 */
export function require2FA(purpose: string) {
  return async (req: Request, res: Response, next: Function) => {
    const token = req.headers["x-2fa-token"] as string;

    if (!token) {
      return res.status(403).json({
        error: "2fa_required",
        message: "This operation requires 2FA verification. Please complete OTP verification first."
      });
    }

    // T1-002: Check Redis first, then Map fallback
    const verified = (await rGet<{ email: string; purpose: string; expiresAt: number }>(R.token2fa(token))) || verifiedTokens.get(token) || null;

    if (!verified) {
      return res.status(403).json({ error: "invalid_2fa_token", message: "Invalid or expired 2FA token." });
    }

    if (Date.now() > verified.expiresAt) {
      await rDel(R.token2fa(token));
      verifiedTokens.delete(token);
      return res.status(403).json({ error: "2fa_token_expired", message: "2FA token has expired. Please verify again." });
    }

    if (verified.purpose !== purpose) {
      return res.status(403).json({ error: "2fa_purpose_mismatch", message: "2FA token was issued for a different purpose." });
    }

    // Token is valid - consume it (single use)
    await rDel(R.token2fa(token));
    verifiedTokens.delete(token);

    // Add verified info to request
    (req as any).verified2FA = {
      email: verified.email,
      purpose: verified.purpose
    };

    next();
  };
}

// T1-002: Cleanup local fallback Maps (Redis handles TTL automatically)
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of _otpStore.entries()) {
    if (now > value.expiresAt) _otpStore.delete(key);
  }
  for (const [key, value] of verifiedTokens.entries()) {
    if (now > value.expiresAt) verifiedTokens.delete(key);
  }
  for (const [ip, data] of _ipOtpAttempts.entries()) {
    if (now - data.windowStart > IP_OTP_WINDOW_MS) _ipOtpAttempts.delete(ip);
  }
  for (const [email, data] of _otpVerifyFailures.entries()) {
    if (data.lockedUntil && now > data.lockedUntil) _otpVerifyFailures.delete(email);
  }
}, 60000);
