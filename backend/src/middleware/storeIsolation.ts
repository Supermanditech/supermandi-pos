/**
 * SEC-002: Store Isolation Middleware (SECONDARY)
 *
 * STG-548: This is the SECONDARY isolation layer. The PRIMARY isolation
 * for POS devices is deviceToken.ts, which derives storeId server-side
 * from the device enrollment record (never from client input).
 *
 * This middleware provides defense-in-depth by:
 * 1. Extracting store_id from JWT (never from request body)
 * 2. Stripping any store_id from request body/params
 * 3. Injecting the verified store_id into request context
 *
 * Both layers must agree — if deviceToken says storeId=X and a portal
 * JWT says storeId=Y, the request is rejected.
 *
 * CRITICAL: This middleware MUST run after authentication middleware.
 */

import type { Request, Response, NextFunction } from 'express';
import { log } from "../lib/logger";

/**
 * SEC-002: Fields that should never be accepted from client
 * If these appear in request body, they will be overwritten with JWT value
 */
const PROTECTED_STORE_FIELDS = ['store_id', 'storeId'];

/**
 * SEC-002: Audit log entry for store isolation enforcement
 */
interface StoreIsolationAuditEntry {
  timestamp: string;
  path: string;
  method: string;
  tokenStoreId: string;
  clientAttemptedStoreId?: string;
  action: 'allowed' | 'stripped' | 'blocked';
  reason?: string;
}

/**
 * SEC-002: Create store isolation middleware
 *
 * Options:
 * - strict: If true, reject requests that attempt to specify store_id (403)
 *           If false (default), silently strip and replace with token value
 * - allowQuery: If true, allow store_id in query params (for filtering)
 *               If false (default), strip from query params too
 *
 * @example
 * // Default: silently strip store_id from body
 * router.use(enforceStoreIsolation());
 *
 * // Strict: reject attempts to specify store_id
 * router.post('/sales', enforceStoreIsolation({ strict: true }), salesController.create);
 */
export function enforceStoreIsolation(options?: {
  strict?: boolean;
  allowQuery?: boolean;
  logAttempts?: boolean;
}) {
  const strict = options?.strict ?? false;
  const allowQuery = options?.allowQuery ?? false;
  const logAttempts = options?.logAttempts ?? true;

  return (req: Request, res: Response, next: NextFunction): void => {
    // Get store_id from JWT context (set by retailerStoreContext or deviceToken middleware)
    const tokenStoreId = (req as any).storeId || (req as any).posDevice?.storeId;

    if (!tokenStoreId) {
      // No store context - let downstream middleware handle auth
      next();
      return;
    }

    let clientAttemptedStoreId: string | undefined;

    // Check body for store_id
    if (req.body && typeof req.body === 'object') {
      for (const field of PROTECTED_STORE_FIELDS) {
        if (req.body[field] !== undefined && req.body[field] !== tokenStoreId) {
          clientAttemptedStoreId = req.body[field];

          if (strict) {
            const auditEntry: StoreIsolationAuditEntry = {
              timestamp: new Date().toISOString(),
              path: req.path,
              method: req.method,
              tokenStoreId,
              clientAttemptedStoreId,
              action: 'blocked',
              reason: `Client attempted to set ${field} in body`,
            };

            log.warn('[SEC-002] Store isolation violation BLOCKED', auditEntry);

            res.status(403).json({
              error: 'STORE_ISOLATION_VIOLATION',
              message: 'You cannot specify store_id in request body. Store is determined by your authentication token.',
            });
            return;
          }

          // Non-strict: silently strip the field
          delete req.body[field];

          if (logAttempts) {
            const auditEntry: StoreIsolationAuditEntry = {
              timestamp: new Date().toISOString(),
              path: req.path,
              method: req.method,
              tokenStoreId,
              clientAttemptedStoreId,
              action: 'stripped',
              reason: `Client attempted to set ${field} in body - stripped`,
            };

            log.warn('[SEC-002] Store isolation attempt STRIPPED', auditEntry);
          }
        }
      }

      // Also check nested payload object (common in sync endpoints)
      if (req.body.payload && typeof req.body.payload === 'object') {
        for (const field of PROTECTED_STORE_FIELDS) {
          if (req.body.payload[field] !== undefined && req.body.payload[field] !== tokenStoreId) {
            if (strict) {
              res.status(403).json({
                error: 'STORE_ISOLATION_VIOLATION',
                message: 'You cannot specify store_id in request payload.',
              });
              return;
            }
            delete req.body.payload[field];
          }
        }
      }
    }

    // Check query params (if not allowing them)
    if (!allowQuery && req.query) {
      for (const field of PROTECTED_STORE_FIELDS) {
        if ((req.query as any)[field] !== undefined && (req.query as any)[field] !== tokenStoreId) {
          if (strict) {
            res.status(403).json({
              error: 'STORE_ISOLATION_VIOLATION',
              message: 'You cannot specify store_id in query parameters.',
            });
            return;
          }
          delete (req.query as any)[field];
        }
      }
    }

    // All good - ensure store_id is available in body for downstream handlers that expect it
    if (req.body && typeof req.body === 'object') {
      // Only set if body exists (POST/PUT/PATCH requests)
      req.body.store_id = tokenStoreId;
    }

    next();
  };
}

/**
 * SEC-002: Default store isolation middleware (non-strict, strips client store_id)
 */
export const storeIsolation = enforceStoreIsolation();

/**
 * SEC-002: Strict store isolation middleware (rejects any client store_id attempt)
 */
export const strictStoreIsolation = enforceStoreIsolation({ strict: true });

/**
 * SEC-002: Validate that a store_id matches the token store_id
 * Use when you need to check an ID from params (e.g., GET /stores/:storeId)
 */
export function validateStoreOwnership(req: Request, res: Response, next: NextFunction): void {
  const tokenStoreId = (req as any).storeId || (req as any).posDevice?.storeId;
  const paramStoreId = req.params.storeId || req.params.store_id;

  if (!tokenStoreId) {
    res.status(401).json({
      error: 'STORE_CONTEXT_MISSING',
      message: 'Store authentication required',
    });
    return;
  }

  if (paramStoreId && paramStoreId !== tokenStoreId) {
    log.warn('[SEC-002] Store ownership validation failed', {
      tokenStoreId,
      paramStoreId,
      path: req.path,
      method: req.method,
    });

    res.status(403).json({
      error: 'FORBIDDEN',
      message: 'You do not have access to this store',
    });
    return;
  }

  next();
}

export default {
  enforceStoreIsolation,
  storeIsolation,
  strictStoreIsolation,
  validateStoreOwnership,
};
