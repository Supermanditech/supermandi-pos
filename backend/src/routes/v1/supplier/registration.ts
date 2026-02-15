// REG-AUTH-202: Supplier Registration API
// Registration-First Authentication - Application must exist before OTP login
//
// Flow:
// 1. User submits registration with GSTIN, business details, phone, email
// 2. System creates application (status: DRAFT)
// 3. User verifies phone via OTP → application gets firebase_uid
// 4. User uploads documents → status: KYC_SUBMITTED
// 5. Admin reviews → status: ACTIVE (creates supplier)
// 6. ONLY THEN can user access full features

import { Router, Request, Response, NextFunction } from "express";
import { getPool } from "../../../db/client";
import rateLimit from "express-rate-limit";
import { sendRegistrationConfirmationEmail } from "../../../services/emailService";

const router = Router();

// Firebase verification
let verifyFirebaseIdToken: ((idToken: string) => Promise<{
  success: boolean;
  payload?: { phone_number?: string; uid?: string };
  error?: string;
  code?: string;
}>) | null = null;

try {
  const firebase = require("@supermandi/common");
  if (firebase.verifyFirebaseIdToken) {
    verifyFirebaseIdToken = firebase.verifyFirebaseIdToken;
    console.log("[SupplierReg] Firebase server-side verification available");
  }
} catch {
  console.warn("[SupplierReg] Firebase verification not available");
}

// Rate limiter for registration endpoints
const registrationRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 attempts per window (multi-step flow needs headroom for retries)
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many registration attempts. Please try again in 15 minutes.'
    }
  },
  keyGenerator: (req) => {
    return req.ip || 'unknown';
  }
});

// =============================================================================
// TYPES
// =============================================================================

interface CreateApplicationRequest {
  phone: string;
  businessName: string;
  ownerName: string;
  gstin: string;
  email: string; // Required for suppliers
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  bankAccountNumber?: string;
  bankIfsc?: string;
  bankAccountName?: string;
  upiVpa?: string;
}

interface VerifyOtpRequest {
  idToken: string;
  applicationId: string;
}

// =============================================================================
// UTILITIES
// =============================================================================

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

// GSTIN format validation
// Format: 22AAAAA0000A1Z5 (15 chars)
// Position 14 can be any alphanumeric (GL-CRIT-0031)
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}[0-9A-Z]{1}[0-9A-Z]{1}$/;

function validateGSTIN(gstin: string): boolean {
  return GSTIN_REGEX.test(gstin.trim().toUpperCase());
}

// Bank account validation (9-18 digits)
function isValidBankAccountNumber(accountNumber: string): boolean {
  const trimmed = accountNumber.replace(/\s/g, '');
  return /^\d{9,18}$/.test(trimmed);
}

// IFSC code validation (4 letters + 0 + 6 alphanumeric)
function isValidIfscCode(ifsc: string): boolean {
  const trimmed = ifsc.toUpperCase().trim();
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(trimmed);
}

// UPI VPA validation
function isValidUpiVpa(vpa: string): boolean {
  const trimmed = vpa.trim().toLowerCase();
  return /^[a-z0-9._-]{3,}@[a-z0-9]{2,}$/.test(trimmed) && trimmed.length >= 6 && trimmed.length <= 100;
}

// =============================================================================
// ROUTES
// =============================================================================

/**
 * GET /api/v1/supplier/registration/lookup
 * GO-LIVE-UI-REG-004: Lookup registration by phone number
 *
 * This endpoint is used by the login page to check if a phone number
 * has a registration before allowing OTP login.
 *
 * Query params:
 * - phone: Phone number to lookup (required)
 *
 * Returns:
 * - exists: true/false
 * - application_id: (if exists)
 * - status: Application status
 * - nextStep: What the user should do next
 */
// STBT-187.9: Accept both GET (backward compat) and POST (PII-safe)
router.all("/lookup", registrationRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const phone = (req.body?.phone || req.query.phone) as string | undefined;

    if (!phone) {
      res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Phone number is required" }
      });
      return;
    }

    const phoneNormalized = normalizePhoneNumber(phone);

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: "DB_UNAVAILABLE", message: "Database unavailable" } });
      return;
    }

    // First check if phone has an approved supplier (can login directly)
    // PORTAL-AUTH-001: Use primary_phone column (not phone) - matches supplier.suppliers schema
    const supplierResult = await pool.query(
      `SELECT id, business_name, verification_status
       FROM supplier.suppliers
       WHERE primary_phone = $1 AND verification_status IN ('verified', 'active', 'ACTIVE', 'SUSPENDED')
       LIMIT 1`,
      [phoneNormalized]
    );

    if (supplierResult.rows.length > 0) {
      const supplier = supplierResult.rows[0];

      // SA-P1-005: Block suspended suppliers at lookup
      if (supplier.verification_status === 'SUSPENDED') {
        res.json({
          exists: true,
          type: 'supplier',
          status: 'SUSPENDED',
          nextStep: 'ACCOUNT_SUSPENDED',
          businessName: supplier.business_name,
          message: 'Your account has been suspended. Please contact support.',
        });
        return;
      }

      // Phone has an approved supplier - can login directly
      res.json({
        exists: true,
        type: 'supplier',
        status: 'ACTIVE',
        nextStep: 'LOGIN_ALLOWED',
        businessName: supplier.business_name,
        message: 'Account found. You can proceed with OTP login.',
      });
      return;
    }

    // Check for existing application
    const appResult = await pool.query(
      `SELECT id, status, firebase_uid IS NOT NULL as phone_verified, business_name
       FROM auth.applications
       WHERE phone = $1 AND entity_type = 'supplier'
       ORDER BY created_at DESC
       LIMIT 1`,
      [phoneNormalized]
    );

    if (appResult.rows.length === 0) {
      // No registration found
      res.json({
        exists: false,
        action: 'REGISTER_REQUIRED',
        message: 'No registration found for this phone number. Please register first.',
      });
      return;
    }

    const application = appResult.rows[0];

    // Determine next step based on status
    let nextStep: string;
    switch (application.status) {
      case 'ACTIVE':
        nextStep = 'LOGIN_ALLOWED';
        break;
      case 'EXPIRED':
        nextStep = 'REGISTER_REQUIRED';
        break;
      case 'KYC_SUBMITTED':
      case 'UNDER_REVIEW':
      case 'PAYMENTS_SUBMITTED':
        nextStep = 'PENDING_APPROVAL';
        break;
      case 'NEEDS_FIX':
        nextStep = 'FIX_REQUIRED';
        break;
      case 'REJECTED':
        nextStep = 'CONTACT_SUPPORT';
        break;
      default: // DRAFT
        nextStep = application.phone_verified ? 'UPLOAD_DOCUMENTS' : 'VERIFY_PHONE';
    }

    // For expired applications, tell user to register again
    if (application.status === 'EXPIRED') {
      res.json({
        exists: false,
        action: 'REGISTER_REQUIRED',
        message: 'Your previous application has expired. Please register again.',
      });
      return;
    }

    // For active applications, allow login
    if (application.status === 'ACTIVE') {
      res.json({
        exists: true,
        application_id: application.id,
        status: application.status,
        nextStep: 'LOGIN_ALLOWED',
        message: 'Your registration is approved. You can proceed with OTP login.',
      });
      return;
    }

    // For pending/in-progress applications
    res.json({
      exists: true,
      application_id: application.id,
      status: application.status,
      nextStep,
      businessName: application.business_name,
      message: nextStep === 'PENDING_APPROVAL'
        ? 'Your application is under review. OTP login is not yet available.'
        : 'Please complete your registration before logging in.',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/supplier/registration/check-gstin
 * REG-AUTH-202: Check if GSTIN is already registered
 *
 * Returns:
 * - exists: true/false
 * - action: 'CREATE' | 'RESUME' | 'LOGIN'
 * - applicationId: (if exists and can resume)
 */
router.post("/check-gstin", registrationRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { gstin } = req.body as { gstin?: string };

    if (!gstin) {
      res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "GSTIN is required" }
      });
      return;
    }

    const gstinNormalized = gstin.trim().toUpperCase();

    if (!validateGSTIN(gstinNormalized)) {
      res.status(400).json({
        error: { code: "INVALID_GSTIN", message: "Please enter a valid 15-character GSTIN" }
      });
      return;
    }

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: "DB_UNAVAILABLE", message: "Database unavailable" } });
      return;
    }

    // Use the helper function to check GSTIN uniqueness
    const result = await pool.query(
      `SELECT * FROM auth.check_gstin_uniqueness($1, 'supplier')`,
      [gstinNormalized]
    );

    if (result.rows.length === 0) {
      // GSTIN not found - can create new application
      res.json({
        exists: false,
        action: 'CREATE',
        message: 'GSTIN is available for registration'
      });
      return;
    }

    const { exists_in, entity_id, entity_status, can_resume } = result.rows[0];

    if (exists_in === 'supplier') {
      // Already an approved supplier
      res.json({
        exists: true,
        action: 'LOGIN',
        message: 'This GSTIN is already registered. Please login instead.',
        supplierId: entity_id,
      });
      return;
    }

    if (exists_in === 'application') {
      if (can_resume) {
        // Can resume existing application
        res.json({
          exists: true,
          action: 'RESUME',
          message: 'An application with this GSTIN already exists. You can resume it.',
          applicationId: entity_id,
          applicationStatus: entity_status,
        });
      } else {
        // Application exists but can't resume (ACTIVE or EXPIRED)
        res.json({
          exists: true,
          action: 'LOGIN',
          message: entity_status === 'ACTIVE'
            ? 'This GSTIN is already approved. Please login.'
            : 'The application for this GSTIN has expired. Please contact support.',
          applicationId: entity_id,
          applicationStatus: entity_status,
        });
      }
      return;
    }

    // Fallback
    res.json({
      exists: false,
      action: 'CREATE',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/supplier/registration/create
 * REG-AUTH-202: Create new supplier registration application
 *
 * This creates an application in DRAFT status.
 * Phone must be verified via OTP before proceeding.
 */
router.post("/create", registrationRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      phone,
      businessName,
      ownerName,
      gstin,
      email,
      addressLine1,
      addressLine2,
      city,
      state,
      pincode,
      bankAccountNumber,
      bankIfsc,
      bankAccountName,
      upiVpa,
    } = req.body as CreateApplicationRequest;

    // Validate required fields (email required for suppliers)
    if (!phone || !businessName || !ownerName || !gstin || !email) {
      res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Phone, business name, owner name, GSTIN, and email are required"
        }
      });
      return;
    }

    const gstinNormalized = gstin.trim().toUpperCase();
    const phoneNormalized = normalizePhoneNumber(phone);

    // AUDIT-API-009: Validate phone format (must resolve to valid Indian mobile: +91 + 10 digits starting with 6-9)
    const phoneDigits = phoneNormalized.replace(/\D/g, "");
    if (!/^91[6-9]\d{9}$/.test(phoneDigits)) {
      res.status(400).json({
        error: { code: "INVALID_PHONE", message: "Please enter a valid 10-digit Indian mobile number" }
      });
      return;
    }

    // Validate GSTIN format
    if (!validateGSTIN(gstinNormalized)) {
      res.status(400).json({
        error: { code: "INVALID_GSTIN", message: "Please enter a valid 15-character GSTIN" }
      });
      return;
    }

    // Validate email (required for suppliers)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim().toLowerCase())) {
      res.status(400).json({
        error: { code: "INVALID_EMAIL", message: "Please enter a valid email address" }
      });
      return;
    }

    // Validate bank details if provided
    if (bankAccountNumber && !isValidBankAccountNumber(bankAccountNumber)) {
      res.status(400).json({
        error: { code: "INVALID_BANK_ACCOUNT", message: "Invalid bank account number. Must be 9-18 digits." }
      });
      return;
    }

    if (bankIfsc && !isValidIfscCode(bankIfsc)) {
      res.status(400).json({
        error: { code: "INVALID_IFSC", message: "Invalid IFSC code. Format: 4 letters + 0 + 6 alphanumeric (e.g., SBIN0001234)" }
      });
      return;
    }

    if (upiVpa && !isValidUpiVpa(upiVpa)) {
      res.status(400).json({
        error: { code: "INVALID_UPI_VPA", message: "Invalid UPI VPA format. Must be username@bankhandle (e.g., merchant@paytm)" }
      });
      return;
    }

    // Require IFSC when bank account is provided
    if (bankAccountNumber && !bankIfsc) {
      res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "IFSC code is required when bank account number is provided" }
      });
      return;
    }

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: "DB_UNAVAILABLE", message: "Database unavailable" } });
      return;
    }

    // Check GSTIN uniqueness
    const gstinCheck = await pool.query(
      `SELECT * FROM auth.check_gstin_uniqueness($1, 'supplier')`,
      [gstinNormalized]
    );

    if (gstinCheck.rows.length > 0) {
      const { exists_in, entity_id, entity_status, can_resume } = gstinCheck.rows[0];

      if (exists_in === 'supplier') {
        res.status(409).json({
          error: {
            code: "GSTIN_EXISTS",
            message: "This GSTIN is already registered as an approved supplier. Please login instead."
          }
        });
        return;
      }

      if (exists_in === 'application') {
        // STAGING-FIX-011: If the GSTIN belongs to the same user's DRAFT app (same phone),
        // skip the 409 and let the phone-based upsert below handle it.
        // This allows re-submission of the same form without blocking.
        const ownerCheck = await pool.query(
          `SELECT id FROM auth.applications
           WHERE id = $1::uuid AND phone = $2 AND status IN ('DRAFT', 'OTP_VERIFIED')`,
          [entity_id, phoneNormalized]
        );

        if (ownerCheck.rows.length === 0) {
          // GSTIN belongs to a different user's application or non-resumable status
          if (can_resume) {
            res.status(409).json({
              error: {
                code: "APPLICATION_EXISTS",
                message: "An application with this GSTIN already exists. Please resume it.",
                applicationId: entity_id,
                applicationStatus: entity_status,
              }
            });
          } else {
            res.status(409).json({
              error: {
                code: "GSTIN_EXISTS",
                message: "This GSTIN is already registered.",
              }
            });
          }
          return;
        }
        // Same phone owns this GSTIN application — fall through to upsert
      }
    }

    // Check if a DRAFT application already exists for this phone (allow re-registration)
    const existingApp = await pool.query(
      `SELECT id, status, gstin FROM auth.applications
       WHERE phone = $1 AND entity_type = 'supplier' AND status IN ('DRAFT', 'OTP_VERIFIED')
       ORDER BY created_at DESC LIMIT 1`,
      [phoneNormalized]
    );

    let application;
    let isResumed = false;

    if (existingApp.rows.length > 0) {
      // Update existing DRAFT/OTP_VERIFIED application with new details
      const existing = existingApp.rows[0];
      const updateResult = await pool.query(
        `UPDATE auth.applications SET
          business_name = $2,
          owner_name = $3,
          gstin = $4,
          email = $5,
          address_line1 = $6,
          address_line2 = $7,
          city = $8,
          state = $9,
          pincode = $10,
          bank_account_number = $11,
          bank_ifsc = $12,
          bank_name = $13,
          upi_vpa = $14,
          updated_at = NOW()
        WHERE id = $1
        RETURNING id, status, created_at`,
        [
          existing.id,
          businessName.trim(),
          ownerName.trim(),
          gstinNormalized,
          email.trim().toLowerCase(),
          addressLine1?.trim() || null,
          addressLine2?.trim() || null,
          city?.trim() || null,
          state?.trim() || null,
          pincode?.trim() || null,
          bankAccountNumber || null,
          bankIfsc?.toUpperCase() || null,
          bankAccountName || null,
          upiVpa?.toLowerCase() || null,
        ]
      );
      application = updateResult.rows[0];
      isResumed = true;
      console.log(`[SupplierReg] REG-AUTH-202: Application updated ${application.id} (phone re-registration) for GSTIN ${gstinNormalized}`);
    } else {
      // Create new application
      const result = await pool.query(
        `INSERT INTO auth.applications (
          entity_type,
          phone,
          email,
          business_name,
          owner_name,
          gstin,
          address_line1,
          address_line2,
          city,
          state,
          pincode,
          bank_account_number,
          bank_ifsc,
          bank_name,
          upi_vpa,
          status
        ) VALUES (
          'supplier',
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14,
          'DRAFT'
        )
        RETURNING id, status, created_at`,
        [
          phoneNormalized,
          email.trim().toLowerCase(),
          businessName.trim(),
          ownerName.trim(),
          gstinNormalized,
          addressLine1?.trim() || null,
          addressLine2?.trim() || null,
          city?.trim() || null,
          state?.trim() || null,
          pincode?.trim() || null,
          bankAccountNumber || null,
          bankIfsc?.toUpperCase() || null,
          bankAccountName || null,
          upiVpa?.toLowerCase() || null,
        ]
      );
      application = result.rows[0];

      // Log status change
      await pool.query(
        `INSERT INTO auth.application_status_log (application_id, old_status, new_status, change_reason)
         VALUES ($1, NULL, 'DRAFT', 'Supplier application created')`,
        [application.id]
      );

      console.log(`[SupplierReg] REG-AUTH-202: Application created ${application.id} for GSTIN ${gstinNormalized}`);
    }

    // STAGING-FIX-012: Inline phone verification during create.
    // If idToken is provided, verify Firebase token and set firebase_uid in one step.
    // This avoids a separate verify-otp call that can fail due to token serialization issues.
    const { idToken } = req.body;
    let phoneVerified = application.status === 'OTP_VERIFIED';

    if (idToken && verifyFirebaseIdToken && !phoneVerified) {
      try {
        const verifyResult = await verifyFirebaseIdToken(idToken);
        if (verifyResult.success && verifyResult.payload?.phone_number) {
          const phoneFromToken = normalizePhoneNumber(verifyResult.payload.phone_number);
          if (phoneFromToken === phoneNormalized) {
            // STAGING-FIX-012b: Clear firebase_uid from other entity types first
            // (unique constraint is global, same phone can have supplier + retailer apps)
            await pool.query(
              `UPDATE auth.applications SET firebase_uid = NULL
               WHERE firebase_uid = $1 AND entity_type != 'supplier'`,
              [verifyResult.payload.uid]
            );
            await pool.query(
              `UPDATE auth.applications SET firebase_uid = $1, updated_at = NOW() WHERE id = $2`,
              [verifyResult.payload.uid, application.id]
            );
            phoneVerified = true;
            console.log(`[SupplierReg] STAGING-FIX-012: Phone verified inline for ${application.id}`);
          }
        }
      } catch (firebaseErr) {
        // Firebase verification failed — non-blocking, user can verify separately
        console.warn(`[SupplierReg] STAGING-FIX-012: Inline verify failed for ${application.id}:`, firebaseErr);
      }
    }

    res.status(201).json({
      success: true,
      application: {
        id: application.id,
        status: phoneVerified ? 'OTP_VERIFIED' : application.status,
        createdAt: application.created_at,
      },
      resumed: isResumed,
      phoneVerified,
      nextStep: phoneVerified ? 'UPLOAD_DOCUMENTS' : 'VERIFY_PHONE',
      message: isResumed
        ? 'Application updated with new details. Please continue registration.'
        : 'Application created. Please verify your phone number with OTP.',
    });
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      // Unique constraint violation (e.g. GSTIN used by another phone)
      res.status(409).json({
        error: {
          code: "DUPLICATE_ENTRY",
          message: "This GSTIN is already registered with a different account."
        }
      });
      return;
    }
    next(error);
  }
});

/**
 * POST /api/v1/supplier/registration/verify-otp
 * REG-AUTH-202: Verify phone OTP for application
 *
 * CRITICAL: Requires application_id - cannot verify without existing application
 * This is the REG-AUTH-203 guardrail enforcement
 */
router.post("/verify-otp", registrationRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { idToken, applicationId } = req.body as VerifyOtpRequest;

    // CRITICAL: application_id is REQUIRED
    if (!applicationId) {
      res.status(403).json({
        error: {
          code: "REGISTRATION_REQUIRED",
          message: "Registration required before login. Please complete registration first.",
        }
      });
      return;
    }

    if (!idToken) {
      res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Firebase ID token is required" }
      });
      return;
    }

    // Verify Firebase token
    if (!verifyFirebaseIdToken) {
      if (process.env.NODE_ENV === 'production') {
        res.status(503).json({
          error: { code: "SERVICE_UNAVAILABLE", message: "Phone verification service unavailable" }
        });
        return;
      }
      res.status(400).json({
        error: { code: "FIREBASE_REQUIRED", message: "Firebase verification required" }
      });
      return;
    }

    const verifyResult = await verifyFirebaseIdToken(idToken);
    if (!verifyResult.success || !verifyResult.payload?.phone_number) {
      res.status(401).json({
        error: { code: "INVALID_TOKEN", message: "Invalid or expired OTP. Please try again." }
      });
      return;
    }

    const phoneFromToken = normalizePhoneNumber(verifyResult.payload.phone_number);
    const firebaseUid = verifyResult.payload.uid;

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: "DB_UNAVAILABLE", message: "Database unavailable" } });
      return;
    }

    // Get application
    const appResult = await pool.query(
      `SELECT id, phone, status, firebase_uid
       FROM auth.applications
       WHERE id = $1::uuid AND entity_type = 'supplier'`,
      [applicationId]
    );

    if (appResult.rows.length === 0) {
      res.status(404).json({
        error: { code: "APPLICATION_NOT_FOUND", message: "Application not found" }
      });
      return;
    }

    const application = appResult.rows[0];

    // Check application status
    if (application.status === 'EXPIRED') {
      res.status(403).json({
        error: {
          code: "APPLICATION_EXPIRED",
          message: "This application has expired. Please create a new registration."
        }
      });
      return;
    }

    if (application.status === 'ACTIVE') {
      res.status(400).json({
        error: {
          code: "ALREADY_APPROVED",
          message: "This application is already approved. Please login instead."
        }
      });
      return;
    }

    // Verify phone matches
    if (application.phone !== phoneFromToken) {
      res.status(403).json({
        error: {
          code: "PHONE_MISMATCH",
          message: "The verified phone number does not match the application."
        }
      });
      return;
    }

    // STAGING-FIX-012b: Clear firebase_uid from other entity types first
    await pool.query(
      `UPDATE auth.applications SET firebase_uid = NULL
       WHERE firebase_uid = $1 AND entity_type != 'supplier'`,
      [firebaseUid]
    );
    // Update application with Firebase UID
    await pool.query(
      `UPDATE auth.applications
       SET firebase_uid = $1, updated_at = NOW()
       WHERE id = $2`,
      [firebaseUid, applicationId]
    );

    console.log(`[SupplierReg] REG-AUTH-202: Phone verified for application ${applicationId}`);

    res.json({
      success: true,
      application: {
        id: application.id,
        status: application.status,
        phoneVerified: true,
      },
      nextStep: application.status === 'DRAFT' ? 'UPLOAD_DOCUMENTS' : 'AWAIT_APPROVAL',
      message: 'Phone verified successfully.',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/supplier/registration/submit-kyc
 * REG-AUTH-202: Submit application for KYC review
 *
 * Changes status from DRAFT → KYC_SUBMITTED
 */
router.post("/submit-kyc", registrationRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { applicationId } = req.body as { applicationId?: string };

    if (!applicationId) {
      res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Application ID is required" }
      });
      return;
    }

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: "DB_UNAVAILABLE", message: "Database unavailable" } });
      return;
    }

    // Get application
    const appResult = await pool.query(
      `SELECT id, status, firebase_uid FROM auth.applications WHERE id = $1::uuid AND entity_type = 'supplier'`,
      [applicationId]
    );

    if (appResult.rows.length === 0) {
      res.status(404).json({
        error: { code: "APPLICATION_NOT_FOUND", message: "Application not found" }
      });
      return;
    }

    const application = appResult.rows[0];

    // Must be in DRAFT or NEEDS_FIX status
    if (!['DRAFT', 'NEEDS_FIX'].includes(application.status)) {
      res.status(400).json({
        error: {
          code: "INVALID_STATUS",
          message: `Cannot submit KYC from status: ${application.status}`
        }
      });
      return;
    }

    // Must have verified phone
    if (!application.firebase_uid) {
      res.status(400).json({
        error: {
          code: "PHONE_NOT_VERIFIED",
          message: "Please verify your phone number before submitting KYC"
        }
      });
      return;
    }

    // Check document completeness (supplier-specific)
    const docsResult = await pool.query(
      `SELECT * FROM auth.check_application_documents($1)`,
      [applicationId]
    );

    const missingDocs = docsResult.rows.filter(d => d.is_required && !d.is_complete);
    if (missingDocs.length > 0) {
      res.status(400).json({
        error: {
          code: "MISSING_DOCUMENTS",
          message: `Missing required documents: ${missingDocs.map(d => d.document_type).join(', ')}`
        },
        missingDocuments: missingDocs.map(d => d.document_type),
      });
      return;
    }

    // Update status
    await pool.query(
      `SELECT auth.update_application_status($1, 'KYC_SUBMITTED', NULL, 'KYC documents submitted')`,
      [applicationId]
    );

    console.log(`[SupplierReg] REG-AUTH-202: KYC submitted for application ${applicationId}`);

    // STAGING-FIX-014: Send registration confirmation email (non-blocking)
    const appDetails = await pool.query(
      `SELECT email, business_name FROM auth.applications WHERE id = $1`,
      [applicationId]
    );
    if (appDetails.rows[0]?.email) {
      sendRegistrationConfirmationEmail(
        appDetails.rows[0].email,
        appDetails.rows[0].business_name || 'Supplier',
        'supplier',
        applicationId
      ).catch(err => console.error('[SupplierReg] Email send failed (non-blocking):', err));
    }

    res.json({
      success: true,
      application: {
        id: applicationId,
        status: 'KYC_SUBMITTED',
      },
      nextStep: 'AWAIT_APPROVAL',
      message: 'KYC submitted successfully. Your application is now under review.',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/supplier/registration/status/:applicationId
 * REG-AUTH-202: Get application status
 */
router.get("/status/:applicationId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { applicationId } = req.params;

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: "DB_UNAVAILABLE", message: "Database unavailable" } });
      return;
    }

    // Get application details
    const appResult = await pool.query(
      `SELECT
        id, entity_type, phone, email, business_name, owner_name, gstin,
        address_line1, address_line2, city, state, pincode,
        bank_account_number, bank_ifsc, bank_name, upi_vpa,
        status, rejection_reason, firebase_uid IS NOT NULL as phone_verified,
        approved_supplier_id, created_at, updated_at, submitted_at
       FROM auth.applications
       WHERE id = $1::uuid AND entity_type = 'supplier'`,
      [applicationId]
    );

    if (appResult.rows.length === 0) {
      res.status(404).json({
        error: { code: "APPLICATION_NOT_FOUND", message: "Application not found" }
      });
      return;
    }

    const application = appResult.rows[0];

    // Get document status
    const docsResult = await pool.query(
      `SELECT * FROM auth.check_application_documents($1)`,
      [applicationId]
    );

    // Get status history
    const historyResult = await pool.query(
      `SELECT old_status, new_status, change_reason, created_at
       FROM auth.application_status_log
       WHERE application_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [applicationId]
    );

    res.json({
      application: {
        id: application.id,
        entityType: application.entity_type,
        businessName: application.business_name,
        ownerName: application.owner_name,
        gstin: application.gstin,
        email: application.email,
        address: {
          line1: application.address_line1,
          line2: application.address_line2,
          city: application.city,
          state: application.state,
          pincode: application.pincode,
        },
        paymentDetails: {
          bankAccountNumber: application.bank_account_number,
          bankIfsc: application.bank_ifsc,
          bankName: application.bank_name,
          upiVpa: application.upi_vpa,
        },
        status: application.status,
        phoneVerified: application.phone_verified,
        rejectionReason: application.rejection_reason,
        approvedSupplierId: application.approved_supplier_id,
        createdAt: application.created_at,
        updatedAt: application.updated_at,
        submittedAt: application.submitted_at,
      },
      documents: docsResult.rows.map(d => ({
        documentType: d.document_type,
        isRequired: d.is_required,
        status: d.status,
        isComplete: d.is_complete,
      })),
      statusHistory: historyResult.rows,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/supplier/registration/resume/:gstin
 * REG-AUTH-202: Resume existing application by GSTIN
 */
router.get("/resume/:gstin", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { gstin } = req.params;
    const gstinNormalized = gstin.trim().toUpperCase();

    if (!validateGSTIN(gstinNormalized)) {
      res.status(400).json({
        error: { code: "INVALID_GSTIN", message: "Please enter a valid 15-character GSTIN" }
      });
      return;
    }

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: "DB_UNAVAILABLE", message: "Database unavailable" } });
      return;
    }

    // Find application by GSTIN
    const result = await pool.query(
      `SELECT id, status, business_name, phone
       FROM auth.applications
       WHERE gstin = $1 AND entity_type = 'supplier' AND status NOT IN ('EXPIRED', 'ACTIVE')
       ORDER BY created_at DESC
       LIMIT 1`,
      [gstinNormalized]
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        error: { code: "APPLICATION_NOT_FOUND", message: "No active application found for this GSTIN" }
      });
      return;
    }

    const application = result.rows[0];

    // Mask phone for privacy
    const maskedPhone = application.phone
      ? `****${application.phone.slice(-4)}`
      : null;

    res.json({
      application: {
        id: application.id,
        status: application.status,
        businessName: application.business_name,
        maskedPhone: maskedPhone,
      },
      nextStep: application.status === 'DRAFT' ? 'VERIFY_PHONE' : 'AWAIT_APPROVAL',
      message: 'Application found. Please verify your phone to continue.',
    });
  } catch (error) {
    next(error);
  }
});

// T-009: Clear stuck DRAFT registration so phone/GSTIN can be reused
// Only DRAFT applications can be expired (not submitted or approved ones)
router.post("/clear", registrationRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { phone } = req.body;
    if (!phone || typeof phone !== 'string') {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Phone number is required' }
      });
    }

    const pool = getPool();
    const normalizedPhone = phone.trim().replace(/\s+/g, '');

    // Only expire DRAFT applications — submitted/approved ones are protected
    const result = await pool.query(
      `UPDATE auth.applications
       SET status = 'EXPIRED', updated_at = NOW()
       WHERE phone = $1 AND entity_type = 'supplier' AND status = 'DRAFT'
       RETURNING id`,
      [normalizedPhone]
    );

    // Always return success (prevent phone enumeration)
    res.json({
      success: true,
      message: result.rowCount && result.rowCount > 0
        ? 'Previous registration cleared. You can register again.'
        : 'No pending registration found for this phone.'
    });
  } catch (error) {
    next(error);
  }
});

export const supplierRegistrationRouter = router;
