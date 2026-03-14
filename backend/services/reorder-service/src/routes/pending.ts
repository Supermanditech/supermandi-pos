// Pending Reorders Routes - V3.0.9 compliant
// Pending reorder management endpoints
// GL-CRIT-0003: Added authentication middleware

import { Router, Request, Response, NextFunction } from 'express';
import type { Router as RouterType } from 'express';
import { ApiError } from '@supermandi/common';
import { authenticate, requireStoreAccess } from '@supermandi/auth-service/exports';
import {
  getPendingById,
  listPending,
  approvePendingReorders,
  dismissPendingReorder,
} from '../services/pendingReorderService';
import { config } from '../config';

const router: RouterType = Router();

// =============================================================================
// PENDING REORDER ENDPOINTS
// =============================================================================

/**
 * GET /stores/:storeId/reorder/pending
 * List pending reorders for a store.
 * GL-CRIT-0003: Protected with authenticate + requireStoreAccess
 *
 * Query params:
 * - status: Filter by status (default: 'pending')
 * - limit: Items per page (default 50, max 200)
 * - offset: Pagination offset (default 0)
 */
router.get(
  '/stores/:storeId/reorder/pending',
  authenticate,
  requireStoreAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { storeId } = req.params;
      const status = (req.query.status as string) || 'pending';
      const limit = parseInt(req.query.limit as string) || config.reorder.defaultLimit;
      const offset = parseInt(req.query.offset as string) || 0;

      // Validate status
      const validStatuses = ['pending', 'approved', 'dismissed', 'expired'];
      if (!validStatuses.includes(status)) {
        throw new ApiError(
          400,
          'INVALID_STATUS',
          `Invalid status. Must be one of: ${validStatuses.join(', ')}`
        );
      }

      const result = await listPending(storeId, {
        status: status as 'pending' | 'approved' | 'dismissed' | 'expired',
        limit,
        offset,
      });

      res.json({
        success: true,
        data: result.pendingReorders,
        pagination: {
          limit,
          offset,
          total: result.total,
          hasMore: offset + result.pendingReorders.length < result.total,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /stores/:storeId/reorder/pending/:pendingId
 * Get a single pending reorder by ID.
 * GL-CRIT-0003: Protected with authenticate + requireStoreAccess
 */
router.get(
  '/stores/:storeId/reorder/pending/:pendingId',
  authenticate,
  requireStoreAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { storeId, pendingId } = req.params;

      const pending = await getPendingById(pendingId);

      if (!pending || pending.storeId !== storeId) {
        throw new ApiError(
          404,
          'PENDING_REORDER_NOT_FOUND',
          `Pending reorder ${pendingId} not found`
        );
      }

      res.json({
        success: true,
        data: pending,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /stores/:storeId/reorder/pending/approve
 * Approve selected pending reorders.
 * Creates draft POs grouped by supplier.
 * GL-CRIT-0003: Protected with authenticate + requireStoreAccess
 *
 * Body:
 * - ids: string[] - Array of pending reorder IDs to approve
 */
router.post(
  '/stores/:storeId/reorder/pending/approve',
  authenticate,
  requireStoreAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { storeId } = req.params;
      const { ids } = req.body;

      // Validate input
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        throw new ApiError(
          400,
          'INVALID_INPUT',
          'ids must be a non-empty array of pending reorder IDs'
        );
      }

      const result = await approvePendingReorders(storeId, ids);

      res.json({
        success: true,
        data: {
          approvedCount: result.approvedCount,
          draftPurchaseOrders: result.draftPurchaseOrders,
        },
        message: `Approved ${result.approvedCount} pending reorders. Created ${result.draftPurchaseOrders.length} draft purchase orders.`,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /stores/:storeId/reorder/pending/:pendingId/dismiss
 * Dismiss a pending reorder with a reason.
 * GL-CRIT-0003: Protected with authenticate + requireStoreAccess
 *
 * Body:
 * - reason: string - Reason for dismissing
 */
router.post(
  '/stores/:storeId/reorder/pending/:pendingId/dismiss',
  authenticate,
  requireStoreAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { storeId, pendingId } = req.params;
      const { reason } = req.body;

      // Validate reason
      if (!reason || typeof reason !== 'string') {
        throw new ApiError(400, 'INVALID_INPUT', 'reason is required');
      }

      // STG-443: Max length validation for dismissal reasons
      if (reason.trim().length > 500) {
        throw new ApiError(400, 'INVALID_INPUT', 'Dismissal reason must not exceed 500 characters');
      }

      const dismissed = await dismissPendingReorder(storeId, pendingId, reason);

      res.json({
        success: true,
        data: dismissed,
        message: 'Pending reorder dismissed successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
