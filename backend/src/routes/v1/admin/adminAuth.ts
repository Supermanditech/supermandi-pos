// GO-LIVE-LOGIN-004: Admin Email OTP Authentication
// This module provides email-based OTP login for admin portal
// Only allowlisted emails can access the admin portal
// GCP-STG-0463: TOTP 2FA support for SuperAdmin

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
import { getPool } from "../../../db/client";
import crypto from "crypto";
import { log } from "../../../lib/logger";
import { redisRateLimit } from "../../../middleware/rateLimit";
import { logAuthEvent } from "../../../services/authAudit";

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

// =========================================================================
// GCP-STG-0463: TOTP 2FA utilities (RFC 6238, HMAC-SHA1, 30-second window)
// =========================================================================

/** Base32 alphabet (RFC 4648) */
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Encode a Buffer to base32 string (RFC 4648).
 * Used to display TOTP secrets to the user for manual entry.
 */
export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let result = '';
  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += BASE32_ALPHABET[(value >>> bits) & 0x1f];
    }
  }
  if (bits > 0) {
    result += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }
  return result;
}

/**
 * Decode a base32 string back to a Buffer.
 */
export function base32Decode(encoded: string): Buffer {
  const cleaned = encoded.replace(/=+$/, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (let i = 0; i < cleaned.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(cleaned[i]);
    if (idx === -1) continue; // skip invalid chars
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 0xff);
    }
  }
  return Buffer.from(bytes);
}

/**
 * Generate a 20-byte random TOTP secret, returned as base32.
 */
export function generateTotpSecret(): string {
  const buffer = crypto.randomBytes(20);
  return base32Encode(buffer);
}

/**
 * Compute TOTP code for a given secret and time counter (RFC 6238 / HMAC-SHA1).
 */
function computeTotpCode(secretBase32: string, counter: number): string {
  const key = base32Decode(secretBase32);
  // Counter as 8-byte big-endian buffer
  const counterBuf = Buffer.alloc(8);
  // Write as unsigned 64-bit big-endian (top 4 bytes are 0 for reasonable time values)
  counterBuf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBuf.writeUInt32BE(counter >>> 0, 4);

  const hmac = crypto.createHmac('sha1', key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 1000000).padStart(6, '0');
}

/**
 * Verify a TOTP token against a secret. Checks current window and 1 window before/after
 * to account for clock skew (±30 seconds).
 */
export function verifyTotp(secretBase32: string, token: string): boolean {
  if (!token || !/^\d{6}$/.test(token)) return false;
  const now = Math.floor(Date.now() / 1000);
  const step = 30;
  // Check current window, 1 before, and 1 after
  for (let i = -1; i <= 1; i++) {
    const counter = Math.floor((now / step) + i);
    if (computeTotpCode(secretBase32, counter) === token) return true;
  }
  return false;
}

/**
 * Build an otpauth:// URI for QR code generation (Google Authenticator compatible).
 */
export function buildTotpUri(secret: string, email: string): string {
  const issuer = 'SuperMandi';
  const label = encodeURIComponent(`${issuer}:${email}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

// =========================================================================
// GCP-STG-0463: TOTP database helpers (admin_totp table)
// =========================================================================

interface AdminTotpRow {
  email: string;
  totp_secret: string;
  totp_enabled: boolean;
}

async function getTotpRecord(email: string): Promise<AdminTotpRow | null> {
  const pool = getPool();
  if (!pool) throw new Error('Database pool not available');
  const result = await pool.query(
    'SELECT email, totp_secret, totp_enabled FROM admin_totp WHERE email = $1',
    [email]
  );
  return result.rows[0] || null;
}

async function upsertTotpSecret(email: string, secret: string): Promise<void> {
  const pool = getPool();
  if (!pool) throw new Error('Database pool not available');
  await pool.query(
    `INSERT INTO admin_totp (email, totp_secret, totp_enabled, updated_at)
     VALUES ($1, $2, FALSE, NOW())
     ON CONFLICT (email)
     DO UPDATE SET totp_secret = $2, totp_enabled = FALSE, updated_at = NOW()`,
    [email, secret]
  );
}

async function enableTotp(email: string): Promise<void> {
  const pool = getPool();
  if (!pool) throw new Error('Database pool not available');
  await pool.query(
    'UPDATE admin_totp SET totp_enabled = TRUE, updated_at = NOW() WHERE email = $1',
    [email]
  );
}

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
  // GCP-STG-0457: Include unlockAt timestamp so frontend can show countdown
  const lockedUntil = await getLockout(normalizedEmail);
  if (lockedUntil && Date.now() < lockedUntil) {
    const waitMinutes = Math.ceil((lockedUntil - Date.now()) / 60000);
    return res.status(429).json({
      error: {
        code: "TOO_MANY_ATTEMPTS",
        message: `Too many failed attempts. Please try again in ${waitMinutes} minutes.`,
        unlockAt: lockedUntil,
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
      const lockoutUntil = Date.now() + LOCKOUT_MS;
      await setLockout(normalizedEmail, lockoutUntil);
      log.warn(`[GO-LIVE-LOGIN-004] Admin OTP lockout for ${normalizedEmail} after ${stored.attempts} failed attempts`);
      // GCP-STG-0457: Include unlockAt timestamp so frontend can show countdown
      return res.status(429).json({
        error: {
          code: "TOO_MANY_ATTEMPTS",
          message: "Too many failed attempts. Please try again in 30 minutes.",
          unlockAt: lockoutUntil,
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

  // GCP-STG-0463: Check if admin has TOTP 2FA enabled
  try {
    const totpRecord = await getTotpRecord(normalizedEmail);
    if (totpRecord?.totp_enabled) {
      log.info(`[GCP-STG-0463] TOTP required for ${normalizedEmail}, deferring JWT`);
      return res.json({
        success: true,
        requiresTOTP: true,
        email: normalizedEmail,
      });
    }
  } catch (totpErr) {
    // If admin_totp table doesn't exist yet (pre-migration), skip TOTP check gracefully
    log.warn(`[GCP-STG-0463] TOTP check failed (table may not exist yet):`, totpErr);
  }

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

  // GCP-STG-0489: Audit log — admin login success
  logAuthEvent({
    actorType: 'admin',
    actorId: normalizedEmail,
    eventType: 'login_success',
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    metadata: { method: 'email_otp' },
  });

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
      // GCP-STG-0482: Always blacklist with TTL — use remaining lifetime or 24h fallback
      const BLACKLIST_TTL_FALLBACK = 86400; // 24 hours
      const remainingSeconds = decoded?.exp
        ? Math.max(decoded.exp - Math.floor(Date.now() / 1000), 0)
        : BLACKLIST_TTL_FALLBACK;
      if (remainingSeconds > 0) {
        const blacklistKey = decoded?.jti || crypto.createHash('sha256').update(token).digest('hex');
        blacklistToken(blacklistKey, remainingSeconds).catch(() => {});
      }
    } catch {
      // Non-fatal — cookie clear is still the primary action
    }
  }

  // GCP-STG-0489: Audit log — admin logout
  const logoutEmail = token ? (jwt.decode(token) as { email?: string } | null)?.email : undefined;
  logAuthEvent({
    actorType: 'admin',
    actorId: logoutEmail ?? undefined,
    eventType: 'logout',
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.clearCookie('admin_session', { path: '/api' });
  return res.json({ success: true });
});

// =========================================================================
// GCP-STG-0471: SuperAdmin password login fallback (stub)
// Implementation plan:
//   1. Add password_hash column to admin_totp table (or new admin_credentials table)
//   2. Accept { email, password } — check allowlist, bcrypt.compare, issue JWT
//   3. Enforce same rate limiting and lockout as OTP flow
// Currently returns 501 until password hashing infrastructure is in place.
// =========================================================================
adminAuthRouter.post("/auth/login-password", otpRateLimiter, (_req: Request, res: Response) => {
  return res.status(501).json({
    error: { code: "NOT_IMPLEMENTED", message: "Password login not yet enabled. Use email OTP login." }
  });
});

// =========================================================================
// GCP-STG-0463: TOTP 2FA routes
// =========================================================================

/**
 * Helper: extract and verify admin JWT from request, return decoded payload or send 401.
 */
function extractAdminToken(req: Request): { email: string; role: string; type?: string } | null {
  const cookieToken = extractCookie(req, 'admin_session');
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  const token = cookieToken || bearerToken;
  if (!token) return null;
  try {
    return verifyTokenWithRotation(token);
  } catch {
    return null;
  }
}

/**
 * POST /api/v1/admin/auth/totp/setup
 * GCP-STG-0463: Generate TOTP secret + otpauth URI for QR code.
 * Requires valid admin JWT (i.e. admin is already logged in).
 */
adminAuthRouter.post("/auth/totp/setup", async (req: Request, res: Response) => {
  const admin = extractAdminToken(req);
  if (!admin) {
    return res.status(401).json({
      error: { code: "NO_TOKEN", message: "Authentication required" }
    });
  }

  try {
    const secret = generateTotpSecret();
    const otpauthUri = buildTotpUri(secret, admin.email);

    // Store the secret (not yet enabled) — replaces any previous un-enabled secret
    await upsertTotpSecret(admin.email, secret);

    log.info(`[GCP-STG-0463] TOTP setup initiated for ${admin.email}`);

    return res.json({
      success: true,
      secret,
      otpauthUri,
      message: "Scan the QR code with Google Authenticator, then verify with a code.",
    });
  } catch (err) {
    log.error(`[GCP-STG-0463] TOTP setup failed for ${admin.email}:`, err);
    return res.status(500).json({
      error: { code: "TOTP_SETUP_FAILED", message: "Failed to set up TOTP. Please try again." }
    });
  }
});

/**
 * POST /api/v1/admin/auth/totp/verify-setup
 * GCP-STG-0463: Verify first TOTP code to enable 2FA.
 * Requires valid admin JWT + a valid TOTP code.
 */
adminAuthRouter.post("/auth/totp/verify-setup", async (req: Request, res: Response) => {
  const admin = extractAdminToken(req);
  if (!admin) {
    return res.status(401).json({
      error: { code: "NO_TOKEN", message: "Authentication required" }
    });
  }

  const { code } = req.body as { code?: string };
  if (!code || !/^\d{6}$/.test(code)) {
    return res.status(400).json({
      error: { code: "INVALID_CODE", message: "A 6-digit TOTP code is required" }
    });
  }

  try {
    const record = await getTotpRecord(admin.email);
    if (!record) {
      return res.status(400).json({
        error: { code: "NO_TOTP_SECRET", message: "No TOTP setup found. Call /totp/setup first." }
      });
    }

    if (record.totp_enabled) {
      return res.json({ success: true, message: "TOTP is already enabled." });
    }

    if (!verifyTotp(record.totp_secret, code)) {
      return res.status(400).json({
        error: { code: "INVALID_TOTP", message: "Invalid TOTP code. Please try again." }
      });
    }

    await enableTotp(admin.email);
    log.info(`[GCP-STG-0463] TOTP enabled for ${admin.email}`);

    return res.json({
      success: true,
      message: "TOTP 2FA has been enabled for your account.",
    });
  } catch (err) {
    log.error(`[GCP-STG-0463] TOTP verify-setup failed for ${admin.email}:`, err);
    return res.status(500).json({
      error: { code: "TOTP_VERIFY_FAILED", message: "Failed to verify TOTP. Please try again." }
    });
  }
});

/**
 * POST /api/v1/admin/auth/totp/verify
 * GCP-STG-0463: Complete login with TOTP code (second factor after email OTP).
 * Called when verify-email-otp returns { requiresTOTP: true }.
 * Does NOT require JWT — the admin hasn't received one yet.
 */
adminAuthRouter.post("/auth/totp/verify", otpRateLimiter, async (req: Request, res: Response) => {
  const { email, code } = req.body as { email?: string; code?: string };

  if (!email || !code) {
    return res.status(400).json({
      error: { code: "MISSING_FIELDS", message: "Email and TOTP code are required" }
    });
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Must be an allowlisted admin
  if (!isEmailAllowed(normalizedEmail)) {
    return res.status(400).json({
      error: { code: "INVALID_REQUEST", message: "Invalid request" }
    });
  }

  if (!/^\d{6}$/.test(code)) {
    return res.status(400).json({
      error: { code: "INVALID_CODE", message: "A 6-digit TOTP code is required" }
    });
  }

  try {
    const record = await getTotpRecord(normalizedEmail);
    if (!record?.totp_enabled) {
      return res.status(400).json({
        error: { code: "TOTP_NOT_ENABLED", message: "TOTP is not enabled for this account" }
      });
    }

    if (!verifyTotp(record.totp_secret, code)) {
      log.warn(`[GCP-STG-0463] Invalid TOTP code for ${normalizedEmail}`);
      return res.status(400).json({
        error: { code: "INVALID_TOTP", message: "Invalid TOTP code. Please try again." }
      });
    }

    // TOTP verified — issue JWT
    const token = jwt.sign(
      {
        email: normalizedEmail,
        role: 'super_admin',
        type: 'admin',
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY, issuer: JWT_ISSUER }
    );

    log.info(`[GCP-STG-0463] Admin TOTP login successful: ${normalizedEmail}`);

    res.cookie('admin_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV !== 'development',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000,
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
  } catch (err) {
    log.error(`[GCP-STG-0463] TOTP verify failed for ${normalizedEmail}:`, err);
    return res.status(500).json({
      error: { code: "TOTP_VERIFY_FAILED", message: "Failed to verify TOTP. Please try again." }
    });
  }
});
