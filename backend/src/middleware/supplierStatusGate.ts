/**
 * SEC-001: Supplier Status Gate Middleware
 *
 * Enforces that supplier has required verification_status before allowing access.
 * Uses supplier_id from JWT headers (x-actor-id for SUPPLIER actor type).
 */

import type { Request, Response, NextFunction } from 'express';
import { getPool } from '../db/client';
import { SupplierStatus, type SupplierStatusType } from '../services/supplierStateMachine';
import { log } from "../lib/logger";
import { asError } from "../lib/errorUtils";

// Extend Express Request to include supplierStatus
declare global {
  namespace Express {
    interface Request {
      supplierId?: string;
      supplierStatus?: SupplierStatusType;
    }
  }
}

/**
 * SEC-001: Standard error response for supplier status gating
 */
interface SupplierStatusGateError {
  error: 'STATUS_NOT_ALLOWED';
  message: string;
  status: string;
  required_status: string | string[];
}

/**
 * SEC-001: Extract supplier ID from gateway headers
 *
 * The API Gateway sets these headers after JWT verification:
 * - x-actor-id: The supplier ID (for SUPPLIER actor type)
 * - x-actor-type: 'SUPPLIER'
 */
function getSupplierId(req: Request): string | null {
  const actorId = req.headers['x-actor-id'];
  const actorType = req.headers['x-actor-type'];

  // Only SUPPLIER actor type has valid supplier access
  if (actorType !== 'SUPPLIER') {
    return null;
  }

  return typeof actorId === 'string' && actorId.trim() ? actorId.trim() : null;
}

/**
 * SEC-001: Create middleware that requires supplier to have one of the allowed statuses
 *
 * @param allowedStatuses - Single status or array of allowed statuses
 * @returns Express middleware function
 *
 * @example
 * // Require ACTIVE status only
 * router.post('/products', requireSupplierStatus('ACTIVE'), productController.create);
 *
 * // Allow multiple statuses
 * router.get('/profile', requireSupplierStatus(['ACTIVE', 'KYC_SUBMITTED']), profileController.get);
 */
export function requireSupplierStatus(allowedStatuses: SupplierStatusType | SupplierStatusType[]) {
  const statusArray = Array.isArray(allowedStatuses) ? allowedStatuses : [allowedStatuses];

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: 'SERVICE_UNAVAILABLE', message: 'Database unavailable' });
      return;
    }

    // Get supplier_id from headers (set by gateway after JWT verification)
    const supplierId = getSupplierId(req);

    if (!supplierId) {
      res.status(401).json({
        error: 'SUPPLIER_CONTEXT_MISSING',
        message: 'Supplier authentication required for this operation',
      });
      return;
    }

    try {
      // Fetch current supplier verification_status
      const result = await pool.query(
        'SELECT verification_status FROM supplier.suppliers WHERE id = $1::uuid',
        [supplierId]
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: 'SUPPLIER_NOT_FOUND', message: 'Supplier not found' });
        return;
      }

      const currentStatus = result.rows[0].verification_status as SupplierStatusType;

      // Store context in request for downstream use
      req.supplierId = supplierId;
      req.supplierStatus = currentStatus;

      // Check if current status is in allowed list
      if (!statusArray.includes(currentStatus)) {
        const response: SupplierStatusGateError = {
          error: 'STATUS_NOT_ALLOWED',
          message: `Your account is not authorized for this operation. Current status: ${currentStatus}`,
          status: currentStatus,
          required_status: statusArray.length === 1 ? statusArray[0] : statusArray,
        };

        log.warn('[SEC-001] Supplier status gate blocked request', {
          supplierId,
          currentStatus,
          requiredStatus: statusArray,
          path: req.path,
          method: req.method,
        });

        res.status(403).json(response);
        return;
      }

      next();
    } catch (_error: unknown) {
    const error = asError(_error);
      log.error('[SEC-001] Supplier status check failed:', error?.message);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to verify supplier status' });
    }
  };
}

/**
 * SEC-001: Middleware that blocks all non-ACTIVE suppliers
 * Use for write operations that require full approval
 */
export const requireActiveSupplier = requireSupplierStatus(SupplierStatus.ACTIVE);

/**
 * SEC-001: Middleware that allows any registered supplier
 * Use for read operations (viewing own profile, etc.)
 */
export const requireRegisteredSupplier = requireSupplierStatus([
  SupplierStatus.KYC_SUBMITTED,
  SupplierStatus.ACTIVE,
  SupplierStatus.NEEDS_FIX, // Can still view their profile
]);

/**
 * SEC-001: Middleware to extract supplier context without requiring specific status
 * Sets req.supplierId and req.supplierStatus for downstream use
 */
export async function loadSupplierContext(req: Request, res: Response, next: NextFunction): Promise<void> {
  const pool = getPool();
  if (!pool) {
    next();
    return;
  }

  const supplierId = getSupplierId(req);
  if (!supplierId) {
    next();
    return;
  }

  try {
    const result = await pool.query(
      'SELECT verification_status FROM supplier.suppliers WHERE id = $1::uuid',
      [supplierId]
    );

    if (result.rows.length > 0) {
      req.supplierId = supplierId;
      req.supplierStatus = result.rows[0].verification_status as SupplierStatusType;
    }

    next();
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error('[SEC-001] Failed to load supplier context:', error?.message);
    next();
  }
}

export default {
  requireSupplierStatus,
  requireActiveSupplier,
  requireRegisteredSupplier,
  loadSupplierContext,
};
