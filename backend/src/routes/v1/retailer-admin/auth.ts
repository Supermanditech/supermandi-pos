// Retailer Admin Auth Routes - Firebase Token Exchange
// GO-LIVE-FIX: Handles phone OTP authentication via Firebase for retailer portal
// GO-LIVE-045: Server-side Firebase token verification
// GO-LIVE-195: Enhanced auth protection for 10K stores scale

import { Router, Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { getPool } from "../../../db/client";
import { logLoginSuccess } from "../../../services/authAuditService";
// AUTH-SESSION-169: Cookie utility for auth session persistence
import { setAuthCookies, clearAuthCookies, getRefreshTokenFromRequest } from "../../../utils/authCookies";
// T-184: Redis token blacklist for immediate revocation at gateway level
import { blacklistToken } from "../../../db/redis";
// GO-LIVE-189: Import rate limiter to prevent store code enumeration
import { authRateLimiter } from "../../../middleware/posRateLimiter";
// GO-LIVE-195: Enhanced auth protection with per-store-code limiting and progressive lockout
import { enhancedAuthProtection } from "../../../middleware/authProtection";
import { log } from "../../../lib/logger";
// STG-055: Import email service for password reset emails
import { sendPasswordResetEmail } from "../../../services/emailService";

// GO-LIVE-045: Import Firebase verification from common package
let verifyFirebaseIdToken: ((idToken: string) => Promise<{ success: boolean; payload?: { phone_number?: string; uid?: string }; error?: string; code?: string }>) | null = null;
try {
  const firebase = require("@supermandi/common");
  if (firebase.verifyFirebaseIdToken) {
    verifyFirebaseIdToken = firebase.verifyFirebaseIdToken;
    log.info("[RetailerAuth] Firebase server-side verification available");
  }
} catch {
  log.warn("[RetailerAuth] Firebase verification not available - using client-side extraction");
}

// =============================================================================
// JWT CONFIGURATION
// Must match API Gateway middleware settings
// ITER3-P0-002: JWT_SECRET is required - no fallback in production
// =============================================================================

// SEC-003: Only allow dev fallback when NODE_ENV is explicitly 'development' or 'test'
const JWT_SECRET = (() => {
  const secret = process.env['JWT_SECRET']?.trim();
  if (!secret) {
    // W5-BACKEND-JWT-001: JWT_SECRET must always be set; no hardcoded fallback in any environment
    log.error('[FATAL] JWT_SECRET must be set (NODE_ENV is not development/test)');
    process.exit(1);
  }
  return secret;
})();
const JWT_ISSUER = process.env['JWT_ISSUER'] || 'supermandi-auth';
const JWT_EXPIRES_IN = '24h';

// GO-LIVE-LOGIN: Password hashing configuration
const BCRYPT_SALT_ROUNDS = 12;

// Password validation rules
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

function validatePassword(password: string): string | null {
  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  }
  if (!PASSWORD_REGEX.test(password)) {
    return 'Password must contain at least one uppercase letter, one lowercase letter, and one number';
  }
  return null;
}

// Rate limiting for password login attempts
const loginAttempts = new Map<string, { count: number; lockedUntil: number }>();
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

function checkLoginAttempts(key: string): { allowed: boolean; waitMinutes?: number } {
  const attempts = loginAttempts.get(key);
  if (!attempts) return { allowed: true };

  if (Date.now() < attempts.lockedUntil) {
    const waitMinutes = Math.ceil((attempts.lockedUntil - Date.now()) / 60000);
    return { allowed: false, waitMinutes };
  }

  // Reset if lockout expired
  if (attempts.count >= MAX_LOGIN_ATTEMPTS && Date.now() >= attempts.lockedUntil) {
    loginAttempts.delete(key);
    return { allowed: true };
  }

  return { allowed: true };
}

function recordLoginAttempt(key: string, success: boolean): void {
  if (success) {
    loginAttempts.delete(key);
    return;
  }

  const attempts = loginAttempts.get(key) || { count: 0, lockedUntil: 0 };
  attempts.count += 1;

  if (attempts.count >= MAX_LOGIN_ATTEMPTS) {
    attempts.lockedUntil = Date.now() + LOGIN_LOCKOUT_MS;
    log.warn(`[RetailerAuth] GO-LIVE-LOGIN: Account locked for ${key} after ${attempts.count} failed attempts`);
  }

  loginAttempts.set(key, attempts);
}

// Cleanup expired lockouts
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of loginAttempts.entries()) {
    if (data.lockedUntil && now > data.lockedUntil) {
      loginAttempts.delete(key);
    }
  }
}, 60000);

const router = Router();

// =============================================================================
// TYPES
// =============================================================================

interface FirebaseLoginRequest {
  idToken: string;
  storeCode: string;
  // For simplified flow, client can send verified phone
  phoneNumber?: string;
}

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * ITER4-P0-018: Mask phone number to protect PII in API responses
 * Shows only country code and last 4 digits: +91****5678
 */
function maskPhoneNumber(phone: string): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length <= 4) return '****';

  // For E.164 format (+91XXXXXXXXXX)
  if (phone.startsWith('+')) {
    const countryCode = phone.match(/^\+\d{1,3}/)?.[0] || '+';
    const lastFour = digits.slice(-4);
    return `${countryCode}****${lastFour}`;
  }

  // For other formats, just show last 4
  return `****${digits.slice(-4)}`;
}

/**
 * Normalize phone number to E.164 format
 * Assumes Indian numbers if no country code provided
 */
function normalizePhoneNumber(phone: string): string {
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, "");

  // If starts with 91 and has 12 digits, add +
  if (digits.startsWith("91") && digits.length === 12) {
    return `+${digits}`;
  }

  // If 10 digits, assume Indian number
  if (digits.length === 10) {
    return `+91${digits}`;
  }

  // If already has country code (starts with 91 or other)
  if (digits.length > 10) {
    return `+${digits}`;
  }

  // Return as-is with + prefix
  return `+${digits}`;
}

// =============================================================================
// ROUTES
// =============================================================================

/**
 * POST /api/v1/retailer-admin/auth/firebase-login
 * Exchange Firebase ID token for session
 *
 * For go-live: This endpoint validates the store code and phone number,
 * then issues a session token. Firebase verification happens client-side.
 * GO-LIVE-189: Rate limited to prevent store code enumeration via brute force
 * GO-LIVE-195: Enhanced auth protection (per-store-code limiting, progressive lockout)
 */
router.post("/auth/firebase-login", enhancedAuthProtection(), authRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { idToken, storeCode, phoneNumber } = req.body as FirebaseLoginRequest;

    // Validate input
    if (!idToken) {
      res.status(400).json({ error: "Firebase ID token is required" });
      return;
    }
    if (!storeCode) {
      res.status(400).json({ error: "Store code is required" });
      return;
    }

    // GO-LIVE-045: Server-side Firebase token verification
    let phone = phoneNumber;
    let firebaseUid: string | undefined;

    if (verifyFirebaseIdToken) {
      // Server-side verification available - use it
      log.info("[RetailerAuth] Verifying Firebase token server-side");
      const verifyResult = await verifyFirebaseIdToken(idToken);

      if (!verifyResult.success) {
        log.warn(`[RetailerAuth] Firebase verification failed: ${verifyResult.error} (${verifyResult.code})`);
        res.status(401).json({
          error: verifyResult.code === 'TOKEN_EXPIRED'
            ? "Firebase token has expired. Please sign in again."
            : "Invalid Firebase token. Please sign in again.",
          code: verifyResult.code,
        });
        return;
      }

      // Extract verified phone number from Firebase
      phone = verifyResult.payload?.phone_number || phoneNumber;
      firebaseUid = verifyResult.payload?.uid;
      // FIREBASE-HARDENING-B: Log verification success without full PII
      log.info(`[RetailerAuth] Firebase token verified — provider: phone`);
    } else {
      // GO-LIVE-104: Firebase Admin SDK is REQUIRED for production
      // The previous fallback allowed JWT forgery by simply base64-decoding the token
      // without cryptographic verification - attackers could forge any phone number
      if (process.env.NODE_ENV === 'production') {
        log.error("[RetailerAuth] SECURITY: Firebase Admin SDK not configured in production");
        res.status(503).json({
          error: "Authentication service unavailable. Firebase verification required.",
          code: "FIREBASE_NOT_CONFIGURED"
        });
        return;
      }

      // Development only: Allow bypass with explicit phone number from request
      // This does NOT extract from token (which would be insecure)
      log.warn("[RetailerAuth] DEV MODE: Firebase Admin not configured, using phoneNumber from request body");
      if (!phone) {
        log.error("[RetailerAuth] DEV MODE: phoneNumber required in request body when Firebase Admin not configured");
        res.status(400).json({
          error: "Phone number required in request body (Firebase Admin not configured)",
          code: "PHONE_REQUIRED_DEV_MODE"
        });
        return;
      }
    }

    if (!phone) {
      res.status(400).json({ error: "Phone number is required" });
      return;
    }

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "Database unavailable" });
      return;
    }

    // Get store by code
    const storeResult = await pool.query(
      `SELECT id, code, name, status, retailer_portal_enabled, retailer_portal_phone
       FROM platform.stores
       WHERE code = $1 AND deleted_at IS NULL`,
      [storeCode.toUpperCase()]
    );

    const store = storeResult.rows[0];
    if (!store) {
      res.status(404).json({ error: "Store not found" });
      return;
    }

    if (!store.retailer_portal_enabled) {
      res.status(403).json({ error: "Retailer portal is not enabled for this store" });
      return;
    }

    // SEC-3: Block login for suspended/deleted stores
    if (store.status === 'SUSPENDED' || store.status === 'suspended') {
      res.status(403).json({ error: { code: "ACCOUNT_SUSPENDED", message: "Your store account has been suspended. Contact support at hello@supermandi.tech" } });
      return;
    }
    if (store.status === 'DELETED' || store.status === 'deleted') {
      res.status(404).json({ error: "Store not found" });
      return;
    }

    const phoneNormalized = normalizePhoneNumber(phone);

    // Verify phone matches store's retailer portal phone
    if (!store.retailer_portal_phone) {
      res.status(403).json({ error: "Retailer portal phone not configured for this store" });
      return;
    }

    const storePhone = normalizePhoneNumber(store.retailer_portal_phone);
    if (phoneNormalized !== storePhone) {
      res.status(403).json({ error: "Phone number does not match store registration" });
      return;
    }

    // Create/get user record
    let user;
    const existingUserResult = await pool.query(
      `SELECT id, phone, name FROM auth.users WHERE phone = $1 AND status = 'active'`,
      [phoneNormalized]
    );

    if (existingUserResult.rows[0]) {
      user = existingUserResult.rows[0];
    } else {
      // Create new user
      const newUserResult = await pool.query(
        `INSERT INTO auth.users (phone, name, actor_type, actor_id, status)
         VALUES ($1, 'Retailer Admin', 'store', $2, 'active')
         RETURNING id, phone, name`,
        [phoneNormalized, store.id]
      );
      user = newUserResult.rows[0];
    }

    // Create/get store_user record
    const existingStoreUserResult = await pool.query(
      `SELECT * FROM auth.store_users WHERE store_id = $1 AND user_id = $2`,
      [store.id, user.id]
    );

    if (!existingStoreUserResult.rows[0]) {
      await pool.query(
        `INSERT INTO auth.store_users (store_id, user_id, role, is_owner, is_active)
         VALUES ($1, $2, 'RETAILER_ADMIN', true, true)
         ON CONFLICT (store_id, user_id) DO UPDATE SET is_active = true`,
        [store.id, user.id]
      );
    }

    // GO-LIVE-137: Generate proper JWT token with JTI for revocation support
    const jti = randomUUID();
    const jwtPayload = {
      sub: user.id,                    // User ID
      actorType: 'STORE',              // Actor type for retailer admin
      actorId: store.id,               // Store ID
      permissions: ['retailer:read', 'retailer:write', 'inventory:read', 'inventory:write'],
      jti,                             // GO-LIVE-137: JWT ID for session revocation
    };

    const accessToken = jwt.sign(jwtPayload, JWT_SECRET, {
      issuer: JWT_ISSUER,
      expiresIn: JWT_EXPIRES_IN,
    });

    // Also generate a refresh token (longer lived) with JTI
    const refreshJti = randomUUID();
    const refreshPayload = {
      sub: user.id,
      type: 'refresh',
      actorType: 'STORE',             // PRA-079: Prevent cross-platform refresh token reuse
      storeId: store.id,
      jti: refreshJti,                 // GO-LIVE-137: JWT ID for refresh token revocation
    };

    const refreshToken = jwt.sign(refreshPayload, JWT_SECRET, {
      issuer: JWT_ISSUER,
      expiresIn: '7d',
    });

    // GO-LIVE-144: Log successful login
    logLoginSuccess({
      actorType: 'retailer',
      actorId: user.id,
      phone: phoneNormalized,
      storeId: store.id,
      ipAddress: req.ip || undefined,
      userAgent: req.get('user-agent'),
    }).catch(() => {}); // Non-blocking

    // RCAT-FIX-005: Fetch application status for limited-mode gating
    const appStatusResult = await pool.query(
      `SELECT status FROM auth.applications WHERE phone = $1 AND entity_type = 'retailer' ORDER BY created_at DESC LIMIT 1`,
      [phoneNormalized]
    );
    // SEC-011: Don't blindly default to ACTIVE when no application record exists.
    // Use the store's operational status as the fallback — stores created via SuperAdmin
    // provisioning have status set by the admin (ACTIVE/DRAFT), not by application workflow.
    let applicationStatus = appStatusResult.rows[0]?.status || store.status || 'DRAFT';

    // PRA-070: Store operational status overrides application status for limited-mode gating
    // When SuperAdmin suspends a store, platform.stores.status changes but auth.applications stays ACTIVE
    if (store.status && store.status !== 'ACTIVE') {
      applicationStatus = store.status;
    }

    res.json({
      success: true,
      data: {
        accessToken,
        refreshToken,
        expiresIn: 86400, // 24 hours in seconds
        tokenType: 'Bearer',
        user: {
          id: user.id,
          // ITER4-P0-018: Mask phone number in response to prevent PII exposure
          phone: maskPhoneNumber(phoneNormalized),
          role: "RETAILER_ADMIN",
          applicationStatus,
        },
        store: {
          storeId: store.id,
          storeCode: store.code,
          storeName: store.name,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/retailer-admin/auth/firebase-otp-login
 * GO-LIVE-RET-AUTH-001: OTP-first login - Phone OTP → Store selection after
 *
 * Flow:
 * 1. Client sends Firebase ID token (from OTP verification)
 * 2. Backend verifies token and extracts phone
 * 3. Looks up all stores this phone has access to
 * 4. Issues JWT token + returns stores list
 * 5. Client selects store (if multiple) or auto-enters (if single)
 */
router.post("/auth/firebase-otp-login", enhancedAuthProtection(), authRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { idToken } = req.body as { idToken?: string };

    // Validate input
    if (!idToken) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Firebase ID token is required" } });
      return;
    }

    // Verify Firebase token
    if (!verifyFirebaseIdToken) {
      if (process.env.NODE_ENV === 'production') {
        res.status(503).json({
          error: { code: "SERVICE_UNAVAILABLE", message: "Authentication service unavailable. Firebase verification required." }
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
        error: { code: "INVALID_TOKEN", message: "Invalid or expired verification. Please verify your phone again." }
      });
      return;
    }

    const phoneNormalized = normalizePhoneNumber(verifyResult.payload.phone_number);

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: "DB_UNAVAILABLE", message: "Database unavailable" } });
      return;
    }

    // Find user by phone
    const userResult = await pool.query(
      `SELECT id, phone, name FROM auth.users WHERE phone = $1 AND status = 'active'`,
      [phoneNormalized]
    );

    let user = userResult.rows[0];

    if (!user) {
      // Check if phone is registered for any store (retailer_portal_phone)
      const storeByPhoneResult = await pool.query(
        `SELECT id, code, name FROM platform.stores
         WHERE retailer_portal_enabled = true
         AND retailer_portal_phone = $1 AND deleted_at IS NULL`,
        [phoneNormalized]
      );

      if (storeByPhoneResult.rows.length === 0) {
        res.status(404).json({
          error: { code: "USER_NOT_FOUND", message: "No account found with this phone number. Please register first." }
        });
        return;
      }

      // Auto-create user and associate with store
      const store = storeByPhoneResult.rows[0];
      const newUserResult = await pool.query(
        `INSERT INTO auth.users (phone, name, actor_type, actor_id, status)
         VALUES ($1, 'Retailer Admin', 'store', $2, 'active')
         RETURNING id, phone, name`,
        [phoneNormalized, store.id]
      );
      user = newUserResult.rows[0];

      // Create store_user association
      await pool.query(
        `INSERT INTO auth.store_users (store_id, user_id, role, is_owner, is_active)
         VALUES ($1, $2, 'RETAILER_ADMIN', true, true)
         ON CONFLICT (store_id, user_id) DO UPDATE SET is_active = true`,
        [store.id, user.id]
      );
    }

    // Get all stores this user has access to
    const storesResult = await pool.query(
      `SELECT s.id, s.code, s.name, s.status
       FROM platform.stores s
       INNER JOIN auth.store_users su ON s.id = su.store_id
       WHERE su.user_id = $1 AND su.is_active = true AND s.retailer_portal_enabled = true AND s.deleted_at IS NULL
       ORDER BY s.name`,
      [user.id]
    );

    // Also check for stores where phone is the retailer_portal_phone (legacy)
    const storesByPhoneResult = await pool.query(
      `SELECT s.id, s.code, s.name, s.status
       FROM platform.stores s
       WHERE s.retailer_portal_enabled = true
       AND s.retailer_portal_phone = $1
       AND s.id NOT IN (
         SELECT store_id FROM auth.store_users WHERE user_id = $2
       ) AND s.deleted_at IS NULL`,
      [phoneNormalized, user.id]
    );

    // Combine and deduplicate stores
    const allStores = [...storesResult.rows, ...storesByPhoneResult.rows];
    const uniqueStoresMap = new Map();
    for (const store of allStores) {
      uniqueStoresMap.set(store.id, store);
    }
    const stores = Array.from(uniqueStoresMap.values());

    // STG-053: Include actorId (store.id) in JWT when user has exactly 1 store
    // Gateway requires actorId to set x-actor-id header for downstream services
    const primaryStoreId = stores.length === 1 ? stores[0].id : undefined;

    const jti = randomUUID();
    const jwtPayload: Record<string, any> = {
      sub: user.id,
      actorType: 'STORE',             // STAGING-FIX-008: Must match gateway policy ('store')
      phone: phoneNormalized,
      permissions: ['retailer:read', 'retailer:write', 'inventory:read', 'inventory:write'],
      jti,
    };
    // STG-053: Only include actorId for single-store users; multi-store users must call /auth/select-store
    if (primaryStoreId) {
      jwtPayload.actorId = primaryStoreId;
    }

    const accessToken = jwt.sign(jwtPayload, JWT_SECRET, {
      issuer: JWT_ISSUER,
      expiresIn: JWT_EXPIRES_IN,
    });

    // Generate refresh token
    // STG-054: Include storeId in refresh token so refresh endpoint can find user-store association
    const refreshJti = randomUUID();
    const refreshPayload: Record<string, any> = {
      sub: user.id,
      type: 'refresh',
      actorType: 'STORE',             // PRA-079: Prevent cross-platform refresh token reuse
      jti: refreshJti,
    };
    if (primaryStoreId) {
      refreshPayload.storeId = primaryStoreId;
    }

    const refreshToken = jwt.sign(refreshPayload, JWT_SECRET, {
      issuer: JWT_ISSUER,
      expiresIn: '7d',
    });

    // Log successful login
    logLoginSuccess({
      actorType: 'retailer',
      actorId: user.id,
      phone: phoneNormalized,
      ipAddress: req.ip || undefined,
      userAgent: req.get('user-agent'),
    }).catch(() => {});

    // RCAT-FIX-005: Fetch application status for limited-mode gating
    const otpAppStatusResult = await pool.query(
      `SELECT status FROM auth.applications WHERE phone = $1 AND entity_type = 'retailer' ORDER BY created_at DESC LIMIT 1`,
      [phoneNormalized]
    );
    let otpApplicationStatus = otpAppStatusResult.rows[0]?.status || 'ACTIVE';

    // PRA-070: Store operational status overrides application status for limited-mode gating
    // Use primary store (first in list / JWT-bound store) status
    if (stores.length > 0 && stores[0].status && stores[0].status !== 'ACTIVE') {
      otpApplicationStatus = stores[0].status;
    }

    log.info(`[RetailerAuth] GO-LIVE-RET-AUTH-001: OTP login successful for ***${phoneNormalized.slice(-4)}, ${stores.length} stores`);

    // AUTH-SESSION-169: Set HttpOnly cookies for session persistence across page refreshes
    // Access token: 24h (matches JWT expiresIn), Refresh token: 7d
    setAuthCookies(res, accessToken, refreshToken, 86400, 7 * 86400);

    res.json({
      success: true,
      token: accessToken,
      refreshToken,
      expiresIn: 86400,
      tokenType: 'Bearer',
      user: {
        id: user.id,
        phone: maskPhoneNumber(phoneNormalized),
        role: "RETAILER_ADMIN",
        applicationStatus: otpApplicationStatus,
      },
      stores: stores.map(s => ({
        id: s.id,
        code: s.code,
        name: s.name,
      })),
    });
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// GO-LIVE-LOGIN: Password-Based Registration & Login
// =============================================================================

/**
 * POST /api/v1/retailer-admin/auth/register
 * GO-LIVE-LOGIN: Register a new retailer with phone verification + password
 *
 * Request body:
 * - idToken: Firebase ID token (proves phone ownership)
 * - email: Email address
 * - password: Password (min 8 chars, 1 uppercase, 1 lowercase, 1 number)
 * - storeCode: Store code to register for
 */
router.post("/auth/register", enhancedAuthProtection(), authRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { idToken, email, password, storeCode } = req.body as {
      idToken?: string;
      email?: string;
      password?: string;
      storeCode?: string;
    };

    // Validate inputs
    if (!idToken || !email || !password || !storeCode) {
      res.status(400).json({
        error: { code: "MISSING_FIELDS", message: "All fields are required: idToken, email, password, storeCode" }
      });
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim().toLowerCase())) {
      res.status(400).json({
        error: { code: "INVALID_EMAIL", message: "Please enter a valid email address" }
      });
      return;
    }

    // Validate password
    const passwordError = validatePassword(password);
    if (passwordError) {
      res.status(400).json({
        error: { code: "INVALID_PASSWORD", message: passwordError }
      });
      return;
    }

    // Verify Firebase token to extract phone number
    if (!verifyFirebaseIdToken) {
      if (process.env.NODE_ENV === 'production') {
        res.status(503).json({
          error: { code: "SERVICE_UNAVAILABLE", message: "Authentication service unavailable" }
        });
        return;
      }
      res.status(400).json({
        error: { code: "FIREBASE_REQUIRED", message: "Firebase verification required for registration" }
      });
      return;
    }

    const verifyResult = await verifyFirebaseIdToken(idToken);
    if (!verifyResult.success || !verifyResult.payload?.phone_number) {
      res.status(401).json({
        error: { code: "INVALID_TOKEN", message: "Invalid or expired verification. Please verify your phone again." }
      });
      return;
    }

    const phone = verifyResult.payload.phone_number;
    const phoneNormalized = normalizePhoneNumber(phone);

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: "DB_UNAVAILABLE", message: "Database unavailable" } });
      return;
    }

    // Get store by code
    const storeResult = await pool.query(
      `SELECT id, code, name, retailer_portal_enabled
       FROM platform.stores
       WHERE code = $1 AND deleted_at IS NULL`,
      [storeCode.toUpperCase()]
    );

    const store = storeResult.rows[0];
    if (!store) {
      res.status(404).json({ error: { code: "STORE_NOT_FOUND", message: "Store not found" } });
      return;
    }

    if (!store.retailer_portal_enabled) {
      res.status(403).json({ error: { code: "PORTAL_DISABLED", message: "Retailer portal is not enabled for this store" } });
      return;
    }

    // Check if phone already registered for this store
    const existingUser = await pool.query(
      `SELECT u.id FROM auth.users u
       JOIN auth.store_users su ON su.user_id = u.id
       WHERE u.phone = $1 AND su.store_id = $2`,
      [phoneNormalized, store.id]
    );

    if (existingUser.rows[0]) {
      res.status(409).json({
        error: { code: "ALREADY_REGISTERED", message: "This phone number is already registered for this store. Please login instead." }
      });
      return;
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    // Create user with password
    const newUserResult = await pool.query(
      `INSERT INTO auth.users (phone, email, password_hash, name, actor_type, actor_id, status)
       VALUES ($1, $2, $3, 'Retailer Admin', 'store', $4, 'active')
       RETURNING id, phone, email, name`,
      [phoneNormalized, email.trim().toLowerCase(), passwordHash, store.id]
    );

    const user = newUserResult.rows[0];

    // Create store_user record
    await pool.query(
      `INSERT INTO auth.store_users (store_id, user_id, role, is_owner, is_active)
       VALUES ($1, $2, 'RETAILER_ADMIN', true, true)`,
      [store.id, user.id]
    );

    // Update store's retailer_portal_phone
    await pool.query(
      `UPDATE platform.stores
       SET retailer_portal_phone = $1
       WHERE id = $2`,
      [phoneNormalized, store.id]
    );

    log.info(`[RetailerAuth] GO-LIVE-LOGIN: Registration successful for store ${storeCode}, phone: ***${phoneNormalized.slice(-4)}`);

    res.json({
      success: true,
      message: "Registration successful. Please login with your phone and password.",
    });
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      // Unique constraint violation
      res.status(409).json({
        error: { code: "ALREADY_REGISTERED", message: "This phone or email is already registered." }
      });
      return;
    }
    next(error);
  }
});

/**
 * POST /api/v1/retailer-admin/auth/login
 * AUTH-PARITY-001: Email+password login for retailers (parity with supplier)
 * Returns stores[] for post-auth store picker (same shape as OTP login)
 *
 * Request body:
 * - email: Email address
 * - password: Password
 */
router.post("/auth/login", enhancedAuthProtection(), authRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body as {
      email?: string;
      password?: string;
    };

    // Validate inputs
    if (!email || !password) {
      res.status(400).json({
        error: { code: "MISSING_FIELDS", message: "Email and password are required" }
      });
      return;
    }

    const emailNormalized = email.trim().toLowerCase();
    const loginKey = `retailer-pw:${emailNormalized}`;

    // Check if locked out
    const attemptCheck = checkLoginAttempts(loginKey);
    if (!attemptCheck.allowed) {
      res.status(429).json({
        error: {
          code: "TOO_MANY_ATTEMPTS",
          message: `Too many failed attempts. Please try again in ${attemptCheck.waitMinutes} minutes.`
        }
      });
      return;
    }

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: "DB_UNAVAILABLE", message: "Database unavailable" } });
      return;
    }

    // Find user by email
    const userResult = await pool.query(
      `SELECT id, phone, email, name, password_hash FROM auth.users
       WHERE LOWER(email) = $1 AND status = 'active'`,
      [emailNormalized]
    );

    const user = userResult.rows[0];
    if (!user) {
      recordLoginAttempt(loginKey, false);
      res.status(401).json({ error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" } });
      return;
    }

    // Check password — DR-004: Clear messaging for OTP-only registrations
    if (!user.password_hash) {
      res.status(401).json({
        error: {
          code: "PASSWORD_NOT_SET",
          message: "Your account uses phone OTP login. Switch to \"Sign in with OTP\" or use \"Forgot Password\" to set a password."
        }
      });
      return;
    }

    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      recordLoginAttempt(loginKey, false);
      res.status(401).json({ error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" } });
      return;
    }

    // Login successful - clear attempts
    recordLoginAttempt(loginKey, true);

    // Get all stores this user has access to (same as OTP flow)
    const storesResult = await pool.query(
      `SELECT s.id, s.code, s.name, s.status
       FROM platform.stores s
       INNER JOIN auth.store_users su ON s.id = su.store_id
       WHERE su.user_id = $1 AND su.is_active = true AND s.retailer_portal_enabled = true AND s.deleted_at IS NULL
       ORDER BY s.name`,
      [user.id]
    );

    const stores = storesResult.rows;

    // STG-053: Include actorId (store.id) in JWT when user has exactly 1 store
    const primaryStoreId = stores.length === 1 ? stores[0].id : undefined;

    const jti = randomUUID();
    const jwtPayload: Record<string, any> = {
      sub: user.id,
      actorType: 'STORE',
      permissions: ['retailer:read', 'retailer:write', 'inventory:read', 'inventory:write'],
      jti,
    };
    if (primaryStoreId) {
      jwtPayload.actorId = primaryStoreId;
    }

    const accessToken = jwt.sign(jwtPayload, JWT_SECRET, {
      issuer: JWT_ISSUER,
      expiresIn: JWT_EXPIRES_IN,
    });

    // STG-054: Include storeId in refresh token
    const refreshJti = randomUUID();
    const refreshPayload: Record<string, any> = {
      sub: user.id,
      type: 'refresh',
      actorType: 'STORE',             // PRA-079: Prevent cross-platform refresh token reuse
      jti: refreshJti,
    };
    if (primaryStoreId) {
      refreshPayload.storeId = primaryStoreId;
    }

    const refreshToken = jwt.sign(refreshPayload, JWT_SECRET, {
      issuer: JWT_ISSUER,
      expiresIn: '7d',
    });

    // Log successful login
    logLoginSuccess({
      actorType: 'retailer',
      actorId: user.id,
      phone: user.phone,
      ipAddress: req.ip || undefined,
      userAgent: req.get('user-agent'),
    }).catch(() => {});

    // RCAT-FIX-005: Fetch application status for limited-mode gating
    const pwAppStatusResult = await pool.query(
      `SELECT status FROM auth.applications WHERE phone = $1 AND entity_type = 'retailer' ORDER BY created_at DESC LIMIT 1`,
      [user.phone]
    );
    let pwApplicationStatus = pwAppStatusResult.rows[0]?.status || 'ACTIVE';

    // PRA-070: Store operational status overrides application status for limited-mode gating
    if (stores.length > 0 && stores[0].status && stores[0].status !== 'ACTIVE') {
      pwApplicationStatus = stores[0].status;
    }

    log.info(`[RetailerAuth] AUTH-PARITY-001: Email+password login successful for ${emailNormalized}, ${stores.length} stores`);

    // AUTH-SESSION-169: Set HttpOnly cookies for session persistence
    setAuthCookies(res, accessToken, refreshToken, 86400, 7 * 86400);

    // Return same shape as OTP login for frontend parity
    res.json({
      success: true,
      token: accessToken,
      refreshToken,
      expiresIn: 86400,
      tokenType: 'Bearer',
      user: {
        id: user.id,
        phone: user.phone ? maskPhoneNumber(user.phone) : undefined,
        role: "RETAILER_ADMIN",
        applicationStatus: pwApplicationStatus,
      },
      stores: stores.map(s => ({
        id: s.id,
        code: s.code,
        name: s.name,
      })),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/retailer-admin/auth/select-store
 * STG-053: Multi-store users select a store after login to get a store-specific JWT
 *
 * Request body:
 * - storeId: The store ID to select
 *
 * The initial login JWT (without actorId) is passed via Authorization header.
 * This endpoint verifies the user has access to the store and issues a new JWT with actorId.
 */
router.post("/auth/select-store", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { storeId } = req.body as { storeId?: string };

    if (!storeId) {
      res.status(400).json({ error: { code: "MISSING_FIELDS", message: "storeId is required" } });
      return;
    }

    // Extract user from the current JWT (may not have actorId yet)
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

    if (!token) {
      res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } });
      return;
    }

    let decoded: { sub?: string; actorType?: string };
    try {
      decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as { sub?: string; actorType?: string };
    } catch {
      res.status(401).json({ error: { code: "INVALID_TOKEN", message: "Invalid or expired token" } });
      return;
    }

    if (!decoded.sub) {
      res.status(401).json({ error: { code: "INVALID_TOKEN", message: "Token missing user ID" } });
      return;
    }

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: "DB_UNAVAILABLE", message: "Database unavailable" } });
      return;
    }

    // Verify user has access to this store
    const storeResult = await pool.query(
      `SELECT s.id, s.code, s.name
       FROM platform.stores s
       INNER JOIN auth.store_users su ON s.id = su.store_id
       WHERE s.id = $1 AND su.user_id = $2 AND su.is_active = true AND s.deleted_at IS NULL`,
      [storeId, decoded.sub]
    );

    if (!storeResult.rows[0]) {
      res.status(403).json({ error: { code: "STORE_ACCESS_DENIED", message: "You do not have access to this store" } });
      return;
    }

    const store = storeResult.rows[0];

    // Issue new JWT with actorId
    const newJti = randomUUID();
    const jwtPayload = {
      sub: decoded.sub,
      actorType: 'STORE',
      actorId: store.id,
      permissions: ['retailer:read', 'retailer:write', 'inventory:read', 'inventory:write'],
      jti: newJti,
    };

    const accessToken = jwt.sign(jwtPayload, JWT_SECRET, {
      issuer: JWT_ISSUER,
      expiresIn: JWT_EXPIRES_IN,
    });

    // Issue new refresh token with storeId
    const refreshJti = randomUUID();
    const refreshPayload = {
      sub: decoded.sub,
      type: 'refresh',
      actorType: 'STORE',
      storeId: store.id,
      jti: refreshJti,
    };

    const refreshToken = jwt.sign(refreshPayload, JWT_SECRET, {
      issuer: JWT_ISSUER,
      expiresIn: '7d',
    });

    // AUTH-SESSION-169: Set HttpOnly cookies
    setAuthCookies(res, accessToken, refreshToken, 86400, 7 * 86400);

    log.info(`[RetailerAuth] STG-053: Store selected for user ${decoded.sub}: ${store.code}`);

    res.json({
      success: true,
      token: accessToken,
      refreshToken,
      expiresIn: 86400,
      tokenType: 'Bearer',
      store: {
        id: store.id,
        code: store.code,
        name: store.name,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/retailer-admin/auth/forgot-password/request
 * GO-LIVE-LOGIN: Request password reset (check if user exists)
 *
 * Request body:
 * - phone: Phone number
 */
router.post("/auth/forgot-password/request", authRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { phone } = req.body as { phone?: string };

    if (!phone) {
      res.status(400).json({
        error: { code: "MISSING_FIELDS", message: "Phone number is required" }
      });
      return;
    }

    const phoneNormalized = normalizePhoneNumber(phone);

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: "DB_UNAVAILABLE", message: "Database unavailable" } });
      return;
    }

    // AUTH-PARITY-002: Find user by phone only (no storeCode — user-level reset)
    const result = await pool.query(
      `SELECT u.id FROM auth.users u WHERE u.phone = $1 AND u.status = 'active'`,
      [phoneNormalized]
    );

    // STG-723: Identical response regardless of whether account exists (prevent phone enumeration)
    res.json({
      success: true,
      message: "If an account exists with this phone, you can proceed to verify OTP.",
    });

    if (!result.rows[0]) {
      return;
    }
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/retailer-admin/auth/forgot-password/reset
 * AUTH-PARITY-002: Reset password with verified Firebase token (no storeCode)
 *
 * Request body:
 * - idToken: Firebase ID token (proves phone ownership)
 * - newPassword: New password
 */
router.post("/auth/forgot-password/reset", authRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { idToken, newPassword } = req.body as {
      idToken?: string;
      newPassword?: string;
    };

    if (!idToken || !newPassword) {
      res.status(400).json({
        error: { code: "MISSING_FIELDS", message: "ID token and new password are required" }
      });
      return;
    }

    // Validate password
    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      res.status(400).json({
        error: { code: "INVALID_PASSWORD", message: passwordError }
      });
      return;
    }

    // Verify Firebase token
    if (!verifyFirebaseIdToken) {
      if (process.env.NODE_ENV === 'production') {
        res.status(503).json({
          error: { code: "SERVICE_UNAVAILABLE", message: "Authentication service unavailable" }
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
        error: { code: "INVALID_TOKEN", message: "Invalid or expired verification. Please verify your phone again." }
      });
      return;
    }

    const phone = verifyResult.payload.phone_number;
    const phoneNormalized = normalizePhoneNumber(phone);

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: "DB_UNAVAILABLE", message: "Database unavailable" } });
      return;
    }

    // Find user by phone (no store check — user-level password)
    const userResult = await pool.query(
      `SELECT u.id FROM auth.users u WHERE u.phone = $1 AND u.status = 'active'`,
      [phoneNormalized]
    );

    if (!userResult.rows[0]) {
      res.status(404).json({
        error: { code: "USER_NOT_FOUND", message: "No account found for this phone number" }
      });
      return;
    }

    const userId = userResult.rows[0].id;

    // Hash and update password
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);

    await pool.query(
      `UPDATE auth.users SET password_hash = $1, tokens_revoked_at = NOW() WHERE id = $2`,
      [passwordHash, userId]
    );

    log.info(`[RetailerAuth] AUTH-PARITY-002: OTP password reset for user ${userId}`);

    res.json({
      success: true,
      message: "Password reset successful. Please login with your new password.",
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/retailer-admin/auth/forgot-password/email-request
 * AUTH-PARITY-002: Email-based password reset (parity with supplier)
 * Generates a signed JWT reset token.
 *
 * Request body:
 * - email: Email address
 */
router.post("/auth/forgot-password/email-request", authRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body as { email?: string };

    if (!email) {
      res.status(400).json({
        error: { code: "MISSING_FIELDS", message: "Email is required" }
      });
      return;
    }

    const emailNormalized = email.trim().toLowerCase();

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: "DB_UNAVAILABLE", message: "Database unavailable" } });
      return;
    }

    // Find user by email
    const result = await pool.query(
      `SELECT id FROM auth.users WHERE LOWER(email) = $1 AND status = 'active'`,
      [emailNormalized]
    );

    // Always return success to prevent email enumeration
    if (!result.rows[0]) {
      res.json({
        success: true,
        message: "If an account exists with this email, a reset link will be sent.",
      });
      return;
    }

    const userId = result.rows[0].id;

    // Generate signed JWT reset token (no DB column needed)
    const resetToken = jwt.sign(
      { sub: userId, purpose: 'password-reset' },
      JWT_SECRET,
      { issuer: JWT_ISSUER, expiresIn: '1h' }
    );

    log.info(`[RetailerAuth] AUTH-PARITY-002: Email password reset requested for ${emailNormalized}`);

    // STG-055: Actually send the password reset email (was previously missing)
    try {
      await sendPasswordResetEmail(emailNormalized, resetToken, undefined, 'retailer');
    } catch (emailErr) {
      log.error(`[RetailerAuth] STG-055: Failed to send password reset email to ${emailNormalized}:`, emailErr);
      // Still return success to prevent email enumeration
    }

    res.json({
      success: true,
      message: "If an account exists with this email, a reset link will be sent.",
      // DEV ONLY: Return token for testing
      ...(process.env.NODE_ENV !== 'production' && { devToken: resetToken }),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/retailer-admin/auth/forgot-password/email-reset
 * AUTH-PARITY-002: Reset password using email JWT token
 *
 * Request body:
 * - email: Email address
 * - token: JWT reset token
 * - newPassword: New password
 */
router.post("/auth/forgot-password/email-reset", authRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, token, newPassword } = req.body as {
      email?: string;
      token?: string;
      newPassword?: string;
    };

    if (!email || !token || !newPassword) {
      res.status(400).json({
        error: { code: "MISSING_FIELDS", message: "Email, token, and new password are required" }
      });
      return;
    }

    // Validate password
    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      res.status(400).json({
        error: { code: "INVALID_PASSWORD", message: passwordError }
      });
      return;
    }

    // Verify JWT reset token
    let decoded: { sub?: string; purpose?: string };
    try {
      // LIVE.BE.JWT_ALGORITHM_PINNING.001: Pin HS256 algorithm
      decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as { sub?: string; purpose?: string };
    } catch {
      res.status(400).json({
        error: { code: "INVALID_TOKEN", message: "Invalid or expired reset token. Please request a new one." }
      });
      return;
    }

    if (decoded.purpose !== 'password-reset' || !decoded.sub) {
      res.status(400).json({
        error: { code: "INVALID_TOKEN", message: "Invalid reset token" }
      });
      return;
    }

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: "DB_UNAVAILABLE", message: "Database unavailable" } });
      return;
    }

    // Verify email matches the token's user
    const userResult = await pool.query(
      `SELECT id FROM auth.users WHERE id = $1 AND LOWER(email) = $2 AND status = 'active'`,
      [decoded.sub, email.trim().toLowerCase()]
    );

    if (!userResult.rows[0]) {
      res.status(400).json({
        error: { code: "INVALID_TOKEN", message: "Invalid or expired reset token" }
      });
      return;
    }

    // Hash and update password
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);

    await pool.query(
      `UPDATE auth.users SET password_hash = $1, tokens_revoked_at = NOW() WHERE id = $2`,
      [passwordHash, decoded.sub]
    );

    log.info(`[RetailerAuth] AUTH-PARITY-002: Email token password reset for user ${decoded.sub}`);

    res.json({
      success: true,
      message: "Password reset successful. Please login with your new password.",
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/retailer-admin/auth/refresh
 * Refresh an expired access token using a valid refresh token
 * GO-LIVE-137: Now checks for token revocation before issuing new token
 */
router.post("/auth/refresh", async (req: Request, res: Response, next: NextFunction) => {
  try {
    // AUTH-SESSION-169: Read refresh token from cookie or body (backward compat with POS app)
    const refreshToken = getRefreshTokenFromRequest(req);

    if (!refreshToken) {
      res.status(400).json({ error: "Refresh token is required" });
      return;
    }

    // Verify refresh token
    let decoded;
    try {
      // LIVE.BE.JWT_ALGORITHM_PINNING.001: Pin HS256 algorithm
      decoded = jwt.verify(refreshToken, JWT_SECRET, {
        issuer: JWT_ISSUER,
        algorithms: ['HS256'],
      }) as { sub: string; type: string; storeId: string; jti?: string; iat?: number };
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        res.status(401).json({ error: "Refresh token expired. Please login again." });
        return;
      }
      res.status(401).json({ error: "Invalid refresh token" });
      return;
    }

    if (decoded.type !== 'refresh') {
      res.status(401).json({ error: "Invalid token type" });
      return;
    }

    // PRA-079: Reject refresh tokens from other platforms (backward-compat: allow missing actorType)
    if (decoded.actorType && decoded.actorType !== 'STORE') {
      res.status(401).json({ error: "Invalid token for this endpoint" });
      return;
    }

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "Database unavailable" });
      return;
    }

    // GO-LIVE-137: Check if refresh token has been revoked
    if (decoded.jti) {
      const revocationCheck = await pool.query(
        `SELECT 1 FROM auth.token_revocations WHERE jti = $1 LIMIT 1`,
        [decoded.jti]
      );
      if (revocationCheck.rows.length > 0) {
        res.status(401).json({ error: "Session has been logged out. Please login again." });
        return;
      }
    }

    // STG-054: Handle missing storeId in refresh token (backward compat with tokens issued before fix)
    // If storeId is present, verify it. If not, find user's first active store.
    let userResult;
    if (decoded.storeId) {
      userResult = await pool.query(
        `SELECT u.id, u.phone, u.name, u.tokens_revoked_at, su.store_id
         FROM auth.users u
         JOIN auth.store_users su ON su.user_id = u.id
         WHERE u.id = $1 AND su.store_id = $2 AND u.status = 'active' AND su.is_active = true`,
        [decoded.sub, decoded.storeId]
      );
    } else {
      // Fallback: find user's first active store association
      userResult = await pool.query(
        `SELECT u.id, u.phone, u.name, u.tokens_revoked_at, su.store_id
         FROM auth.users u
         JOIN auth.store_users su ON su.user_id = u.id
         JOIN platform.stores s ON s.id = su.store_id
         WHERE u.id = $1 AND u.status = 'active' AND su.is_active = true AND s.deleted_at IS NULL
         ORDER BY s.name LIMIT 1`,
        [decoded.sub]
      );
    }

    if (!userResult.rows[0]) {
      res.status(401).json({ error: "User or store association not found" });
      return;
    }

    // STG-054: Use the found storeId for downstream queries (override decoded.storeId if missing)
    if (!decoded.storeId) {
      decoded.storeId = userResult.rows[0].store_id;
    }

    const user = userResult.rows[0];

    // GO-LIVE-137: Check bulk token revocation
    if (user.tokens_revoked_at && decoded.iat) {
      const revokedAtMs = new Date(user.tokens_revoked_at).getTime();
      const issuedAtMs = decoded.iat * 1000;
      if (issuedAtMs < revokedAtMs) {
        res.status(401).json({ error: "All sessions have been logged out. Please login again." });
        return;
      }
    }

    // Get store info
    const storeResult = await pool.query(
      `SELECT id, code, name FROM platform.stores WHERE id = $1 AND deleted_at IS NULL`,
      [decoded.storeId]
    );

    const store = storeResult.rows[0];
    if (!store) {
      res.status(401).json({ error: "Store not found" });
      return;
    }

    // GO-LIVE-137: Generate new access token with JTI
    const newJti = randomUUID();
    const jwtPayload = {
      sub: user.id,
      actorType: 'STORE',
      actorId: store.id,
      permissions: ['retailer:read', 'retailer:write', 'inventory:read', 'inventory:write'],
      jti: newJti,
    };

    const accessToken = jwt.sign(jwtPayload, JWT_SECRET, {
      issuer: JWT_ISSUER,
      expiresIn: JWT_EXPIRES_IN,
    });

    // AUTH-SESSION-169: Refresh cookies on token refresh (new access token, same refresh token)
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

/**
 * GET /api/v1/retailer-admin/auth/me
 * Get current user info (requires valid JWT)
 */
router.get("/auth/me", async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get user ID from headers (set by API Gateway after JWT verification)
    const userId = req.headers['x-user-id'] as string;
    const actorId = req.headers['x-actor-id'] as string;

    if (!userId || !actorId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "Database unavailable" });
      return;
    }

    // Get user info
    const userResult = await pool.query(
      `SELECT u.id, u.phone, u.name, su.role
       FROM auth.users u
       JOIN auth.store_users su ON su.user_id = u.id
       WHERE u.id = $1 AND su.store_id = $2 AND u.status = 'active'`,
      [userId, actorId]
    );

    if (!userResult.rows[0]) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const user = userResult.rows[0];

    // Get store info
    const storeResult = await pool.query(
      `SELECT id, code, name FROM platform.stores WHERE id = $1 AND deleted_at IS NULL`,
      [actorId]
    );

    const store = storeResult.rows[0];

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          // ITER4-P0-018: Mask phone number in response to prevent PII exposure
          phone: maskPhoneNumber(user.phone),
          name: user.name,
          role: user.role,
        },
        store: store ? {
          storeId: store.id,
          storeCode: store.code,
          storeName: store.name,
        } : null,
      },
    });
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// T-004: Change Password (requires current password)
// =============================================================================

/**
 * POST /api/v1/retailer-admin/auth/change-password
 * T-004: Change password for authenticated retailer user
 * Requires valid JWT + current password verification
 */
router.post("/auth/change-password", authRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    const storeId = req.headers['x-actor-id'] as string;

    if (!userId || !storeId) {
      res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } });
      return;
    }

    const { currentPassword, newPassword } = req.body as {
      currentPassword?: string;
      newPassword?: string;
    };

    if (!currentPassword || !newPassword) {
      res.status(400).json({
        error: { code: "MISSING_FIELDS", message: "Current password and new password are required" }
      });
      return;
    }

    // Validate new password
    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      res.status(400).json({
        error: { code: "INVALID_PASSWORD", message: passwordError }
      });
      return;
    }

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: "DB_UNAVAILABLE", message: "Database unavailable" } });
      return;
    }

    // Get current password hash
    const userResult = await pool.query(
      `SELECT id, password_hash FROM auth.users WHERE id = $1 AND status = 'active'`,
      [userId]
    );

    if (!userResult.rows[0]) {
      res.status(404).json({ error: { code: "USER_NOT_FOUND", message: "User not found" } });
      return;
    }

    const user = userResult.rows[0];

    if (!user.password_hash) {
      res.status(400).json({
        error: { code: "NO_PASSWORD", message: "No password set for this account. Use 'Forgot Password' to set one." }
      });
      return;
    }

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isValid) {
      res.status(401).json({
        error: { code: "INVALID_PASSWORD", message: "Current password is incorrect" }
      });
      return;
    }

    // Hash and update new password
    const newHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
    await pool.query(
      `UPDATE auth.users SET password_hash = $1 WHERE id = $2`,
      [newHash, userId]
    );

    // LIVE.R4.B18.001: Invalidate all existing sessions after password change
    // Sets tokens_revoked_at so all tokens issued before now are rejected on refresh
    await pool.query(
      `UPDATE auth.users SET tokens_revoked_at = NOW() WHERE id = $1`,
      [userId]
    );

    log.info(`[RetailerAuth] T-004: Password changed and sessions invalidated for user ${userId}`);

    res.json({ data: { success: true, message: "Password changed successfully. Please login again." } });
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// GO-LIVE-137: Server-side session invalidation (Logout)
// =============================================================================

/**
 * POST /api/v1/retailer-admin/auth/logout
 * GO-LIVE-137: Revoke the current session token
 * Adds the token's JTI to the blacklist so it can't be reused
 */
router.post("/auth/logout", async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get user context from gateway headers
    const userId = req.headers['x-user-id'] as string;
    const storeId = req.headers['x-actor-id'] as string;

    if (!userId || !storeId) {
      // No valid session, just return success
      res.json({ data: { success: true, message: 'Logged out' } });
      return;
    }

    // Get the Bearer token to extract JTI
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.json({ data: { success: true, message: 'Logged out' } });
      return;
    }

    const token = authHeader.slice(7);
    let decoded: { jti?: string; exp?: number };

    try {
      // Decode without verification (gateway already verified)
      decoded = jwt.decode(token) as { jti?: string; exp?: number };
    } catch {
      res.json({ data: { success: true, message: 'Logged out' } });
      return;
    }

    if (!decoded?.jti) {
      // Old tokens without JTI - still return success
      log.info(`[RetailerAuth] GO-LIVE-137: Logout for user ${userId} (no JTI)`);
      res.json({ data: { success: true, message: 'Logged out' } });
      return;
    }

    const pool = getPool();
    if (!pool) {
      // Even if DB unavailable, return success since token will expire
      res.json({ data: { success: true, message: 'Logged out' } });
      return;
    }

    // Calculate token expiry
    const expiresAt = decoded.exp
      ? new Date(decoded.exp * 1000)
      : new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Add to revocation table
    try {
      await pool.query(
        `INSERT INTO auth.token_revocations
         (user_id, store_id, jti, token_expires_at, revoked_by, reason, ip_address, user_agent)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (jti) DO NOTHING`,
        [
          userId,
          storeId,
          decoded.jti,
          expiresAt,
          'user',
          'User logout',
          req.ip || null,
          req.get('user-agent') || null,
        ]
      );

      log.info(`[RetailerAuth] GO-LIVE-137: Token revoked for user ${userId}, JTI: ${decoded.jti}`);
    } catch (dbError) {
      // Log but don't fail
      log.warn('[RetailerAuth] GO-LIVE-137: Failed to record token revocation:', dbError);
    }

    // T-184: Also blacklist in Redis for immediate gateway-level revocation
    const remainingSeconds = decoded.exp
      ? Math.max(0, decoded.exp - Math.floor(Date.now() / 1000))
      : 24 * 60 * 60; // Default 24h if no exp
    blacklistToken(decoded.jti, remainingSeconds).catch(() => {});

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
 * POST /api/v1/retailer-admin/auth/logout-all
 * GO-LIVE-137: Revoke all sessions for the current user/store
 */
router.post("/auth/logout-all", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    const storeId = req.headers['x-actor-id'] as string;

    if (!userId || !storeId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: "Database unavailable" });
      return;
    }

    // Revoke current token if available
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
            `INSERT INTO auth.token_revocations
             (user_id, store_id, jti, token_expires_at, revoked_by, reason)
             VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)
             ON CONFLICT (jti) DO NOTHING`,
            [userId, storeId, decoded.jti, expiresAt, 'user', 'Logout all sessions']
          );
        }
      } catch {
        // Ignore decode errors
      }
    }

    // Set tokens_revoked_at to invalidate all tokens issued before this time
    await pool.query(
      `UPDATE auth.users
       SET tokens_revoked_at = NOW()
       WHERE id = $1::uuid`,
      [userId]
    );

    log.info(`[RetailerAuth] GO-LIVE-137: All tokens revoked for user ${userId}`);

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

export const retailerAdminAuthRouter = router;
