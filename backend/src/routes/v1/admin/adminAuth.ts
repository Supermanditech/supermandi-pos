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
import { getRedis, blacklistToken } from "../../../db/redis";
import crypto from "crypto";
import { log } from "../../../lib/logger";
import { redisRateLimit } from "../../../middleware/rateLimit";

// SEC-007: IP-level rate limit for admin OTP endpoints
// Prevents brute-force OTP requests from a single IP
// (Complements existing email-level rate limits in emailService)
const otpRateLimiter = redisRateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 requests per minute per IP
});

export const adminAuthRouter = Router();

// ISSUE-MICRO-025: Extract cookie value without cookie-parser dependency
function extractCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  const match = header.split(';').find(c => c.trim().startsWith(`${name}=`));
  return match ? decodeURIComponent(match.trim().slice(name.length + 1)) : undefined;
}

// Admin email allowlist from environment variable (comma-separated)
const ADMIN_EMAIL_ALLOWLIST = (process.env.ADMIN_EMAIL_ALLOWLIST || '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

// OTP configuration
const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
// SEC-003: Only allow dev fallback when NODE_ENV is explicitly 'development' or 'test'
// LIVE.AUTH.JWT_SECRET_FALLBACK_REMOVAL_STACK.001: Remove ADMIN_TOKEN fallback — JWT_SECRET only
const JWT_SECRET = (() => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    // W5-BACKEND-JWT-001: JWT_SECRET must always be set; no hardcoded fallback in any environment
    log.error('[FATAL] JWT_SECRET must be set (NODE_ENV is not development/test)');
    process.exit(1);
  }
  return secret;
})();
const JWT_EXPIRY = '24h';

// GCP-STG-0480: Dual-secret JWT rotation support
// Rotation protocol:
//   1. Generate a new secret value
//   2. Set JWT_SECRET_PREVIOUS = <current JWT_SECRET value>
//   3. Set JWT_SECRET = <new secret value>
//   4. Deploy — new tokens signed with new secret, old tokens still accepted via fallback
//   5. After 24h (max token lifetime), remove JWT_SECRET_PREVIOUS
// This allows zero-downtime secret rotation without invalidating active sessions.
const JWT_SECRET_PREVIOUS = process.env.JWT_SECRET_PREVIOUS || '';

/**
 * GCP-STG-0480: Verify a JWT token with dual-secret fallback.
 * Tries JWT_SECRET first; if verification fails and JWT_SECRET_PREVIOUS is set,
 * retries with the previous secret. This enables seamless secret rotation.
 */
function verifyTokenWithRotation(token: string): { email: string; role: string; type?: string } {
  const verifyOpts: jwt.VerifyOptions = { issuer: JWT_ISSUER, algorithms: ['HS256'], clockTolerance: 30 };
  try {
    return jwt.verify(token, JWT_SECRET, verifyOpts) as { email: string; role: string; type?: string };
  } catch (primaryErr) {
    if (JWT_SECRET_PREVIOUS) {
      try {
        return jwt.verify(token, JWT_SECRET_PREVIOUS, verifyOpts) as { email: string; role: string; type?: string };
      } catch {
        // Fall through — throw the original error from the primary secret
      }
    }
    throw primaryErr;
  }
}
// LIVE.BE.JWT_ADMIN_ISSUER_ENFORCEMENT.001: Enforce issuer on admin JWTs
const JWT_ISSUER = process.env['JWT_ISSUER'] || 'supermandi-auth';

// OTP data shape
interface StoredOTP {
  hash: string;
  expiresAt: number;
  attempts: number;
}

// Rate limiting for OTP verification attempts
const MAX_VERIFY_ATTEMPTS = 5;
const LOCKOUT_MS = 30 * 60 * 1000; // 30 minutes

// Redis key prefixes for admin OTP
const REDIS_OTP_PREFIX = 'admin:otp:';
const REDIS_LOCKOUT_PREFIX = 'admin:lockout:';

// Fallback in-memory stores (only when Redis unavailable)
const otpStoreFallback = new Map<string, StoredOTP>();
const lockoutFallback = new Map<string, number>();

async function setOtp(email: string, data: StoredOTP): Promise<void> {
  const redis = getRedis();
  if (redis) {
    const ttl = Math.max(Math.ceil((data.expiresAt - Date.now()) / 1000), 1);
    await redis.setex(REDIS_OTP_PREFIX + email, ttl, JSON.stringify(data));
  } else {
    otpStoreFallback.set(email, data);
  }
}

async function getOtp(email: string): Promise<StoredOTP | null> {
  const redis = getRedis();
  if (redis) {
    const raw = await redis.get(REDIS_OTP_PREFIX + email);
    // LIVE.BE.EVENTS_JSON_PARSE_GUARD.001: Guard against corrupted Redis data
    if (!raw) return null;
    try { return JSON.parse(raw) as StoredOTP; } catch { return null; }
  }
  return otpStoreFallback.get(email) ?? null;
}

async function deleteOtp(email: string): Promise<void> {
  const redis = getRedis();
  if (redis) {
    await redis.del(REDIS_OTP_PREFIX + email);
  } else {
    otpStoreFallback.delete(email);
  }
}

async function setLockout(email: string, lockedUntil: number): Promise<void> {
  const redis = getRedis();
  if (redis) {
    const ttl = Math.max(Math.ceil((lockedUntil - Date.now()) / 1000), 1);
    await redis.setex(REDIS_LOCKOUT_PREFIX + email, ttl, lockedUntil.toString());
  } else {
    lockoutFallback.set(email, lockedUntil);
  }
}

async function getLockout(email: string): Promise<number | null> {
  const redis = getRedis();
  if (redis) {
    const raw = await redis.get(REDIS_LOCKOUT_PREFIX + email);
    return raw ? parseInt(raw, 10) : null;
  }
  return lockoutFallback.get(email) ?? null;
}

async function deleteLockout(email: string): Promise<void> {
  const redis = getRedis();
  if (redis) {
    await redis.del(REDIS_LOCKOUT_PREFIX + email);
  } else {
    lockoutFallback.delete(email);
  }
}

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
adminAuthRouter.post("/auth/send-email-otp", otpRateLimiter, async (req: Request, res: Response) => {
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
  // STG-422 FIX: Return generic success for non-admin emails to prevent email enumeration.
  // Attacker cannot distinguish admin vs non-admin emails from the response.
  if (!isEmailAllowed(normalizedEmail)) {
    log.warn(`[GO-LIVE-LOGIN-004] Unauthorized admin login attempt: ${normalizedEmail}`);
    return res.json({
      success: true,
      message: "If this email is authorized, a verification code has been sent.",
      expiresIn: OTP_EXPIRY_MS / 1000,
    });
  }

  // Check rate limiting
  const rateLimitError = await checkEmailRateLimit(normalizedEmail);
  if (rateLimitError) {
    return res.status(429).json({
      error: { code: "RATE_LIMITED", message: rateLimitError }
    });
  }

  // Generate OTP
  const otp = generateSecureOTP();
  const otpHash = hashOTP(otp);
  const expiresAt = Date.now() + OTP_EXPIRY_MS;

  // Store hashed OTP in Redis
  await setOtp(normalizedEmail, {
    hash: otpHash,
    expiresAt,
    attempts: 0,
  });

  // Record for rate limiting
  await recordEmailSend(normalizedEmail);

  // Send OTP email
  const emailResult = await sendVerificationEmail({
    to: normalizedEmail,
    code: otp,
    expiryMinutes: 10,
  });

  if (!emailResult.sent) {
    log.error(`[GO-LIVE-LOGIN-004] Failed to send OTP email to ${normalizedEmail}:`, emailResult.errorMessage);
    await deleteOtp(normalizedEmail); // Clean up on failure
    return res.status(500).json({
      error: {
        code: "EMAIL_SEND_FAILED",
        message: "Failed to send verification email. Please try again."
      }
    });
  }

  log.info(`[GO-LIVE-LOGIN-004] Admin OTP sent to ${normalizedEmail}`);

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
adminAuthRouter.post("/auth/verify-email-otp", otpRateLimiter, async (req: Request, res: Response) => {
  const { email, otp } = req.body as { email?: string; otp?: string };

  // Validate inputs
  if (!email || !otp) {
    return res.status(400).json({
      error: { code: "MISSING_FIELDS", message: "Email and OTP are required" }
    });
  }

  const normalizedEmail = email.toLowerCase().trim();

  // ISSUE-203: Enforce allowlist on verify (matches send-email-otp gate)
  if (!isEmailAllowed(normalizedEmail)) {
    log.warn(`[ISSUE-203] Blocked verify-otp for non-allowlisted email: ${normalizedEmail}`);
    return res.status(400).json({
      error: { code: "OTP_NOT_FOUND", message: "No verification code found. Please request a new one." }
    });
  }

  // Check if locked out
  const lockedUntil = await getLockout(normalizedEmail);
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
  const stored = await getOtp(normalizedEmail);

  if (!stored) {
    return res.status(400).json({
      error: { code: "OTP_NOT_FOUND", message: "No verification code found. Please request a new one." }
    });
  }

  // Check expiry
  if (Date.now() > stored.expiresAt) {
    await deleteOtp(normalizedEmail);
    return res.status(400).json({
      error: { code: "OTP_EXPIRED", message: "Verification code has expired. Please request a new one." }
    });
  }

  // Verify OTP using timing-safe comparison
  if (!verifyOTPHash(otp, stored.hash)) {
    stored.attempts += 1;
    await setOtp(normalizedEmail, stored); // Persist updated attempt count

    // Check if max attempts reached
    if (stored.attempts >= MAX_VERIFY_ATTEMPTS) {
      await deleteOtp(normalizedEmail);
      await setLockout(normalizedEmail, Date.now() + LOCKOUT_MS);
      log.warn(`[GO-LIVE-LOGIN-004] Admin OTP lockout for ${normalizedEmail} after ${stored.attempts} failed attempts`);
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
  await deleteOtp(normalizedEmail);
  await deleteLockout(normalizedEmail);

  // Generate JWT token
  // LIVE.BE.JWT_ADMIN_ISSUER_ENFORCEMENT.001: Include issuer in admin JWT
  const token = jwt.sign(
    {
      email: normalizedEmail,
      role: 'super_admin',
      type: 'admin',
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY, issuer: JWT_ISSUER }
  );

  log.info(`[GO-LIVE-LOGIN-004] Admin login successful: ${normalizedEmail}`);

  // ISSUE-MICRO-025: Set HttpOnly cookie (XSS-safe) alongside JSON response
  res.cookie('admin_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV !== 'development',
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000, // 24h
    path: '/api',
  });

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
 * ISSUE-MICRO-025: Also checks HttpOnly cookie
 */
adminAuthRouter.get("/auth/check", (req: Request, res: Response) => {
  // ISSUE-MICRO-025: Try cookie first, then Authorization header
  const cookieToken = extractCookie(req, 'admin_session');
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  const token = cookieToken || bearerToken;

  if (!token) {
    return res.status(401).json({
      error: { code: "NO_TOKEN", message: "No authentication token provided" }
    });
  }

  try {
    // GCP-STG-0480: Use dual-secret rotation-aware verification
    const decoded = verifyTokenWithRotation(token);
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

/**
 * POST /api/v1/admin/auth/refresh
 * T-011: Refresh admin JWT token — prevents "Session expired" on fresh login.
 * Frontend calls this on app mount and every 10 minutes.
 * Validates current token and issues a new one with extended expiry.
 */
adminAuthRouter.post("/auth/refresh", (req: Request, res: Response) => {
  const cookieToken = extractCookie(req, 'admin_session');
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  const token = cookieToken || bearerToken;

  if (!token) {
    return res.status(401).json({
      error: { code: "NO_TOKEN", message: "No authentication token provided" }
    });
  }

  try {
    // GCP-STG-0480: Use dual-secret rotation-aware verification
    const decoded = verifyTokenWithRotation(token) as { email: string; role: string; type: string };

    // Issue new token with fresh expiry (always signs with current JWT_SECRET)
    const newToken = jwt.sign(
      {
        email: decoded.email,
        role: decoded.role,
        type: decoded.type || 'admin',
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY, issuer: JWT_ISSUER }
    );

    // Refresh the HttpOnly cookie too
    res.cookie('admin_session', newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV !== 'development',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000,
      path: '/api',
    });

    const expiresAt = Date.now() + 24 * 60 * 60 * 1000;

    return res.json({
      sessionToken: newToken,
      expiresAt,
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

/**
 * POST /api/v1/admin/auth/logout
 * ISSUE-MICRO-025: Clear HttpOnly session cookie
 * ISSUE-196: Also blacklist the JWT in Redis so stolen tokens are immediately revoked
 */
adminAuthRouter.post("/auth/logout", (req: Request, res: Response) => {
  // Extract token from cookie or Authorization header
  const token = req.cookies?.admin_session
    || (req.header('authorization')?.startsWith('Bearer ') ? req.header('authorization')!.slice(7) : null);

  if (token) {
    try {
      // Decode without verification to get expiry (token may already be close to expiry)
      const decoded = jwt.decode(token) as { exp?: number; jti?: string } | null;
      if (decoded?.exp) {
        const remainingSeconds = decoded.exp - Math.floor(Date.now() / 1000);
        if (remainingSeconds > 0) {
          // Use jti if available, otherwise hash the token
          const blacklistKey = decoded.jti || crypto.createHash('sha256').update(token).digest('hex');
          blacklistToken(blacklistKey, remainingSeconds).catch(() => {});
        }
      }
    } catch {
      // Non-fatal — cookie clear is still the primary action
    }
  }

  res.clearCookie('admin_session', { path: '/api' });
  return res.json({ success: true });
});
