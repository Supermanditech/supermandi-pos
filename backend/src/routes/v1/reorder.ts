// Reorder Routes - V3.0.10 compliant
// Store reorder settings and policies endpoints
// ITER2-001: Added store-scoped authentication via x-actor-id

import { Router, Request, Response, NextFunction } from "express";
import { getPool } from "../../db/client";

export const reorderRouter = Router();

/**
 * ITER2-001: Get and validate store ID from gateway-provided x-actor-id header
 * Returns null if not authenticated or if path storeId doesn't match actor's store
 */
function getAndValidateStoreId(req: Request, pathStoreId: string): { storeId: string } | { error: string; status: number } {
  const actorId = req.headers['x-actor-id'];
  if (typeof actorId !== 'string' || !actorId) {
    return { error: "Unauthorized: Store not identified", status: 401 };
  }

  // Store isolation: Verify the requested storeId matches the authenticated user's store
  if (actorId !== pathStoreId) {
    console.warn(`[Reorder] Store isolation violation: actor=${actorId} tried to access store=${pathStoreId}`);
    return { error: "Forbidden: Cannot access another store's data", status: 403 };
  }

  return { storeId: actorId };
}

// =============================================================================
// SETTINGS ENDPOINTS
// =============================================================================

/**
 * GET /api/v1/reorder/stores/:storeId/reorder/settings
 * Get or initialize reorder settings for a store.
 * Returns default settings if none exist.
 * ITER2-001: Requires x-actor-id authentication + store isolation
 */
reorderRouter.get("/stores/:storeId/reorder/settings", async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  // ITER2-001: Authenticate and validate store access
  const authResult = getAndValidateStoreId(req, req.params.storeId);
  if ('error' in authResult) {
    return res.status(authResult.status).json({ success: false, error: authResult.error });
  }
  const { storeId } = authResult;

  try {
    // Check if settings exist
    let result = await pool.query(
      `SELECT
        store_id as "storeId",
        reorder_enabled as "reorderEnabled",
        require_approval as "requireApproval",
        auto_approve_threshold as "autoApproveThreshold",
        default_lead_days as "defaultLeadDays",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM reorder.store_settings
      WHERE store_id = $1`,
      [storeId]
    );

    if (result.rows.length === 0) {
      // Create default settings for this store
      result = await pool.query(
        `INSERT INTO reorder.store_settings (store_id, reorder_enabled, require_approval, default_lead_days)
         VALUES ($1, true, true, 3)
         ON CONFLICT (store_id) DO UPDATE SET updated_at = NOW()
         RETURNING
           store_id as "storeId",
           reorder_enabled as "reorderEnabled",
           require_approval as "requireApproval",
           auto_approve_threshold as "autoApproveThreshold",
           default_lead_days as "defaultLeadDays",
           created_at as "createdAt",
           updated_at as "updatedAt"`,
        [storeId]
      );
    }

    return res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error("[ReorderSettings] Error:", error.message);

    // If table doesn't exist, return default settings
    if (error.code === "42P01") {
      return res.json({
        success: true,
        data: {
          storeId,
          reorderEnabled: true,
          requireApproval: true,
          autoApproveThreshold: null,
          defaultLeadDays: 3,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });
    }

    return res.status(500).json({
      success: false,
      error: "Failed to load settings",
    });
  }
});

/**
 * PATCH /api/v1/reorder/stores/:storeId/reorder/settings
 * Update reorder settings for a store.
 * ITER2-001: Requires x-actor-id authentication + store isolation
 */
reorderRouter.patch("/stores/:storeId/reorder/settings", async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  // ITER2-001: Authenticate and validate store access
  const authResult = getAndValidateStoreId(req, req.params.storeId);
  if ('error' in authResult) {
    return res.status(authResult.status).json({ success: false, error: authResult.error });
  }
  const { storeId } = authResult;
  const { reorderEnabled, requireApproval, autoApproveThreshold, defaultLeadDays } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO reorder.store_settings (store_id, reorder_enabled, require_approval, auto_approve_threshold, default_lead_days)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (store_id) DO UPDATE SET
         reorder_enabled = COALESCE($2, reorder.store_settings.reorder_enabled),
         require_approval = COALESCE($3, reorder.store_settings.require_approval),
         auto_approve_threshold = COALESCE($4, reorder.store_settings.auto_approve_threshold),
         default_lead_days = COALESCE($5, reorder.store_settings.default_lead_days),
         updated_at = NOW()
       RETURNING
         store_id as "storeId",
         reorder_enabled as "reorderEnabled",
         require_approval as "requireApproval",
         auto_approve_threshold as "autoApproveThreshold",
         default_lead_days as "defaultLeadDays",
         created_at as "createdAt",
         updated_at as "updatedAt"`,
      [storeId, reorderEnabled, requireApproval, autoApproveThreshold, defaultLeadDays]
    );

    return res.json({
      success: true,
      data: result.rows[0],
      message: "Settings updated successfully",
    });
  } catch (error: any) {
    console.error("[ReorderSettings] Update error:", error.message);
    return res.status(500).json({
      success: false,
      error: "Failed to update settings",
    });
  }
});

// =============================================================================
// POLICIES ENDPOINTS
// =============================================================================

/**
 * GET /api/v1/reorder/stores/:storeId/reorder/policies
 * List reorder policies for a store.
 * ITER2-001: Requires x-actor-id authentication + store isolation
 */
reorderRouter.get("/stores/:storeId/reorder/policies", async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  // ITER2-001: Authenticate and validate store access
  const authResult = getAndValidateStoreId(req, req.params.storeId);
  if ('error' in authResult) {
    return res.status(authResult.status).json({ success: false, error: authResult.error });
  }
  const { storeId } = authResult;
  const { search, isEnabled, limit = "50", offset = "0" } = req.query;

  try {
    let whereClause = "WHERE rp.store_id = $1";
    const params: any[] = [storeId];
    let paramIndex = 2;

    // AUD-059-C FIX: Search query length bounds
    const MAX_SEARCH_QUERY_LENGTH = 100;
    if (search && typeof search === "string" && search.trim().length > 0) {
      if (search.trim().length > MAX_SEARCH_QUERY_LENGTH) {
        return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: `Search query exceeds ${MAX_SEARCH_QUERY_LENGTH} characters` } });
      }
      // ITER2-005: Fixed column references - use display_name and join products for barcode
      whereClause += ` AND (COALESCE(sp.display_name, p.name) ILIKE $${paramIndex} OR p.primary_barcode ILIKE $${paramIndex})`;
      params.push(`%${search.trim()}%`);
      paramIndex++;
    }

    if (isEnabled !== undefined) {
      whereClause += ` AND rp.is_enabled = $${paramIndex}`;
      params.push(isEnabled === "true");
      paramIndex++;
    }

    // First get total count - ITER2-005: Fixed JOIN to include products table for barcode
    const countResult = await pool.query(
      `SELECT COUNT(*) as total
       FROM reorder.product_policies rp
       JOIN catalog.store_products sp ON sp.store_id = rp.store_id AND sp.product_id = rp.product_id
       JOIN catalog.products p ON p.id = sp.product_id
       ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.total || "0", 10);

    // Then get paginated results
    const limitNum = Math.min(parseInt(limit as string, 10) || 50, 200);
    const offsetNum = parseInt(offset as string, 10) || 0;

    // ITER2-005: Fixed column names (current_stock not stock_on_hand), added COALESCE for stock
    const result = await pool.query(
      `SELECT
        rp.id,
        rp.store_id as "storeId",
        rp.product_id as "productId",
        COALESCE(sp.display_name, p.name) as "productName",
        p.primary_barcode as barcode,
        rp.min_threshold as "minThreshold",
        rp.target_stock as "targetStock",
        rp.preferred_supplier_id as "preferredSupplierId",
        NULL as "preferredSupplierName",
        rp.is_enabled as "isEnabled",
        COALESCE(sb.current_qty, sp.current_stock, 0) as "currentStock",
        rp.created_at as "createdAt",
        rp.updated_at as "updatedAt"
      FROM reorder.product_policies rp
      JOIN catalog.store_products sp ON sp.store_id = rp.store_id AND sp.product_id = rp.product_id
      JOIN catalog.products p ON p.id = sp.product_id
      LEFT JOIN inventory.stock_balances sb ON sb.store_id = sp.store_id AND sb.product_id = sp.product_id
      ${whereClause}
      ORDER BY COALESCE(sp.display_name, p.name) ASC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limitNum, offsetNum]
    );

    return res.json({
      success: true,
      data: result.rows,
      pagination: {
        limit: limitNum,
        offset: offsetNum,
        total,
        hasMore: offsetNum + result.rows.length < total,
      },
    });
  } catch (error: any) {
    console.error("[ReorderPolicies] Error:", error.message);

    // If table doesn't exist, return empty list
    if (error.code === "42P01") {
      return res.json({
        success: true,
        data: [],
        pagination: {
          limit: 50,
          offset: 0,
          total: 0,
          hasMore: false,
        },
      });
    }

    return res.status(500).json({
      success: false,
      error: "Failed to load policies",
    });
  }
});

/**
 * PATCH /api/v1/reorder/stores/:storeId/reorder/policies/:productId
 * Update a reorder policy for a specific product.
 * ITER2-001: Requires x-actor-id authentication + store isolation
 */
reorderRouter.patch("/stores/:storeId/reorder/policies/:productId", async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  // ITER2-001: Authenticate and validate store access
  const authResult = getAndValidateStoreId(req, req.params.storeId);
  if ('error' in authResult) {
    return res.status(authResult.status).json({ success: false, error: authResult.error });
  }
  const { storeId } = authResult;
  const { productId } = req.params;
  const { minThreshold, targetStock, preferredSupplierId, isEnabled } = req.body;

  try {
    const result = await pool.query(
      `UPDATE reorder.product_policies
       SET
         min_threshold = COALESCE($3, min_threshold),
         target_stock = COALESCE($4, target_stock),
         preferred_supplier_id = COALESCE($5, preferred_supplier_id),
         is_enabled = COALESCE($6, is_enabled),
         updated_at = NOW()
       WHERE store_id = $1 AND product_id = $2
       RETURNING
         id,
         store_id as "storeId",
         product_id as "productId",
         min_threshold as "minThreshold",
         target_stock as "targetStock",
         preferred_supplier_id as "preferredSupplierId",
         is_enabled as "isEnabled",
         created_at as "createdAt",
         updated_at as "updatedAt"`,
      [storeId, productId, minThreshold, targetStock, preferredSupplierId, isEnabled]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Policy not found",
      });
    }

    return res.json({
      success: true,
      data: result.rows[0],
      message: "Policy updated successfully",
    });
  } catch (error: any) {
    console.error("[ReorderPolicies] Update error:", error.message);
    return res.status(500).json({
      success: false,
      error: "Failed to update policy",
    });
  }
});

// =============================================================================
// PENDING REORDERS ENDPOINTS
// =============================================================================

/**
 * GET /api/v1/reorder/stores/:storeId/reorder/pending
 * List pending reorders for a store.
 * ITER2-001: Requires x-actor-id authentication + store isolation
 */
reorderRouter.get("/stores/:storeId/reorder/pending", async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  // ITER2-001: Authenticate and validate store access
  const authResult = getAndValidateStoreId(req, req.params.storeId);
  if ('error' in authResult) {
    return res.status(authResult.status).json({ success: false, error: authResult.error });
  }
  const { storeId } = authResult;
  const { status, limit = "50", offset = "0" } = req.query;

  try {
    let whereClause = "WHERE pr.store_id = $1";
    const params: any[] = [storeId];
    let paramIndex = 2;

    if (status && typeof status === "string") {
      whereClause += ` AND pr.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    const limitNum = Math.min(parseInt(limit as string, 10) || 50, 200);
    const offsetNum = parseInt(offset as string, 10) || 0;

    // ITER2-005: Fixed column names and JOINs for correct schema
    const result = await pool.query(
      `SELECT
        pr.id,
        pr.store_id as "storeId",
        pr.product_id as "productId",
        COALESCE(sp.display_name, p.name) as "productName",
        p.primary_barcode as barcode,
        COALESCE(sb.current_qty, sp.current_stock, 0) as "currentStock",
        rp.min_threshold as "minThreshold",
        rp.target_stock as "targetStock",
        pr.suggested_quantity as "suggestedQuantity",
        pr.suggested_supplier_id as "suggestedSupplierId",
        NULL as "suggestedSupplierName",
        pr.suggested_unit_price as "suggestedUnitPrice",
        pr.supplier_product_id as "supplierProductId",
        pr.status,
        pr.dismissed_reason as "dismissedReason",
        pr.purchase_order_id as "purchaseOrderId",
        pr.expires_at as "expiresAt",
        pr.created_at as "createdAt",
        pr.updated_at as "updatedAt"
      FROM reorder.pending_reorders pr
      LEFT JOIN catalog.store_products sp ON sp.store_id = pr.store_id AND sp.product_id = pr.product_id
      LEFT JOIN catalog.products p ON p.id = pr.product_id
      LEFT JOIN inventory.stock_balances sb ON sb.store_id = pr.store_id AND sb.product_id = pr.product_id
      LEFT JOIN reorder.product_policies rp ON rp.store_id = pr.store_id AND rp.product_id = pr.product_id
      ${whereClause}
      ORDER BY pr.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limitNum, offsetNum]
    );

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM reorder.pending_reorders pr ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.total || "0", 10);

    return res.json({
      success: true,
      data: result.rows,
      pagination: {
        limit: limitNum,
        offset: offsetNum,
        total,
        hasMore: offsetNum + result.rows.length < total,
      },
    });
  } catch (error: any) {
    console.error("[PendingReorders] Error:", error.message);

    // If table doesn't exist, return empty list
    if (error.code === "42P01") {
      return res.json({
        success: true,
        data: [],
        pagination: {
          limit: 50,
          offset: 0,
          total: 0,
          hasMore: false,
        },
      });
    }

    return res.status(500).json({
      success: false,
      error: "Failed to load pending reorders",
    });
  }
});
