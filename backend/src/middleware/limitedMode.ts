// REG-AUTH-204: Limited Mode Middleware
// Enforces status-based access control for registration-first authentication
//
// LIMITED MODE = Application exists but status ≠ ACTIVE
//
// Users in LIMITED MODE can:
// ✅ View dashboard, Edit profile, Upload documents, View products
//
// Users in LIMITED MODE cannot:
// ❌ SELL, Create invoices, Accept payments, BUY/Reorder, Financial reports

import { Request, Response, NextFunction } from "express";
import { REG_AUTH_ERRORS } from "./registrationGuard";
import type { StoreStatusType } from "../services/storeStateMachine";

// Extended request interface with status fields
// Note: storeStatus is already declared globally in storeStatusGate.ts as StoreStatusType
export interface StatusAwareRequest extends Request {
  applicationStatus?: string;
  // storeStatus inherited from global Express.Request (StoreStatusType)
  userId?: string;
  storeId?: string;
}

// Actions that are ALLOWED in limited mode
const LIMITED_MODE_ALLOWED_ACTIONS = [
  'VIEW_DASHBOARD',
  'EDIT_PROFILE',
  'UPLOAD_DOCUMENTS',
  'VIEW_PRODUCTS',
  'VIEW_INVENTORY',
  'SYNC_DATA',
];

// Actions that are BLOCKED in limited mode
const LIMITED_MODE_BLOCKED_ACTIONS = [
  'SELL',
  'CREATE_INVOICE',
  'ACCEPT_PAYMENT',
  'REORDER',
  'BUY',
  'FINANCIAL_REPORTS',
  'GST_COMPLIANCE',
];

// Valid ACTIVE status values
const ACTIVE_STATUSES = ['ACTIVE', 'active'];

/**
 * Middleware: requireActiveStatus
 *
 * REG-AUTH-204: Blocks requests for users who are not in ACTIVE status.
 * Use this middleware on routes that should only be accessible to fully approved users.
 *
 * Expects status to be available from:
 * - req.applicationStatus (from JWT or previous middleware)
 * - req.storeStatus (from store lookup)
 *
 * Usage:
 * router.post("/sales/create", requireActiveStatus, async (req, res) => { ... });
 *
 * @param options - Optional configuration
 * @param options.allowedStatuses - Array of allowed statuses (default: ['ACTIVE'])
 * @param options.action - The action being performed (for error message)
 */
export function requireActiveStatus(options?: {
  allowedStatuses?: string[];
  action?: string;
}) {
  const allowedStatuses = options?.allowedStatuses || ACTIVE_STATUSES;
  const actionName = options?.action || 'perform this action';

  return (req: StatusAwareRequest, res: Response, next: NextFunction): void => {
    // Get status from request context (set by auth middleware)
    const status = req.applicationStatus || req.storeStatus;

    // If no status found, user needs to register
    if (!status) {
      const error = REG_AUTH_ERRORS.REGISTRATION_REQUIRED;
      res.status(error.status).json({
        error: {
          code: error.code,
          message: error.message,
          errorCode: error.errorCode,
        }
      });
      return;
    }

    // Check if status is allowed
    if (!allowedStatuses.some(s => s.toLowerCase() === status.toLowerCase())) {
      const error = REG_AUTH_ERRORS.LIMITED_MODE;
      res.status(error.status).json({
        error: {
          code: error.code,
          message: `Your account is pending approval. Cannot ${actionName} in limited mode.`,
          errorCode: error.errorCode,
          currentStatus: status,
          allowedActions: LIMITED_MODE_ALLOWED_ACTIONS,
          blockedActions: LIMITED_MODE_BLOCKED_ACTIONS,
        }
      });
      return;
    }

    next();
  };
}

/**
 * Convenience middleware: requireActiveForSell
 * Pre-configured for SELL operations
 */
export const requireActiveForSell = requireActiveStatus({
  action: 'create sales',
});

/**
 * Convenience middleware: requireActiveForPayments
 * Pre-configured for payment operations
 */
export const requireActiveForPayments = requireActiveStatus({
  action: 'accept payments',
});

/**
 * Convenience middleware: requireActiveForReorder
 * Pre-configured for reorder/BUY operations
 */
export const requireActiveForReorder = requireActiveStatus({
  action: 'place reorders',
});

/**
 * Convenience middleware: requireActiveForCompliance
 * Pre-configured for compliance/GST operations
 */
export const requireActiveForCompliance = requireActiveStatus({
  action: 'access compliance features',
});

/**
 * Helper: isLimitedMode
 *
 * Check if a status indicates LIMITED MODE
 */
export function isLimitedMode(status: string | undefined): boolean {
  if (!status) return false;
  return !ACTIVE_STATUSES.some(s => s.toLowerCase() === status.toLowerCase());
}

/**
 * Helper: getLimitedModeInfo
 *
 * Get information about LIMITED MODE restrictions
 */
export function getLimitedModeInfo(status: string) {
  return {
    isLimited: isLimitedMode(status),
    currentStatus: status,
    allowedActions: LIMITED_MODE_ALLOWED_ACTIONS,
    blockedActions: LIMITED_MODE_BLOCKED_ACTIONS,
    message: status === 'ACTIVE'
      ? 'Full access granted'
      : `Account status: ${status}. Some features are restricted until approval.`,
  };
}

/**
 * Middleware: setStatusFromStore
 *
 * Sets req.storeStatus from the store lookup result.
 * Use after store authentication middleware.
 */
export function setStatusFromStore(req: StatusAwareRequest, res: Response, next: NextFunction): void {
  // Status should be set by auth/gateway middleware
  // This is a fallback that checks if storeStatus needs to be derived
  if (!req.storeStatus && req.storeId) {
    // If storeId exists but no status, assume ACTIVE (legacy stores)
    req.storeStatus = 'ACTIVE';
  }
  next();
}

/**
 * Middleware factory: conditionalActiveStatus
 *
 * Conditionally apply status check based on request data.
 * Useful for routes that have both read and write operations.
 *
 * @param shouldCheck - Function that returns true if status check should apply
 */
export function conditionalActiveStatus(
  shouldCheck: (req: StatusAwareRequest) => boolean,
  options?: Parameters<typeof requireActiveStatus>[0]
) {
  const statusMiddleware = requireActiveStatus(options);

  return (req: StatusAwareRequest, res: Response, next: NextFunction): void => {
    if (shouldCheck(req)) {
      return statusMiddleware(req, res, next);
    }
    next();
  };
}

export default {
  requireActiveStatus,
  requireActiveForSell,
  requireActiveForPayments,
  requireActiveForReorder,
  requireActiveForCompliance,
  isLimitedMode,
  getLimitedModeInfo,
  setStatusFromStore,
  conditionalActiveStatus,
  LIMITED_MODE_ALLOWED_ACTIONS,
  LIMITED_MODE_BLOCKED_ACTIONS,
};
