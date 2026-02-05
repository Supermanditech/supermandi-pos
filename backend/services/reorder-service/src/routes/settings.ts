// Settings Routes - V3.0.9 compliant
// Store-level reorder settings endpoints

import { Router, Request, Response, NextFunction } from 'express';
import type { Router as RouterType } from 'express';
import { ApiError } from '@supermandi/common';
import { authenticate, requireStoreAccess } from '@supermandi/auth-service/exports';
import {
  getSettings,
  getOrCreateSettings,
  updateSettings,
} from '../services/settingsService';

const router: RouterType = Router();

// AUTH-CONCURRENT-002: Apply authentication + store ownership validation to all settings routes
router.use(authenticate);
router.use(requireStoreAccess);

// =============================================================================
// SETTINGS ENDPOINTS
// =============================================================================

/**
 * GET /stores/:storeId/settings
 * Get reorder settings for a store.
 * Returns 404 if settings don't exist.
 */
// Alias route for POS compatibility: /stores/:storeId/reorder/settings
router.get(
  '/stores/:storeId/reorder/settings',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { storeId } = req.params;
      const settings = await getOrCreateSettings(storeId);
      res.json({ success: true, data: settings });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/stores/:storeId/settings',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { storeId } = req.params;

      const settings = await getSettings(storeId);

      if (!settings) {
        throw new ApiError(
          404,
          'SETTINGS_NOT_FOUND',
          `Settings not found for store ${storeId}`
        );
      }

      res.json({
        success: true,
        data: settings,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /stores/:storeId/settings/init
 * Get or create reorder settings for a store.
 * Creates defaults if settings don't exist.
 */
router.get(
  '/stores/:storeId/settings/init',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { storeId } = req.params;

      const settings = await getOrCreateSettings(storeId);

      res.json({
        success: true,
        data: settings,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /stores/:storeId/settings
 * Update reorder settings for a store.
 * Creates settings if they don't exist.
 *
 * Body:
 * - reorderEnabled: boolean (optional)
 * - requireApproval: boolean (optional)
 * - notifyOnLowStock: boolean (optional)
 */
router.put(
  '/stores/:storeId/settings',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { storeId } = req.params;
      const { reorderEnabled, requireApproval, notifyOnLowStock } = req.body;

      const settings = await updateSettings(storeId, {
        reorderEnabled,
        requireApproval,
        notifyOnLowStock,
      });

      res.json({
        success: true,
        data: settings,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
