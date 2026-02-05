// Internal Routes - V3.0.9 compliant
// Service-to-service endpoints (no auth required - trusted network)

import { Router, Request, Response, NextFunction } from 'express';
import { getStore, findStoreByCode } from '../services/storeService';
import { isFlagEnabled, getFlagsForStore, getFlagsForSupplier } from '../services/flagService';

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

interface StoreCodeParams {
  code: string;
}

interface SupplierIdParams {
  supplierId: string;
}

// =============================================================================
// INTERNAL STORE ROUTES
// =============================================================================

/**
 * GET /internal/stores/:storeId
 * Get store by ID (internal use)
 */
router.get(
  '/stores/:storeId',
  asyncHandler<StoreIdParams>(async (req: Request<StoreIdParams>, res: Response) => {
    const store = await getStore(req.params.storeId);
    res.json({ data: store });
  })
);

/**
 * GET /internal/stores/by-code/:code
 * Get store by code (internal use)
 */
router.get(
  '/stores/by-code/:code',
  asyncHandler<StoreCodeParams>(async (req: Request<StoreCodeParams>, res: Response) => {
    const store = await findStoreByCode(req.params.code);
    if (!store) {
      res.status(404).json({ error: { message: `Store not found: ${req.params.code}` } });
      return;
    }
    res.json({ data: store });
  })
);

// =============================================================================
// INTERNAL FLAG ROUTES
// =============================================================================

/**
 * GET /internal/flags/check
 * Check if a flag is enabled for a specific scope
 * Query params: flagKey, scopeType?, scopeId?
 */
router.get(
  '/flags/check',
  asyncHandler(async (req: Request, res: Response) => {
    const { flagKey, scopeType, scopeId } = req.query as {
      flagKey?: string;
      scopeType?: 'store' | 'supplier';
      scopeId?: string;
    };

    if (!flagKey) {
      res.status(400).json({ error: { message: 'flagKey query parameter is required' } });
      return;
    }

    const enabled = await isFlagEnabled(flagKey, scopeType, scopeId);
    res.json({ data: { flagKey, enabled } });
  })
);

/**
 * GET /internal/flags/store/:storeId
 * Get all resolved flags for a store (internal use)
 */
router.get(
  '/flags/store/:storeId',
  asyncHandler<StoreIdParams>(async (req: Request<StoreIdParams>, res: Response) => {
    const flags = await getFlagsForStore(req.params.storeId);
    res.json({ data: flags });
  })
);

/**
 * GET /internal/flags/supplier/:supplierId
 * Get all resolved flags for a supplier (internal use)
 */
router.get(
  '/flags/supplier/:supplierId',
  asyncHandler<SupplierIdParams>(async (req: Request<SupplierIdParams>, res: Response) => {
    const flags = await getFlagsForSupplier(req.params.supplierId);
    res.json({ data: flags });
  })
);

export default router;
