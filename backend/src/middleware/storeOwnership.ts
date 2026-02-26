// GO-LIVE-047: Store Ownership Verification Middleware
// GO-LIVE-129: Enhanced with complete ownership verification
// Ensures users can only access stores they own/are authorized for
// SuperAdmin (x-admin-token) bypasses this check

import type { Request, Response, NextFunction } from 'express';
import { getPool } from '../db/client';
import { log } from "../lib/logger";
import { asError } from "../lib/errorUtils";

// =============================================================================
// TYPES
// =============================================================================

interface StoreOwnershipResult {
  verified: boolean;
  error?: string;
  storeId?: string;
}

// GO-LIVE-129: Store info for extended verification
interface StoreInfo {
  id: string;
  status: string;
  name?: string;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Check if request is from SuperAdmin (x-admin-token)
 * GO-LIVE-129: Also check for adminRole from RBAC middleware
 */
function isSuperAdmin(req: Request): boolean {
  // If request has admin token header and passed adminToken middleware, it's SuperAdmin
  if (req.headers['x-admin-token']) {
    return true;
  }
  // GO-LIVE-129: Check for RBAC admin role
  if ((req as any).adminRole === 'super_admin' || (req as any).adminRole === 'admin') {
    return true;
  }
  // Legacy flag
  return (req as any).isAdminRequest === true;
}

/**
 * Get store ID from gateway headers (set after JWT verification)
 */
function getAuthorizedStoreId(req: Request): string | null {
  const actorType = req.headers['x-actor-type'];
  const actorId = req.headers['x-actor-id'];

  // Only STORE actor type has store access
  if (actorType !== 'STORE') {
    return null;
  }

  return typeof actorId === 'string' ? actorId : null;
}

/**
 * GO-LIVE-129: Get supplier ID from gateway headers
 */
function getAuthorizedSupplierId(req: Request): string | null {
  const actorType = req.headers['x-actor-type'];
  const actorId = req.headers['x-actor-id'];

  if (actorType !== 'SUPPLIER') {
    return null;
  }

  return typeof actorId === 'string' ? actorId : null;
}

/**
 * Get requested store ID from various request locations
 * GO-LIVE-129: Extended to check more locations
 */
function getRequestedStoreId(req: Request): string | null {
  // Check params first (common in routes like /stores/:storeId)
  if (req.params?.storeId) {
    return req.params.storeId;
  }
  // Also check for store_id in params
  if (req.params?.store_id) {
    return req.params.store_id;
  }

  // Check query
  if (typeof req.query?.storeId === 'string') {
    return req.query.storeId;
  }
  if (typeof req.query?.store_id === 'string') {
    return req.query.store_id;
  }

  // Check body (both camelCase and snake_case)
  if (typeof (req.body as any)?.storeId === 'string') {
    return (req.body as any).storeId;
  }
  if (typeof (req.body as any)?.store_id === 'string') {
    return (req.body as any).store_id;
  }

  // RCAT-FIX-001: Check verifiedStoreId set by requireStoreOwnership middleware
  // This allows verifyStoreExists to work for retailer-admin routes where
  // storeId comes from JWT (x-actor-id header) rather than path params
  if ((req as any).verifiedStoreId) {
    return (req as any).verifiedStoreId;
  }

  return null;
}

// =============================================================================
// VERIFICATION FUNCTIONS
// =============================================================================

/**
 * GO-LIVE-129: Verify store exists in database with proper status check
 * Uses status column (not deleted_at) as that's what the schema uses
 */
async function storeExists(storeId: string): Promise<StoreInfo | null> {
  const pool = getPool();
  if (!pool) return null;

  try {
    // GO-LIVE-129: Filter soft-deleted stores (deleted_at set by migration 069)
    const result = await pool.query(
      `SELECT id::TEXT as id, status, name FROM platform.stores WHERE id = $1::uuid AND deleted_at IS NULL`,
      [storeId]
    );
    if ((result.rowCount ?? 0) === 0) {
      return null;
    }
    return result.rows[0] as StoreInfo;
  } catch (err: any) {
    log.error('[StoreOwnership] GO-LIVE-129: Store lookup error:', err?.message);
    return null;
  }
}

/**
 * GO-LIVE-129: Verify supplier has access to a specific store
 * Suppliers can only access stores they are linked to
 */
async function supplierHasStoreAccess(supplierId: string, storeId: string): Promise<boolean> {
  const pool = getPool();
  if (!pool) return false;

  try {
    const result = await pool.query(
      `SELECT 1 FROM supplier.supplier_store_links
       WHERE supplier_id = $1::uuid AND store_id = $2::uuid AND status = 'active'
       LIMIT 1`,
      [supplierId, storeId]
    );
    return (result.rowCount ?? 0) > 0;
  } catch (err: any) {
    // Table might not exist yet
    if (err?.code === '42P01') {
      log.info('[StoreOwnership] GO-LIVE-129: supplier_store_links table not found');
      return false;
    }
    log.error('[StoreOwnership] GO-LIVE-129: Supplier store access check error:', err?.message);
    return false;
  }
}

/**
 * GO-LIVE-129: Verify device has access to a store
 * Used for POS device authentication
 */
async function deviceHasStoreAccess(deviceId: string, storeId: string): Promise<boolean> {
  const pool = getPool();
  if (!pool) return false;

  try {
    const result = await pool.query(
      `SELECT 1 FROM platform.devices
       WHERE id = $1::uuid AND store_id = $2::uuid AND status = 'active'
       LIMIT 1`,
      [deviceId, storeId]
    );
    return (result.rowCount ?? 0) > 0;
  } catch (err: any) {
    // Table might not exist yet
    if (err?.code === '42P01') {
      log.info('[StoreOwnership] GO-LIVE-129: devices table not found');
      return false;
    }
    log.error('[StoreOwnership] GO-LIVE-129: Device store access check error:', err?.message);
    return false;
  }
}

/**
 * GO-LIVE-129: Verify user has access to store
 * Enhanced to check multiple ownership paths
 */
export async function verifyStoreOwnership(
  userId: string,
  storeId: string
): Promise<StoreOwnershipResult> {
  const pool = getPool();
  if (!pool) {
    return { verified: false, error: 'Database unavailable' };
  }

  try {
    // Check if store exists and get status
    const storeInfo = await storeExists(storeId);
    if (!storeInfo) {
      return { verified: false, error: 'Store not found' };
    }

    // GO-LIVE-129: Check if store is active/accessible
    if (storeInfo.status === 'deleted') {
      return { verified: false, error: 'Store has been deleted' };
    }

    // Check if user has access via auth.store_users
    const storeUserResult = await pool.query(
      `SELECT 1 FROM auth.store_users
       WHERE user_id = $1::uuid AND store_id = $2::uuid AND is_active = true`,
      [userId, storeId]
    );

    if ((storeUserResult.rowCount ?? 0) > 0) {
      return { verified: true, storeId };
    }

    // GO-LIVE-129: Also check if user is directly linked via auth.users actor_id
    const userActorResult = await pool.query(
      `SELECT 1 FROM auth.users
       WHERE id = $1::uuid AND actor_type = 'store' AND actor_id = $2::uuid AND status = 'active'`,
      [userId, storeId]
    );

    if ((userActorResult.rowCount ?? 0) > 0) {
      return { verified: true, storeId };
    }

    return { verified: false, error: 'Access denied to this store' };
  } catch (_error: unknown) {
    const error = asError(_error);
    // GO-LIVE-129: Handle missing tables gracefully
    if (error?.code === '42P01') {
      log.warn('[StoreOwnership] GO-LIVE-129: Required table not found:', error?.message);
      return { verified: false, error: 'Store access table not initialized' };
    }
    log.error('[StoreOwnership] Verification error:', error);
    return { verified: false, error: 'Verification failed' };
  }
}

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * GO-LIVE-047: Store ownership verification middleware
 * GO-LIVE-129: Enhanced with complete ownership verification
 *
 * Ensures that:
 * 1. SuperAdmin requests bypass verification (they have access to all stores)
 * 2. Retailer requests can only access their authorized store
 * 3. Supplier requests can only access stores they are linked to
 * 4. Store IDs in request match the caller's authorized store
 */
export function requireStoreOwnership(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // GO-LIVE-RET-AUTH-001: Skip store ownership check for auth endpoints (they issue tokens, not consume them)
  if (req.path.startsWith('/auth/')) {
    return next();
  }

  // SuperAdmin bypasses store ownership check
  if (isSuperAdmin(req)) {
    log.info('[StoreOwnership] GO-LIVE-129: SuperAdmin access - bypassing verification');
    return next();
  }

  const authorizedStoreId = getAuthorizedStoreId(req);
  const authorizedSupplierId = getAuthorizedSupplierId(req);
  const requestedStoreId = getRequestedStoreId(req);

  // Case 1: Store actor (retailer)
  if (authorizedStoreId) {
    // If request includes a specific storeId, verify it matches authorized store
    if (requestedStoreId && requestedStoreId !== authorizedStoreId) {
      log.warn(
        `[StoreOwnership] GO-LIVE-129: Store mismatch - authorized: ${authorizedStoreId}, requested: ${requestedStoreId}`
      );
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied to requested store',
        },
      });
      return;
    }

    // Set verified store ID on request for downstream use
    (req as any).verifiedStoreId = authorizedStoreId;
    log.info(`[StoreOwnership] GO-LIVE-129: Verified store access: ${authorizedStoreId}`);
    return next();
  }

  // Case 2: Supplier actor - needs async verification
  if (authorizedSupplierId && requestedStoreId) {
    // Suppliers need to be verified against specific store links
    supplierHasStoreAccess(authorizedSupplierId, requestedStoreId)
      .then((hasAccess) => {
        if (hasAccess) {
          (req as any).verifiedStoreId = requestedStoreId;
          (req as any).verifiedSupplierId = authorizedSupplierId;
          log.info(`[StoreOwnership] GO-LIVE-129: Verified supplier ${authorizedSupplierId} access to store: ${requestedStoreId}`);
          return next();
        }
        log.warn(`[StoreOwnership] GO-LIVE-129: Supplier ${authorizedSupplierId} denied access to store ${requestedStoreId}`);
        res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: 'Supplier not linked to this store',
          },
        });
      })
      .catch((error) => {
        log.error('[StoreOwnership] GO-LIVE-129: Supplier verification error:', error);
        res.status(500).json({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Store access verification failed',
          },
        });
      });
    return;
  }

  // Case 3: Supplier without specific store request - allow (for supplier-only endpoints)
  if (authorizedSupplierId && !requestedStoreId) {
    (req as any).verifiedSupplierId = authorizedSupplierId;
    log.info(`[StoreOwnership] GO-LIVE-129: Supplier access (no store): ${authorizedSupplierId}`);
    return next();
  }

  // No valid authorization found
  log.info('[StoreOwnership] GO-LIVE-129: No authorized store/supplier for request');
  res.status(403).json({
    error: {
      code: 'FORBIDDEN',
      message: 'Store access not authorized',
    },
  });
}

/**
 * GO-LIVE-129: Verify store exists for admin operations
 * Used by SuperAdmin routes that take storeId as parameter
 * Enhanced to check store status
 */
export async function verifyStoreExists(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const storeId = getRequestedStoreId(req);

  if (!storeId) {
    // No storeId in request, skip verification
    return next();
  }

  const storeInfo = await storeExists(storeId);
  if (!storeInfo) {
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: 'Store not found',
      },
    });
    return;
  }

  // GO-LIVE-129: Check if store is deleted
  if (storeInfo.status === 'deleted') {
    res.status(410).json({
      error: {
        code: 'GONE',
        message: 'Store has been deleted',
      },
    });
    return;
  }

  (req as any).verifiedStoreId = storeId;
  (req as any).verifiedStoreInfo = storeInfo;
  next();
}

/**
 * Get the verified store ID from request
 * Use this in route handlers after middleware has run
 */
export function getVerifiedStoreId(req: Request): string | null {
  return (req as any).verifiedStoreId || getAuthorizedStoreId(req);
}

/**
 * GO-LIVE-129: Get the verified supplier ID from request
 * Use this in route handlers after middleware has run
 */
export function getVerifiedSupplierId(req: Request): string | null {
  return (req as any).verifiedSupplierId || getAuthorizedSupplierId(req);
}

/**
 * GO-LIVE-129: Get the verified store info from request
 * Use this in route handlers after middleware has run
 */
export function getVerifiedStoreInfo(req: Request): StoreInfo | null {
  return (req as any).verifiedStoreInfo || null;
}

/**
 * GO-LIVE-129: Require that store is in active status
 * Use after verifyStoreExists to ensure store is operational
 */
export function requireActiveStore(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // RCAT-FIX-001: Skip for auth/registration endpoints (same pattern as requireStoreOwnership)
  if (req.path.startsWith('/auth/') || req.path.startsWith('/registration')) {
    return next();
  }

  const storeInfo = getVerifiedStoreInfo(req);

  if (!storeInfo) {
    res.status(400).json({
      error: {
        code: 'BAD_REQUEST',
        message: 'Store verification required before this check',
      },
    });
    return;
  }

  // FIX-019-009: Match UPPERCASE status from migration 094
  if (storeInfo.status !== 'ACTIVE') {
    res.status(403).json({
      error: {
        code: 'STORE_INACTIVE',
        message: `Store is ${storeInfo.status}. Only active stores can perform this operation.`,
      },
    });
    return;
  }

  next();
}

/**
 * RCAT-FIX-002: Require that the authenticated user has active status in DB.
 * Blocks deactivated/suspended users even if their JWT is still valid.
 * Reads x-user-id header (set by gateway from JWT claims).
 * Must be applied AFTER gateway JWT verification.
 */
export async function requireActiveUser(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // SuperAdmin bypasses user status check
  if (isSuperAdmin(req)) {
    return next();
  }

  const userId = req.headers['x-user-id'];
  if (!userId || typeof userId !== 'string') {
    // No user ID — let other middleware handle auth
    return next();
  }

  const pool = getPool();
  if (!pool) {
    res.status(503).json({
      error: { code: 'SERVICE_UNAVAILABLE', message: 'Database unavailable' },
    });
    return;
  }

  try {
    const result = await pool.query(
      `SELECT status FROM auth.users WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      res.status(401).json({
        error: { code: 'USER_NOT_FOUND', message: 'User account not found' },
      });
      return;
    }

    const userStatus = result.rows[0].status;
    if (userStatus !== 'active') {
      log.warn(`[RCAT-FIX-002] Blocked ${userStatus} user ${userId} on ${req.method} ${req.path}`);
      res.status(403).json({
        error: {
          code: 'USER_INACTIVE',
          message: `Account is ${userStatus}. Please contact support.`,
        },
      });
      return;
    }

    next();
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error('[requireActiveUser] DB error:', error.message);
    // Fail open on DB error to avoid blocking all traffic
    // Production monitoring will catch persistent failures
    next();
  }
}
