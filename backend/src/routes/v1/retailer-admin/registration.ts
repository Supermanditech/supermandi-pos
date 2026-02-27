// REG-AUTH-201: Retailer Registration API
// Registration-First Authentication - Application must exist before OTP login
//
// Flow:
// 1. User submits registration with GSTIN, business details, phone
// 2. System creates application (status: DRAFT)
// 3. User verifies phone via OTP → application gets firebase_uid
// 4. User uploads documents → status: KYC_SUBMITTED
// 5. Admin reviews → status: ACTIVE (creates store)
// 6. ONLY THEN can user access full features

import { Router, Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { getPool } from "../../../db/client";
import { sendRegistrationConfirmationEmail } from "../../../services/emailService";
import { log } from "../../../lib/logger";

const router = Router();

// Rate limiter for registration endpoints (matches supplier registration)
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
    log.info("[RetailerReg] Firebase server-side verification available");
  }
} catch {
  log.warn("[RetailerReg] Firebase verification not available");
}

// =============================================================================
// TYPES
// =============================================================================

interface CreateApplicationRequest {
  phone: string;
  businessName: string;
  ownerName: string;
  gstin: string;
  businessType?: string;
  email?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  pincode?: string;
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

// =============================================================================
// ROUTES
// =============================================================================

/**
 * GET /api/v1/retailer-admin/registration/lookup
 * GO-LIVE-UI-REG-004: Lookup registration by phone number
 *
 * This endpoint is used by the login page to check if a phone number
 * has a registration before allowing OTP login.
 *
 * Query params:
 * - phone: Phone number to lookup (required)
 *
 * Returns (DR-009: action-only, no existence boolean):
 * - action: LOGIN_ALLOWED | REGISTER_REQUIRED | PENDING_APPROVAL | ...
 * - message: Human-readable guidance
 */
// STBT-187.9: Accept both GET (backward compat) and POST (PII-safe)
router.all("/lookup", registrationRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    // STBT-187.9: Read phone from body (POST) or query (GET, backward compat)
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

    // First check if phone has an approved store (can login directly)
    const storeUserResult = await pool.query(
      `SELECT su.id, s.id as store_id, s.name as store_name, s.status as store_status
       FROM auth.store_users su
       JOIN auth.users u ON u.id = su.user_id
       JOIN platform.stores s ON s.id = su.store_id
       WHERE u.phone = $1 AND su.is_active = true
       LIMIT 1`,
      [phoneNormalized]
    );

    if (storeUserResult.rows.length > 0) {
      // SEC-3: Check store status before allowing login
      const storeStatus = (storeUserResult.rows[0].store_status || '').toUpperCase();
      if (storeStatus === 'SUSPENDED') {
        res.json({
          action: 'ACCOUNT_SUSPENDED',
          message: 'Your store account has been suspended. Contact hello@supermandi.tech for assistance.',
        });
        return;
      }
      // Phone has an active store user - can login directly
      // DR-009: No existence boolean — action-only response
      res.json({
        action: 'LOGIN_ALLOWED',
        message: 'You can proceed with OTP login.',
      });
      return;
    }

    // Check for existing application
    const appResult = await pool.query(
      `SELECT id, status, firebase_uid IS NOT NULL as phone_verified, business_name
       FROM auth.applications
       WHERE phone = $1 AND entity_type = 'retailer'
       ORDER BY created_at DESC
       LIMIT 1`,
      [phoneNormalized]
    );

    if (appResult.rows.length === 0) {
      // DR-009: No existence boolean — uniform envelope
      res.json({
        action: 'REGISTER_REQUIRED',
        message: 'Please register to continue.',
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

    // DR-009: Enumeration-safe — no exists boolean, no internal IDs for unauthenticated callers
    if (application.status === 'EXPIRED') {
      res.json({
        action: 'REGISTER_REQUIRED',
        message: 'Please register to continue.',
      });
      return;
    }

    if (application.status === 'ACTIVE') {
      res.json({
        action: 'LOGIN_ALLOWED',
        message: 'You can proceed with OTP login.',
      });
      return;
    }

    // For pending/in-progress applications
    res.json({
      action: nextStep,
      message: nextStep === 'PENDING_APPROVAL'
        ? 'Your application is under review.'
        : 'Please complete your registration before logging in.',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/retailer-admin/registration/check-gstin
 * REG-AUTH-201: Check if GSTIN is already registered
 *
 * Returns (DR-009: action-only, no existence boolean):
 * - action: 'CREATE' | 'RESUME' | 'LOGIN'
 * - message: Human-readable guidance
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
      `SELECT * FROM auth.check_gstin_uniqueness($1, 'retailer')`,
      [gstinNormalized]
    );

    // DR-009: Enumeration-safe — no exists boolean, no internal IDs
    if (result.rows.length === 0) {
      res.json({
        action: 'CREATE',
        message: 'You can proceed with registration.',
      });
      return;
    }

    const { exists_in, entity_status, can_resume } = result.rows[0];

    if (exists_in === 'store') {
      res.json({
        action: 'LOGIN',
        message: 'An account with this GSTIN exists. Please login instead.',
      });
      return;
    }

    if (exists_in === 'application') {
      if (can_resume) {
        res.json({
          action: 'RESUME',
          message: 'A registration is in progress. Please resume or login.',
        });
      } else {
        res.json({
          action: entity_status === 'ACTIVE' ? 'LOGIN' : 'CREATE',
          message: entity_status === 'ACTIVE'
            ? 'An account with this GSTIN exists. Please login instead.'
            : 'You can proceed with registration.',
        });
      }
      return;
    }

    res.json({
      action: 'CREATE',
      message: 'You can proceed with registration.',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/retailer-admin/registration/create
 * REG-AUTH-201: Create new retailer registration application
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
      businessType,
      email,
      addressLine1,
      addressLine2,
      city,
      state,
      pincode,
    } = req.body as CreateApplicationRequest;

    // Validate required fields
    if (!phone || !businessName || !ownerName || !gstin) {
      res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Phone, business name, owner name, and GSTIN are required"
        }
      });
      return;
    }

    const gstinNormalized = gstin.trim().toUpperCase();
    const phoneNormalized = normalizePhoneNumber(phone);

    // Validate GSTIN format
    if (!validateGSTIN(gstinNormalized)) {
      res.status(400).json({
        error: { code: "INVALID_GSTIN", message: "Please enter a valid 15-character GSTIN" }
      });
      return;
    }

    // Validate email if provided
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim().toLowerCase())) {
        res.status(400).json({
          error: { code: "INVALID_EMAIL", message: "Please enter a valid email address" }
        });
        return;
      }
    }

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: "DB_UNAVAILABLE", message: "Database unavailable" } });
      return;
    }

    // Check GSTIN uniqueness
    const gstinCheck = await pool.query(
      `SELECT * FROM auth.check_gstin_uniqueness($1, 'retailer')`,
      [gstinNormalized]
    );

    if (gstinCheck.rows.length > 0) {
      const { exists_in, entity_id, entity_status, can_resume } = gstinCheck.rows[0];

      if (exists_in === 'store') {
        res.status(409).json({
          error: {
            code: "GSTIN_EXISTS",
            message: "This GSTIN is already registered as an approved store. Please login instead."
          }
        });
        return;
      }

      if (exists_in === 'application') {
        // STAGING-FIX-011: If the GSTIN belongs to the same user's DRAFT app (same phone),
        // skip the 409 and let the phone-based upsert below handle it.
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
       WHERE phone = $1 AND entity_type = 'retailer' AND status IN ('DRAFT', 'OTP_VERIFIED')
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
          business_type = $5,
          email = $6,
          address_line1 = $7,
          address_line2 = $8,
          city = $9,
          state = $10,
          pincode = $11,
          updated_at = NOW()
        WHERE id = $1
        RETURNING id, status, created_at`,
        [
          existing.id,
          businessName.trim(),
          ownerName.trim(),
          gstinNormalized,
          businessType?.trim() || null,
          email?.trim().toLowerCase() || null,
          addressLine1?.trim() || null,
          addressLine2?.trim() || null,
          city?.trim() || null,
          state?.trim() || null,
          pincode?.trim() || null,
        ]
      );
      application = updateResult.rows[0];
      isResumed = true;
      log.info(`[RetailerReg] REG-AUTH-201: Application updated ${application.id} (phone re-registration) for GSTIN ${gstinNormalized}`);
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
          business_type,
          address_line1,
          address_line2,
          city,
          state,
          pincode,
          status
        ) VALUES (
          'retailer',
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
          'DRAFT'
        )
        RETURNING id, status, created_at`,
        [
          phoneNormalized,
          email?.trim().toLowerCase() || null,
          businessName.trim(),
          ownerName.trim(),
          gstinNormalized,
          businessType?.trim() || null,
          addressLine1?.trim() || null,
          addressLine2?.trim() || null,
          city?.trim() || null,
          state?.trim() || null,
          pincode?.trim() || null,
        ]
      );
      application = result.rows[0];

      // Log status change
      await pool.query(
        `INSERT INTO auth.application_status_log (application_id, old_status, new_status, change_reason)
         VALUES ($1, NULL, 'DRAFT', 'Application created')`,
        [application.id]
      );

      log.info(`[RetailerReg] REG-AUTH-201: Application created ${application.id} for GSTIN ${gstinNormalized}`);
    }

    res.status(201).json({
      success: true,
      application: {
        id: application.id,
        status: application.status,
        createdAt: application.created_at,
      },
      resumed: isResumed,
      nextStep: application.status === 'OTP_VERIFIED' ? 'UPLOAD_DOCUMENTS' : 'VERIFY_PHONE',
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
 * POST /api/v1/retailer-admin/registration/verify-otp
 * REG-AUTH-201: Verify phone OTP for application
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
       WHERE id = $1::uuid`,
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

    // STAGING-FIX-013: Clear stale firebase_uid from old DRAFT/OTP_VERIFIED applications
    // before updating, to avoid unique constraint violation (ux_applications_firebase_uid_entity)
    await pool.query(
      `UPDATE auth.applications
       SET firebase_uid = NULL, updated_at = NOW()
       WHERE firebase_uid = $1 AND entity_type = 'retailer' AND id != $2::uuid
         AND status IN ('DRAFT', 'OTP_VERIFIED')`,
      [firebaseUid, applicationId]
    );

    // Update application with Firebase UID
    await pool.query(
      `UPDATE auth.applications
       SET firebase_uid = $1, updated_at = NOW()
       WHERE id = $2`,
      [firebaseUid, applicationId]
    );

    log.info(`[RetailerReg] REG-AUTH-201: Phone verified for application ${applicationId}`);

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
 * POST /api/v1/retailer-admin/registration/submit-kyc
 * REG-AUTH-201: Submit application for KYC review
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
      `SELECT id, status, firebase_uid FROM auth.applications WHERE id = $1::uuid`,
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

    // Check document completeness
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

    log.info(`[RetailerReg] REG-AUTH-201: KYC submitted for application ${applicationId}`);

    // STAGING-FIX-014: Send registration confirmation email (non-blocking)
    const appDetails = await pool.query(
      `SELECT email, business_name FROM auth.applications WHERE id = $1`,
      [applicationId]
    );
    if (appDetails.rows[0]?.email) {
      sendRegistrationConfirmationEmail(
        appDetails.rows[0].email,
        appDetails.rows[0].business_name || 'Retailer',
        'retailer',
        applicationId
      ).catch(err => log.error('[RetailerReg] Email send failed (non-blocking):', err));
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
 * GET /api/v1/retailer-admin/registration/status/:applicationId
 * REG-AUTH-201: Get application status
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
        status, rejection_reason, firebase_uid IS NOT NULL as phone_verified,
        approved_store_id, created_at, updated_at, submitted_at
       FROM auth.applications
       WHERE id = $1::uuid`,
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
        status: application.status,
        phoneVerified: application.phone_verified,
        rejectionReason: application.rejection_reason,
        approvedStoreId: application.approved_store_id,
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
 * GET /api/v1/retailer-admin/registration/resume/:gstin
 * REG-AUTH-201: Resume existing application by GSTIN
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
       WHERE gstin = $1 AND entity_type = 'retailer' AND status NOT IN ('EXPIRED', 'ACTIVE')
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
       WHERE phone = $1 AND entity_type = 'retailer' AND status = 'DRAFT'
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

export const retailerRegistrationRouter = router;
