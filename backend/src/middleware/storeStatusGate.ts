/**
 * SEC-001: Store Status Gate Middleware
 *
 * Enforces that store has required status before allowing access to protected endpoints.
 * Uses store_id from request context (set by retailerStoreContext or deviceToken middleware).
 */

import type { Request, Response, NextFunction } from 'express';
import { getPool } from '../db/client';
import { StoreStatus, type StoreStatusType } from '../services/storeStateMachine';

// Extend Express Request to include storeStatus
declare global {
  namespace Express {
    interface Request {
      storeStatus?: StoreStatusType;
    }
  }
}

// ISSUE-MICRO-011: TTL cache for store status to eliminate N+1 queries
// 30-second TTL is short enough for status changes to propagate quickly
const STATUS_CACHE_TTL_MS = 30_000;
const STATUS_CACHE_MAX_SIZE = 5000;
const statusCache = new Map<string, { status: StoreStatusType; expiresAt: number }>();

function getCachedStatus(storeId: string): StoreStatusType | null {
  const entry = statusCache.get(storeId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    statusCache.delete(storeId);
    return null;
  }
  return entry.status;
}

function setCachedStatus(storeId: string, status: StoreStatusType): void {
  // Evict oldest entries if cache is full
  if (statusCache.size >= STATUS_CACHE_MAX_SIZE) {
    const firstKey = statusCache.keys().next().value;
    if (firstKey) statusCache.delete(firstKey);
  }
  statusCache.set(storeId, { status, expiresAt: Date.now() + STATUS_CACHE_TTL_MS });
}

/**
 * SEC-001: Standard error response for status gating
 */
interface StatusGateError {
  error: 'STATUS_NOT_ALLOWED';
  message: string;
  status: string;
  required_status: string | string[];
}

/**
 * SEC-001: Create middleware that requires store to have one of the allowed statuses
 *
 * @param allowedStatuses - Single status or array of allowed statuses
 * @returns Express middleware function
 *
 * @example
 * // Require ACTIVE status only
 * router.post('/sales', requireStoreStatus('ACTIVE'), salesController.create);
 *
 * // Allow multiple statuses
 * router.get('/products', requireStoreStatus(['ACTIVE', 'PAYMENTS_SUBMITTED']), productController.list);
 */
export function requireStoreStatus(allowedStatuses: StoreStatusType | StoreStatusType[]) {
  const statusArray = Array.isArray(allowedStatuses) ? allowedStatuses : [allowedStatuses];

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: 'SERVICE_UNAVAILABLE', message: 'Database unavailable' });
      return;
    }

    // Get store_id from various sources (deviceToken sets this, or retailerStoreContext)
    const storeId = (req as any).storeId || (req as any).posDevice?.storeId;

    if (!storeId) {
      res.status(401).json({
        error: 'STORE_CONTEXT_MISSING',
        message: 'Store context required for this operation',
      });
      return;
    }

    try {
      // ISSUE-MICRO-011: Check TTL cache before hitting DB
      let currentStatus = getCachedStatus(storeId);

      if (!currentStatus) {
        // Fetch current store status from DB
        const result = await pool.query(
          'SELECT status FROM platform.stores WHERE id = $1::uuid AND deleted_at IS NULL',
          [storeId]
        );

        if (result.rows.length === 0) {
          res.status(404).json({ error: 'STORE_NOT_FOUND', message: 'Store not found' });
          return;
        }

        currentStatus = result.rows[0].status as StoreStatusType;
        setCachedStatus(storeId, currentStatus);
      }

      // Store status in request for downstream use
      req.storeStatus = currentStatus;

      // Check if current status is in allowed list
      if (!statusArray.includes(currentStatus)) {
        const response: StatusGateError = {
          error: 'STATUS_NOT_ALLOWED',
          message: `Your store is not authorized for this operation. Current status: ${currentStatus}`,
          status: currentStatus,
          required_status: statusArray.length === 1 ? statusArray[0] : statusArray,
        };

        console.warn('[SEC-001] Store status gate blocked request', {
          storeId,
          currentStatus,
          requiredStatus: statusArray,
          path: req.path,
          method: req.method,
        });

        res.status(403).json(response);
        return;
      }

      next();
    } catch (error: any) {
      console.error('[SEC-001] Store status check failed:', error?.message);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to verify store status' });
    }
  };
}

/**
 * SEC-001: Middleware that blocks all non-ACTIVE stores
 * Shorthand for requireStoreStatus('ACTIVE')
 */
export const requireActiveStore = requireStoreStatus(StoreStatus.ACTIVE);

/**
 * SEC-001: Middleware that allows operational stores (ACTIVE or PAYMENTS_SUBMITTED)
 * Use for read operations that can work during onboarding
 */
export const requireOperationalStore = requireStoreStatus([
  StoreStatus.ACTIVE,
  StoreStatus.PAYMENTS_SUBMITTED,
]);

/**
 * SEC-001: Middleware that allows any registered store
 * DR-005: Includes DRAFT — stores created via instant registration (RO-001)
 * should be able to access basic read operations before device enrollment
 */
export const requireEnrolledStore = requireStoreStatus([
  StoreStatus.DRAFT,     // DR-005: Instant-registered stores before enrollment
  StoreStatus.ENROLLED,
  StoreStatus.KYC_SUBMITTED,
  StoreStatus.PAYMENTS_SUBMITTED,
  StoreStatus.ACTIVE,
  StoreStatus.NEEDS_FIX, // Can still view their data
]);

export default {
  requireStoreStatus,
  requireActiveStore,
  requireOperationalStore,
  requireEnrolledStore,
};
