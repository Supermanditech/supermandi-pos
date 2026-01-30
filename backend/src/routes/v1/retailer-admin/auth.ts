// Retailer Admin Auth Routes - Firebase Token Exchange
// GO-LIVE-FIX: Handles phone OTP authentication via Firebase for retailer portal
// GO-LIVE-045: Server-side Firebase token verification

import { Router, Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { getPool } from "../../../db/client";

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
 */
router.post("/auth/firebase-login", async (req: Request, res: Response, next: NextFunction) => {
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
      // Fallback: Client-side extraction (less secure, for development/testing)
      console.warn("[RetailerAuth] Using client-side token extraction (Firebase Admin not configured)");
      if (!phone) {
        try {
          const parts = idToken.split(".");
          if (parts.length === 3) {
            const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());
            phone = payload.phone_number;
          }
        } catch (parseError) {
          console.warn("[RetailerAuth] Failed to parse Firebase token:", parseError);
        }
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

    // Generate proper JWT token matching API Gateway expectations
    const jwtPayload = {
      sub: user.id,                    // User ID
      actorType: 'STORE',              // Actor type for retailer admin
      actorId: store.id,               // Store ID
      permissions: ['retailer:read', 'retailer:write', 'inventory:read', 'inventory:write'],
    };

    const accessToken = jwt.sign(jwtPayload, JWT_SECRET, {
      issuer: JWT_ISSUER,
      expiresIn: JWT_EXPIRES_IN,
    });

    // Also generate a refresh token (longer lived)
    const refreshPayload = {
      sub: user.id,
      type: 'refresh',
      storeId: store.id,
    };

    const refreshToken = jwt.sign(refreshPayload, JWT_SECRET, {
      issuer: JWT_ISSUER,
      expiresIn: '7d',
    });

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
      }) as { sub: string; type: string; storeId: string };
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

    // Get user and store info
    const userResult = await pool.query(
      `SELECT u.id, u.phone, u.name, su.store_id
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

    // Generate new access token
    const jwtPayload = {
      sub: user.id,
      actorType: 'STORE',
      actorId: store.id,
      permissions: ['retailer:read', 'retailer:write', 'inventory:read', 'inventory:write'],
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

export const retailerAdminAuthRouter = router;
