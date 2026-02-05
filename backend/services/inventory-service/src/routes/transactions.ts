// Transaction Routes - V3.0.9 compliant
// Inventory transaction endpoints with event outbox integration

import { Router, Request, Response, NextFunction } from 'express';
import {
  createTransaction,
  adjustStock,
  CreateTransactionInput,
  AdjustmentInput,
  TransactionType,
  ReferenceType,
} from '../services/transactionService';

const router: Router = Router();

// =============================================================================
// ASYNC HANDLER
// =============================================================================

type AsyncHandler<P = Record<string, string>> = (
  req: Request<P>,
  res: Response,
  next: NextFunction
) => Promise<void>;

function asyncHandler<P = Record<string, string>>(fn: AsyncHandler<P>): AsyncHandler<P> {
  return async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

// =============================================================================
// ROUTE PARAMS
// =============================================================================

interface StoreIdParams {
  storeId: string;
}

// =============================================================================
// REQUEST BODY TYPES
// =============================================================================

interface TransactionRequestBody {
  items: Array<{
    productId: string;
    quantity: number;
    unitCost?: number;
  }>;
  transactionType: TransactionType;
  referenceType?: ReferenceType;
  referenceId?: string;
  referenceSubId?: string;
  notes?: string;
}

interface AdjustmentRequestBody {
  productId: string;
  quantity: number; // Positive to add, negative to remove
  reason: string;
}

// =============================================================================
// TRANSACTION ROUTES
// =============================================================================

/**
 * POST /stores/:storeId/inventory/transactions
 * Create an inventory transaction (sale, sale_return, purchase_received)
 *
 * Request body:
 * {
 *   items: [{ productId, quantity, unitCost? }],
 *   transactionType: 'sale' | 'sale_return' | 'purchase_received' | 'adjustment',
 *   referenceType?: 'sale' | 'po' | 'return' | 'manual',
 *   referenceId?: string,
 *   referenceSubId?: string,
 *   notes?: string
 * }
 *
 * Sign application:
 * - sale: -quantity (decrease stock)
 * - sale_return: +quantity (increase stock)
 * - purchase_received: +quantity (increase stock)
 * - adjustment: +quantity (for batch increase)
 */
router.post(
  '/:storeId/inventory/transactions',
  asyncHandler<StoreIdParams>(async (req: Request<StoreIdParams>, res: Response) => {
    const body = req.body as TransactionRequestBody;
    const userId = req.headers['x-user-id'] as string | undefined;

    const input: CreateTransactionInput = {
      storeId: req.params.storeId,
      items: body.items,
      transactionType: body.transactionType,
      referenceType: body.referenceType,
      referenceId: body.referenceId,
      referenceSubId: body.referenceSubId,
      userId,
      notes: body.notes,
    };

    const result = await createTransaction(input);

    res.status(201).json({
      data: {
        ledgerEntries: result.ledgerEntries,
        eventId: result.eventId,
        summary: {
          transactionType: body.transactionType,
          itemCount: result.ledgerEntries.length,
          totalDeltaQty: result.ledgerEntries.reduce((sum, e) => sum + e.deltaQty, 0),
        },
      },
    });
  })
);

/**
 * POST /stores/:storeId/inventory/adjust
 * Adjust stock for a single product (manual correction)
 *
 * Request body:
 * {
 *   productId: string,
 *   quantity: number, // Positive to add, negative to remove
 *   reason: string    // Required explanation
 * }
 */
router.post(
  '/:storeId/inventory/adjust',
  asyncHandler<StoreIdParams>(async (req: Request<StoreIdParams>, res: Response) => {
    const body = req.body as AdjustmentRequestBody;
    const userId = req.headers['x-user-id'] as string | undefined;

    const input: AdjustmentInput = {
      storeId: req.params.storeId,
      productId: body.productId,
      quantity: body.quantity,
      reason: body.reason,
      userId,
    };

    const result = await adjustStock(input);
    const entry = result.ledgerEntries[0];

    res.status(201).json({
      data: {
        ledgerEntry: entry,
        eventId: result.eventId,
        summary: {
          productId: entry.productId,
          stockBefore: entry.stockBefore,
          stockAfter: entry.stockAfter,
          adjustment: entry.deltaQty,
        },
      },
    });
  })
);

export default router;
