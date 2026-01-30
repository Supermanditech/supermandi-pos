// GO-LIVE-047: Store Ownership Verification Middleware
// Ensures users can only access stores they own/are authorized for
// SuperAdmin (x-admin-token) bypasses this check

import type { Request, Response, NextFunction } from 'express';
import { getPool } from '../db/client';

// =============================================================================
// TYPES
// =============================================================================

interface StoreOwnershipResult {
  verified: boolean;
  error?: string;
  storeId?: string;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Check if request is from SuperAdmin (x-admin-token)
 */
function isSuperAdmin(req: Request): boolean {
  // If request has admin token header and passed adminToken middleware, it's SuperAdmin
  return !!req.headers['x-admin-token'] || (req as any).isAdminRequest === true;
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
 * Get requested store ID from various request locations
 */
function getRequestedStoreId(req: Request): string | null {
  // Check params first
  if (req.params?.storeId) {
    return req.params.storeId;
  }

  // Check query
  if (typeof req.query?.storeId === 'string') {
    return req.query.storeId;
  }

  // Check body
  if (typeof (req.body as any)?.storeId === 'string') {
    return (req.body as any).storeId;
  }

  return null;
}

// =============================================================================
// VERIFICATION FUNCTIONS
// =============================================================================

/**
 * Verify store exists in database
 */
async function storeExists(storeId: string): Promise<boolean> {
  const pool = getPool();
  if (!pool) return false;

  try {
    const result = await pool.query(
      `SELECT 1 FROM platform.stores WHERE id = $1 AND deleted_at IS NULL`,
      [storeId]
    );
    return (result.rowCount ?? 0) > 0;
  } catch {
    return false;
  }
}

/**
 * Verify user has access to store
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
    // Check if store exists
    if (!(await storeExists(storeId))) {
      return { verified: false, error: 'Store not found' };
    }

    // Check if user has access to this store
    const result = await pool.query(
      `SELECT 1 FROM auth.store_users
       WHERE user_id = $1 AND store_id = $2 AND is_active = true`,
      [userId, storeId]
    );

    if ((result.rowCount ?? 0) === 0) {
      return { verified: false, error: 'Access denied to this store' };
    }

    return { verified: true, storeId };
  } catch (error) {
    console.error('[StoreOwnership] Verification error:', error);
    return { verified: false, error: 'Verification failed' };
  }
}

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * GO-LIVE-047: Store ownership verification middleware
 *
 * Ensures that:
 * 1. SuperAdmin requests bypass verification (they have access to all stores)
 * 2. Retailer requests can only access their authorized store
 * 3. Store IDs in request match the caller's authorized store
 */
export function requireStoreOwnership(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // SuperAdmin bypasses store ownership check
  if (isSuperAdmin(req)) {
    console.log('[StoreOwnership] SuperAdmin access - bypassing verification');
    return next();
  }

  const authorizedStoreId = getAuthorizedStoreId(req);
  const requestedStoreId = getRequestedStoreId(req);

  // If no authorized store (not a store actor), reject
  if (!authorizedStoreId) {
    console.log('[StoreOwnership] No authorized store for user');
    res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'Store access not authorized',
      },
    });
    return;
  }

  // If request includes a specific storeId, verify it matches authorized store
  if (requestedStoreId && requestedStoreId !== authorizedStoreId) {
    console.warn(
      `[StoreOwnership] Store mismatch - authorized: ${authorizedStoreId}, requested: ${requestedStoreId}`
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
  console.log(`[StoreOwnership] Verified store access: ${authorizedStoreId}`);
  next();
}

/**
 * Verify store exists for admin operations
 * Used by SuperAdmin routes that take storeId as parameter
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

  const exists = await storeExists(storeId);
  if (!exists) {
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: 'Store not found',
      },
    });
    return;
  }

  (req as any).verifiedStoreId = storeId;
  next();
}

/**
 * Get the verified store ID from request
 * Use this in route handlers after middleware has run
 */
export function getVerifiedStoreId(req: Request): string | null {
  return (req as any).verifiedStoreId || getAuthorizedStoreId(req);
}
