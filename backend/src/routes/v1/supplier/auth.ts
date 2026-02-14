// SM-005: Supplier Auth Routes
// Handles supplier registration, login, and password management
// Uses bcrypt for password hashing and JWT for sessions

import { Router, Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { randomUUID } from "crypto";
import rateLimit from "express-rate-limit";
import { getPool } from "../../../db/client";
import { checkIpBlockMiddleware, recordAuthFailure, clearIpFailures } from "../../../services/ipBlockingService";
import { logLoginSuccess, logLoginFailed, logAccountLocked } from "../../../services/authAuditService";
// AUTH-SESSION-169: Cookie utility for auth session persistence
import { setAuthCookies, clearAuthCookies, getRefreshTokenFromRequest } from "../../../utils/authCookies";

// GO-LIVE-LOGIN: Import Firebase verification for phone-based auth
let verifyFirebaseIdToken: ((idToken: string) => Promise<{ success: boolean; payload?: { phone_number?: string; uid?: string }; error?: string; code?: string }>) | null = null;
try {
  const firebase = require("@supermandi/common");
  if (firebase.verifyFirebaseIdToken) {
    verifyFirebaseIdToken = firebase.verifyFirebaseIdToken;
    console.log("[SupplierAuth] Firebase server-side verification available");
  }
} catch {
  console.warn("[SupplierAuth] Firebase verification not available");
}
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  generateSecureOTP,
  hashOTP,
  verifyOTPHash,
  checkEmailRateLimit,
  recordEmailSend,
  isEmailServiceEnabled,
  // GO-LIVE-085 & GO-LIVE-086: Secure password reset token functions
  generateSecureResetToken,
  hashResetToken,
  verifyResetTokenHash,
} from "../../../services/emailService";

// =============================================================================
// JWT CONFIGURATION
// ITER3-P0-002: JWT_SECRET is required - no fallback in production
// =============================================================================

// SEC-003: Only allow dev fallback when NODE_ENV is explicitly 'development' or 'test'
const JWT_SECRET = (() => {
  const secret = process.env['JWT_SECRET']?.trim();
  if (!secret) {
    const env = (process.env.NODE_ENV || '').toLowerCase();
    if (env === 'development' || env === 'test') {
      return 'dev-secret-change-in-prod';
    }
    console.error('[FATAL] JWT_SECRET must be set (NODE_ENV is not development/test)');
    process.exit(1);
  }
  return secret;
})();
const JWT_ISSUER = process.env['JWT_ISSUER'] || 'supermandi-auth';
const JWT_EXPIRES_IN = '24h';
const BCRYPT_ROUNDS = 10;

// GO-LIVE-134: Account lockout configuration
const MAX_LOGIN_ATTEMPTS = 5;          // Lock after 5 failed attempts
const LOCKOUT_DURATION_MINUTES = 30;   // Lock for 30 minutes

const router = Router();

// =============================================================================
// ITER4-P1-001, ITER4-P1-002: Rate limiters for auth endpoints
// =============================================================================

// Rate limiter for login attempts (5 attempts per 15 minutes per IP)
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many login attempts. Please try again in 15 minutes.'
    }
  },
  keyGenerator: (req) => {
    // Rate limit by IP + email combination for targeted protection
    const email = (req.body?.email || '').toLowerCase();
    return `${req.ip}:${email}`;
  }
});

// Rate limiter for password reset requests (3 per 15 minutes per email)
const passwordResetRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // 3 attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many password reset requests. Please try again later.'
    }
  },
  keyGenerator: (req) => {
    // Rate limit by email to prevent email flooding
    return (req.body?.email || req.ip || '').toLowerCase();
  }
});

// GO-LIVE-054: Rate limiter for password change (authenticated)
// Prevents abuse even from authenticated users
const passwordChangeRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many password change attempts. Please try again later.'
    }
  },
  keyGenerator: (req) => {
    // Rate limit by supplier ID (from auth middleware)
    const supplierId = (req as SupplierAuthRequest).supplierId;
    return supplierId || req.ip || 'unknown';
  }
});

// =============================================================================
// GL-AUD-008: Bank Detail Validation Functions
// =============================================================================

/**
 * Validate Indian bank account number (9-18 digits)
 */
function isValidBankAccountNumber(accountNumber: string): boolean {
  const trimmed = accountNumber.replace(/\s/g, '');
  return /^\d{9,18}$/.test(trimmed);
}

/**
 * Validate IFSC code (4 letters + 0 + 6 alphanumeric)
 */
function isValidIfscCode(ifsc: string): boolean {
  const trimmed = ifsc.toUpperCase().trim();
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(trimmed);
}

/**
 * GO-LIVE-123: Strict UPI VPA validation (username@bankhandle)
 * Rules: Min 3 chars before @, min 2 chars for bank handle
 */
function isValidUpiVpa(vpa: string): boolean {
  const trimmed = vpa.trim().toLowerCase();
  // GO-LIVE-123: At least 3 chars before @, 2+ chars for bank handle
  return /^[a-z0-9._-]{3,}@[a-z0-9]{2,}$/.test(trimmed) && trimmed.length >= 6 && trimmed.length <= 100;
}

// =============================================================================
// MIDDLEWARE: Supplier Auth
// =============================================================================

export interface SupplierAuthRequest extends Request {
  supplierId?: string;
  supplierEmail?: string;
  tokenJti?: string; // GO-LIVE-084: JWT ID for revocation
}

// GO-LIVE-084: Check if token is revoked (either by JTI or bulk revocation)
async function isTokenRevoked(jti: string | undefined, supplierId: string, tokenIssuedAt: number | undefined): Promise<boolean> {
  const pool = getPool();
  if (!pool) return false; // Fail open if DB unavailable

  try {
    // Check 1: Individual token revocation by JTI
    if (jti) {
      const jtiResult = await pool.query(
        `SELECT 1 FROM supplier.token_revocations WHERE jti = $1 LIMIT 1`,
        [jti]
      );
      if (jtiResult.rows.length > 0) return true;
    }

    // Check 2: Bulk revocation ("logout all") - check tokens_revoked_at
    if (tokenIssuedAt) {
      const supplierResult = await pool.query(
        `SELECT tokens_revoked_at FROM supplier.suppliers WHERE id = $1`,
        [supplierId]
      );
      const revokedAt = supplierResult.rows[0]?.tokens_revoked_at;
      if (revokedAt) {
        const revokedAtMs = new Date(revokedAt).getTime();
        const issuedAtMs = tokenIssuedAt * 1000;
        // Token was issued before the bulk revocation
        if (issuedAtMs < revokedAtMs) return true;
      }
    }

    return false;
  } catch (err) {
    console.warn('[SupplierAuth] Revocation check failed:', err);
    return false; // Fail open
  }
}

export async function requireSupplierAuth(
  req: SupplierAuthRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET, { issuer: JWT_ISSUER }) as {
      sub: string;
      actorType: string;
      actorId: string;
      email: string;
      jti?: string; // GO-LIVE-084: JWT ID
      iat?: number; // GO-LIVE-084: Issued at timestamp
      exp?: number;
    };

    if (decoded.actorType !== 'SUPPLIER') {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Invalid token type' } });
      return;
    }

    // GO-LIVE-084: Check token revocation (both individual and bulk)
    if (await isTokenRevoked(decoded.jti, decoded.actorId, decoded.iat)) {
      res.status(401).json({
        error: {
          code: 'TOKEN_REVOKED',
          message: 'This session has been logged out. Please login again.',
        },
      });
      return;
    }

    req.supplierId = decoded.actorId;
    req.supplierEmail = decoded.email;
    req.tokenJti = decoded.jti;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: { code: 'TOKEN_EXPIRED', message: 'Token expired' } });
      return;
    }
    res.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'Invalid token' } });
  }
}

// =============================================================================
// ROUTES
// =============================================================================

/**
 * POST /api/v1/supplier/auth/register
 * Register a new supplier
 */
router.post("/auth/register", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      email,
      password,
      businessName,
      gstin,
      phone,
      address,
      city,
      state,
      pincode,
      // GL-AUD-008: Bank detail fields
      bankAccountNumber,
      bankIfsc,
      bankAccountName,
      upiVpa,
    } = req.body;

    // Validation
    if (!email || !password || !businessName) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Email, password, and business name are required' }
      });
      return;
    }

    // SUP-REG-001: GSTIN is required (DB column is NOT NULL)
    if (!gstin) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'GSTIN is required for supplier registration' }
      });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Password must be at least 8 characters' }
      });
      return;
    }

    // GSTIN format validation
    if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin)) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid GSTIN format' }
      });
      return;
    }

    // GL-AUD-008: Bank detail validation
    if (bankAccountNumber && !isValidBankAccountNumber(bankAccountNumber)) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid bank account number. Must be 9-18 digits.' }
      });
      return;
    }

    if (bankIfsc && !isValidIfscCode(bankIfsc)) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid IFSC code. Format: 4 letters + 0 + 6 alphanumeric (e.g., SBIN0001234)' }
      });
      return;
    }

    if (upiVpa && !isValidUpiVpa(upiVpa)) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid UPI VPA format. Must be username@bankhandle (e.g., merchant@paytm)' }
      });
      return;
    }

    // Require IFSC when bank account is provided
    if (bankAccountNumber && !bankIfsc) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'IFSC code is required when bank account number is provided' }
      });
      return;
    }

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: 'DB_UNAVAILABLE', message: 'Database unavailable' } });
      return;
    }

    // Check if email already exists
    const existingResult = await pool.query(
      `SELECT id FROM supplier.suppliers WHERE primary_email = $1`,
      [email.toLowerCase()]
    );

    if (existingResult.rows.length > 0) {
      res.status(409).json({
        error: { code: 'EMAIL_EXISTS', message: 'A supplier with this email already exists' }
      });
      return;
    }

    // Check if GSTIN already exists (if provided)
    if (gstin) {
      const gstinResult = await pool.query(
        `SELECT id FROM supplier.suppliers WHERE gstin = $1`,
        [gstin.toUpperCase()]
      );

      if (gstinResult.rows.length > 0) {
        res.status(409).json({
          error: { code: 'GSTIN_EXISTS', message: 'A supplier with this GSTIN already exists' }
        });
        return;
      }
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // Create supplier (GL-AUD-008: includes bank details)
    const result = await pool.query(
      `INSERT INTO supplier.suppliers (
        primary_email,
        password_hash,
        business_name,
        gstin,
        primary_phone,
        address_line1,
        city,
        state,
        pincode,
        bank_account_number,
        bank_ifsc,
        bank_account_name,
        upi_vpa,
        verification_status,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'KYC_SUBMITTED', 'active')
      RETURNING id, primary_email, business_name, gstin, verification_status`,
      [
        email.toLowerCase(),
        passwordHash,
        businessName,
        gstin.toUpperCase(),
        phone || null,
        address || null,
        city || null,
        state || null,
        pincode || null,
        bankAccountNumber || null,
        bankIfsc?.toUpperCase() || null,
        bankAccountName || null,
        upiVpa?.toLowerCase() || null,
      ]
    );

    const supplier = result.rows[0];

    // GO-LIVE-084: Generate JWT token with JTI for revocation support
    const jti = randomUUID(); // Unique token identifier
    const jwtPayload = {
      sub: supplier.id,
      actorType: 'SUPPLIER',
      actorId: supplier.id,
      email: supplier.primary_email,
      permissions: ['supplier:read', 'supplier:write', 'products:read', 'products:write'],
      jti, // GO-LIVE-084: JWT ID for revocation
    };

    const token = jwt.sign(jwtPayload, JWT_SECRET, {
      issuer: JWT_ISSUER,
      expiresIn: JWT_EXPIRES_IN,
    });

    res.status(201).json({
      data: {
        token,
        supplier: {
          id: supplier.id,
          email: supplier.primary_email,
          businessName: supplier.business_name,
          gstin: supplier.gstin,
          verificationStatus: supplier.verification_status,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/supplier/auth/login
 * Login an existing supplier
 * ITER4-P1-001: Rate limited to prevent brute force attacks
 * GO-LIVE-134: Account lockout after failed attempts
 * GO-LIVE-138: IP-based blocking after multiple failures
 */
router.post("/auth/login", checkIpBlockMiddleware, loginRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Email and password are required' }
      });
      return;
    }

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: 'DB_UNAVAILABLE', message: 'Database unavailable' } });
      return;
    }

    // GO-LIVE-134: Get supplier by email including lockout fields
    const result = await pool.query(
      `SELECT id, primary_email, password_hash, business_name, gstin,
              verification_status, status, failed_login_count, locked_until
       FROM supplier.suppliers
       WHERE primary_email = $1`,
      [email.toLowerCase()]
    );

    const supplier = result.rows[0];

    // Use constant-time comparison to prevent timing attacks
    // Don't reveal whether email exists or not
    if (!supplier || !supplier.password_hash) {
      res.status(401).json({
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' }
      });
      return;
    }

    // GO-LIVE-134: Check if account is locked
    if (supplier.locked_until && new Date(supplier.locked_until) > new Date()) {
      const remainingMinutes = Math.ceil((new Date(supplier.locked_until).getTime() - Date.now()) / 60000);
      console.warn(`[SupplierAuth] GO-LIVE-134: Account ${email} is locked for ${remainingMinutes} more minutes`);
      res.status(403).json({
        error: {
          code: 'ACCOUNT_LOCKED',
          message: `Account is temporarily locked due to too many failed login attempts. Please try again in ${remainingMinutes} minutes.`,
          lockedUntil: supplier.locked_until,
        }
      });
      return;
    }

    if (supplier.status !== 'active') {
      res.status(403).json({
        error: { code: 'ACCOUNT_INACTIVE', message: 'Your account is not active' }
      });
      return;
    }

    // SA-P1-005: Block suspended suppliers
    if (supplier.verification_status === 'SUSPENDED') {
      res.status(403).json({
        error: { code: 'ACCOUNT_SUSPENDED', message: 'Your account has been suspended. Please contact support.' }
      });
      return;
    }

    // Verify password
    const isValid = await bcrypt.compare(password, supplier.password_hash);
    const clientIp = req.ip || req.socket?.remoteAddress || null;

    if (!isValid) {
      // GO-LIVE-138: Record IP-level failure
      if (clientIp) {
        await recordAuthFailure(clientIp, 'login_failed', { email });
      }

      // GO-LIVE-134: Record failed login attempt
      const newCount = (supplier.failed_login_count || 0) + 1;
      const attemptsRemaining = MAX_LOGIN_ATTEMPTS - newCount;

      if (newCount >= MAX_LOGIN_ATTEMPTS) {
        // Lock the account
        const lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000);
        await pool.query(
          `UPDATE supplier.suppliers
           SET failed_login_count = $1, locked_until = $2, last_failed_login_at = NOW(), last_login_ip = $3
           WHERE id = $4`,
          [newCount, lockedUntil, clientIp, supplier.id]
        );
        console.warn(`[SupplierAuth] GO-LIVE-134: Account ${email} locked after ${newCount} failed attempts`);

        // GO-LIVE-144: Log account lockout
        logAccountLocked({
          actorType: 'supplier',
          actorId: supplier.id,
          email,
          ipAddress: clientIp || undefined,
          lockDurationMinutes: LOCKOUT_DURATION_MINUTES,
          failedAttempts: newCount,
        }).catch(() => {});

        res.status(403).json({
          error: {
            code: 'ACCOUNT_LOCKED',
            message: `Account has been locked due to ${MAX_LOGIN_ATTEMPTS} failed login attempts. Please try again in ${LOCKOUT_DURATION_MINUTES} minutes.`,
            lockedUntil,
          }
        });
      } else {
        // Just increment the counter
        await pool.query(
          `UPDATE supplier.suppliers
           SET failed_login_count = $1, last_failed_login_at = NOW(), last_login_ip = $2
           WHERE id = $3`,
          [newCount, clientIp, supplier.id]
        );
        console.warn(`[SupplierAuth] GO-LIVE-134: Failed login for ${email}, ${attemptsRemaining} attempts remaining`);

        // GO-LIVE-144: Log failed login attempt
        logLoginFailed({
          actorType: 'supplier',
          email,
          ipAddress: clientIp || undefined,
          userAgent: req.get('user-agent'),
          errorCode: 'INVALID_CREDENTIALS',
          metadata: { attemptsRemaining },
        }).catch(() => {});

        res.status(401).json({
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email or password',
            attemptsRemaining: attemptsRemaining > 0 ? attemptsRemaining : undefined,
          }
        });
      }
      return;
    }

    // GO-LIVE-134: Clear failed login attempts on successful login
    await pool.query(
      `UPDATE supplier.suppliers
       SET failed_login_count = 0, locked_until = NULL, last_login_ip = $1
       WHERE id = $2`,
      [clientIp, supplier.id]
    );

    // GO-LIVE-138: Clear IP failure tracking on successful login
    if (clientIp) {
      clearIpFailures(clientIp);
    }

    // GO-LIVE-084: Generate JWT token with JTI for revocation support
    const jti = randomUUID();
    const jwtPayload = {
      sub: supplier.id,
      actorType: 'SUPPLIER',
      actorId: supplier.id,
      email: supplier.primary_email,
      permissions: ['supplier:read', 'supplier:write', 'products:read', 'products:write'],
      jti, // GO-LIVE-084: JWT ID for revocation
    };

    const token = jwt.sign(jwtPayload, JWT_SECRET, {
      issuer: JWT_ISSUER,
      expiresIn: JWT_EXPIRES_IN,
    });

    // AUTH-SESSION-169: Generate refresh token for email/password login
    const refreshJti = randomUUID();
    const refreshPayload = {
      sub: supplier.id,
      type: 'refresh',
      jti: refreshJti,
    };
    const refreshToken = jwt.sign(refreshPayload, JWT_SECRET, {
      issuer: JWT_ISSUER,
      expiresIn: '7d',
    });

    // GO-LIVE-144: Log successful login
    logLoginSuccess({
      actorType: 'supplier',
      actorId: supplier.id,
      email: supplier.primary_email,
      ipAddress: clientIp || undefined,
      userAgent: req.get('user-agent'),
    }).catch(() => {}); // Non-blocking

    // AUTH-SESSION-169: Set HttpOnly cookies for session persistence
    setAuthCookies(res, token, refreshToken, 86400, 7 * 86400);

    res.json({
      data: {
        token,
        refreshToken,
        supplier: {
          id: supplier.id,
          email: supplier.primary_email,
          businessName: supplier.business_name,
          gstin: supplier.gstin,
          verificationStatus: supplier.verification_status,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/supplier/auth/change-password
 * Change supplier password (requires auth)
 * GO-LIVE-054: Added rate limiting to prevent abuse
 */
router.post("/auth/change-password", requireSupplierAuth, passwordChangeRateLimiter, async (req: SupplierAuthRequest, res: Response, next: NextFunction) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Current and new password are required' }
      });
      return;
    }

    if (newPassword.length < 8) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'New password must be at least 8 characters' }
      });
      return;
    }

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: 'DB_UNAVAILABLE', message: 'Database unavailable' } });
      return;
    }

    // Get current password hash
    const result = await pool.query(
      `SELECT password_hash FROM supplier.suppliers WHERE id = $1`,
      [req.supplierId]
    );

    const supplier = result.rows[0];
    if (!supplier?.password_hash) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Supplier not found' }
      });
      return;
    }

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, supplier.password_hash);
    if (!isValid) {
      res.status(401).json({
        error: { code: 'INVALID_PASSWORD', message: 'Current password is incorrect' }
      });
      return;
    }

    // Hash new password and update
    const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await pool.query(
      `UPDATE supplier.suppliers SET password_hash = $1 WHERE id = $2`,
      [newHash, req.supplierId]
    );

    res.json({ data: { success: true } });
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// GL-WF-035: Password Reset Flow
// =============================================================================

/**
 * POST /api/v1/supplier/auth/forgot-password
 * Request a password reset token
 * ITER4-P1-002: Rate limited to prevent email flooding
 */
router.post("/auth/forgot-password", passwordResetRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Email is required' }
      });
      return;
    }

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: 'DB_UNAVAILABLE', message: 'Database unavailable' } });
      return;
    }

    // Check if email exists
    const result = await pool.query(
      `SELECT id, primary_email FROM supplier.suppliers WHERE primary_email = $1`,
      [email.toLowerCase()]
    );

    // Always return success to prevent email enumeration
    if (result.rows.length === 0) {
      res.json({ data: { success: true, message: 'If the email exists, a reset link will be sent.' } });
      return;
    }

    const supplier = result.rows[0];

    // GO-LIVE-086: Generate cryptographically secure 64-char hex token (256 bits entropy)
    // Much stronger than previous 6-digit code (~20 bits)
    const resetToken = generateSecureResetToken();
    const resetExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // GO-LIVE-085: Hash token before storing (like passwords)
    // Store only the hash, never the plaintext token
    const tokenHash = hashResetToken(resetToken);
    await pool.query(
      `UPDATE supplier.suppliers
       SET password_reset_token = $1, password_reset_expires = $2
       WHERE id = $3`,
      [tokenHash, resetExpiry, supplier.id]
    );

    // ITER4-P0-013: Never log reset tokens - only log that a reset was requested
    console.log(`[GL-WF-035] Password reset requested for ***@${email?.split('@')[1] || '***'} (GO-LIVE-085/086: secure hashed token)`);

    // GO-LIVE-166: Send email with reset token (with proper error handling)
    let emailSent = false;
    let emailError: string | undefined;
    if (isEmailServiceEnabled()) {
      try {
        const emailResult = await sendPasswordResetEmail(email, resetToken, supplier.business_name);
        emailSent = emailResult.sent;
        if (!emailResult.sent) {
          emailError = emailResult.errorCode;
          console.error(`[GL-WF-035] Failed to send password reset email to ${email}: ${emailResult.errorCode} - ${emailResult.errorMessage}`);
        }
      } catch (err) {
        emailError = 'EMAIL_SEND_EXCEPTION';
        console.error(`[GL-WF-035] Exception sending password reset email:`, err);
      }
    } else {
      emailError = 'EMAIL_SERVICE_DISABLED';
      console.warn(`[GL-WF-035] Email service is disabled - password reset email not sent`);
    }

    res.json({
      data: {
        success: true,
        message: 'If the email exists, a reset link will be sent.',
        // GO-LIVE-166: Include email delivery status (never leak whether email exists)
        emailDeliveryAttempted: isEmailServiceEnabled(),
        // DEV ONLY: Return token in response for testing (this is the plaintext token to send via email)
        ...(process.env.NODE_ENV !== 'production' && { devToken: resetToken, emailSent, emailError })
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/supplier/auth/reset-password
 * Reset password using token
 */
router.post("/auth/reset-password", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, token, newPassword } = req.body;

    if (!email || !token || !newPassword) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Email, token, and new password are required' }
      });
      return;
    }

    if (newPassword.length < 8) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'New password must be at least 8 characters' }
      });
      return;
    }

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: 'DB_UNAVAILABLE', message: 'Database unavailable' } });
      return;
    }

    // Find supplier with valid reset token
    const result = await pool.query(
      `SELECT id, password_reset_token, password_reset_expires
       FROM supplier.suppliers
       WHERE primary_email = $1`,
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      res.status(400).json({
        error: { code: 'INVALID_TOKEN', message: 'Invalid or expired reset token' }
      });
      return;
    }

    const supplier = result.rows[0];

    // Check if reset token exists
    if (!supplier.password_reset_token) {
      res.status(400).json({
        error: { code: 'INVALID_TOKEN', message: 'No password reset was requested for this account' }
      });
      return;
    }

    // Check expiry first (faster check)
    if (new Date(supplier.password_reset_expires) < new Date()) {
      res.status(400).json({
        error: { code: 'TOKEN_EXPIRED', message: 'Reset token has expired. Please request a new one.' }
      });
      return;
    }

    // GO-LIVE-085: Verify token using timing-safe hash comparison
    // The stored value is a hash, so we hash the provided token and compare
    if (!verifyResetTokenHash(token, supplier.password_reset_token)) {
      res.status(400).json({
        error: { code: 'INVALID_TOKEN', message: 'Invalid or expired reset token' }
      });
      return;
    }

    // Hash new password and update
    const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await pool.query(
      `UPDATE supplier.suppliers
       SET password_hash = $1, password_reset_token = NULL, password_reset_expires = NULL
       WHERE id = $2`,
      [newHash, supplier.id]
    );

    res.json({ data: { success: true, message: 'Password reset successfully. You can now login.' } });
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// GL-WF-034: Email Verification Flow
// =============================================================================

/**
 * POST /api/v1/supplier/auth/send-verification
 * Send email verification code (requires auth)
 * GO-LIVE: Now actually sends emails via Resend/SMTP
 * CRITICAL: Returns honest result - never lies about email delivery
 */
router.post("/auth/send-verification", requireSupplierAuth, async (req: SupplierAuthRequest, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: 'DB_UNAVAILABLE', message: 'Database unavailable' } });
      return;
    }

    // Check if already verified
    const result = await pool.query(
      `SELECT id, primary_email, email_verified FROM supplier.suppliers WHERE id = $1`,
      [req.supplierId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Supplier not found' } });
      return;
    }

    const supplier = result.rows[0];

    if (supplier.email_verified) {
      res.status(400).json({ error: { code: 'ALREADY_VERIFIED', message: 'Email is already verified' } });
      return;
    }

    // Check rate limit before sending
    const rateLimitError = checkEmailRateLimit(supplier.primary_email);
    if (rateLimitError) {
      res.status(429).json({
        error: { code: 'RATE_LIMITED', message: rateLimitError }
      });
      return;
    }

    // Generate cryptographically secure 6-digit OTP
    const verificationCode = generateSecureOTP();
    const OTP_EXPIRY_MINUTES = 10; // 10 minutes for better security
    const verificationExpiry = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    // Hash OTP before storing for security
    const hashedCode = hashOTP(verificationCode);

    // Store hashed verification code
    await pool.query(
      `UPDATE supplier.suppliers
       SET email_verification_token = $1, email_verification_expires = $2
       WHERE id = $3`,
      [hashedCode, verificationExpiry, req.supplierId]
    );

    // CRITICAL: Actually send the email
    const emailResult = await sendVerificationEmail({
      to: supplier.primary_email,
      code: verificationCode,
      expiryMinutes: OTP_EXPIRY_MINUTES,
    });

    // Record the send attempt for rate limiting
    recordEmailSend(supplier.primary_email);

    // NEVER log OTP in production
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[GL-WF-034] DEV: Verification code for ${supplier.primary_email}: ${verificationCode}`);
    }

    // Return HONEST result about email delivery
    if (emailResult.sent) {
      res.json({
        data: {
          sent: true,
          message: 'Verification code sent to your email.',
          expiresIn: OTP_EXPIRY_MINUTES * 60, // seconds
          // DEV ONLY: Return code in response for testing
          ...(process.env.NODE_ENV !== 'production' && { devCode: verificationCode })
        }
      });
    } else {
      // Email failed to send - be honest about it
      console.error(`[GL-WF-034] Failed to send verification email to ${supplier.primary_email}: ${emailResult.errorCode}`);
      res.status(500).json({
        error: {
          code: 'EMAIL_SEND_FAILED',
          message: 'Failed to send verification email. Please try again or contact support.',
          errorCode: emailResult.errorCode,
        },
        data: {
          sent: false,
          errorCode: emailResult.errorCode,
        }
      });
    }
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/supplier/auth/verify-email
 * Verify email using code (requires auth)
 * GO-LIVE: Uses timing-safe hash comparison for security
 */
router.post("/auth/verify-email", requireSupplierAuth, async (req: SupplierAuthRequest, res: Response, next: NextFunction) => {
  try {
    const { code } = req.body;

    if (!code) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Verification code is required' }
      });
      return;
    }

    // Validate code format (must be 6 digits)
    if (!/^\d{6}$/.test(code)) {
      res.status(400).json({
        error: { code: 'INVALID_CODE', message: 'Verification code must be 6 digits' }
      });
      return;
    }

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: 'DB_UNAVAILABLE', message: 'Database unavailable' } });
      return;
    }

    // Get supplier verification data
    const result = await pool.query(
      `SELECT id, email_verified, email_verification_token, email_verification_expires
       FROM supplier.suppliers
       WHERE id = $1`,
      [req.supplierId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Supplier not found' } });
      return;
    }

    const supplier = result.rows[0];

    if (supplier.email_verified) {
      res.status(400).json({ error: { code: 'ALREADY_VERIFIED', message: 'Email is already verified' } });
      return;
    }

    // Check if there's a pending verification token
    if (!supplier.email_verification_token) {
      res.status(400).json({
        error: { code: 'NO_PENDING_VERIFICATION', message: 'No verification code pending. Please request a new one.' }
      });
      return;
    }

    // Check expiry first (before revealing code validity)
    if (new Date(supplier.email_verification_expires) < new Date()) {
      // Clear expired token
      await pool.query(
        `UPDATE supplier.suppliers
         SET email_verification_token = NULL, email_verification_expires = NULL
         WHERE id = $1`,
        [req.supplierId]
      );
      res.status(400).json({
        error: { code: 'CODE_EXPIRED', message: 'Verification code has expired. Please request a new one.' }
      });
      return;
    }

    // Verify code using timing-safe hash comparison
    // The stored token is a SHA-256 hash of the original OTP
    if (!verifyOTPHash(code, supplier.email_verification_token)) {
      res.status(400).json({
        error: { code: 'INVALID_CODE', message: 'Invalid verification code' }
      });
      return;
    }

    // Mark email as verified and clear the token
    await pool.query(
      `UPDATE supplier.suppliers
       SET email_verified = true, email_verification_token = NULL, email_verification_expires = NULL
       WHERE id = $1`,
      [req.supplierId]
    );

    console.log(`[GL-WF-034] Email verified for supplier ${req.supplierId}`);

    res.json({ data: { success: true, message: 'Email verified successfully!' } });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/supplier/auth/verification-status
 * Check email verification status (requires auth)
 */
router.get("/auth/verification-status", requireSupplierAuth, async (req: SupplierAuthRequest, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: 'DB_UNAVAILABLE', message: 'Database unavailable' } });
      return;
    }

    const result = await pool.query(
      `SELECT email_verified FROM supplier.suppliers WHERE id = $1`,
      [req.supplierId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Supplier not found' } });
      return;
    }

    res.json({ data: { emailVerified: result.rows[0].email_verified } });
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// GO-LIVE-084: Token Revocation (Logout)
// =============================================================================

/**
 * POST /api/v1/supplier/auth/logout
 * GO-LIVE-084: Revoke the current session token (logout)
 * Adds the token's JTI to the blacklist so it can't be reused
 */
router.post("/auth/logout", requireSupplierAuth, async (req: SupplierAuthRequest, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    if (!pool) {
      // Even if DB is unavailable, return success since token will expire eventually
      res.json({ data: { success: true, message: 'Logged out' } });
      return;
    }

    // Get token JTI and expiry from the decoded JWT
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.json({ data: { success: true, message: 'Logged out' } });
      return;
    }

    const token = authHeader.slice(7);
    let decoded: { jti?: string; exp?: number };

    try {
      // Decode without verification (already verified by middleware)
      decoded = jwt.decode(token) as { jti?: string; exp?: number };
    } catch {
      res.json({ data: { success: true, message: 'Logged out' } });
      return;
    }

    if (!decoded?.jti) {
      // Old tokens without JTI - still return success
      console.log(`[SupplierAuth] Logout for supplier ${req.supplierId} (no JTI)`);
      res.json({ data: { success: true, message: 'Logged out' } });
      return;
    }

    // Calculate token expiry (default to 24h if not present)
    const expiresAt = decoded.exp
      ? new Date(decoded.exp * 1000)
      : new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Add to revocation blacklist
    try {
      await pool.query(
        `INSERT INTO supplier.token_revocations
         (supplier_id, jti, token_expires_at, revoked_by, reason, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (jti) DO NOTHING`,
        [
          req.supplierId,
          decoded.jti,
          expiresAt,
          'user',
          'User logout',
          req.ip || null,
          req.get('user-agent') || null,
        ]
      );

      console.log(`[GO-LIVE-084] Token revoked for supplier ${req.supplierId}, JTI: ${decoded.jti}`);
    } catch (dbError) {
      // Log but don't fail - token will expire eventually
      console.warn('[SupplierAuth] Failed to record token revocation:', dbError);
    }

    // AUTH-SESSION-169: Clear auth cookies on logout
    clearAuthCookies(res);

    res.json({
      data: {
        success: true,
        message: 'Logged out successfully',
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/supplier/auth/logout-all
 * GO-LIVE-084: Revoke all sessions for the current supplier
 * Useful when password is changed or suspicious activity is detected
 */
router.post("/auth/logout-all", requireSupplierAuth, async (req: SupplierAuthRequest, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: 'DB_UNAVAILABLE', message: 'Database unavailable' } });
      return;
    }

    // Since we can't enumerate all active tokens, we'll:
    // 1. Invalidate the current token
    // 2. Add a "revoke all before" timestamp to the supplier record

    // First, revoke current token if it has JTI
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      try {
        const decoded = jwt.decode(token) as { jti?: string; exp?: number };
        if (decoded?.jti) {
          const expiresAt = decoded.exp
            ? new Date(decoded.exp * 1000)
            : new Date(Date.now() + 24 * 60 * 60 * 1000);

          await pool.query(
            `INSERT INTO supplier.token_revocations
             (supplier_id, jti, token_expires_at, revoked_by, reason)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (jti) DO NOTHING`,
            [req.supplierId, decoded.jti, expiresAt, 'user', 'Logout all sessions']
          );
        }
      } catch {
        // Ignore decode errors
      }
    }

    // Update supplier record with revocation timestamp
    // Any tokens issued before this timestamp should be considered invalid
    await pool.query(
      `UPDATE supplier.suppliers
       SET tokens_revoked_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [req.supplierId]
    );

    console.log(`[GO-LIVE-084] All tokens revoked for supplier ${req.supplierId}`);

    res.json({
      data: {
        success: true,
        message: 'All sessions logged out. Please login again.',
      },
    });
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// GO-LIVE-SUP-AUTH: Firebase Phone OTP ONLY - No Password
// =============================================================================

/**
 * Normalize phone number to E.164 format
 */
function normalizePhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) {
    return `+${digits}`;
  }
  if (digits.length === 10) {
    return `+91${digits}`;
  }
  if (digits.length > 10) {
    return `+${digits}`;
  }
  return `+${digits}`;
}

/**
 * POST /api/v1/supplier/auth/firebase-register
 * GO-LIVE-SUP-AUTH-002: Register a new supplier with phone OTP verification
 * NO PASSWORD - OTP only model
 *
 * Request body:
 * - idToken: Firebase ID token (proves phone ownership)
 * - email: Email address
 * - businessName: Business name
 * - gstin: GSTIN (optional)
 */
router.post("/auth/firebase-register", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { idToken, email, businessName, gstin } = req.body as {
      idToken?: string;
      email?: string;
      businessName?: string;
      gstin?: string;
    };

    // Validate inputs (NO PASSWORD)
    if (!idToken || !email || !businessName) {
      res.status(400).json({
        error: { code: 'MISSING_FIELDS', message: 'All fields are required: idToken, email, businessName' }
      });
      return;
    }

    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim().toLowerCase())) {
      res.status(400).json({
        error: { code: 'INVALID_EMAIL', message: 'Please enter a valid email address' }
      });
      return;
    }

    // Validate GSTIN if provided (GL-CRIT-0031: position 14 can be any alphanumeric)
    if (gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}[0-9A-Z]{1}[0-9A-Z]{1}$/.test(gstin.toUpperCase())) {
      res.status(400).json({
        error: { code: 'INVALID_GSTIN', message: 'Invalid GSTIN format' }
      });
      return;
    }

    // Verify Firebase token
    if (!verifyFirebaseIdToken) {
      if (process.env.NODE_ENV === 'production') {
        res.status(503).json({
          error: { code: 'SERVICE_UNAVAILABLE', message: 'Authentication service unavailable' }
        });
        return;
      }
      res.status(400).json({
        error: { code: 'FIREBASE_REQUIRED', message: 'Firebase verification required for registration' }
      });
      return;
    }

    const verifyResult = await verifyFirebaseIdToken(idToken);
    if (!verifyResult.success || !verifyResult.payload?.phone_number) {
      res.status(401).json({
        error: { code: 'INVALID_TOKEN', message: 'Invalid or expired verification. Please verify your phone again.' }
      });
      return;
    }

    const phone = normalizePhoneNumber(verifyResult.payload.phone_number);

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: 'DB_UNAVAILABLE', message: 'Database unavailable' } });
      return;
    }

    // Check if phone already registered
    const existingPhone = await pool.query(
      `SELECT id FROM supplier.suppliers WHERE primary_phone = $1`,
      [phone]
    );
    if (existingPhone.rows[0]) {
      res.status(409).json({
        error: { code: 'PHONE_EXISTS', message: 'This phone number is already registered. Please login instead.' }
      });
      return;
    }

    // Check if email already registered
    const existingEmail = await pool.query(
      `SELECT id FROM supplier.suppliers WHERE primary_email = $1`,
      [email.toLowerCase()]
    );
    if (existingEmail.rows[0]) {
      res.status(409).json({
        error: { code: 'EMAIL_EXISTS', message: 'This email is already registered.' }
      });
      return;
    }

    // Check GSTIN if provided
    if (gstin) {
      const existingGstin = await pool.query(
        `SELECT id FROM supplier.suppliers WHERE gstin = $1`,
        [gstin.toUpperCase()]
      );
      if (existingGstin.rows[0]) {
        res.status(409).json({
          error: { code: 'GSTIN_EXISTS', message: 'A supplier with this GSTIN already exists' }
        });
        return;
      }
    }

    // Create supplier with pending status (awaiting admin approval)
    // NO password_hash - OTP only model
    const result = await pool.query(
      `INSERT INTO supplier.suppliers (
        primary_phone,
        primary_email,
        business_name,
        gstin,
        verification_status,
        status
      ) VALUES ($1, $2, $3, $4, 'pending', 'pending')
      RETURNING id, primary_phone, primary_email, business_name, gstin, verification_status, status`,
      [
        phone,
        email.toLowerCase(),
        businessName,
        gstin?.toUpperCase() || null,
      ]
    );

    const supplier = result.rows[0];

    console.log(`[SupplierAuth] GO-LIVE-SUP-AUTH-002: Registration successful for phone ***${phone.slice(-4)}`);

    res.status(201).json({
      success: true,
      message: 'Registration submitted for approval. You will be notified once approved.',
      data: {
        supplier: {
          id: supplier.id,
          phone: `***${phone.slice(-4)}`,
          email: supplier.primary_email,
          businessName: supplier.business_name,
          status: supplier.status,
        },
      },
    });
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      res.status(409).json({
        error: { code: 'ALREADY_EXISTS', message: 'Phone, email, or GSTIN already registered.' }
      });
      return;
    }
    next(error);
  }
});

/**
 * POST /api/v1/supplier/auth/firebase-login
 * GO-LIVE-SUP-AUTH-001: Login with Firebase Phone OTP only (no password)
 *
 * Request body:
 * - idToken: Firebase ID token (proves phone ownership via OTP)
 *
 * Returns:
 * - APPROVED supplier: JWT token + supplier data
 * - PENDING_APPROVAL: Status indicator (no full JWT)
 * - LOCKED/INACTIVE: Blocked with error
 */
router.post("/auth/firebase-login", checkIpBlockMiddleware, loginRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { idToken } = req.body as { idToken?: string };

    if (!idToken) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Firebase ID token is required' }
      });
      return;
    }

    // Verify Firebase token
    if (!verifyFirebaseIdToken) {
      if (process.env.NODE_ENV === 'production') {
        res.status(503).json({
          error: { code: 'SERVICE_UNAVAILABLE', message: 'Authentication service unavailable' }
        });
        return;
      }
      res.status(400).json({
        error: { code: 'FIREBASE_REQUIRED', message: 'Firebase verification required' }
      });
      return;
    }

    const verifyResult = await verifyFirebaseIdToken(idToken);
    if (!verifyResult.success || !verifyResult.payload?.phone_number) {
      res.status(401).json({
        error: { code: 'INVALID_TOKEN', message: 'Invalid or expired verification. Please verify your phone again.' }
      });
      return;
    }

    const phoneNormalized = normalizePhoneNumber(verifyResult.payload.phone_number);

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: 'DB_UNAVAILABLE', message: 'Database unavailable' } });
      return;
    }

    // Find supplier by phone
    const result = await pool.query(
      `SELECT id, primary_email, primary_phone, business_name, gstin,
              verification_status, status, locked_until
       FROM supplier.suppliers
       WHERE primary_phone = $1`,
      [phoneNormalized]
    );

    const supplier = result.rows[0];
    const clientIp = req.ip || req.socket?.remoteAddress || null;

    if (!supplier) {
      res.status(404).json({
        error: { code: 'USER_NOT_FOUND', message: 'No account found with this phone number. Please register first.' }
      });
      return;
    }

    // Check if account is pending approval
    if (supplier.status === 'pending') {
      res.status(200).json({
        success: true,
        status: 'pending',
        message: 'Your account is pending admin approval. You will be notified once approved.',
      });
      return;
    }

    // Check if account is locked
    if (supplier.locked_until && new Date(supplier.locked_until) > new Date()) {
      const remainingMinutes = Math.ceil((new Date(supplier.locked_until).getTime() - Date.now()) / 60000);
      res.status(403).json({
        error: {
          code: 'ACCOUNT_LOCKED',
          message: `Account is temporarily locked. Please try again in ${remainingMinutes} minutes.`,
          lockedUntil: supplier.locked_until,
        }
      });
      return;
    }

    // Check if account is active
    if (supplier.status !== 'active') {
      res.status(403).json({
        error: { code: 'ACCOUNT_INACTIVE', message: 'Your account is not active. Please contact support.' }
      });
      return;
    }

    // SA-P1-005: Block suspended suppliers
    if (supplier.verification_status === 'SUSPENDED') {
      res.status(403).json({
        error: { code: 'ACCOUNT_SUSPENDED', message: 'Your account has been suspended. Please contact support.' }
      });
      return;
    }

    // Update last login
    await pool.query(
      `UPDATE supplier.suppliers
       SET last_login_ip = $1, failed_login_count = 0, locked_until = NULL
       WHERE id = $2`,
      [clientIp, supplier.id]
    );

    if (clientIp) {
      clearIpFailures(clientIp);
    }

    // Generate JWT
    const jti = randomUUID();
    const jwtPayload = {
      sub: supplier.id,
      actorType: 'SUPPLIER',
      actorId: supplier.id,
      email: supplier.primary_email,
      phone: phoneNormalized,
      permissions: ['supplier:read', 'supplier:write', 'products:read', 'products:write'],
      jti,
    };

    const token = jwt.sign(jwtPayload, JWT_SECRET, {
      issuer: JWT_ISSUER,
      expiresIn: JWT_EXPIRES_IN,
    });

    // Generate refresh token
    const refreshJti = randomUUID();
    const refreshPayload = {
      sub: supplier.id,
      type: 'refresh',
      jti: refreshJti,
    };

    const refreshToken = jwt.sign(refreshPayload, JWT_SECRET, {
      issuer: JWT_ISSUER,
      expiresIn: '7d',
    });

    logLoginSuccess({
      actorType: 'supplier',
      actorId: supplier.id,
      phone: phoneNormalized,
      ipAddress: clientIp || undefined,
      userAgent: req.get('user-agent'),
    }).catch(() => {});

    console.log(`[SupplierAuth] GO-LIVE-SUP-AUTH-001: OTP login successful for ***${phoneNormalized.slice(-4)}`);

    // AUTH-SESSION-169: Set HttpOnly cookies for session persistence across page refreshes
    setAuthCookies(res, token, refreshToken, 86400, 7 * 86400);

    res.json({
      success: true,
      status: 'active',
      token,
      refreshToken,
      expiresIn: 86400,
      tokenType: 'Bearer',
      supplier: {
        id: supplier.id,
        phone: `***${phoneNormalized.slice(-4)}`,
        email: supplier.primary_email,
        businessName: supplier.business_name,
        gstin: supplier.gstin,
        verificationStatus: supplier.verification_status,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/supplier/auth/refresh
 * AUTH-SESSION-169: Refresh an expired access token using a valid refresh token (cookie or body)
 */
router.post("/auth/refresh", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const refreshToken = getRefreshTokenFromRequest(req);

    if (!refreshToken) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Refresh token is required' } });
      return;
    }

    // Verify refresh token
    let decoded: { sub: string; type: string; jti?: string; iat?: number };
    try {
      decoded = jwt.verify(refreshToken, JWT_SECRET, {
        issuer: JWT_ISSUER,
      }) as { sub: string; type: string; jti?: string; iat?: number };
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        res.status(401).json({ error: { code: 'TOKEN_EXPIRED', message: 'Refresh token expired. Please login again.' } });
        return;
      }
      res.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'Invalid refresh token' } });
      return;
    }

    if (decoded.type !== 'refresh') {
      res.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'Invalid token type' } });
      return;
    }

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: 'DB_UNAVAILABLE', message: 'Database unavailable' } });
      return;
    }

    // Check if refresh token has been revoked
    if (decoded.jti) {
      const revocationCheck = await pool.query(
        `SELECT 1 FROM auth.token_revocations WHERE jti = $1 LIMIT 1`,
        [decoded.jti]
      );
      if (revocationCheck.rows.length > 0) {
        res.status(401).json({ error: { code: 'TOKEN_REVOKED', message: 'Session has been logged out. Please login again.' } });
        return;
      }
    }

    // Get supplier info
    const supplierResult = await pool.query(
      `SELECT id, primary_email, primary_phone, business_name, status
       FROM supplier.suppliers
       WHERE id = $1 AND status = 'active'`,
      [decoded.sub]
    );

    if (!supplierResult.rows[0]) {
      res.status(401).json({ error: { code: 'USER_NOT_FOUND', message: 'Supplier not found or inactive' } });
      return;
    }

    const supplier = supplierResult.rows[0];

    // Generate new access token
    const newJti = randomUUID();
    const jwtPayload = {
      sub: supplier.id,
      actorType: 'SUPPLIER',
      actorId: supplier.id,
      email: supplier.primary_email,
      phone: supplier.primary_phone,
      permissions: ['supplier:read', 'supplier:write', 'products:read', 'products:write'],
      jti: newJti,
    };

    const accessToken = jwt.sign(jwtPayload, JWT_SECRET, {
      issuer: JWT_ISSUER,
      expiresIn: JWT_EXPIRES_IN,
    });

    // AUTH-SESSION-169: Refresh cookies
    setAuthCookies(res, accessToken, refreshToken, 86400, 7 * 86400);

    res.json({
      success: true,
      data: {
        accessToken,
        expiresIn: 86400,
        tokenType: 'Bearer',
      },
    });
  } catch (error) {
    next(error);
  }
});

export const supplierAuthRouter = router;
