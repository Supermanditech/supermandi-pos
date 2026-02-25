// Store Routes - V3.0.9 compliant
// Public store endpoints

import { Router, Request, Response, NextFunction } from 'express';
import { ApiError } from '@supermandi/common';
import {
  listStores,
  getStore,
  createNewStore,
  updateExistingStore,
  removeStore,
  CreateStoreInput,
  UpdateStoreInput,
} from '../services/storeService';
import { getFlagsForStore } from '../services/flagService';

const router: Router = Router();

// R7.BE.011: Enforce service-level authentication and platform actor authorization.
function requirePlatformAdmin(req: Request, _res: Response, next: NextFunction): void {
  const userId = req.headers['x-user-id'] as string | undefined;
  const actorType = req.headers['x-actor-type'] as string | undefined;

  if (!userId || !actorType) {
    next(ApiError.unauthorized('Authentication required'));
    return;
  }

  if (actorType !== 'platform') {
    next(ApiError.forbidden('Platform actor required'));
    return;
  }

  next();
}

router.use(requirePlatformAdmin);

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
// STORE ROUTES
// =============================================================================

/**
 * GET /stores
 * List all stores
 */
router.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const stores = await listStores();
    res.json({ data: stores });
  })
);

/**
 * GET /stores/:storeId
 * Get store by ID
 */
router.get(
  '/:storeId',
  asyncHandler<StoreIdParams>(async (req: Request<StoreIdParams>, res: Response) => {
    const store = await getStore(req.params.storeId);
    res.json({ data: store });
  })
);

/**
 * GET /stores/:storeId/flags
 * Get resolved feature flags for a store (global + store overrides)
 */
router.get(
  '/:storeId/flags',
  asyncHandler<StoreIdParams>(async (req: Request<StoreIdParams>, res: Response) => {
    const flags = await getFlagsForStore(req.params.storeId);
    res.json({ data: flags });
  })
);

/**
 * POST /stores
 * Create a new store (requires SUPERADMIN - enforced by gateway)
 */
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const input = req.body as CreateStoreInput;
    const store = await createNewStore(input);
    res.status(201).json({ data: store });
  })
);

/**
 * PUT /stores/:storeId
 * Update store (requires SUPERADMIN - enforced by gateway)
 */
router.put(
  '/:storeId',
  asyncHandler<StoreIdParams>(async (req: Request<StoreIdParams>, res: Response) => {
    const input = req.body as UpdateStoreInput;
    const store = await updateExistingStore(req.params.storeId, input);
    res.json({ data: store });
  })
);

/**
 * DELETE /stores/:storeId
 * Delete store (requires SUPERADMIN - enforced by gateway)
 */
router.delete(
  '/:storeId',
  asyncHandler<StoreIdParams>(async (req: Request<StoreIdParams>, res: Response) => {
    await removeStore(req.params.storeId);
    res.json({ message: 'Store deleted successfully' });
  })
);

export default router;
