// Reorder Routes - T-251 updated to canonical schema (migration 007 + 150)
// Store reorder settings and policies endpoints
// GO-LIVE: Uses requireDeviceToken middleware for POS device authentication
// T-251: Migrated from deprecated reorder.store_settings/product_policies
//        to canonical reorder.store_reorder_settings/reorder_policies

import { Router, Request, Response, NextFunction } from "express";
import { getPool } from "../../db/client";
import { requireDeviceToken, PosDeviceContext } from "../../middleware/deviceToken";
import { log } from "../../lib/logger";
import { asError } from "../../lib/errorUtils";

export const reorderRouter = Router();

/**
 * GO-LIVE: Get store ID from device token (set by requireDeviceToken middleware)
 * The middleware already validates store isolation via enforceStoreBinding
 */
function getStoreIdFromDevice(req: Request): string {
  const posDevice = (req as any).posDevice as PosDeviceContext;
  return posDevice.storeId!;
}

// =============================================================================
// SETTINGS ENDPOINTS
// Schema: reorder.store_reorder_settings (migration 007 + 150)
// =============================================================================

/**
 * GET /api/v1/reorder/stores/:storeId/reorder/settings
 * Get or initialize reorder settings for a store.
 * Returns default settings if none exist.
 * GO-LIVE: Requires device token authentication
 */
reorderRouter.get("/stores/:storeId/reorder/settings", requireDeviceToken, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreIdFromDevice(req);

  try {
    // Check if settings exist
    let result = await pool.query(
      `SELECT
        store_id as "storeId",
        reorder_enabled as "reorderEnabled",
        require_approval as "requireApproval",
        notify_on_low_stock as "notifyOnLowStock",
        auto_approve_threshold as "autoApproveThreshold",
        default_lead_days as "defaultLeadDays",
        updated_at as "updatedAt"
      FROM reorder.store_reorder_settings
      WHERE store_id = $1`,
      [storeId]
    );

    if (result.rows.length === 0) {
      // Create default settings for this store
      result = await pool.query(
        `INSERT INTO reorder.store_reorder_settings (store_id, reorder_enabled, require_approval, notify_on_low_stock, default_lead_days)
         VALUES ($1, true, true, true, 3)
         ON CONFLICT (store_id) DO UPDATE SET updated_at = NOW()
         RETURNING
           store_id as "storeId",
           reorder_enabled as "reorderEnabled",
           require_approval as "requireApproval",
           notify_on_low_stock as "notifyOnLowStock",
           auto_approve_threshold as "autoApproveThreshold",
           default_lead_days as "defaultLeadDays",
           updated_at as "updatedAt"`,
        [storeId]
      );
    }

    return res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[ReorderSettings] Error:", error.message);

    // If table doesn't exist, return default settings
    if (error.code === "42P01") {
      return res.json({
        success: true,
        data: {
          storeId,
          reorderEnabled: true,
          requireApproval: true,
          notifyOnLowStock: true,
          autoApproveThreshold: null,
          defaultLeadDays: 3,
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
 * GO-LIVE: Requires device token authentication
 */
reorderRouter.patch("/stores/:storeId/reorder/settings", requireDeviceToken, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreIdFromDevice(req);
  const { reorderEnabled, requireApproval, notifyOnLowStock, autoApproveThreshold, defaultLeadDays } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO reorder.store_reorder_settings (store_id, reorder_enabled, require_approval, notify_on_low_stock, auto_approve_threshold, default_lead_days)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (store_id) DO UPDATE SET
         reorder_enabled = COALESCE($2, reorder.store_reorder_settings.reorder_enabled),
         require_approval = COALESCE($3, reorder.store_reorder_settings.require_approval),
         notify_on_low_stock = COALESCE($4, reorder.store_reorder_settings.notify_on_low_stock),
         auto_approve_threshold = COALESCE($5, reorder.store_reorder_settings.auto_approve_threshold),
         default_lead_days = COALESCE($6, reorder.store_reorder_settings.default_lead_days),
         updated_at = NOW()
       RETURNING
         store_id as "storeId",
         reorder_enabled as "reorderEnabled",
         require_approval as "requireApproval",
         notify_on_low_stock as "notifyOnLowStock",
         auto_approve_threshold as "autoApproveThreshold",
         default_lead_days as "defaultLeadDays",
         updated_at as "updatedAt"`,
      [storeId, reorderEnabled, requireApproval, notifyOnLowStock, autoApproveThreshold, defaultLeadDays]
    );

    return res.json({
      success: true,
      data: result.rows[0],
      message: "Settings updated successfully",
    });
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[ReorderSettings] Update error:", error.message);
    return res.status(500).json({
      success: false,
      error: "Failed to update settings",
    });
  }
});

// =============================================================================
// POLICIES ENDPOINTS
// Schema: reorder.reorder_policies (migration 007 + 150)
// =============================================================================

/**
 * GET /api/v1/reorder/stores/:storeId/reorder/policies
 * List reorder policies for a store.
 * GO-LIVE: Requires device token authentication
 */
reorderRouter.get("/stores/:storeId/reorder/policies", requireDeviceToken, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreIdFromDevice(req);
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
      whereClause += ` AND (COALESCE(sp.display_name, p.name) ILIKE $${paramIndex} OR p.primary_barcode ILIKE $${paramIndex})`;
      params.push(`%${search.trim()}%`);
      paramIndex++;
    }

    if (isEnabled !== undefined) {
      whereClause += ` AND rp.is_enabled = $${paramIndex}`;
      params.push(isEnabled === "true");
      paramIndex++;
    }

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) as total
       FROM reorder.reorder_policies rp
       JOIN catalog.store_products sp ON sp.store_id = rp.store_id AND sp.product_id = rp.product_id
       JOIN catalog.products p ON p.id = sp.product_id
       ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.total || "0", 10);

    // Get paginated results
    const limitNum = Math.min(parseInt(limit as string, 10) || 50, 200);
    const offsetNum = parseInt(offset as string, 10) || 0;

    const result = await pool.query(
      `SELECT
        rp.id,
        rp.store_id as "storeId",
        rp.product_id as "productId",
        COALESCE(sp.display_name, p.name) as "productName",
        p.primary_barcode as barcode,
        rp.min_stock as "minStock",
        rp.target_stock as "targetStock",
        rp.max_reorder_qty as "maxReorderQty",
        rp.preferred_supplier_id as "preferredSupplierId",
        NULL as "preferredSupplierName",
        rp.is_enabled as "isEnabled",
        COALESCE(sb.current_qty, sp.current_stock, 0) as "currentStock",
        rp.created_at as "createdAt",
        rp.updated_at as "updatedAt"
      FROM reorder.reorder_policies rp
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
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[ReorderPolicies] Error:", error.message);

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
 * GO-LIVE: Requires device token authentication
 */
reorderRouter.patch("/stores/:storeId/reorder/policies/:productId", requireDeviceToken, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreIdFromDevice(req);
  const { productId } = req.params;
  const { minStock, targetStock, maxReorderQty, preferredSupplierId, isEnabled } = req.body;

  try {
    const result = await pool.query(
      `UPDATE reorder.reorder_policies
       SET
         min_stock = COALESCE($3, min_stock),
         target_stock = COALESCE($4, target_stock),
         max_reorder_qty = COALESCE($5, max_reorder_qty),
         preferred_supplier_id = COALESCE($6, preferred_supplier_id),
         is_enabled = COALESCE($7, is_enabled),
         updated_at = NOW()
       WHERE store_id = $1 AND product_id = $2
       RETURNING
         id,
         store_id as "storeId",
         product_id as "productId",
         min_stock as "minStock",
         target_stock as "targetStock",
         max_reorder_qty as "maxReorderQty",
         preferred_supplier_id as "preferredSupplierId",
         is_enabled as "isEnabled",
         created_at as "createdAt",
         updated_at as "updatedAt"`,
      [storeId, productId, minStock, targetStock, maxReorderQty, preferredSupplierId, isEnabled]
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
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[ReorderPolicies] Update error:", error.message);
    return res.status(500).json({
      success: false,
      error: "Failed to update policy",
    });
  }
});

// =============================================================================
// PENDING REORDERS ENDPOINTS
// Schema: reorder.pending_reorders (migration 007)
// =============================================================================

/**
 * GET /api/v1/reorder/stores/:storeId/reorder/pending
 * List pending reorders for a store.
 * GO-LIVE: Requires device token authentication
 */
reorderRouter.get("/stores/:storeId/reorder/pending", requireDeviceToken, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreIdFromDevice(req);
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

    const result = await pool.query(
      `SELECT
        pr.id,
        pr.store_id as "storeId",
        pr.product_id as "productId",
        COALESCE(sp.display_name, p.name) as "productName",
        p.primary_barcode as barcode,
        COALESCE(sb.current_qty, sp.current_stock, 0) as "currentStock",
        rp.min_stock as "minStock",
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
      LEFT JOIN reorder.reorder_policies rp ON rp.store_id = pr.store_id AND rp.product_id = pr.product_id
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
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[PendingReorders] Error:", error.message);

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

/**
 * POST /api/v1/reorder/stores/:storeId/reorder/pending/approve
 * AUD-GOLIVE-004: Approve selected pending reorders.
 * Creates draft purchase orders grouped by supplier.
 * GO-LIVE: Requires device token authentication
 */
reorderRouter.post("/stores/:storeId/reorder/pending/approve", requireDeviceToken, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreIdFromDevice(req);
  const { ids } = req.body;

  // Validate input
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({
      success: false,
      error: "ids must be a non-empty array of pending reorder IDs",
    });
  }

  try {
    // Start transaction
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Get pending reorders to approve
      const pendingResult = await client.query(
        `SELECT
          pr.id,
          pr.product_id as "productId",
          pr.suggested_supplier_id as "supplierId",
          pr.suggested_quantity as "quantity",
          pr.suggested_unit_price as "unitPrice",
          pr.supplier_product_id as "supplierProductId"
        FROM reorder.pending_reorders pr
        WHERE pr.id = ANY($1::uuid[])
          AND pr.store_id = $2
          AND pr.status = 'pending'`,
        [ids, storeId]
      );

      if (pendingResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          error: "No valid pending reorders found",
        });
      }

      // Group by supplier
      const bySupplier = new Map<string, typeof pendingResult.rows>();
      for (const row of pendingResult.rows) {
        const supplierId = row.supplierId || "unknown";
        if (!bySupplier.has(supplierId)) {
          bySupplier.set(supplierId, []);
        }
        bySupplier.get(supplierId)!.push(row);
      }

      // Create draft POs for each supplier
      const draftPurchaseOrders: Array<{
        id: string;
        orderNumber: string;
        supplierId: string;
        itemCount: number;
        totalAmount: number;
      }> = [];

      for (const [supplierId, items] of bySupplier) {
        // Generate order number
        const orderNumber = `PO-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

        // Calculate totals
        let totalAmount = 0;
        for (const item of items) {
          totalAmount += (item.quantity || 0) * (item.unitPrice || 0);
        }

        // Create draft PO with source_reorder_ids
        const reorderIds = items.map((i) => i.id);
        const poResult = await client.query(
          `INSERT INTO orders.purchase_orders
            (store_id, supplier_id, order_number, order_type, source_reorder_ids, status, total_amount, item_count)
           VALUES ($1, $2, $3, 'reorder', $4, 'draft', $5, $6)
           RETURNING id, order_number as "orderNumber"`,
          [storeId, supplierId === "unknown" ? null : supplierId, orderNumber, reorderIds, totalAmount, items.length]
        );

        const poId = poResult.rows[0].id;

        // Create PO items
        for (const item of items) {
          await client.query(
            `INSERT INTO orders.purchase_order_items
              (order_id, supplier_product_id, product_id, ordered_quantity, unit_price, total_price, status)
             VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
            [
              poId,
              item.supplierProductId,
              item.productId,
              item.quantity || 0,
              item.unitPrice || 0,
              (item.quantity || 0) * (item.unitPrice || 0),
            ]
          );
        }

        draftPurchaseOrders.push({
          id: poId,
          orderNumber: poResult.rows[0].orderNumber,
          supplierId,
          itemCount: items.length,
          totalAmount,
        });
      }

      // Update pending reorders status to approved with purchase_order_id
      const approvedIds = pendingResult.rows.map((r) => r.id);
      await client.query(
        `UPDATE reorder.pending_reorders
         SET status = 'approved', updated_at = NOW()
         WHERE id = ANY($1::uuid[])`,
        [approvedIds]
      );

      await client.query("COMMIT");

      return res.json({
        success: true,
        data: {
          approvedCount: approvedIds.length,
          draftPurchaseOrders,
        },
        message: `Approved ${approvedIds.length} pending reorders. Created ${draftPurchaseOrders.length} draft purchase orders.`,
      });
    } catch (innerError) {
      await client.query("ROLLBACK");
      throw innerError;
    } finally {
      client.release();
    }
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[ReorderApprove] Error:", error.message);

    // If table doesn't exist
    if (error.code === "42P01") {
      return res.status(400).json({
        success: false,
        error: "Reorder system not initialized",
      });
    }

    return res.status(500).json({
      success: false,
      error: "Failed to approve pending reorders",
    });
  }
});

/**
 * POST /api/v1/reorder/stores/:storeId/reorder/pending/:pendingId/dismiss
 * AUD-GOLIVE-004: Dismiss a pending reorder with a reason.
 * GO-LIVE: Requires device token authentication
 */
reorderRouter.post("/stores/:storeId/reorder/pending/:pendingId/dismiss", requireDeviceToken, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreIdFromDevice(req);
  const { pendingId } = req.params;
  const { reason } = req.body;

  // Validate reason
  if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: "reason is required",
    });
  }

  try {
    // Check if pending reorder exists and belongs to this store
    const checkResult = await pool.query(
      `SELECT id, status FROM reorder.pending_reorders
       WHERE id = $1 AND store_id = $2`,
      [pendingId, storeId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Pending reorder not found",
      });
    }

    if (checkResult.rows[0].status !== "pending") {
      return res.status(400).json({
        success: false,
        error: `Cannot dismiss reorder in '${checkResult.rows[0].status}' status`,
      });
    }

    // Update to dismissed
    const result = await pool.query(
      `UPDATE reorder.pending_reorders
       SET status = 'dismissed', dismissed_reason = $3, updated_at = NOW()
       WHERE id = $1 AND store_id = $2
       RETURNING
         id,
         store_id as "storeId",
         product_id as "productId",
         status,
         dismissed_reason as "dismissedReason",
         updated_at as "updatedAt"`,
      [pendingId, storeId, reason.trim()]
    );

    return res.json({
      success: true,
      data: result.rows[0],
      message: "Pending reorder dismissed successfully",
    });
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[ReorderDismiss] Error:", error.message);

    if (error.code === "42P01") {
      return res.status(404).json({
        success: false,
        error: "Pending reorder not found",
      });
    }

    return res.status(500).json({
      success: false,
      error: "Failed to dismiss pending reorder",
    });
  }
});
