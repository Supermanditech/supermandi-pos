// GO-LIVE-132: Retailer Store Context Middleware
// Centralizes store ID extraction from JWT for retailer-admin routes
// Ensures consistent store ID handling across all retailer-admin endpoints

import type { Request, Response, NextFunction } from 'express';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      storeId?: string;
      userId?: string;
      actorType?: string;
    }
  }
}

/**
 * GO-LIVE-132: Extract store ID from gateway-provided headers
 *
 * The API Gateway sets these headers after JWT verification:
 * - x-actor-id: The store ID (for STORE actor type)
 * - x-user-id: The user ID
 * - x-actor-type: 'STORE', 'SUPPLIER', or 'PLATFORM'
 */
export function getStoreId(req: Request): string | null {
  const actorId = req.headers['x-actor-id'];
  const actorType = req.headers['x-actor-type'];

  // Only STORE actor type has valid store access
  if (actorType && actorType !== 'STORE') {
    console.warn(`[RetailerStoreContext] GO-LIVE-132: Non-store actor type: ${actorType}`);
    return null;
  }

  return typeof actorId === 'string' && actorId.trim() ? actorId.trim() : null;
}

/**
 * GO-LIVE-132: Extract user ID from gateway-provided headers
 */
export function getUserId(req: Request): string | null {
  const userId = req.headers['x-user-id'];
  return typeof userId === 'string' && userId.trim() ? userId.trim() : null;
}

/**
 * GO-LIVE-132: Middleware to require store context
 *
 * Use this middleware on retailer-admin routes that require store context.
 * It extracts the store ID from JWT headers and makes it available as req.storeId.
 *
 * Usage:
 *   router.use(requireStoreContext);
 *   router.get('/products', (req, res) => { const storeId = req.storeId; ... });
 */
export function requireStoreContext(req: Request, res: Response, next: NextFunction): void {
  // GO-LIVE-RET-AUTH-001: Skip store context check for auth endpoints (they issue tokens, not consume them)
  if (req.path.startsWith('/auth/')) {
    return next();
  }

  const storeId = getStoreId(req);
  const userId = getUserId(req);
  const actorType = req.headers['x-actor-type'] as string | undefined;

  if (!storeId) {
    console.warn('[RetailerStoreContext] GO-LIVE-132: Store context missing', {
      path: req.path,
      method: req.method,
      hasActorId: !!req.headers['x-actor-id'],
      actorType,
      hasUserId: !!userId,
    });

    res.status(401).json({
      error: {
        code: 'STORE_CONTEXT_MISSING',
        message: 'Store not identified. Please ensure you are logged in with a store account.',
      },
    });
    return;
  }

  // Set on request for easy access
  req.storeId = storeId;
  req.userId = userId || undefined;
  req.actorType = actorType;

  next();
}

/**
 * GO-LIVE-132: Optional store context middleware
 *
 * Extracts store context if available but doesn't require it.
 * Use for routes that can work with or without store context.
 */
export function optionalStoreContext(req: Request, _res: Response, next: NextFunction): void {
  const storeId = getStoreId(req);
  const userId = getUserId(req);
  const actorType = req.headers['x-actor-type'] as string | undefined;

  if (storeId) {
    req.storeId = storeId;
  }
  if (userId) {
    req.userId = userId;
  }
  if (actorType) {
    req.actorType = actorType;
  }

  next();
}

/**
 * GO-LIVE-132: Validate store ID format (UUID)
 */
export function isValidStoreId(storeId: string | null | undefined): boolean {
  if (!storeId) return false;
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidPattern.test(storeId);
}

export default {
  getStoreId,
  getUserId,
  requireStoreContext,
  optionalStoreContext,
  isValidStoreId,
};
