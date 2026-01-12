// Flag Routes - V3.0.9 compliant
// Admin feature flag management endpoints

import { Router, Request, Response, NextFunction } from 'express';
import {
  listAllFlags,
  getFlag,
  setFlag,
  updateExistingFlag,
  removeFlag,
  CreateFlagInput,
  UpdateFlagInput,
} from '../services/flagService.js';

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

interface FlagIdParams {
  flagId: string;
}

// =============================================================================
// ADMIN FLAG ROUTES (SUPERADMIN only - enforced by gateway)
// =============================================================================

/**
 * GET /admin/flags
 * List all feature flags (all scopes)
 */
router.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const flags = await listAllFlags();
    res.json({ data: flags });
  })
);

/**
 * GET /admin/flags/:flagId
 * Get flag by ID
 */
router.get(
  '/:flagId',
  asyncHandler<FlagIdParams>(async (req: Request<FlagIdParams>, res: Response) => {
    const flag = await getFlag(req.params.flagId);
    res.json({ data: flag });
  })
);

/**
 * PUT /admin/flags
 * Set (upsert) a feature flag
 * Creates if not exists, updates if exists
 */
router.put(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const input = req.body as CreateFlagInput;
    const flag = await setFlag(input);
    res.json({ data: flag });
  })
);

/**
 * PATCH /admin/flags/:flagId
 * Update existing flag (enabled, payload, description)
 */
router.patch(
  '/:flagId',
  asyncHandler<FlagIdParams>(async (req: Request<FlagIdParams>, res: Response) => {
    const input = req.body as UpdateFlagInput;
    const flag = await updateExistingFlag(req.params.flagId, input);
    res.json({ data: flag });
  })
);

/**
 * DELETE /admin/flags/:flagId
 * Delete a feature flag
 */
router.delete(
  '/:flagId',
  asyncHandler<FlagIdParams>(async (req: Request<FlagIdParams>, res: Response) => {
    await removeFlag(req.params.flagId);
    res.json({ message: 'Feature flag deleted successfully' });
  })
);

export default router;
