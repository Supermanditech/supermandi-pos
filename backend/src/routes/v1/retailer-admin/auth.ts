// Retailer Admin Auth Routes - Firebase Token Exchange
// GO-LIVE-FIX: Handles phone OTP authentication via Firebase for retailer portal
// GO-LIVE-045: Server-side Firebase token verification
// GO-LIVE-195: Enhanced auth protection for 10K stores scale

import { Router, Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { getPool } from "../../../db/client";
import { logLoginSuccess } from "../../../services/authAuditService";
// GO-LIVE-189: Import rate limiter to prevent store code enumeration
import { authRateLimiter } from "../../../middleware/posRateLimiter";
// GO-LIVE-195: Enhanced auth protection with per-store-code limiting and progressive lockout
import { enhancedAuthProtection } from "../../../middleware/authProtection";

// GO-LIVE-045: Import Firebase verification from common package
let verifyFirebaseIdToken: ((idToken: string) => Promise<{ success: boolean; payload?: { phone_number?: string; uid?: string }; error?: string; code?: string }>) | null = null;
try {
  const firebase = require("@supermandi/common");
  if (firebase.verifyFirebaseIdToken) {
    verifyFirebaseIdToken = firebase.verifyFirebaseIdToken;
    console.log("[RetailerAuth] Firebase server-side verification available");
  }
} catch {
  console.warn("[RetailerAuth] Firebase verification not available - using client-side extraction");
}

// =============================================================================
// JWT CONFIGURATION
// Must match API Gateway middleware settings
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
      console.log("[RetailerAuth] Verifying Firebase token server-side");
      const verifyResult = await verifyFirebaseIdToken(idToken);

      if (!verifyResult.success) {
        console.warn(`[RetailerAuth] Firebase verification failed: ${verifyResult.error} (${verifyResult.code})`);
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
      console.log(`[RetailerAuth] Firebase token verified. UID: ${firebaseUid}, Phone: ${phone ? '***' + phone.slice(-4) : 'N/A'}`);
    } else {
      // GO-LIVE-104: Firebase Admin SDK is REQUIRED for production
      // The previous fallback allowed JWT forgery by simply base64-decoding the token
      // without cryptographic verification - attackers could forge any phone number
      if (process.env.NODE_ENV === 'production') {
        console.error("[RetailerAuth] SECURITY: Firebase Admin SDK not configured in production");
        res.status(503).json({
          error: "Authentication service unavailable. Firebase verification required.",
          code: "FIREBASE_NOT_CONFIGURED"
        });
        return;
      }

      // Development only: Allow bypass with explicit phone number from request
      // This does NOT extract from token (which would be insecure)
      console.warn("[RetailerAuth] DEV MODE: Firebase Admin not configured, using phoneNumber from request body");
      if (!phone) {
        console.error("[RetailerAuth] DEV MODE: phoneNumber required in request body when Firebase Admin not configured");
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
      `SELECT id, code, name, retailer_portal_enabled, retailer_portal_phone
       FROM platform.stores
       WHERE code = $1`,
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
 * POST /api/v1/retailer-admin/auth/refresh
 * Refresh an expired access token using a valid refresh token
 * GO-LIVE-137: Now checks for token revocation before issuing new token
 */
router.post("/auth/refresh", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(400).json({ error: "Refresh token is required" });
      return;
    }

    // Verify refresh token
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, JWT_SECRET, {
        issuer: JWT_ISSUER,
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

    // Get user and store info, including tokens_revoked_at for bulk revocation check
    const userResult = await pool.query(
      `SELECT u.id, u.phone, u.name, u.tokens_revoked_at, su.store_id
       FROM auth.users u
       JOIN auth.store_users su ON su.user_id = u.id
       WHERE u.id = $1 AND su.store_id = $2 AND u.status = 'active' AND su.is_active = true`,
      [decoded.sub, decoded.storeId]
    );

    if (!userResult.rows[0]) {
      res.status(401).json({ error: "User or store association not found" });
      return;
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
      `SELECT id, code, name FROM platform.stores WHERE id = $1`,
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
      `SELECT id, code, name FROM platform.stores WHERE id = $1`,
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
      console.log(`[RetailerAuth] GO-LIVE-137: Logout for user ${userId} (no JTI)`);
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

      console.log(`[RetailerAuth] GO-LIVE-137: Token revoked for user ${userId}, JTI: ${decoded.jti}`);
    } catch (dbError) {
      // Log but don't fail
      console.warn('[RetailerAuth] GO-LIVE-137: Failed to record token revocation:', dbError);
    }

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

    console.log(`[RetailerAuth] GO-LIVE-137: All tokens revoked for user ${userId}`);

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
