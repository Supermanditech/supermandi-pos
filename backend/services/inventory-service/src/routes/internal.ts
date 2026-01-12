// Internal Routes - V3.0.9 compliant
// Service-to-service endpoints (no auth required - trusted network)

import { Router, Request, Response, NextFunction } from 'express';
import {
  getStock,
  getStockForMultipleProducts,
  listStoreInventory,
  getReferenceLedgerHistory,
  ReferenceType,
} from '../services/ledgerService.js';
import { getCurrentStock } from '../db/queries.js';

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

interface StoreProductParams {
  storeId: string;
  productId: string;
}

// =============================================================================
// INTERNAL STOCK LOOKUP
// =============================================================================

/**
 * GET /internal/stock/:storeId/:productId
 * Get current stock for a single product (internal use)
 */
router.get(
  '/stock/:storeId/:productId',
  asyncHandler<StoreProductParams>(async (req: Request<StoreProductParams>, res: Response) => {
    const stock = await getStock(req.params.storeId, req.params.productId);
    res.json({ data: stock });
  })
);

/**
 * GET /internal/stock/:storeId
 * Get current stock quantity only (shortcut for internal services)
 * Query params: productId (required)
 */
router.get(
  '/stock/:storeId',
  asyncHandler<StoreIdParams>(async (req: Request<StoreIdParams>, res: Response) => {
    const productId = req.query.productId as string;
    if (!productId) {
      res.status(400).json({ error: { message: 'productId query parameter required' } });
      return;
    }
    const qty = await getCurrentStock(req.params.storeId, productId);
    res.json({ data: { currentQty: qty } });
  })
);

/**
 * POST /internal/stock/:storeId/batch
 * Get stock for multiple products at once
 * Body: { productIds: string[] }
 */
router.post(
  '/stock/:storeId/batch',
  asyncHandler<StoreIdParams>(async (req: Request<StoreIdParams>, res: Response) => {
    const { productIds } = req.body as { productIds?: string[] };
    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      res.status(400).json({ error: { message: 'productIds array required in body' } });
      return;
    }
    const stocks = await getStockForMultipleProducts(req.params.storeId, productIds);
    res.json({ data: stocks });
  })
);

/**
 * GET /internal/inventory/:storeId
 * Get all stock balances for a store (internal use)
 */
router.get(
  '/inventory/:storeId',
  asyncHandler<StoreIdParams>(async (req: Request<StoreIdParams>, res: Response) => {
    const balances = await listStoreInventory(req.params.storeId);
    res.json({ data: balances });
  })
);

// =============================================================================
// INTERNAL LEDGER LOOKUP
// =============================================================================

/**
 * GET /internal/ledger/reference/:referenceType/:referenceId
 * Get all ledger entries for a specific reference (e.g., all entries for a PO)
 */
router.get(
  '/ledger/reference/:referenceType/:referenceId',
  asyncHandler(async (req: Request, res: Response) => {
    const referenceType = req.params.referenceType as ReferenceType;
    const { referenceId } = req.params;

    const validTypes: ReferenceType[] = ['sale', 'po', 'return', 'manual'];
    if (!validTypes.includes(referenceType)) {
      res.status(400).json({
        error: { message: `Invalid referenceType. Must be one of: ${validTypes.join(', ')}` },
      });
      return;
    }

    const entries = await getReferenceLedgerHistory(referenceType, referenceId);
    res.json({ data: entries });
  })
);

export default router;
