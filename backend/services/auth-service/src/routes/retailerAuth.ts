// Retailer Auth Routes - Firebase Token Exchange
// Handles phone OTP authentication via Firebase for retailer portal

import { Router, Request, Response, NextFunction } from 'express';
import { ApiError, query } from '@supermandi/common';
import {
  verifyFirebaseIdToken,
  normalizePhoneNumber,
} from '@supermandi/common';
import { generateTokenPair } from '../services/jwtService.js';

const router: Router = Router();

// =============================================================================
// ASYNC HANDLER
// =============================================================================

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

function asyncHandler(fn: AsyncHandler): AsyncHandler {
  return async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

// =============================================================================
// TYPES
// =============================================================================

interface FirebaseLoginRequest {
  idToken: string;
  storeCode: string;
}

interface StoreWithPortal {
  id: string;
  code: string;
  name: string;
  retailer_portal_enabled: boolean;
  retailer_portal_phone: string | null;
}

interface StoreUser {
  id: string;
  store_id: string;
  user_id: string;
  role: string;
  is_owner: boolean;
  is_active: boolean;
}

interface AuthUser {
  id: string;
  phone: string;
  name: string;
}

// =============================================================================
// DATABASE QUERIES
// =============================================================================

async function getStoreByCode(code: string): Promise<StoreWithPortal | null> {
  const result = await query<StoreWithPortal>(
    `SELECT id, code, name, retailer_portal_enabled, retailer_portal_phone
     FROM platform.stores
     WHERE code = $1`,
    [code]
  );
  return result[0] || null;
}

async function getUserByPhone(phone: string): Promise<AuthUser | null> {
  const result = await query<AuthUser>(
    `SELECT id, phone, name
     FROM auth.users
     WHERE phone = $1 AND status = 'active'`,
    [phone]
  );
  return result[0] || null;
}

async function getStoreUser(storeId: string, userId: string): Promise<StoreUser | null> {
  const result = await query<StoreUser>(
    `SELECT * FROM auth.store_users
     WHERE store_id = $1 AND user_id = $2 AND is_active = true`,
    [storeId, userId]
  );
  return result[0] || null;
}

async function createUserIfNotExists(params: {
  phone: string;
  storeId: string;
}): Promise<AuthUser> {
  // First try to get existing user
  const existing = await getUserByPhone(params.phone);
  if (existing) {
    return existing;
  }

  // Create new user - auth.users uses actor_type/actor_id, not role_id
  const result = await query<AuthUser>(
    `INSERT INTO auth.users (phone, name, actor_type, actor_id, status)
     VALUES ($1, 'Retailer Admin', 'store', $2, 'active')
     RETURNING id, phone, name`,
    [params.phone, params.storeId]
  );
  return result[0]!;
}

async function createStoreUserIfNotExists(params: {
  storeId: string;
  userId: string;
  role: string;
  isOwner: boolean;
}): Promise<StoreUser> {
  // First try to get existing
  const existing = await getStoreUser(params.storeId, params.userId);
  if (existing) {
    return existing;
  }

  // Create new store user
  const result = await query<StoreUser>(
    `INSERT INTO auth.store_users (store_id, user_id, role, is_owner, is_active)
     VALUES ($1, $2, $3, $4, true)
     ON CONFLICT (store_id, user_id) DO UPDATE SET is_active = true
     RETURNING *`,
    [params.storeId, params.userId, params.role, params.isOwner]
  );
  return result[0]!;
}

async function getRolePermissions(roleName: string): Promise<string[]> {
  const result = await query<{ permissions: string[] }>(
    `SELECT permissions FROM auth.roles WHERE name = $1`,
    [roleName]
  );
  return result[0]?.permissions || [];
}

// =============================================================================
// ROUTES
// =============================================================================

/**
 * POST /retailer-admin/auth/firebase-login
 * Exchange Firebase ID token for app JWT
 *
 * Flow:
 * 1. Verify Firebase ID token
 * 2. Extract phone number from token
 * 3. Verify store exists and portal is enabled
 * 4. Verify phone matches store's retailer_portal_phone
 * 5. Create/get user and store_user records
 * 6. Generate app JWT with store-scoped claims
 */
router.post(
  '/firebase-login',
  asyncHandler(async (req, res) => {
    const { idToken, storeCode } = req.body as FirebaseLoginRequest;

    // Validate input
    if (!idToken) {
      throw ApiError.badRequest('Firebase ID token is required', 'idToken');
    }
    if (!storeCode) {
      throw ApiError.badRequest('Store code is required', 'storeCode');
    }

    // 1. Verify Firebase ID token
    let verifyResult;
    try {
      verifyResult = await verifyFirebaseIdToken(idToken);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage.includes('Firebase not initialized')) {
        throw ApiError.internal('Firebase authentication is not configured. Contact administrator.');
      }
      throw ApiError.internal(`Firebase verification failed: ${errorMessage}`);
    }
    if (!verifyResult.success) {
      throw ApiError.unauthorized(`Firebase token invalid: ${verifyResult.error}`);
    }

    const { payload } = verifyResult;

    // 2. Check phone number exists in token
    if (!payload.phone_number) {
      throw ApiError.unauthorized('Phone number not found in Firebase token. Use phone OTP authentication.');
    }

    const phoneFromToken = normalizePhoneNumber(payload.phone_number);

    // 3. Get store and verify portal is enabled
    const store = await getStoreByCode(storeCode.toUpperCase());
    if (!store) {
      throw ApiError.notFound('Store not found');
    }

    if (!store.retailer_portal_enabled) {
      throw ApiError.forbidden('Retailer portal is not enabled for this store');
    }

    // 4. Verify phone matches store's retailer portal phone
    if (!store.retailer_portal_phone) {
      throw ApiError.forbidden('Retailer portal phone not configured for this store');
    }

    const storePhone = normalizePhoneNumber(store.retailer_portal_phone);
    if (phoneFromToken !== storePhone) {
      throw ApiError.forbidden('Phone number does not match store registration');
    }

    // 5. Create/get user and store_user records
    const user = await createUserIfNotExists({
      phone: phoneFromToken,
      storeId: store.id,
    });

    await createStoreUserIfNotExists({
      storeId: store.id,
      userId: user.id,
      role: 'RETAILER_ADMIN',
      isOwner: true, // First user for store is owner
    });

    // 6. Get permissions for role
    const permissions = await getRolePermissions('RETAILER_ADMIN');

    // 7. Generate app JWT with store-scoped claims
    const tokenPair = generateTokenPair(
      user.id,
      'store', // actorType (lowercase as per ActorType definition)
      store.id, // actorId (storeId)
      permissions
    );

    res.json({
      success: true,
      data: {
        token: tokenPair.accessToken,
        refreshToken: tokenPair.refreshToken,
        expiresIn: tokenPair.expiresIn,
        user: {
          id: user.id,
          phone: phoneFromToken,
          role: 'RETAILER_ADMIN',
        },
        store: {
          storeId: store.id,
          storeCode: store.code,
          storeName: store.name,
        },
      },
    });
  })
);

/**
 * GET /retailer-admin/auth/me
 * Get current user info (requires JWT)
 */
router.get(
  '/me',
  asyncHandler(async (req, res) => {
    // User ID from JWT (set by auth middleware in gateway)
    const userId = req.headers['x-user-id'] as string;
    const storeId = req.headers['x-actor-id'] as string;

    if (!userId || !storeId) {
      throw ApiError.unauthorized('Authentication required');
    }

    // Get user info
    const userResult = await query<{
      id: string;
      phone: string;
      name: string;
    }>(
      `SELECT id, phone, name FROM auth.users WHERE id = $1`,
      [userId]
    );
    const user = userResult[0];
    if (!user) {
      throw ApiError.notFound('User not found');
    }

    // Get store info
    const storeResult = await query<{
      id: string;
      code: string;
      name: string;
    }>(
      `SELECT id, code, name FROM platform.stores WHERE id = $1`,
      [storeId]
    );
    const store = storeResult[0];
    if (!store) {
      throw ApiError.notFound('Store not found');
    }

    // Get store user info
    const storeUser = await getStoreUser(storeId, userId);

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          phone: user.phone,
          name: user.name,
          role: storeUser?.role || 'RETAILER_ADMIN',
          isOwner: storeUser?.is_owner || false,
        },
        store: {
          id: store.id,
          code: store.code,
          name: store.name,
        },
      },
    });
  })
);

// =============================================================================
// DEV BYPASS - DEVELOPMENT ONLY
// =============================================================================

const DEV_BYPASS_KEY = 'supermandi2026';

/**
 * POST /retailer-admin/auth/dev-bypass
 * Development-only endpoint to bypass OTP authentication
 * Issues a real JWT token for testing the portal
 *
 * CRITICAL: Only works when:
 * - NODE_ENV !== 'production', OR
 * - ALLOW_BYPASS_FOR_TESTING === 'true' (for go-live testing)
 */
router.post(
  '/dev-bypass',
  asyncHandler(async (req, res) => {
    // CRITICAL: Block in production unless explicitly allowed for testing
    const allowBypassForTesting = process.env.ALLOW_BYPASS_FOR_TESTING === 'true';
    if (process.env.NODE_ENV === 'production' && !allowBypassForTesting) {
      throw ApiError.notFound('Not found');
    }

    // Log all bypass attempts in production for audit
    if (process.env.NODE_ENV === 'production') {
      console.log(`[SECURITY] dev-bypass attempted in production mode from IP: ${req.ip || req.headers['x-forwarded-for']}`);
    }

    const { bypassKey, storeCode } = req.body as {
      bypassKey: string;
      storeCode: string;
    };

    // Validate bypass key
    if (bypassKey !== DEV_BYPASS_KEY) {
      throw ApiError.unauthorized('Invalid bypass key');
    }

    if (!storeCode) {
      throw ApiError.badRequest('Store code is required', 'storeCode');
    }

    // Get store (create demo store if DEMO001 doesn't exist)
    let store = await getStoreByCode(storeCode.toUpperCase());

    if (!store) {
      // For DEMO001, auto-create if it doesn't exist
      if (storeCode.toUpperCase() === 'DEMO001') {
        const storeResult = await query<StoreWithPortal>(
          `INSERT INTO platform.stores (code, name, status, retailer_portal_enabled, retailer_portal_phone)
           VALUES ('DEMO001', 'SuperMandi Demo Store', 'active', true, '+917737914383')
           ON CONFLICT (code) DO UPDATE SET retailer_portal_enabled = true
           RETURNING id, code, name, retailer_portal_enabled, retailer_portal_phone`,
          []
        );
        store = storeResult[0]!;
      } else {
        throw ApiError.notFound('Store not found');
      }
    }

    // Use a fixed demo phone for bypass
    const bypassPhone = '+917737914383';

    // Create/get user
    const user = await createUserIfNotExists({
      phone: bypassPhone,
      storeId: store.id,
    });

    // Create store_user mapping
    await createStoreUserIfNotExists({
      storeId: store.id,
      userId: user.id,
      role: 'RETAILER_ADMIN',
      isOwner: true,
    });

    // Get permissions for role
    const permissions = await getRolePermissions('RETAILER_ADMIN');

    // Generate real JWT
    const tokenPair = generateTokenPair(
      user.id,
      'store',
      store.id,
      permissions
    );

    const mode = process.env.NODE_ENV === 'production' ? 'PRODUCTION-TESTING' : 'DEV';
    console.log(`[${mode}-BYPASS] Issued token for store ${storeCode}, user ${user.id}`);

    res.json({
      success: true,
      data: {
        token: tokenPair.accessToken,
        refreshToken: tokenPair.refreshToken,
        expiresIn: tokenPair.expiresIn,
        user: {
          id: user.id,
          phone: bypassPhone,
          role: 'RETAILER_ADMIN',
        },
        store: {
          storeId: store.id,
          storeCode: store.code,
          storeName: store.name,
        },
      },
    });
  })
);

export default router;
