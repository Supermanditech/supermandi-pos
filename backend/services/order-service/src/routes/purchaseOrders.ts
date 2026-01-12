// Purchase Order Routes - V3.0.9 compliant
// REST API endpoints for purchase order management

import { Router, Request, Response, NextFunction } from 'express';
import type { Router as RouterType } from 'express';
import { ApiError, ERROR_CODES } from '@supermandi/common';
import {
  createPurchaseOrderFromCart,
  createPurchaseOrderFromReorders,
  getPurchaseOrderWithItems,
  listStoreOrders,
  parseStatusFilter,
  CartItem,
} from '../services/purchaseOrderService.js';

const router: RouterType = Router();

// =============================================================================
// TYPES
// =============================================================================

interface CreateOrderBody {
  supplierId: string;
  orderType: 'manual' | 'reorder';
  items?: CartItem[];
  reorderIds?: string[];
  storeNotes?: string;
  deliveryAddress?: string;
  expectedDeliveryDate?: string;
}

interface ListOrdersQuery {
  status?: string;
  supplierId?: string;
  fromDate?: string;
  toDate?: string;
  page?: string;
  limit?: string;
}

// =============================================================================
// ROUTES
// =============================================================================

/**
 * POST /stores/:storeId/orders
 * Create a new purchase order (manual or from reorders)
 */
router.post(
  '/stores/:storeId/orders',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { storeId } = req.params;
      const body = req.body as CreateOrderBody;

      // Validate required fields
      if (!body.supplierId) {
        throw new ApiError(
          400,
          ERROR_CODES.VALIDATION_ERROR,
          'supplierId is required'
        );
      }

      if (!body.orderType || !['manual', 'reorder'].includes(body.orderType)) {
        throw new ApiError(
          400,
          ERROR_CODES.VALIDATION_ERROR,
          'orderType must be "manual" or "reorder"'
        );
      }

      // Get user ID from auth context (if available)
      const createdByUserId = (req as Request & { userId?: string }).userId;

      let order;

      if (body.orderType === 'manual') {
        // Validate items for manual order
        if (!body.items || body.items.length === 0) {
          throw new ApiError(
            400,
            ERROR_CODES.VALIDATION_ERROR,
            'items array is required for manual orders'
          );
        }

        // Validate each item
        for (const item of body.items) {
          if (!item.supplierProductId || typeof item.quantity !== 'number' || item.quantity <= 0) {
            throw new ApiError(
              400,
              ERROR_CODES.VALIDATION_ERROR,
              'Each item must have supplierProductId and quantity > 0'
            );
          }
        }

        order = await createPurchaseOrderFromCart({
          storeId,
          supplierId: body.supplierId,
          items: body.items,
          storeNotes: body.storeNotes,
          deliveryAddress: body.deliveryAddress,
          expectedDeliveryDate: body.expectedDeliveryDate,
          createdByUserId,
        });
      } else {
        // Validate reorderIds for reorder type
        if (!body.reorderIds || body.reorderIds.length === 0) {
          throw new ApiError(
            400,
            ERROR_CODES.VALIDATION_ERROR,
            'reorderIds array is required for reorder type'
          );
        }

        order = await createPurchaseOrderFromReorders({
          storeId,
          supplierId: body.supplierId,
          reorderIds: body.reorderIds,
          storeNotes: body.storeNotes,
          deliveryAddress: body.deliveryAddress,
          expectedDeliveryDate: body.expectedDeliveryDate,
          createdByUserId,
        });
      }

      res.status(201).json({
        success: true,
        data: order,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /stores/:storeId/orders
 * List purchase orders with filters.
 * V3.0.9: Supports multi-status filter via comma-separated values.
 *
 * Query params:
 * - status: Comma-separated list (e.g., "draft,submitted,confirmed")
 * - supplierId: Filter by supplier
 * - fromDate: ISO date string
 * - toDate: ISO date string
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20, max: 100)
 */
router.get(
  '/stores/:storeId/orders',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { storeId } = req.params;
      const query = req.query as ListOrdersQuery;

      const result = await listStoreOrders(storeId, {
        statuses: parseStatusFilter(query.status),
        supplierId: query.supplierId,
        fromDate: query.fromDate,
        toDate: query.toDate,
        page: query.page ? parseInt(query.page, 10) : undefined,
        limit: query.limit ? parseInt(query.limit, 10) : undefined,
      });

      res.json({
        success: true,
        data: result.items,
        pagination: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: Math.ceil(result.total / result.limit),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /stores/:storeId/orders/:orderId
 * Get a purchase order with its items.
 */
router.get(
  '/stores/:storeId/orders/:orderId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { storeId, orderId } = req.params;

      const order = await getPurchaseOrderWithItems(orderId, storeId);

      if (!order) {
        throw new ApiError(
          404,
          ERROR_CODES.NOT_FOUND,
          `Order not found: ${orderId}`
        );
      }

      res.json({
        success: true,
        data: order,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
