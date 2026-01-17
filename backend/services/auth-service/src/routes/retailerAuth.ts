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
  role_name: string;
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
  return result.rows[0] || null;
}

async function getUserByPhone(phone: string): Promise<AuthUser | null> {
  const result = await query<AuthUser>(
    `SELECT u.id, u.phone, r.name as role_name
     FROM auth.users u
     JOIN auth.roles r ON u.role_id = r.id
     WHERE u.phone = $1 AND u.is_active = true`,
    [phone]
  );
  return result.rows[0] || null;
}

async function getStoreUser(storeId: string, userId: string): Promise<StoreUser | null> {
  const result = await query<StoreUser>(
    `SELECT * FROM auth.store_users
     WHERE store_id = $1 AND user_id = $2 AND is_active = true`,
    [storeId, userId]
  );
  return result.rows[0] || null;
}

async function createUserIfNotExists(params: {
  phone: string;
  roleId: string;
}): Promise<AuthUser> {
  // First try to get existing user
  const existing = await getUserByPhone(params.phone);
  if (existing) {
    return existing;
  }

  // Create new user with RETAILER_ADMIN role
  const result = await query<AuthUser>(
    `INSERT INTO auth.users (phone, role_id, is_active)
     VALUES ($1, $2, true)
     RETURNING id, phone, (SELECT name FROM auth.roles WHERE id = $2) as role_name`,
    [params.phone, params.roleId]
  );
  return result.rows[0]!;
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
  return result.rows[0]!;
}

async function getRetailerAdminRoleId(): Promise<string> {
  const result = await query<{ id: string }>(
    `SELECT id FROM auth.roles WHERE name = 'RETAILER_ADMIN'`,
    []
  );
  if (!result.rows[0]) {
    throw new Error('RETAILER_ADMIN role not found. Run migration 028.');
  }
  return result.rows[0].id;
}

async function getRolePermissions(roleName: string): Promise<string[]> {
  const result = await query<{ permissions: string[] }>(
    `SELECT permissions FROM auth.roles WHERE name = $1`,
    [roleName]
  );
  return result.rows[0]?.permissions || [];
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
    const verifyResult = await verifyFirebaseIdToken(idToken);
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
    const roleId = await getRetailerAdminRoleId();
    const user = await createUserIfNotExists({
      phone: phoneFromToken,
      roleId,
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
      'STORE', // actorType
      store.id, // actorId (storeId)
      permissions
    );

    res.json({
      success: true,
      data: {
        accessToken: tokenPair.accessToken,
        refreshToken: tokenPair.refreshToken,
        expiresIn: tokenPair.expiresIn,
        user: {
          id: user.id,
          phone: phoneFromToken,
          role: 'RETAILER_ADMIN',
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
      role_name: string;
    }>(
      `SELECT u.id, u.phone, r.name as role_name
       FROM auth.users u
       JOIN auth.roles r ON u.role_id = r.id
       WHERE u.id = $1`,
      [userId]
    );
    const user = userResult.rows[0];
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
    const store = storeResult.rows[0];
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
          role: storeUser?.role || user.role_name,
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

export default router;
