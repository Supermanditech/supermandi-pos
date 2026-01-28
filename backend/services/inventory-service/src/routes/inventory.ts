// Inventory Routes - V3.0.9 compliant
// GL-CRIT-0005: Protected inventory endpoints (no longer public)

import { Router, Request, Response, NextFunction } from 'express';
import {
  getStock,
  listStoreInventory,
  listLowStockProducts,
  getProductLedgerHistory,
  getStoreRecentActivity,
} from '../services/ledgerService.js';
import { authenticate, requireStoreAccess } from '@supermandi/auth-service/exports';

const router: Router = Router();

// GL-CRIT-0005: Apply authentication to all inventory routes
router.use(authenticate);
router.use(requireStoreAccess);

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
// INVENTORY ROUTES
// =============================================================================

/**
 * GET /stores/:storeId/inventory
 * Get all stock balances for a store
 */
router.get(
  '/:storeId/inventory',
  asyncHandler<StoreIdParams>(async (req: Request<StoreIdParams>, res: Response) => {
    const balances = await listStoreInventory(req.params.storeId);
    res.json({ data: balances });
  })
);

/**
 * GET /stores/:storeId/inventory/low-stock
 * Get products with stock below threshold
 * Query params: threshold (default: 10)
 */
router.get(
  '/:storeId/inventory/low-stock',
  asyncHandler<StoreIdParams>(async (req: Request<StoreIdParams>, res: Response) => {
    const threshold = parseInt(req.query.threshold as string, 10) || 10;
    const balances = await listLowStockProducts(req.params.storeId, threshold);
    res.json({ data: balances });
  })
);

/**
 * GET /stores/:storeId/inventory/recent
 * Get recent inventory activity for a store
 * Query params: limit (default: 100)
 */
router.get(
  '/:storeId/inventory/recent',
  asyncHandler<StoreIdParams>(async (req: Request<StoreIdParams>, res: Response) => {
    const limit = parseInt(req.query.limit as string, 10) || 100;
    const entries = await getStoreRecentActivity(req.params.storeId, limit);
    res.json({ data: entries });
  })
);

/**
 * GET /stores/:storeId/inventory/:productId
 * Get current stock for a specific product
 */
router.get(
  '/:storeId/inventory/:productId',
  asyncHandler<StoreProductParams>(async (req: Request<StoreProductParams>, res: Response) => {
    const stock = await getStock(req.params.storeId, req.params.productId);
    res.json({ data: stock });
  })
);

/**
 * GET /stores/:storeId/inventory/:productId/history
 * Get ledger history for a specific product
 * Query params: limit (default: 50)
 */
router.get(
  '/:storeId/inventory/:productId/history',
  asyncHandler<StoreProductParams>(async (req: Request<StoreProductParams>, res: Response) => {
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const entries = await getProductLedgerHistory(
      req.params.storeId,
      req.params.productId,
      limit
    );
    res.json({ data: entries });
  })
);

export default router;
