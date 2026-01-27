// SM-005: Supplier Auth Routes
// Handles supplier registration, login, and password management
// Uses bcrypt for password hashing and JWT for sessions

import { Router, Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { getPool } from "../../../db/client";

// =============================================================================
// JWT CONFIGURATION
// =============================================================================

const JWT_SECRET = process.env['JWT_SECRET'] || 'dev-secret-change-in-prod';
const JWT_ISSUER = process.env['JWT_ISSUER'] || 'supermandi-auth';
const JWT_EXPIRES_IN = '24h';
const BCRYPT_ROUNDS = 10;

const router = Router();

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
 */
router.post("/auth/login", async (req: Request, res: Response, next: NextFunction) => {
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

export const supplierAuthRouter = router;
