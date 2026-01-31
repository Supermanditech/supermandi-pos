// GO-LIVE-LOGIN-004: Admin Email OTP Authentication
// This module provides email-based OTP login for admin portal
// Only allowlisted emails can access the admin portal

import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import {
  generateSecureOTP,
  hashOTP,
  verifyOTPHash,
  sendVerificationEmail,
  checkEmailRateLimit,
  recordEmailSend,
} from "../../../services/emailService";

export const adminAuthRouter = Router();

// Hardcoded admin email allowlist
// In production, this should be stored securely (environment variable or database)
const ADMIN_EMAIL_ALLOWLIST = [
  'supermanditech@gmail.com',
];

// OTP configuration
const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const JWT_SECRET = process.env.JWT_SECRET || process.env.ADMIN_TOKEN || 'dev-jwt-secret';
const JWT_EXPIRY = '24h';

// In-memory OTP store (in production, use Redis)
interface StoredOTP {
  hash: string;
  expiresAt: number;
  attempts: number;
}
const otpStore = new Map<string, StoredOTP>();

// Rate limiting for OTP verification attempts
const MAX_VERIFY_ATTEMPTS = 5;
const LOCKOUT_MS = 30 * 60 * 1000; // 30 minutes
const verifyLockouts = new Map<string, number>();

// Cleanup expired OTPs periodically
setInterval(() => {
  const now = Date.now();
  for (const [email, data] of otpStore.entries()) {
    if (now > data.expiresAt) {
      otpStore.delete(email);
    }
  }
  for (const [email, lockedUntil] of verifyLockouts.entries()) {
    if (now > lockedUntil) {
      verifyLockouts.delete(email);
    }
  }
}, 60000); // Every minute

/**
 * Check if email is in admin allowlist
 */
function isEmailAllowed(email: string): boolean {
  const normalizedEmail = email.toLowerCase().trim();
  return ADMIN_EMAIL_ALLOWLIST.some(
    allowed => allowed.toLowerCase() === normalizedEmail
  );
}

/**
 * POST /api/v1/admin/auth/send-email-otp
 * GO-LIVE-LOGIN-004: Request OTP for admin login
 *
 * Request body:
 * - email: The admin's email address
 */
adminAuthRouter.post("/auth/send-email-otp", async (req: Request, res: Response) => {
  const { email } = req.body as { email?: string };

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email.trim())) {
    return res.status(400).json({
      error: { code: "INVALID_EMAIL", message: "Valid email address is required" }
    });
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Check allowlist
  if (!isEmailAllowed(normalizedEmail)) {
    console.warn(`[GO-LIVE-LOGIN-004] Unauthorized admin login attempt: ${normalizedEmail}`);
    return res.status(403).json({
      error: { code: "NOT_AUTHORIZED", message: "This email is not authorized for admin access" }
    });
  }

  // Check rate limiting
  const rateLimitError = checkEmailRateLimit(normalizedEmail);
  if (rateLimitError) {
    return res.status(429).json({
      error: { code: "RATE_LIMITED", message: rateLimitError }
    });
  }

  // Generate OTP
  const otp = generateSecureOTP();
  const otpHash = hashOTP(otp);
  const expiresAt = Date.now() + OTP_EXPIRY_MS;

  // Store hashed OTP
  otpStore.set(normalizedEmail, {
    hash: otpHash,
    expiresAt,
    attempts: 0,
  });

  // Record for rate limiting
  recordEmailSend(normalizedEmail);

  // Send OTP email
  const emailResult = await sendVerificationEmail({
    to: normalizedEmail,
    code: otp,
    expiryMinutes: 10,
  });

  if (!emailResult.sent) {
    console.error(`[GO-LIVE-LOGIN-004] Failed to send OTP email to ${normalizedEmail}:`, emailResult.errorMessage);
    otpStore.delete(normalizedEmail); // Clean up on failure
    return res.status(500).json({
      error: {
        code: "EMAIL_SEND_FAILED",
        message: "Failed to send verification email. Please try again."
      }
    });
  }

  console.log(`[GO-LIVE-LOGIN-004] Admin OTP sent to ${normalizedEmail}`);

  return res.json({
    success: true,
    message: "Verification code sent to your email",
    expiresIn: OTP_EXPIRY_MS / 1000,
  });
});

/**
 * POST /api/v1/admin/auth/verify-email-otp
 * GO-LIVE-LOGIN-004: Verify OTP and issue JWT token
 *
 * Request body:
 * - email: The admin's email address
 * - otp: The 6-digit OTP code
 */
adminAuthRouter.post("/auth/verify-email-otp", async (req: Request, res: Response) => {
  const { email, otp } = req.body as { email?: string; otp?: string };

  // Validate inputs
  if (!email || !otp) {
    return res.status(400).json({
      error: { code: "MISSING_FIELDS", message: "Email and OTP are required" }
    });
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Check if locked out
  const lockedUntil = verifyLockouts.get(normalizedEmail);
  if (lockedUntil && Date.now() < lockedUntil) {
    const waitMinutes = Math.ceil((lockedUntil - Date.now()) / 60000);
    return res.status(429).json({
      error: {
        code: "TOO_MANY_ATTEMPTS",
        message: `Too many failed attempts. Please try again in ${waitMinutes} minutes.`
      }
    });
  }

  // Get stored OTP
  const stored = otpStore.get(normalizedEmail);

  if (!stored) {
    return res.status(400).json({
      error: { code: "OTP_NOT_FOUND", message: "No verification code found. Please request a new one." }
    });
  }

  // Check expiry
  if (Date.now() > stored.expiresAt) {
    otpStore.delete(normalizedEmail);
    return res.status(400).json({
      error: { code: "OTP_EXPIRED", message: "Verification code has expired. Please request a new one." }
    });
  }

  // Verify OTP using timing-safe comparison
  if (!verifyOTPHash(otp, stored.hash)) {
    stored.attempts += 1;

    // Check if max attempts reached
    if (stored.attempts >= MAX_VERIFY_ATTEMPTS) {
      otpStore.delete(normalizedEmail);
      verifyLockouts.set(normalizedEmail, Date.now() + LOCKOUT_MS);
      console.warn(`[GO-LIVE-LOGIN-004] Admin OTP lockout for ${normalizedEmail} after ${stored.attempts} failed attempts`);
      return res.status(429).json({
        error: {
          code: "TOO_MANY_ATTEMPTS",
          message: "Too many failed attempts. Please try again in 30 minutes."
        }
      });
    }

    return res.status(400).json({
      error: { code: "INVALID_OTP", message: "Invalid verification code. Please try again." }
    });
  }

  // OTP verified - clean up
  otpStore.delete(normalizedEmail);
  verifyLockouts.delete(normalizedEmail);

  // Generate JWT token
  const token = jwt.sign(
    {
      email: normalizedEmail,
      role: 'super_admin',
      type: 'admin',
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );

  console.log(`[GO-LIVE-LOGIN-004] Admin login successful: ${normalizedEmail}`);

  return res.json({
    success: true,
    token,
    admin: {
      email: normalizedEmail,
      role: 'super_admin',
    },
  });
});

/**
 * GET /api/v1/admin/auth/check
 * Check if current admin token is valid
 */
adminAuthRouter.get("/auth/check", (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

  if (!token) {
    return res.status(401).json({
      error: { code: "NO_TOKEN", message: "No authentication token provided" }
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { email: string; role: string };
    return res.json({
      valid: true,
      admin: {
        email: decoded.email,
        role: decoded.role,
      },
    });
  } catch {
    return res.status(401).json({
      error: { code: "INVALID_TOKEN", message: "Invalid or expired token" }
    });
  }
});
