"use strict";
// Policies Routes - V3.0.9 compliant
// Per-product reorder policy endpoints
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const common_1 = require("@supermandi/common");
const policyService_js_1 = require("../services/policyService.js");
const config_js_1 = require("../config.js");
const router = (0, express_1.Router)();
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
router.get('/stores/:storeId/reorder/policies', async (req, res, next) => {
    try {
        const { storeId } = req.params;
        const limit = parseInt(req.query.limit) || config_js_1.config.reorder.defaultLimit;
        const offset = parseInt(req.query.offset) || 0;
        const enabledOnly = req.query.enabledOnly === 'true';
        const result = await (0, policyService_js_1.listStorePolicies)(storeId, {
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
    }
    catch (error) {
        next(error);
    }
});
router.get('/stores/:storeId/policies', async (req, res, next) => {
    try {
        const { storeId } = req.params;
        const limit = parseInt(req.query.limit) || config_js_1.config.reorder.defaultLimit;
        const offset = parseInt(req.query.offset) || 0;
        const enabledOnly = req.query.enabledOnly === 'true';
        const result = await (0, policyService_js_1.listStorePolicies)(storeId, {
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
    }
    catch (error) {
        next(error);
    }
});
/**
 * GET /stores/:storeId/policies/product/:productId
 * Get a policy by store and product ID.
 */
router.get('/stores/:storeId/policies/product/:productId', async (req, res, next) => {
    try {
        const { storeId, productId } = req.params;
        const policy = await (0, policyService_js_1.getPolicyByProduct)(storeId, productId);
        if (!policy) {
            throw new common_1.ApiError(404, 'POLICY_NOT_FOUND', `Policy not found for product ${productId} in store ${storeId}`);
        }
        res.json({
            success: true,
            data: policy,
        });
    }
    catch (error) {
        next(error);
    }
});
/**
 * GET /policies/:policyId
 * Get a policy by ID.
 */
router.get('/policies/:policyId', async (req, res, next) => {
    try {
        const { policyId } = req.params;
        const policy = await (0, policyService_js_1.getPolicyByIdService)(policyId);
        if (!policy) {
            throw new common_1.ApiError(404, 'POLICY_NOT_FOUND', `Policy ${policyId} not found`);
        }
        res.json({
            success: true,
            data: policy,
        });
    }
    catch (error) {
        next(error);
    }
});
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
router.post('/stores/:storeId/policies', async (req, res, next) => {
    try {
        const { storeId } = req.params;
        const { productId, minStock, targetStock, preferredSupplierId, isEnabled, } = req.body;
        // Basic validation
        if (!productId) {
            throw new common_1.ApiError(400, 'VALIDATION_ERROR', 'productId is required');
        }
        if (minStock === undefined || minStock === null) {
            throw new common_1.ApiError(400, 'VALIDATION_ERROR', 'minStock is required');
        }
        if (targetStock === undefined || targetStock === null) {
            throw new common_1.ApiError(400, 'VALIDATION_ERROR', 'targetStock is required');
        }
        // Get userId from headers (set by auth middleware/gateway)
        const userId = req.headers['x-user-id'];
        const policy = await (0, policyService_js_1.createPolicyService)({
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
    }
    catch (error) {
        next(error);
    }
});
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
router.put('/policies/:policyId', async (req, res, next) => {
    try {
        const { policyId } = req.params;
        const { minStock, targetStock, preferredSupplierId, isEnabled } = req.body;
        const policy = await (0, policyService_js_1.updatePolicyService)(policyId, {
            minStock,
            targetStock,
            preferredSupplierId,
            isEnabled,
        });
        res.json({
            success: true,
            data: policy,
        });
    }
    catch (error) {
        next(error);
    }
});
/**
 * DELETE /policies/:policyId
 * Delete a reorder policy.
 */
router.delete('/policies/:policyId', async (req, res, next) => {
    try {
        const { policyId } = req.params;
        await (0, policyService_js_1.deletePolicyService)(policyId);
        res.json({
            success: true,
            message: 'Policy deleted',
        });
    }
    catch (error) {
        next(error);
    }
});
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
router.patch('/stores/:storeId/reorder/policies/:identifier', async (req, res, next) => {
    try {
        const { storeId, identifier } = req.params;
        const { minThreshold, minStock, targetStock, preferredSupplierId, isEnabled } = req.body;
        // First try to find by productId (expected case from POS)
        let policy = await (0, policyService_js_1.getPolicyByProduct)(storeId, identifier);
        // If not found, try to find by policyId
        if (!policy) {
            policy = await (0, policyService_js_1.getPolicyByIdService)(identifier);
            // Verify the policy belongs to this store
            if (policy && policy.storeId !== storeId) {
                policy = null;
            }
        }
        if (!policy) {
            throw new common_1.ApiError(404, 'POLICY_NOT_FOUND', `Policy ${identifier} not found`);
        }
        // Map minThreshold to minStock for API compatibility
        const updates = {};
        if (minThreshold !== undefined)
            updates.minStock = minThreshold;
        if (minStock !== undefined)
            updates.minStock = minStock;
        if (targetStock !== undefined)
            updates.targetStock = targetStock;
        if (preferredSupplierId !== undefined)
            updates.preferredSupplierId = preferredSupplierId;
        if (isEnabled !== undefined)
            updates.isEnabled = isEnabled;
        const updated = await (0, policyService_js_1.updatePolicyService)(policy.id, updates);
        res.json({
            success: true,
            data: updated,
        });
    }
    catch (error) {
        next(error);
    }
});
exports.default = router;
//# sourceMappingURL=policies.js.map