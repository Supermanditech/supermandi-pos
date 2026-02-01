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

  // DEBUG: Log middleware creation
  console.log('[SEC-001] Status gate middleware created with allowed:', statusArray);

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // DEBUG: Log middleware invocation
    console.log('[SEC-001] Status gate middleware invoked for:', req.method, req.path);

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: 'SERVICE_UNAVAILABLE', message: 'Database unavailable' });
      return;
    }

    // Get store_id from various sources (deviceToken sets this, or retailerStoreContext)
    const storeId = (req as any).storeId || (req as any).posDevice?.storeId;

    // DEBUG: Log store context
    console.log('[SEC-001] Store context:', { storeId, hasReqStoreId: !!(req as any).storeId, hasPosDevice: !!(req as any).posDevice });

    if (!storeId) {
      res.status(401).json({
        error: 'STORE_CONTEXT_MISSING',
        message: 'Store context required for this operation',
      });
      return;
    }

    try {
      // Fetch current store status
      const result = await pool.query(
        'SELECT status FROM platform.stores WHERE id = $1::uuid AND deleted_at IS NULL',
        [storeId]
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: 'STORE_NOT_FOUND', message: 'Store not found' });
        return;
      }

      const currentStatus = result.rows[0].status as StoreStatusType;

      // DEBUG: Log status check
      console.log('[SEC-001] Status check:', {
        currentStatus,
        statusArray,
        isAllowed: statusArray.includes(currentStatus),
      });

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
 * SEC-001: Middleware that allows any registered store (not DRAFT)
 * Use for basic read operations available after enrollment
 */
export const requireEnrolledStore = requireStoreStatus([
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
