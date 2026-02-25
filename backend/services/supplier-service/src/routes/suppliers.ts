// Supplier Routes - V3.0.9 compliant
// REST API endpoints for supplier operations
// GL-CRIT-0002: Added authentication middleware

import { Router, Request, Response, NextFunction } from 'express';
import type { Router as RouterType } from 'express';
import { ApiError, ERROR_CODES } from '@supermandi/common';
import { authenticate, requireStoreAccess, getAuthUser } from '@supermandi/auth-service/exports';
import {
  searchSuppliersService,
  getStoreSuppliers,
  linkSupplierToStore,
  updateSupplierLinkService,
  unlinkSupplierService,
  reactivateSupplierLinkService,
  requestNewSupplier,
  getStoreSupplierRequests,
  validateGstinService,
} from '../services/supplierService';

const router: RouterType = Router();

// =============================================================================
// TYPES
// =============================================================================

interface LinkSupplierBody {
  supplierId: string;
  creditDays?: number;
  minOrderValue?: number;
  expectedDeliveryDays?: number;
  priority?: number;
  isPreferred?: boolean;
}

interface RequestSupplierBody {
  gstin?: string;
  name?: string;
  phone?: string;
  email?: string;
}

interface UpdateSupplierLinkBody {
  creditDays?: number;
  minOrderValue?: number;
  expectedDeliveryDays?: number;
  priority?: number;
  isPreferred?: boolean;
}

interface UnlinkSupplierBody {
  reason?: string;
}

// =============================================================================
// GLOBAL SUPPLIER ENDPOINTS
// =============================================================================

/**
 * GET /suppliers/search
 * Search suppliers globally by GSTIN or business name.
 * GL-CRIT-0002: Protected with authenticate
 *
 * Query params:
 * - q: Search query (required, min 2 chars)
 * - limit: Max results (default 20)
 * - offset: Pagination offset (default 0)
 * - status: Filter by status (default 'active')
 */
router.get(
  '/suppliers/search',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const q = req.query.q as string;
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;
      const status = (req.query.status as string) || 'active';

      if (!q || q.trim().length < 2) {
        throw new ApiError(
          400,
          ERROR_CODES.VALIDATION_ERROR,
          'Search query (q) must be at least 2 characters'
        );
      }

      const result = await searchSuppliersService({
        query: q,
        limit,
        offset,
        status,
      });

      res.json({
        success: true,
        data: result.suppliers,
        pagination: {
          total: result.total,
          limit: result.limit,
          offset: result.offset,
          hasMore: result.offset + result.suppliers.length < result.total,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /gstin/validate
 * Validate a GSTIN and return structured information.
 */
router.post(
  '/gstin/validate',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { gstin } = req.body as { gstin?: string };

      if (!gstin) {
        throw new ApiError(
          400,
          ERROR_CODES.VALIDATION_ERROR,
          'gstin is required in request body'
        );
      }

      const result = validateGstinService(gstin);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

// =============================================================================
// STORE-SCOPED SUPPLIER ENDPOINTS
// =============================================================================

/**
 * GET /stores/:storeId/suppliers
 * Get all suppliers linked to a store.
 * GL-CRIT-0002: Protected with authenticate + requireStoreAccess
 *
 * Query params:
 * - status: Filter by link status (default 'active')
 * - preferred: If 'true', only return preferred suppliers
 */
router.get(
  '/stores/:storeId/suppliers',
  authenticate,
  requireStoreAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { storeId } = req.params;
      const status = (req.query.status as string) || 'active';
      const preferredOnly = req.query.preferred === 'true';

      const suppliers = await getStoreSuppliers(storeId, {
        status,
        preferredOnly,
      });

      res.json({
        success: true,
        data: suppliers,
        count: suppliers.length,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /stores/:storeId/suppliers/link
 * Link an existing supplier to a store.
 * GL-CRIT-0002: Protected with authenticate + requireStoreAccess
 *
 * Body:
 * - supplierId: UUID of supplier to link (required)
 * - creditDays: Credit terms in days (default 0)
 * - minOrderValue: Minimum order value in paise (default 0)
 * - expectedDeliveryDays: Expected delivery days (default 2)
 * - priority: Priority order (lower = higher, default 100)
 * - isPreferred: Mark as preferred supplier (default false)
 */
router.post(
  '/stores/:storeId/suppliers/link',
  authenticate,
  requireStoreAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { storeId } = req.params;
      const body = req.body as LinkSupplierBody;

      if (!body.supplierId) {
        throw new ApiError(
          400,
          ERROR_CODES.VALIDATION_ERROR,
          'supplierId is required'
        );
      }

      const userId = getAuthUser(req).id;

      const result = await linkSupplierToStore({
        supplierId: body.supplierId,
        storeId,
        creditDays: body.creditDays,
        minOrderValue: body.minOrderValue,
        expectedDeliveryDays: body.expectedDeliveryDays,
        priority: body.priority,
        isPreferred: body.isPreferred,
        linkedByUserId: userId,
      });

      res.status(201).json({
        success: true,
        data: {
          supplier: result.supplier,
          link: result.link,
        },
        message: `Supplier ${result.supplier.businessName} linked successfully`,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /stores/:storeId/suppliers/:supplierId
 * Update a supplier-store link settings.
 * GL-CRIT-0002: Protected with authenticate + requireStoreAccess
 *
 * Body:
 * - creditDays: Credit terms in days
 * - minOrderValue: Minimum order value in paise
 * - expectedDeliveryDays: Expected delivery days
 * - priority: Priority order (lower = higher)
 * - isPreferred: Mark as preferred supplier
 */
router.put(
  '/stores/:storeId/suppliers/:supplierId',
  authenticate,
  requireStoreAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { storeId, supplierId } = req.params;
      const body = req.body as UpdateSupplierLinkBody;

      const userId = getAuthUser(req).id;

      const result = await updateSupplierLinkService({
        storeId,
        supplierId,
        creditDays: body.creditDays,
        minOrderValue: body.minOrderValue,
        expectedDeliveryDays: body.expectedDeliveryDays,
        priority: body.priority,
        isPreferred: body.isPreferred,
        updatedByUserId: userId,
      });

      res.json({
        success: true,
        data: {
          supplier: result.supplier,
          link: result.link,
        },
        message: `Supplier link updated successfully`,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /stores/:storeId/suppliers/:supplierId/unlink
 * Unlink a supplier from a store (soft delete).
 * GL-CRIT-0002: Protected with authenticate + requireStoreAccess
 *
 * Body (optional):
 * - reason: Reason for unlinking
 */
router.delete(
  '/stores/:storeId/suppliers/:supplierId/unlink',
  authenticate,
  requireStoreAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { storeId, supplierId } = req.params;
      const body = req.body as UnlinkSupplierBody;

      const userId = getAuthUser(req).id;

      const result = await unlinkSupplierService({
        storeId,
        supplierId,
        unlinkedByUserId: userId,
        reason: body.reason,
      });

      res.json({
        success: true,
        data: {
          supplier: result.supplier,
          link: result.link,
        },
        message: `Supplier ${result.supplier.businessName} unlinked successfully`,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /stores/:storeId/suppliers/:supplierId/reactivate
 * Reactivate a previously unlinked supplier.
 * GL-CRIT-0002: Protected with authenticate + requireStoreAccess
 */
router.post(
  '/stores/:storeId/suppliers/:supplierId/reactivate',
  authenticate,
  requireStoreAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { storeId, supplierId } = req.params;

      const userId = getAuthUser(req).id;

      const result = await reactivateSupplierLinkService(
        storeId,
        supplierId,
        userId
      );

      res.json({
        success: true,
        data: {
          supplier: result.supplier,
          link: result.link,
        },
        message: `Supplier ${result.supplier.businessName} reactivated successfully`,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /stores/:storeId/suppliers/request
 * Request a new supplier to be added to the system.
 * GL-CRIT-0002: Protected with authenticate + requireStoreAccess
 *
 * Body:
 * - gstin: GSTIN of the supplier (optional but validated if provided)
 * - name: Business name of the supplier (optional)
 * - phone: Contact phone number (optional)
 * - email: Contact email (optional)
 *
 * At least one of gstin, name, or phone must be provided.
 */
router.post(
  '/stores/:storeId/suppliers/request',
  authenticate,
  requireStoreAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { storeId } = req.params;
      const body = req.body as RequestSupplierBody;

      const userId = getAuthUser(req).id;

      const request = await requestNewSupplier({
        storeId,
        gstin: body.gstin,
        name: body.name,
        phone: body.phone,
        email: body.email,
        createdByUserId: userId,
      });

      res.status(201).json({
        success: true,
        data: request,
        message: 'Supplier request submitted for review',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /stores/:storeId/suppliers/requests
 * Get supplier requests for a store.
 * GL-CRIT-0002: Protected with authenticate + requireStoreAccess
 *
 * Query params:
 * - status: Filter by request status ('pending', 'approved', 'rejected')
 */
router.get(
  '/stores/:storeId/suppliers/requests',
  authenticate,
  requireStoreAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { storeId } = req.params;
      const status = req.query.status as string | undefined;

      const requests = await getStoreSupplierRequests(storeId, { status });

      res.json({
        success: true,
        data: requests,
        count: requests.length,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
