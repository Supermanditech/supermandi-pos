// Mapping Routes - V3.0.9 compliant
// Product mapping endpoints: unmatched queue, manual map, unmap, auto-map
// GL-CRIT-0004: Added authentication middleware

import { Router, Request, Response, NextFunction } from 'express';
import type { Router as RouterType } from 'express';
import { ApiError, ERROR_CODES } from '@supermandi/common';
import { authenticate, requireStoreAccess } from '@supermandi/auth-service/exports';
import {
  getUnmatchedProducts,
  createMapping,
  deleteMapping,
  autoMapByBarcode,
  getMappingById,
  verifyMapping,
} from '../services/mappingService';

const router: RouterType = Router();

// =============================================================================
// REQUEST BODY TYPES
// =============================================================================

interface CreateMappingBody {
  supplierProductId: string;
  productId: string;
}

interface DeleteMappingBody {
  reason?: string;
}

// =============================================================================
// UNMATCHED PRODUCTS ENDPOINTS
// =============================================================================

/**
 * GET /stores/:storeId/catalog/unmatched
 * Get supplier products that haven't been mapped to master catalog products.
 * GL-CRIT-0004: Protected with authenticate + requireStoreAccess
 *
 * Query params:
 * - supplierId: Filter by supplier (optional)
 * - limit: Max results (default 50)
 * - offset: Pagination offset (default 0)
 */
router.get(
  '/stores/:storeId/catalog/unmatched',
  authenticate,
  requireStoreAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { storeId } = req.params;
      const supplierId = req.query.supplierId as string | undefined;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      const result = await getUnmatchedProducts({
        storeId,
        supplierId,
        limit,
        offset,
      });

      res.json({
        success: true,
        data: result.products,
        pagination: {
          total: result.total,
          limit: result.limit,
          offset: result.offset,
          hasMore: result.offset + result.products.length < result.total,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// =============================================================================
// MANUAL MAPPING ENDPOINTS
// =============================================================================

/**
 * POST /stores/:storeId/catalog/map
 * Create a manual product mapping.
 * GL-CRIT-0004: Protected with authenticate + requireStoreAccess
 *
 * Body:
 * - supplierProductId: The supplier product to map
 * - productId: The master catalog product to map to
 */
router.post(
  '/stores/:storeId/catalog/map',
  authenticate,
  requireStoreAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { storeId } = req.params;
      const body = req.body as CreateMappingBody;

      if (!body.supplierProductId) {
        throw new ApiError(
          400,
          ERROR_CODES.VALIDATION_ERROR,
          'supplierProductId is required'
        );
      }

      if (!body.productId) {
        throw new ApiError(
          400,
          ERROR_CODES.VALIDATION_ERROR,
          'productId is required'
        );
      }

      // Get user ID from request (if authenticated)
      const userId = (req as Request & { userId?: string }).userId;

      const result = await createMapping({
        storeId,
        supplierProductId: body.supplierProductId,
        productId: body.productId,
        userId,
        isAutoMap: false,
      });

      res.status(201).json({
        success: true,
        data: result.mapping,
        logId: result.logId,
        message: 'Product mapped successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /stores/:storeId/catalog/map/:mapId
 * Get a specific mapping by ID.
 * GL-CRIT-0004: Protected with authenticate + requireStoreAccess
 */
router.get(
  '/stores/:storeId/catalog/map/:mapId',
  authenticate,
  requireStoreAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { mapId } = req.params;

      const mapping = await getMappingById(mapId);

      if (!mapping) {
        throw new ApiError(404, ERROR_CODES.NOT_FOUND, 'Mapping not found');
      }

      res.json({
        success: true,
        data: mapping,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /stores/:storeId/catalog/map/:mapId
 * Delete a product mapping (unmap).
 * GL-CRIT-0004: Protected with authenticate + requireStoreAccess
 *
 * Body (optional):
 * - reason: Reason for unmapping
 */
router.delete(
  '/stores/:storeId/catalog/map/:mapId',
  authenticate,
  requireStoreAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { storeId, mapId } = req.params;
      const body = req.body as DeleteMappingBody;

      // Get user ID from request (if authenticated)
      const userId = (req as Request & { userId?: string }).userId;

      await deleteMapping({
        storeId,
        mapId,
        userId,
        reason: body.reason,
      });

      res.json({
        success: true,
        message: 'Mapping deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /stores/:storeId/catalog/map/:mapId/verify
 * Verify an auto-mapped product (mark as reviewed).
 * GL-CRIT-0004: Protected with authenticate + requireStoreAccess
 */
router.post(
  '/stores/:storeId/catalog/map/:mapId/verify',
  authenticate,
  requireStoreAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { storeId, mapId } = req.params;

      // Get user ID from request (if authenticated)
      const userId = (req as Request & { userId?: string }).userId;

      // FIX-005: Pass storeId for store ownership verification
      const mapping = await verifyMapping(mapId, userId, storeId);

      res.json({
        success: true,
        data: mapping,
        message: 'Mapping verified successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

// =============================================================================
// AUTO-MAPPING ENDPOINTS
// =============================================================================

/**
 * POST /stores/:storeId/catalog/auto-map
 * Trigger auto-mapping for unmatched products based on barcode.
 * GL-CRIT-0004: Protected with authenticate + requireStoreAccess
 *
 * Query params:
 * - supplierId: Only auto-map products from this supplier (optional)
 */
router.post(
  '/stores/:storeId/catalog/auto-map',
  authenticate,
  requireStoreAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { storeId } = req.params;
      const supplierId = req.query.supplierId as string | undefined;

      const result = await autoMapByBarcode(storeId, supplierId);

      res.json({
        success: true,
        data: {
          mapped: result.mapped,
          skipped: result.skipped,
          details: result.details,
        },
        message: `Auto-mapped ${result.mapped} products (${result.skipped} skipped)`,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
