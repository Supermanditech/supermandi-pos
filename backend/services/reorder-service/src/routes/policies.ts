// Policies Routes - V3.0.9 compliant
// Per-product reorder policy endpoints

import { Router, Request, Response, NextFunction } from 'express';
import type { Router as RouterType } from 'express';
import { ApiError } from '@supermandi/common';
import { authenticate, requireStoreAccess } from '@supermandi/auth-service/exports';
import {
  getPolicyByProduct,
  getPolicyByIdService,
  listStorePolicies,
  createPolicyService,
  updatePolicyService,
  deletePolicyService,
} from '../services/policyService';
import { config } from '../config';

const router: RouterType = Router();

// AUTH-CONCURRENT-002: Apply authentication to all policy routes
router.use(authenticate);

// =============================================================================
// POLICY ENDPOINTS
// =============================================================================

/**
 * GET /stores/:storeId/policies
 * List reorder policies for a store.
 *
 * Query params:
 * - limit: Items per page (default 50, max 200)
 * - offset: Pagination offset (default 0)
 * - enabledOnly: Only return enabled policies (default false)
 */
// Alias route for POS compatibility: /stores/:storeId/reorder/policies
router.get(
  '/stores/:storeId/reorder/policies',
  requireStoreAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { storeId } = req.params;
      const limit = parseInt(req.query.limit as string) || config.reorder.defaultLimit;
      const offset = parseInt(req.query.offset as string) || 0;
      const enabledOnly = req.query.enabledOnly === 'true';

      const result = await listStorePolicies(storeId, {
        limit,
        offset,
        enabledOnly,
      });

      res.json({
        success: true,
        data: result.policies,
        pagination: {
          limit,
          offset,
          total: result.total,
          hasMore: offset + result.policies.length < result.total,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/stores/:storeId/policies',
  requireStoreAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { storeId } = req.params;
      const limit = parseInt(req.query.limit as string) || config.reorder.defaultLimit;
      const offset = parseInt(req.query.offset as string) || 0;
      const enabledOnly = req.query.enabledOnly === 'true';

      const result = await listStorePolicies(storeId, {
        limit,
        offset,
        enabledOnly,
      });

      res.json({
        success: true,
        data: result.policies,
        pagination: {
          limit,
          offset,
          total: result.total,
          hasMore: offset + result.policies.length < result.total,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /stores/:storeId/policies/product/:productId
 * Get a policy by store and product ID.
 */
router.get(
  '/stores/:storeId/policies/product/:productId',
  requireStoreAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { storeId, productId } = req.params;

      const policy = await getPolicyByProduct(storeId, productId);

      if (!policy) {
        throw new ApiError(
          404,
          'POLICY_NOT_FOUND',
          `Policy not found for product ${productId} in store ${storeId}`
        );
      }

      res.json({
        success: true,
        data: policy,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /policies/:policyId
 * Get a policy by ID.
 */
router.get(
  '/policies/:policyId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { policyId } = req.params;

      const policy = await getPolicyByIdService(policyId);

      if (!policy) {
        throw new ApiError(
          404,
          'POLICY_NOT_FOUND',
          `Policy ${policyId} not found`
        );
      }

      res.json({
        success: true,
        data: policy,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /stores/:storeId/policies
 * Create a new reorder policy for a product.
 *
 * Body:
 * - productId: UUID (required)
 * - minStock: number >= 0 (required)
 * - targetStock: number >= minStock (required)
 * - preferredSupplierId: UUID (optional)
 * - isEnabled: boolean (optional, default true)
 */
router.post(
  '/stores/:storeId/policies',
  requireStoreAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { storeId } = req.params;
      const {
        productId,
        minStock,
        targetStock,
        preferredSupplierId,
        isEnabled,
      } = req.body;

      // Basic validation
      if (!productId) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'productId is required');
      }

      if (minStock === undefined || minStock === null) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'minStock is required');
      }

      if (targetStock === undefined || targetStock === null) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'targetStock is required');
      }

      // Get userId from headers (set by auth middleware/gateway)
      const userId = req.headers['x-user-id'] as string | undefined;

      const policy = await createPolicyService({
        storeId,
        productId,
        minStock,
        targetStock,
        preferredSupplierId,
        isEnabled,
        createdByUserId: userId || null,
      });

      res.status(201).json({
        success: true,
        data: policy,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /policies/:policyId
 * Update an existing reorder policy.
 *
 * Body:
 * - minStock: number >= 0 (optional)
 * - targetStock: number >= minStock (optional)
 * - preferredSupplierId: UUID or null (optional)
 * - isEnabled: boolean (optional)
 */
router.put(
  '/policies/:policyId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { policyId } = req.params;
      const { minStock, targetStock, preferredSupplierId, isEnabled } = req.body;

      const policy = await updatePolicyService(policyId, {
        minStock,
        targetStock,
        preferredSupplierId,
        isEnabled,
      });

      res.json({
        success: true,
        data: policy,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /policies/:policyId
 * Delete a reorder policy.
 */
router.delete(
  '/policies/:policyId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { policyId } = req.params;

      await deletePolicyService(policyId);

      res.json({
        success: true,
        message: 'Policy deleted',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PATCH /stores/:storeId/reorder/policies/:identifier
 * Update a reorder policy by productId (POS compatibility).
 * The identifier is expected to be a productId, not policyId.
 *
 * Body:
 * - minThreshold: number >= 0 (optional, mapped to minStock)
 * - targetStock: number >= minStock (optional)
 * - preferredSupplierId: UUID or null (optional)
 * - isEnabled: boolean (optional)
 */
router.patch(
  '/stores/:storeId/reorder/policies/:identifier',
  requireStoreAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { storeId, identifier } = req.params;
      const { minThreshold, minStock, targetStock, preferredSupplierId, isEnabled } = req.body;

      // First try to find by productId (expected case from POS)
      let policy = await getPolicyByProduct(storeId, identifier);

      // If not found, try to find by policyId
      if (!policy) {
        policy = await getPolicyByIdService(identifier);
        // Verify the policy belongs to this store
        if (policy && policy.storeId !== storeId) {
          policy = null;
        }
      }

      if (!policy) {
        throw new ApiError(
          404,
          'POLICY_NOT_FOUND',
          `Policy ${identifier} not found`
        );
      }

      // Map minThreshold to minStock for API compatibility
      const updates: { minStock?: number; targetStock?: number; preferredSupplierId?: string | null; isEnabled?: boolean } = {};
      if (minThreshold !== undefined) updates.minStock = minThreshold;
      if (minStock !== undefined) updates.minStock = minStock;
      if (targetStock !== undefined) updates.targetStock = targetStock;
      if (preferredSupplierId !== undefined) updates.preferredSupplierId = preferredSupplierId;
      if (isEnabled !== undefined) updates.isEnabled = isEnabled;

      const updated = await updatePolicyService(policy.id, updates);

      res.json({
        success: true,
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
