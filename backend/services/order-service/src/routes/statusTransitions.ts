// Status Transition Routes - V3.0.9 compliant
// REST API endpoints for order status transitions

import { Router, Request, Response, NextFunction } from 'express';
import type { Router as RouterType } from 'express';
import { ApiError, ERROR_CODES } from '@supermandi/common';
import {
  authenticate,
  requireStoreAccess,
  requireActorType,
  getAuthUser,
} from '@supermandi/auth-service/exports';
import {
  submitOrder,
  cancelOrder,
  confirmOrder,
  shipOrder,
  TransitionActor,
} from '../services/statusService';
import { getOrderEvents, getPurchaseOrderByIdAndStore, getPurchaseOrderById } from '../db/queries';

const router: RouterType = Router();

// R6.CROSS.001: Apply authentication to all status transition routes (defense-in-depth)
// R7.CROSS.001: requireStoreAccess is applied per-route; confirm/ship also allow suppliers
router.use(authenticate);

// =============================================================================
// HELPER: Extract actor from request
// =============================================================================

function getActorFromRequest(req: Request): TransitionActor {
  const user = getAuthUser(req);
  return {
    actorId: user.actorId,
    actorType: user.actorType as TransitionActor['actorType'],
  };
}

// =============================================================================
// ROUTES
// =============================================================================

/**
 * POST /stores/:storeId/orders/:orderId/submit
 * Submit a draft order. Store-only action.
 * V3.0.9: Validates order has items before submission.
 */
router.post(
  '/stores/:storeId/orders/:orderId/submit',
  requireStoreAccess,
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
 * Cancel an order. Store-only action.
 * Can only cancel from draft, submitted, or confirmed status.
 */
router.post(
  '/stores/:storeId/orders/:orderId/cancel',
  requireStoreAccess,
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
 * Confirm a submitted order. Accessible by store, supplier, or platform.
 * R7.CROSS.001: Suppliers must own the order (supplierId match).
 */
router.post(
  '/stores/:storeId/orders/:orderId/confirm',
  requireActorType('store', 'supplier', 'platform'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { storeId, orderId } = req.params;
      const actor = getActorFromRequest(req);

      // R7.CROSS.001: For supplier actors, verify order supplierId matches
      const authUser = getAuthUser(req);
      if (authUser.actorType === 'supplier') {
        const order = await getPurchaseOrderById(orderId);
        if (!order || order.storeId !== storeId) {
          throw new ApiError(404, ERROR_CODES.NOT_FOUND, `Order not found: ${orderId}`);
        }
        if (order.supplierId !== authUser.actorId) {
          throw new ApiError(403, ERROR_CODES.FORBIDDEN, 'Supplier does not own this order');
        }
      }

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
 * Mark order as shipped. Accessible by store, supplier, or platform.
 * R7.CROSS.001: Suppliers must own the order (supplierId match).
 */
router.post(
  '/stores/:storeId/orders/:orderId/ship',
  requireActorType('store', 'supplier', 'platform'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { storeId, orderId } = req.params;
      const { trackingNumber, carrier } = req.body as {
        trackingNumber?: string;
        carrier?: string;
      };
      const actor = getActorFromRequest(req);

      // R7.CROSS.001: For supplier actors, verify order supplierId matches
      const authUser = getAuthUser(req);
      if (authUser.actorType === 'supplier') {
        const order = await getPurchaseOrderById(orderId);
        if (!order || order.storeId !== storeId) {
          throw new ApiError(404, ERROR_CODES.NOT_FOUND, `Order not found: ${orderId}`);
        }
        if (order.supplierId !== authUser.actorId) {
          throw new ApiError(403, ERROR_CODES.FORBIDDEN, 'Supplier does not own this order');
        }
      }

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
 * Get order event history. Accessible by store, supplier, or platform.
 */
router.get(
  '/stores/:storeId/orders/:orderId/events',
  requireActorType('store', 'supplier', 'platform'),
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
