// GRN Receive Routes - V3.0.9 compliant
// REST API endpoints for goods receiving

import { Router, Request, Response, NextFunction } from 'express';
import type { Router as RouterType } from 'express';
import { ApiError, ERROR_CODES } from '@supermandi/common';
import {
  receiveGoods,
  getReceiveRecords,
  getReceiveRecordItems,
  ReceiveItemInput,
} from '../services/grnService';

const router: RouterType = Router();

// =============================================================================
// TYPES
// =============================================================================

interface ReceiveGoodsBody {
  items: Array<{
    orderItemId: string;
    quantityReceived: number;
    notes?: string;
  }>;
  notes?: string;
}

// =============================================================================
// ROUTES
// =============================================================================

/**
 * POST /stores/:storeId/orders/:orderId/receive
 * Receive goods for a purchase order (GRN).
 *
 * Critical Requirements:
 * - Calls inventory-service synchronously (NOT via events)
 * - Each partial receive needs NEW idempotency key
 * - If inventory-service fails, GRN fails (rollback)
 */
router.post(
  '/stores/:storeId/orders/:orderId/receive',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { storeId, orderId } = req.params;
      const body = req.body as ReceiveGoodsBody;

      // Validate items array
      if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
        throw new ApiError(
          400,
          ERROR_CODES.VALIDATION_ERROR,
          'items array is required and must not be empty'
        );
      }

      // Validate each item
      const validatedItems: ReceiveItemInput[] = [];
      for (const item of body.items) {
        if (!item.orderItemId) {
          throw new ApiError(
            400,
            ERROR_CODES.VALIDATION_ERROR,
            'Each item must have orderItemId'
          );
        }
        if (typeof item.quantityReceived !== 'number' || item.quantityReceived <= 0) {
          throw new ApiError(
            400,
            ERROR_CODES.VALIDATION_ERROR,
            'Each item must have quantityReceived > 0'
          );
        }
        validatedItems.push({
          orderItemId: item.orderItemId,
          quantityReceived: item.quantityReceived,
          notes: item.notes,
        });
      }

      // Get user ID and auth token from request
      const userId = (req as Request & { userId?: string }).userId;
      const authToken = req.headers.authorization;

      const result = await receiveGoods(
        {
          orderId,
          storeId,
          items: validatedItems,
          notes: body.notes,
          receivedByUserId: userId,
        },
        authToken
      );

      res.status(201).json({
        success: true,
        data: {
          receiveRecord: result.receiveRecord,
          order: {
            id: result.order.id,
            orderNumber: result.order.orderNumber,
            status: result.order.status,
          },
          itemsUpdated: result.updatedItems.map((item) => ({
            id: item.id,
            productName: item.productName,
            orderedQuantity: item.orderedQuantity,
            receivedQuantity: item.receivedQuantity,
            status: item.status,
          })),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /stores/:storeId/orders/:orderId/receives
 * Get receive history for an order.
 */
router.get(
  '/stores/:storeId/orders/:orderId/receives',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { orderId } = req.params;

      const records = await getReceiveRecords(orderId);

      res.json({
        success: true,
        data: records,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /stores/:storeId/orders/:orderId/receives/:receiveId
 * Get a specific receive record with items.
 */
router.get(
  '/stores/:storeId/orders/:orderId/receives/:receiveId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { orderId, receiveId } = req.params;

      const records = await getReceiveRecords(orderId);
      const record = records.find((r) => r.id === receiveId);

      if (!record) {
        throw new ApiError(
          404,
          ERROR_CODES.NOT_FOUND,
          `Receive record not found: ${receiveId}`
        );
      }

      const items = await getReceiveRecordItems(receiveId);

      res.json({
        success: true,
        data: {
          ...record,
          items,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
