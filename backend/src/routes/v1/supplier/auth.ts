// SM-005: Supplier Auth Routes
// Handles supplier registration, login, and password management
// Uses bcrypt for password hashing and JWT for sessions

import { Router, Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import { getPool } from "../../../db/client";

// =============================================================================
// JWT CONFIGURATION
// ITER3-P0-002: JWT_SECRET is required - no fallback in production
// =============================================================================

const JWT_SECRET = (() => {
  const secret = process.env['JWT_SECRET']?.trim();
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      console.error('FATAL: JWT_SECRET environment variable is required in production');
      process.exit(1);
    }
    console.warn('[SECURITY] JWT_SECRET not set - using dev default (NOT FOR PRODUCTION)');
    return 'dev-secret-change-in-prod';
  }
  return secret;
})();
const JWT_ISSUER = process.env['JWT_ISSUER'] || 'supermandi-auth';
const JWT_EXPIRES_IN = '24h';
const BCRYPT_ROUNDS = 10;

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
 * Validate UPI VPA (username@bankhandle)
 */
function isValidUpiVpa(vpa: string): boolean {
  const trimmed = vpa.trim().toLowerCase();
  return /^[a-z0-9._-]+@[a-z0-9]+$/.test(trimmed) && trimmed.length <= 100;
}

// =============================================================================
// MIDDLEWARE: Supplier Auth
// =============================================================================

export interface SupplierAuthRequest extends Request {
  supplierId?: string;
  supplierEmail?: string;
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
    };

    if (decoded.actorType !== 'SUPPLIER') {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Invalid token type' } });
      return;
    }

    req.supplierId = decoded.actorId;
    req.supplierEmail = decoded.email;
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

    if (password.length < 8) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Password must be at least 8 characters' }
      });
      return;
    }

    // GSTIN format validation (if provided)
    if (gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin)) {
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
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'pending', 'active')
      RETURNING id, primary_email, business_name, gstin, verification_status`,
      [
        email.toLowerCase(),
        passwordHash,
        businessName,
        gstin?.toUpperCase() || null,
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

    // Generate JWT token
    const jwtPayload = {
      sub: supplier.id,
      actorType: 'SUPPLIER',
      actorId: supplier.id,
      email: supplier.primary_email,
      permissions: ['supplier:read', 'supplier:write', 'products:read', 'products:write'],
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
 */
router.post("/auth/login", loginRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
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

    // Get supplier by email
    const result = await pool.query(
      `SELECT id, primary_email, password_hash, business_name, gstin,
              verification_status, status
       FROM supplier.suppliers
       WHERE primary_email = $1`,
      [email.toLowerCase()]
    );

    const supplier = result.rows[0];

    if (!supplier || !supplier.password_hash) {
      res.status(401).json({
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' }
      });
      return;
    }

    if (supplier.status !== 'active') {
      res.status(403).json({
        error: { code: 'ACCOUNT_INACTIVE', message: 'Your account is not active' }
      });
      return;
    }

    // Verify password
    const isValid = await bcrypt.compare(password, supplier.password_hash);
    if (!isValid) {
      res.status(401).json({
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' }
      });
      return;
    }

    // Generate JWT token
    const jwtPayload = {
      sub: supplier.id,
      actorType: 'SUPPLIER',
      actorId: supplier.id,
      email: supplier.primary_email,
      permissions: ['supplier:read', 'supplier:write', 'products:read', 'products:write'],
    };

    const token = jwt.sign(jwtPayload, JWT_SECRET, {
      issuer: JWT_ISSUER,
      expiresIn: JWT_EXPIRES_IN,
    });

    res.json({
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
 * POST /api/v1/supplier/auth/change-password
 * Change supplier password (requires auth)
 */
router.post("/auth/change-password", requireSupplierAuth, async (req: SupplierAuthRequest, res: Response, next: NextFunction) => {
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

    // ITER4-P0-002: Use crypto.randomInt() for cryptographically secure token generation
    // 6-digit code for simplicity, valid for 1 hour
    const resetToken = crypto.randomInt(100000, 999999).toString();
    const resetExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Store reset token
    await pool.query(
      `UPDATE supplier.suppliers
       SET password_reset_token = $1, password_reset_expires = $2
       WHERE id = $3`,
      [resetToken, resetExpiry, supplier.id]
    );

    // ITER4-P0-013: Never log reset tokens - only log that a reset was requested
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[GL-WF-035] DEV ONLY - Password reset requested for ${email}`);
    } else {
      console.log(`[GL-WF-035] Password reset requested for ${email}`);
    }

    // TODO: Send email with reset token
    // await sendPasswordResetEmail(email, resetToken);

    res.json({
      data: {
        success: true,
        message: 'If the email exists, a reset code will be sent.',
        // DEV ONLY: Return token in response for testing
        ...(process.env.NODE_ENV !== 'production' && { devToken: resetToken })
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

    // Verify token
    if (supplier.password_reset_token !== token) {
      res.status(400).json({
        error: { code: 'INVALID_TOKEN', message: 'Invalid or expired reset token' }
      });
      return;
    }

    // Check expiry
    if (new Date(supplier.password_reset_expires) < new Date()) {
      res.status(400).json({
        error: { code: 'TOKEN_EXPIRED', message: 'Reset token has expired. Please request a new one.' }
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

    // Generate verification code (6-digit, valid for 1 hour)
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const verificationExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Store verification code
    await pool.query(
      `UPDATE supplier.suppliers
       SET email_verification_token = $1, email_verification_expires = $2
       WHERE id = $3`,
      [verificationCode, verificationExpiry, req.supplierId]
    );

    // In production, send email here
    console.log(`[GL-WF-034] Email verification code for ${supplier.primary_email}: ${verificationCode}`);

    // TODO: Send email with verification code
    // await sendVerificationEmail(supplier.primary_email, verificationCode);

    res.json({
      data: {
        success: true,
        message: 'Verification code sent to your email.',
        // DEV ONLY: Return code in response for testing
        ...(process.env.NODE_ENV !== 'production' && { devCode: verificationCode })
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/supplier/auth/verify-email
 * Verify email using code (requires auth)
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

    // Verify code
    if (supplier.email_verification_token !== code) {
      res.status(400).json({
        error: { code: 'INVALID_CODE', message: 'Invalid verification code' }
      });
      return;
    }

    // Check expiry
    if (new Date(supplier.email_verification_expires) < new Date()) {
      res.status(400).json({
        error: { code: 'CODE_EXPIRED', message: 'Verification code has expired. Please request a new one.' }
      });
      return;
    }

    // Mark email as verified
    await pool.query(
      `UPDATE supplier.suppliers
       SET email_verified = true, email_verification_token = NULL, email_verification_expires = NULL
       WHERE id = $1`,
      [req.supplierId]
    );

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

export const supplierAuthRouter = router;
