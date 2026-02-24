// Status Transition Routes - V3.0.9 compliant
// REST API endpoints for order status transitions

import { Router, Request, Response, NextFunction } from 'express';
import type { Router as RouterType } from 'express';
import { ApiError, ERROR_CODES } from '@supermandi/common';
import { authenticate, requireStoreAccess } from '@supermandi/auth-service/exports';
import {
  submitOrder,
  cancelOrder,
  confirmOrder,
  shipOrder,
  TransitionActor,
} from '../services/statusService';
import { getOrderEvents, getPurchaseOrderByIdAndStore } from '../db/queries';

const router: RouterType = Router();

// R6.CROSS.001: Apply authentication to all status transition routes (defense-in-depth)
router.use(authenticate);
router.use(requireStoreAccess);

// =============================================================================
// HELPER: Extract actor from request
// =============================================================================

function getActorFromRequest(req: Request): TransitionActor {
  const userId = (req as Request & { userId?: string }).userId;
  const userRole = (req as Request & { userRole?: string }).userRole;

  return {
    actorId: userId,
    actorType: userId ? 'user' : 'system',
  };
}

// =============================================================================
// ROUTES
// =============================================================================

/**
 * POST /stores/:storeId/orders/:orderId/submit
 * Submit a draft order.
 * V3.0.9: Validates order has items before submission.
 */
router.post(
  '/stores/:storeId/orders/:orderId/submit',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { storeId, orderId } = req.params;
      const actor = getActorFromRequest(req);

      const result = await submitOrder(orderId, storeId, actor);

      res.json({
        success: true,
        data: result.order,
        transition: {
          from: result.previousStatus,
          to: result.newStatus,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /stores/:storeId/orders/:orderId/cancel
 * Cancel an order.
 * Can only cancel from draft, submitted, or confirmed status.
 */
router.post(
  '/stores/:storeId/orders/:orderId/cancel',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { storeId, orderId } = req.params;
      const { reason } = req.body as { reason?: string };
      const actor = getActorFromRequest(req);

      const result = await cancelOrder(orderId, storeId, actor, reason);

      res.json({
        success: true,
        data: result.order,
        transition: {
          from: result.previousStatus,
          to: result.newStatus,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /stores/:storeId/orders/:orderId/confirm
 * Confirm a submitted order.
 */
router.post(
  '/stores/:storeId/orders/:orderId/confirm',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { storeId, orderId } = req.params;
      const actor = getActorFromRequest(req);

      const result = await confirmOrder(orderId, storeId, actor);

      res.json({
        success: true,
        data: result.order,
        transition: {
          from: result.previousStatus,
          to: result.newStatus,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /stores/:storeId/orders/:orderId/ship
 * Mark order as shipped.
 */
router.post(
  '/stores/:storeId/orders/:orderId/ship',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { storeId, orderId } = req.params;
      const { trackingNumber, carrier } = req.body as {
        trackingNumber?: string;
        carrier?: string;
      };
      const actor = getActorFromRequest(req);

      const result = await shipOrder(orderId, storeId, actor, {
        trackingNumber,
        carrier,
      });

      res.json({
        success: true,
        data: result.order,
        transition: {
          from: result.previousStatus,
          to: result.newStatus,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /stores/:storeId/orders/:orderId/events
 * Get order event history.
 */
router.get(
  '/stores/:storeId/orders/:orderId/events',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { storeId, orderId } = req.params;

      // R6.CROSS.009: Enforce store isolation — verify order belongs to this store
      const order = await getPurchaseOrderByIdAndStore(orderId, storeId);
      if (!order) {
        throw new ApiError(404, ERROR_CODES.NOT_FOUND, `Order not found: ${orderId}`);
      }

      const events = await getOrderEvents(orderId);

      res.json({
        success: true,
        data: events,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
