// Supplier Auth Routes
// SM-005: Supplier registration and login APIs

import { Router, Request, Response, NextFunction } from 'express';
import type { Router as RouterType } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { ApiError, ERROR_CODES, query, queryOne } from '@supermandi/common';
import { validateGstin } from '../utils/gstin';
import { config } from '../config';

const router: RouterType = Router();

// =============================================================================
// GL-AUD-008: Bank Detail Validation Functions
// =============================================================================

/**
 * Validate Indian bank account number
 * Indian bank account numbers are typically 9-18 digits
 */
function isValidBankAccountNumber(accountNumber: string): boolean {
  const trimmed = accountNumber.replace(/\s/g, '');
  // Must be 9-18 digits only
  return /^\d{9,18}$/.test(trimmed);
}

/**
 * Validate IFSC code
 * Format: 4 letters (bank code) + 0 + 6 alphanumeric characters (branch code)
 * Example: SBIN0001234, HDFC0000001
 */
function isValidIfscCode(ifsc: string): boolean {
  const trimmed = ifsc.toUpperCase().trim();
  // 4 letters + 0 + 6 alphanumeric
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(trimmed);
}

/**
 * Validate UPI VPA
 * Format: username@bankhandle
 * Example: merchant@paytm, shop123@ybl
 */
function isValidUpiVpa(vpa: string): boolean {
  const trimmed = vpa.trim().toLowerCase();
  // T-215: Canonical UPI VPA pattern — min 3 chars before @, min 2 after @, max 100 total
  return /^[a-z0-9._-]{3,}@[a-z0-9]{2,}$/.test(trimmed) && trimmed.length >= 6 && trimmed.length <= 100;
}

// =============================================================================
// TYPES
// =============================================================================

interface RegisterBody {
  businessName: string;
  gstin: string;
  email: string;
  phone: string;
  password: string;
  bankAccountNumber?: string;
  bankIfsc?: string;
  bankAccountName?: string;
  upiVpa?: string;
}

interface LoginBody {
  email: string;
  password: string;
}

interface SupplierRow {
  id: string;
  gstin: string;
  business_name: string;
  primary_email: string;
  primary_phone: string;
  password_hash: string | null;
  verification_status: string;
  status: string;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

const BCRYPT_COST = 12;

// JWT issuer must match main-backend for cross-service token validation
const JWT_ISSUER = process.env['JWT_ISSUER'] || 'supermandi-auth';

function generateSupplierToken(supplierId: string, email: string): string {
  // Payload structure must match main-backend expectations
  const payload = {
    sub: supplierId,
    actorType: 'SUPPLIER',
    actorId: supplierId,
    email,
    // Also include supplierId for backward compatibility with supplier-service middleware
    supplierId,
    permissions: ['supplier:read', 'supplier:write', 'products:read', 'products:write'],
  };

  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: '24h',  // Match main-backend's 24h expiry
    issuer: JWT_ISSUER,
  });
}

// =============================================================================
// AUTH ENDPOINTS
// =============================================================================

/**
 * POST /auth/register
 * Register a new supplier with GSTIN, bank details, and password
 */
router.post(
  '/auth/register',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as RegisterBody;

      // Validate required fields
      if (!body.businessName || !body.gstin || !body.email || !body.phone || !body.password) {
        throw new ApiError(
          422,
          ERROR_CODES.VALIDATION_ERROR,
          'Missing required fields: businessName, gstin, email, phone, password'
        );
      }

      // Validate GSTIN format
      const gstinResult = validateGstin(body.gstin);
      if (!gstinResult.isValid) {
        throw new ApiError(
          400,
          ERROR_CODES.VALIDATION_ERROR,
          `Invalid GSTIN format: ${gstinResult.errors.join(', ')}`
        );
      }

      // Validate password strength (minimum 8 characters)
      if (body.password.length < 8) {
        throw new ApiError(
          422,
          ERROR_CODES.VALIDATION_ERROR,
          'Password must be at least 8 characters'
        );
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(body.email)) {
        throw new ApiError(
          422,
          ERROR_CODES.VALIDATION_ERROR,
          'Invalid email format'
        );
      }

      // GL-AUD-008: Validate bank details if provided
      if (body.bankAccountNumber && !isValidBankAccountNumber(body.bankAccountNumber)) {
        throw new ApiError(
          422,
          ERROR_CODES.VALIDATION_ERROR,
          'Invalid bank account number. Must be 9-18 digits.'
        );
      }

      if (body.bankIfsc && !isValidIfscCode(body.bankIfsc)) {
        throw new ApiError(
          422,
          ERROR_CODES.VALIDATION_ERROR,
          'Invalid IFSC code. Format: 4 letters + 0 + 6 alphanumeric (e.g., SBIN0001234)'
        );
      }

      if (body.upiVpa && !isValidUpiVpa(body.upiVpa)) {
        throw new ApiError(
          422,
          ERROR_CODES.VALIDATION_ERROR,
          'Invalid UPI VPA format. Must be username@bankhandle (e.g., merchant@paytm)'
        );
      }

      // Validate that if bank account is provided, IFSC should also be provided
      if (body.bankAccountNumber && !body.bankIfsc) {
        throw new ApiError(
          422,
          ERROR_CODES.VALIDATION_ERROR,
          'IFSC code is required when bank account number is provided'
        );
      }

      // Check if GSTIN already registered
      const existingGstin = await queryOne<{ id: string }>(
        'SELECT id FROM supplier.suppliers WHERE gstin = $1',
        [body.gstin.toUpperCase()]
      );

      if (existingGstin) {
        throw new ApiError(
          409,
          ERROR_CODES.CONFLICT,
          'GSTIN already registered'
        );
      }

      // Check if email already registered
      const existingEmail = await queryOne<{ id: string }>(
        'SELECT id FROM supplier.suppliers WHERE primary_email = $1',
        [body.email.toLowerCase()]
      );

      if (existingEmail) {
        throw new ApiError(
          409,
          ERROR_CODES.CONFLICT,
          'Email already registered'
        );
      }

      // Hash password
      const passwordHash = await bcrypt.hash(body.password, BCRYPT_COST);

      // Insert supplier
      const result = await queryOne<{ id: string }>(
        `INSERT INTO supplier.suppliers (
          gstin, pan, business_name, primary_email, primary_phone,
          password_hash, bank_account_number, bank_ifsc, bank_account_name, upi_vpa,
          verification_status, status
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', 'active'
        ) RETURNING id`,
        [
          body.gstin.toUpperCase(),
          gstinResult.pan,  // Extract PAN from GSTIN
          body.businessName,
          body.email.toLowerCase(),
          body.phone,
          passwordHash,
          body.bankAccountNumber || null,
          body.bankIfsc || null,
          body.bankAccountName || null,
          body.upiVpa || null,
        ]
      );

      if (!result) {
        throw new ApiError(
          500,
          ERROR_CODES.INTERNAL_ERROR,
          'Failed to create supplier'
        );
      }

      // Log the registration
      await query(
        `INSERT INTO supplier.approval_logs (entity_type, entity_id, action, to_status, actor_id)
         VALUES ('supplier', $1, 'submit', 'pending', $1)`,
        [result.id]
      );

      res.status(201).json({
        supplierId: result.id,
        status: 'pending',
        message: 'Registration successful. Pending SuperAdmin approval.',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /auth/login
 * Login with email and password, returns JWT
 */
router.post(
  '/auth/login',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as LoginBody;

      // Validate required fields
      if (!body.email || !body.password) {
        throw new ApiError(
          422,
          ERROR_CODES.VALIDATION_ERROR,
          'Missing required fields: email, password'
        );
      }

      // Find supplier by email
      const supplier = await queryOne<SupplierRow>(
        `SELECT id, gstin, business_name, primary_email, primary_phone,
                password_hash, verification_status, status
         FROM supplier.suppliers
         WHERE primary_email = $1`,
        [body.email.toLowerCase()]
      );

      if (!supplier) {
        throw new ApiError(
          401,
          ERROR_CODES.UNAUTHORIZED,
          'Invalid credentials'
        );
      }

      // Check if account is suspended
      if (supplier.status === 'suspended') {
        throw new ApiError(
          403,
          ERROR_CODES.FORBIDDEN,
          'Account suspended'
        );
      }

      // Check if password hash exists (supplier registered via new flow)
      if (!supplier.password_hash) {
        throw new ApiError(
          401,
          ERROR_CODES.UNAUTHORIZED,
          'Invalid credentials'
        );
      }

      // Verify password
      const passwordValid = await bcrypt.compare(body.password, supplier.password_hash);
      if (!passwordValid) {
        throw new ApiError(
          401,
          ERROR_CODES.UNAUTHORIZED,
          'Invalid credentials'
        );
      }

      // Generate JWT
      const token = generateSupplierToken(supplier.id, supplier.primary_email);

      res.json({
        token,
        supplierId: supplier.id,
        businessName: supplier.business_name,
        status: supplier.verification_status,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /auth/me
 * Get current supplier info from JWT token
 * Compatible with tokens from both supplier-service and main-backend
 */
router.get(
  '/auth/me',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Get token from Authorization header
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new ApiError(
          401,
          ERROR_CODES.UNAUTHORIZED,
          'Missing or invalid authorization header'
        );
      }

      const token = authHeader.substring(7);

      // Verify and decode token - support both old and new formats
      let decoded: {
        supplierId?: string;
        actorId?: string;
        sub?: string;
        email: string;
        actorType: string
      };
      try {
        decoded = jwt.verify(token, config.jwtSecret, { issuer: JWT_ISSUER }) as typeof decoded;
      } catch {
        throw new ApiError(
          401,
          ERROR_CODES.UNAUTHORIZED,
          'Invalid or expired token'
        );
      }

      // Verify actorType
      if (decoded.actorType !== 'SUPPLIER') {
        throw new ApiError(
          403,
          ERROR_CODES.FORBIDDEN,
          'Invalid token type'
        );
      }

      // Extract supplierId from either format
      const supplierId = decoded.supplierId || decoded.actorId || decoded.sub;
      if (!supplierId) {
        throw new ApiError(
          401,
          ERROR_CODES.UNAUTHORIZED,
          'Invalid token: missing supplier ID'
        );
      }

      // Get supplier info
      const supplier = await queryOne<SupplierRow>(
        `SELECT id, gstin, business_name, primary_email, primary_phone,
                verification_status, status
         FROM supplier.suppliers
         WHERE id = $1`,
        [supplierId]
      );

      if (!supplier) {
        throw new ApiError(
          404,
          ERROR_CODES.NOT_FOUND,
          'Supplier not found'
        );
      }

      res.json({
        supplierId: supplier.id,
        gstin: supplier.gstin,
        businessName: supplier.business_name,
        email: supplier.primary_email,
        phone: supplier.primary_phone,
        status: supplier.verification_status,
        accountStatus: supplier.status,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
