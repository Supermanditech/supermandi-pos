// GL-CRIT-0053: Admin 2FA OTP Verification
// This module provides email-based OTP verification for sensitive admin operations

import { Router, Request, Response } from "express";
import { requireAdminToken } from "../../../middleware/adminToken";
import crypto from "crypto";

export const adminOtpRouter = Router();

// In-memory OTP store (in production, use Redis)
// Key: email, Value: { otp, expiresAt, purpose }
const otpStore = new Map<string, { otp: string; expiresAt: number; purpose: string }>();

// OTP configuration
const OTP_LENGTH = 6;
const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const OTP_RATE_LIMIT_MS = 60 * 1000; // 1 minute between requests
const lastOtpRequest = new Map<string, number>();
// ITER4-P1-003: Rate limiting for OTP verification to prevent brute force
const OTP_VERIFY_RATE_LIMIT_MS = 1000; // 1 second between verify attempts
const lastOtpVerify = new Map<string, number>();
const otpVerifyFailures = new Map<string, { count: number; lockedUntil: number }>();
const MAX_OTP_VERIFY_FAILURES = 5;
const OTP_LOCKOUT_MS = 15 * 60 * 1000; // 15 minute lockout after 5 failures

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

  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "valid_email_required" });
  }

  if (!purpose) {
    return res.status(400).json({ error: "purpose_required" });
  }

  // Rate limiting
  const lastRequest = lastOtpRequest.get(email) || 0;
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

  // Store OTP
  otpStore.set(email, { otp, expiresAt, purpose });
  lastOtpRequest.set(email, Date.now());

  // ITER3-P1-001: Only log OTP in development, never in production
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[GL-CRIT-0053] DEV ONLY - OTP for ${email} (${purpose}): ${otp}`);
  } else {
    console.log(`[GL-CRIT-0053] OTP generated for ${email} (${purpose})`);
  }

  // TODO: Integrate with email service
  // await sendEmail({
  //   to: email,
  //   subject: `SuperMandi Admin Verification Code`,
  //   body: `Your verification code is: ${otp}. It expires in 10 minutes.`
  // });

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

  // ITER4-P1-003: Check if email is locked out due to too many failures
  const failures = otpVerifyFailures.get(email);
  if (failures && Date.now() < failures.lockedUntil) {
    const waitSeconds = Math.ceil((failures.lockedUntil - Date.now()) / 1000);
    return res.status(429).json({
      error: "too_many_attempts",
      message: `Account temporarily locked. Please try again in ${waitSeconds} seconds.`
    });
  }

  // ITER4-P1-003: Rate limit verify attempts (1 per second per email)
  const lastVerify = lastOtpVerify.get(email) || 0;
  if (Date.now() - lastVerify < OTP_VERIFY_RATE_LIMIT_MS) {
    return res.status(429).json({
      error: "rate_limited",
      message: "Please wait before trying again."
    });
  }
  lastOtpVerify.set(email, Date.now());

  const stored = otpStore.get(email);

  if (!stored) {
    return res.status(400).json({ error: "otp_not_found", message: "No OTP found for this email. Please request a new one." });
  }

  if (Date.now() > stored.expiresAt) {
    otpStore.delete(email);
    return res.status(400).json({ error: "otp_expired", message: "OTP has expired. Please request a new one." });
  }

  // ITER4-P0-003: Use timing-safe comparison for purpose
  if (!timingSafeCompare(stored.purpose, purpose)) {
    return res.status(400).json({ error: "otp_purpose_mismatch", message: "OTP was requested for a different purpose." });
  }

  // ITER4-P0-003: Use timing-safe comparison for OTP to prevent timing attacks
  if (!timingSafeCompare(stored.otp, otp)) {
    // Track failures for lockout
    const currentFailures = otpVerifyFailures.get(email) || { count: 0, lockedUntil: 0 };
    currentFailures.count += 1;
    if (currentFailures.count >= MAX_OTP_VERIFY_FAILURES) {
      currentFailures.lockedUntil = Date.now() + OTP_LOCKOUT_MS;
      console.warn(`[GL-CRIT-0053] OTP verify locked out for ${email} after ${currentFailures.count} failures`);
    }
    otpVerifyFailures.set(email, currentFailures);
    return res.status(400).json({ error: "invalid_otp", message: "Invalid OTP. Please check and try again." });
  }

  // Clear failures on success
  otpVerifyFailures.delete(email);

  // OTP is valid - delete it (single use)
  otpStore.delete(email);

  // Generate a verification token (valid for 5 minutes)
  const verificationToken = crypto.randomBytes(32).toString("hex");
  const tokenExpiry = Date.now() + 5 * 60 * 1000;

  // Store verification token (in production, use Redis)
  verifiedTokens.set(verificationToken, {
    email,
    purpose,
    expiresAt: tokenExpiry
  });

  console.log(`[GL-CRIT-0053] OTP verified for ${email} (${purpose})`);

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
  return (req: Request, res: Response, next: Function) => {
    const token = req.headers["x-2fa-token"] as string;

    if (!token) {
      return res.status(403).json({
        error: "2fa_required",
        message: "This operation requires 2FA verification. Please complete OTP verification first."
      });
    }

    const verified = verifiedTokens.get(token);

    if (!verified) {
      return res.status(403).json({ error: "invalid_2fa_token", message: "Invalid or expired 2FA token." });
    }

    if (Date.now() > verified.expiresAt) {
      verifiedTokens.delete(token);
      return res.status(403).json({ error: "2fa_token_expired", message: "2FA token has expired. Please verify again." });
    }

    if (verified.purpose !== purpose) {
      return res.status(403).json({ error: "2fa_purpose_mismatch", message: "2FA token was issued for a different purpose." });
    }

    // Token is valid - consume it (single use)
    verifiedTokens.delete(token);

    // Add verified info to request
    (req as any).verified2FA = {
      email: verified.email,
      purpose: verified.purpose
    };

    next();
  };
}

// Cleanup expired tokens periodically
setInterval(() => {
  const now = Date.now();

  for (const [key, value] of otpStore.entries()) {
    if (now > value.expiresAt) {
      otpStore.delete(key);
    }
  }

  for (const [key, value] of verifiedTokens.entries()) {
    if (now > value.expiresAt) {
      verifiedTokens.delete(key);
    }
  }
}, 60000); // Run every minute
