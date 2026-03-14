// Reorder Routes - T-251 updated to canonical schema (migration 007 + 150)
// Store reorder settings and policies endpoints
// GO-LIVE: Uses requireDeviceToken middleware for POS device authentication
// T-251: Migrated from deprecated reorder.store_settings/product_policies
//        to canonical reorder.store_reorder_settings/reorder_policies

import { Router, Request, Response, NextFunction } from "express";
import { getPool } from "../../db/client";
import { requireDeviceToken, PosDeviceContext } from "../../middleware/deviceToken";
// SA-P1-002: Spending limit enforcement
import { checkSpendingLimits } from "../../services/spendingLimitService";
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
        COALESCE(ss.business_name, ss.trade_name) as "preferredSupplierName",
        rp.is_enabled as "isEnabled",
        COALESCE(sb.current_qty, sp.current_stock, 0) as "currentStock",
        rp.created_at as "createdAt",
        rp.updated_at as "updatedAt"
      FROM reorder.reorder_policies rp
      JOIN catalog.store_products sp ON sp.store_id = rp.store_id AND sp.product_id = rp.product_id
      JOIN catalog.products p ON p.id = sp.product_id
      LEFT JOIN inventory.stock_balances sb ON sb.store_id = sp.store_id AND sb.product_id = sp.product_id
      LEFT JOIN supplier.suppliers ss ON ss.id = rp.preferred_supplier_id
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

  // STG-438: Server-side validation for reorder policy values
  if (minStock !== undefined && minStock !== null) {
    const val = Number(minStock);
    if (!Number.isFinite(val) || val < 0 || val > 999999) {
      return res.status(400).json({
        success: false,
        error: "minStock must be a number between 0 and 999999",
      });
    }
  }
  if (targetStock !== undefined && targetStock !== null) {
    const val = Number(targetStock);
    if (!Number.isFinite(val) || val < 0 || val > 999999) {
      return res.status(400).json({
        success: false,
        error: "targetStock must be a number between 0 and 999999",
      });
    }
  }
  if (minStock !== undefined && targetStock !== undefined && minStock !== null && targetStock !== null) {
    if (Number(targetStock) < Number(minStock)) {
      return res.status(400).json({
        success: false,
        error: "targetStock must be greater than or equal to minStock",
      });
    }
  }
  if (maxReorderQty !== undefined && maxReorderQty !== null) {
    const val = Number(maxReorderQty);
    if (!Number.isFinite(val) || val < 1 || val > 999999) {
      return res.status(400).json({
        success: false,
        error: "maxReorderQty must be a number between 1 and 999999",
      });
    }
  }

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
        pr.min_threshold as "minThreshold",
        pr.target_stock as "targetStock",
        pr.suggested_quantity as "suggestedQuantity",
        pr.suggested_supplier_id as "suggestedSupplierId",
        COALESCE(ss.business_name, ss.trade_name) as "suggestedSupplierName",
        pr.suggested_unit_price as "suggestedUnitPrice",
        pr.supplier_product_id as "supplierProductId",
        pr.status,
        pr.dismissed_reason as "dismissedReason",
        pr.purchase_order_id as "purchaseOrderId",
        pr.expires_at as "expiresAt",
        pr.created_at as "createdAt",
        pr.updated_at as "updatedAt",
        ssl.payment_terms as "paymentTerms",
        ssl.credit_limit as "creditLimit",
        ssl.credit_period_days as "creditPeriodDays"
      FROM reorder.pending_reorders pr
      LEFT JOIN catalog.store_products sp ON sp.store_id = pr.store_id AND sp.product_id = pr.product_id
      LEFT JOIN catalog.products p ON p.id = pr.product_id
      LEFT JOIN inventory.stock_balances sb ON sb.store_id = pr.store_id AND sb.product_id = pr.product_id
      LEFT JOIN reorder.reorder_policies rp ON rp.store_id = pr.store_id AND rp.product_id = pr.product_id
      LEFT JOIN supplier.suppliers ss ON ss.id = pr.suggested_supplier_id
      LEFT JOIN supplier.supplier_store_links ssl ON ssl.supplier_id = pr.suggested_supplier_id AND ssl.store_id = pr.store_id
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

      // Get ALL requested reorders (not just pending ones) for STG-428 feedback
      const allResult = await client.query(
        `SELECT
          pr.id,
          pr.product_id as "productId",
          pr.suggested_supplier_id as "supplierId",
          pr.suggested_quantity as "quantity",
          pr.suggested_unit_price as "unitPrice",
          pr.supplier_product_id as "supplierProductId",
          pr.status,
          COALESCE(sp.display_name, p.name, pr.product_name) as "productName"
        FROM reorder.pending_reorders pr
        LEFT JOIN catalog.store_products sp ON sp.store_id = pr.store_id AND sp.product_id = pr.product_id
        LEFT JOIN catalog.products p ON p.id = pr.product_id
        WHERE pr.id = ANY($1::uuid[])
          AND pr.store_id = $2`,
        [ids, storeId]
      );

      // STG-428: Build per-item status for partial approval feedback
      const foundIds = new Set(allResult.rows.map((r: { id: string }) => r.id));
      const itemStatuses: Array<{
        id: string;
        status: "approved" | "failed";
        reason?: string;
        productName?: string;
      }> = [];

      // Track items not found in DB
      for (const id of ids) {
        if (!foundIds.has(id)) {
          itemStatuses.push({ id, status: "failed", reason: "Pending reorder not found" });
        }
      }

      // Separate valid pending from invalid
      const pendingRows = allResult.rows.filter((r: { status: string }) => r.status === "pending");
      const invalidRows = allResult.rows.filter((r: { status: string }) => r.status !== "pending");

      for (const row of invalidRows) {
        itemStatuses.push({
          id: row.id,
          status: "failed",
          reason: `Cannot approve reorder in '${row.status}' status`,
          productName: row.productName,
        });
      }

      if (pendingRows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          error: "No valid pending reorders found",
          // STG-428: Return per-item failure details
          itemStatuses,
        });
      }

      // Group by supplier
      const bySupplier = new Map<string, typeof pendingRows>();
      for (const row of pendingRows) {
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
        const reorderIds = items.map((i: { id: string }) => i.id);
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
              (order_id, supplier_product_id, product_id, ordered_quantity, unit_price, line_total, status)
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

        // Update pending reorders for this supplier group with purchase_order_id
        const groupIds = items.map((i: { id: string }) => i.id);
        await client.query(
          `UPDATE reorder.pending_reorders
           SET status = 'approved', purchase_order_id = $2, updated_at = NOW()
           WHERE id = ANY($1::uuid[])`,
          [groupIds, poId]
        );

        // STG-428: Track approved items
        for (const item of items) {
          itemStatuses.push({
            id: item.id,
            status: "approved",
            productName: item.productName,
          });
        }

        draftPurchaseOrders.push({
          id: poId,
          orderNumber: poResult.rows[0].orderNumber,
          supplierId,
          itemCount: items.length,
          totalAmount,
        });
      }

      await client.query("COMMIT");

      const approvedCount = pendingRows.length;
      const failedCount = itemStatuses.filter((s) => s.status === "failed").length;

      return res.json({
        success: true,
        data: {
          approvedCount,
          failedCount,
          draftPurchaseOrders,
          // STG-428: Per-item status for partial approval feedback
          itemStatuses,
        },
        message: `Approved ${approvedCount} pending reorders. Created ${draftPurchaseOrders.length} draft purchase orders.${failedCount > 0 ? ` ${failedCount} items failed.` : ""}`,
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

  // STG-443: Validate reason — required and max 500 characters
  if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: "reason is required",
    });
  }

  if (reason.trim().length > 500) {
    return res.status(400).json({
      success: false,
      error: "Dismissal reason must not exceed 500 characters",
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

// =============================================================================
// STG-491 (GUARD): PO SUBMISSION ENDPOINT
// POST /api/v1/reorder/stores/:storeId/reorder/submit-po
// Bridge between "approved reorder" and "actual purchase order"
// =============================================================================

reorderRouter.post("/stores/:storeId/reorder/submit-po", requireDeviceToken, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreIdFromDevice(req);
  const { reorderId } = req.body;

  // Validate input
  if (!reorderId || typeof reorderId !== "string") {
    return res.status(400).json({
      success: false,
      error: "reorderId is required and must be a string",
    });
  }

  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Get the approved reorder
      const reorderResult = await client.query(
        `SELECT
          pr.id,
          pr.product_id as "productId",
          pr.suggested_supplier_id as "supplierId",
          pr.suggested_quantity as "quantity",
          pr.suggested_unit_price as "unitPrice",
          pr.supplier_product_id as "supplierProductId",
          pr.purchase_order_id as "purchaseOrderId",
          pr.status,
          COALESCE(sp.display_name, p.name, pr.product_name) as "productName",
          COALESCE(ss.business_name, ss.trade_name) as "supplierName"
        FROM reorder.pending_reorders pr
        LEFT JOIN catalog.store_products sp ON sp.store_id = pr.store_id AND sp.product_id = pr.product_id
        LEFT JOIN catalog.products p ON p.id = pr.product_id
        LEFT JOIN supplier.suppliers ss ON ss.id = pr.suggested_supplier_id
        WHERE pr.id = $1 AND pr.store_id = $2`,
        [reorderId, storeId]
      );

      if (reorderResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          success: false,
          error: "Reorder not found",
        });
      }

      const reorder = reorderResult.rows[0];

      if (reorder.status !== "approved") {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          error: `Cannot submit PO for reorder in '${reorder.status}' status. Must be 'approved' first.`,
        });
      }

      // If a PO already exists in draft status, transition it to submitted
      if (reorder.purchaseOrderId) {
        const poCheck = await client.query(
          `SELECT id, status FROM orders.purchase_orders WHERE id = $1 AND store_id = $2`,
          [reorder.purchaseOrderId, storeId]
        );

        if (poCheck.rows.length > 0) {
          const poStatus = poCheck.rows[0].status;
          if (poStatus === "submitted") {
            await client.query("ROLLBACK");
            return res.status(400).json({
              success: false,
              error: "Purchase order has already been submitted",
            });
          }

          // Update existing draft PO to submitted
          await client.query(
            `UPDATE orders.purchase_orders
             SET status = 'submitted', submitted_at = NOW(), updated_at = NOW()
             WHERE id = $1 AND store_id = $2`,
            [reorder.purchaseOrderId, storeId]
          );

          // Update PO items status
          await client.query(
            `UPDATE orders.purchase_order_items
             SET status = 'submitted', updated_at = NOW()
             WHERE order_id = $1 AND status = 'pending'`,
            [reorder.purchaseOrderId]
          );

          await client.query("COMMIT");

          return res.json({
            success: true,
            data: {
              purchaseOrderId: reorder.purchaseOrderId,
              reorderId: reorder.id,
              supplierId: reorder.supplierId,
              supplierName: reorder.supplierName,
              status: "submitted",
            },
            message: "Purchase order submitted to supplier successfully",
          });
        }
      }

      // No existing PO — create and submit a new one
      const orderNumber = `PO-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      const totalAmount = (reorder.quantity || 0) * (reorder.unitPrice || 0);

      const poResult = await client.query(
        `INSERT INTO orders.purchase_orders
          (store_id, supplier_id, order_number, order_type, source_reorder_ids, status, total_amount, item_count, submitted_at)
         VALUES ($1, $2, $3, 'reorder', ARRAY[$4]::uuid[], 'submitted', $5, 1, NOW())
         RETURNING id, order_number as "orderNumber"`,
        [storeId, reorder.supplierId, orderNumber, reorder.id, totalAmount]
      );

      const poId = poResult.rows[0].id;

      // Create PO item
      await client.query(
        `INSERT INTO orders.purchase_order_items
          (order_id, supplier_product_id, product_id, ordered_quantity, unit_price, line_total, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'submitted')`,
        [
          poId,
          reorder.supplierProductId,
          reorder.productId,
          reorder.quantity || 0,
          reorder.unitPrice || 0,
          totalAmount,
        ]
      );

      // Link reorder to PO
      await client.query(
        `UPDATE reorder.pending_reorders
         SET purchase_order_id = $2, updated_at = NOW()
         WHERE id = $1`,
        [reorder.id, poId]
      );

      await client.query("COMMIT");

      return res.json({
        success: true,
        data: {
          purchaseOrderId: poId,
          orderNumber: poResult.rows[0].orderNumber,
          reorderId: reorder.id,
          supplierId: reorder.supplierId,
          supplierName: reorder.supplierName,
          totalAmount,
          status: "submitted",
        },
        message: "Purchase order created and submitted to supplier successfully",
      });
    } catch (innerError) {
      await client.query("ROLLBACK");
      throw innerError;
    } finally {
      client.release();
    }
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[ReorderSubmitPO] Error:", error.message);

    if (error.code === "42P01") {
      return res.status(400).json({
        success: false,
        error: "Reorder system not initialized",
      });
    }

    return res.status(500).json({
      success: false,
      error: "Failed to submit purchase order",
    });
  }
});

// =============================================================================
// STG-417: EXPIRY CLEANUP JOB FOR PENDING REORDERS
// POST /api/v1/reorder/stores/:storeId/reorder/expire-pending
// Marks pending reorder suggestions as expired if older than threshold (default 7 days)
// Callable as a cron job or manually
// =============================================================================

reorderRouter.post("/stores/:storeId/reorder/expire-pending", requireDeviceToken, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreIdFromDevice(req);
  const { expiryDays } = req.body;

  // STG-417: Configurable expiry threshold, default 7 days
  const EXPIRY_DAYS_DEFAULT = 7;
  const EXPIRY_DAYS_MIN = 1;
  const EXPIRY_DAYS_MAX = 90;

  let effectiveExpiryDays = EXPIRY_DAYS_DEFAULT;
  if (expiryDays !== undefined && expiryDays !== null) {
    const val = Number(expiryDays);
    if (!Number.isFinite(val) || val < EXPIRY_DAYS_MIN || val > EXPIRY_DAYS_MAX) {
      return res.status(400).json({
        success: false,
        error: `expiryDays must be between ${EXPIRY_DAYS_MIN} and ${EXPIRY_DAYS_MAX}`,
      });
    }
    effectiveExpiryDays = val;
  }

  try {
    const result = await pool.query(
      `UPDATE reorder.pending_reorders
       SET status = 'expired', updated_at = NOW()
       WHERE store_id = $1
         AND status = 'pending'
         AND created_at < NOW() - ($2 || ' days')::interval
       RETURNING id, product_id as "productId", product_name as "productName"`,
      [storeId, String(effectiveExpiryDays)]
    );

    const expiredCount = result.rows.length;

    return res.json({
      success: true,
      data: {
        expiredCount,
        expiryDays: effectiveExpiryDays,
        expiredItems: result.rows,
      },
      message: `Expired ${expiredCount} pending reorders older than ${effectiveExpiryDays} days`,
    });
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[ReorderExpiry] Error:", error.message);

    if (error.code === "42P01") {
      return res.json({
        success: true,
        data: { expiredCount: 0, expiryDays: effectiveExpiryDays, expiredItems: [] },
        message: "No pending reorders to expire",
      });
    }

    return res.status(500).json({
      success: false,
      error: "Failed to expire pending reorders",
    });
  }
});

// =============================================================================
// STG-419: AUTO-APPROVE THRESHOLD LOGIC
// POST /api/v1/reorder/stores/:storeId/reorder/auto-approve
// Auto-approves pending reorders whose total value is below the store's threshold
// =============================================================================

reorderRouter.post("/stores/:storeId/reorder/auto-approve", requireDeviceToken, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreIdFromDevice(req);

  try {
    // Get store's auto-approve threshold
    const settingsResult = await pool.query(
      `SELECT auto_approve_threshold as "autoApproveThreshold"
       FROM reorder.store_reorder_settings
       WHERE store_id = $1`,
      [storeId]
    );

    const threshold = settingsResult.rows[0]?.autoApproveThreshold;

    if (!threshold || Number(threshold) <= 0) {
      return res.json({
        success: true,
        data: {
          autoApprovedCount: 0,
          threshold: threshold || null,
        },
        message: "Auto-approve threshold not configured or is zero. No items auto-approved.",
      });
    }

    const thresholdValue = Number(threshold);

    // Find pending reorders below threshold
    const pendingResult = await pool.query(
      `SELECT
        pr.id,
        pr.product_id as "productId",
        pr.suggested_supplier_id as "supplierId",
        pr.suggested_quantity as "quantity",
        pr.suggested_unit_price as "unitPrice",
        pr.supplier_product_id as "supplierProductId",
        COALESCE(pr.suggested_quantity * pr.suggested_unit_price, 0) as "totalValue"
      FROM reorder.pending_reorders pr
      WHERE pr.store_id = $1
        AND pr.status = 'pending'
        AND COALESCE(pr.suggested_quantity * pr.suggested_unit_price, 0) <= $2
      ORDER BY pr.created_at ASC`,
      [storeId, thresholdValue]
    );

    if (pendingResult.rows.length === 0) {
      return res.json({
        success: true,
        data: {
          autoApprovedCount: 0,
          threshold: thresholdValue,
        },
        message: "No pending reorders below threshold to auto-approve",
      });
    }

    // Auto-approve in a transaction — create draft POs grouped by supplier
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const idsToApprove = pendingResult.rows.map((r: { id: string }) => r.id);

      // Group by supplier
      const bySupplier = new Map<string, typeof pendingResult.rows>();
      for (const row of pendingResult.rows) {
        const supplierId = row.supplierId || "unknown";
        if (!bySupplier.has(supplierId)) {
          bySupplier.set(supplierId, []);
        }
        bySupplier.get(supplierId)!.push(row);
      }

      const draftPurchaseOrders: Array<{
        id: string;
        orderNumber: string;
        supplierId: string;
        itemCount: number;
        totalAmount: number;
      }> = [];

      for (const [supplierId, items] of bySupplier) {
        const orderNumber = `PO-AUTO-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
        let totalAmount = 0;
        for (const item of items) {
          totalAmount += (item.quantity || 0) * (item.unitPrice || 0);
        }

        const reorderIds = items.map((i: { id: string }) => i.id);
        const poResult = await client.query(
          `INSERT INTO orders.purchase_orders
            (store_id, supplier_id, order_number, order_type, source_reorder_ids, status, total_amount, item_count)
           VALUES ($1, $2, $3, 'reorder', $4, 'draft', $5, $6)
           RETURNING id, order_number as "orderNumber"`,
          [storeId, supplierId === "unknown" ? null : supplierId, orderNumber, reorderIds, totalAmount, items.length]
        );

        const poId = poResult.rows[0].id;

        for (const item of items) {
          await client.query(
            `INSERT INTO orders.purchase_order_items
              (order_id, supplier_product_id, product_id, ordered_quantity, unit_price, line_total, status)
             VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
            [poId, item.supplierProductId, item.productId, item.quantity || 0, item.unitPrice || 0, (item.quantity || 0) * (item.unitPrice || 0)]
          );
        }

        const groupIds = items.map((i: { id: string }) => i.id);
        await client.query(
          `UPDATE reorder.pending_reorders
           SET status = 'approved', purchase_order_id = $2, updated_at = NOW()
           WHERE id = ANY($1::uuid[])`,
          [groupIds, poId]
        );

        draftPurchaseOrders.push({
          id: poId,
          orderNumber: poResult.rows[0].orderNumber,
          supplierId,
          itemCount: items.length,
          totalAmount,
        });
      }

      await client.query("COMMIT");

      return res.json({
        success: true,
        data: {
          autoApprovedCount: idsToApprove.length,
          threshold: thresholdValue,
          draftPurchaseOrders,
        },
        message: `Auto-approved ${idsToApprove.length} pending reorders below ₹${thresholdValue} threshold`,
      });
    } catch (innerError) {
      await client.query("ROLLBACK");
      throw innerError;
    } finally {
      client.release();
    }
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[ReorderAutoApprove] Error:", error.message);

    if (error.code === "42P01") {
      return res.json({
        success: true,
        data: { autoApprovedCount: 0, threshold: null },
        message: "Reorder system not initialized",
      });
    }

    return res.status(500).json({
      success: false,
      error: "Failed to auto-approve pending reorders",
    });
  }
});

// =============================================================================
// STG-426: PAYMENT TERMS FROM BACKEND
// GET /api/v1/reorder/stores/:storeId/reorder/supplier-terms
// Returns payment terms alongside supplier data for the reorder flow
// Replaces any hardcoded frontend payment terms
// =============================================================================

reorderRouter.get("/stores/:storeId/reorder/supplier-terms", requireDeviceToken, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreIdFromDevice(req);
  const { supplierId } = req.query;

  try {
    if (supplierId && typeof supplierId === "string") {
      // Get terms for a specific supplier
      const result = await pool.query(
        `SELECT
          s.id as "supplierId",
          COALESCE(s.business_name, s.trade_name) as "supplierName",
          ssl.payment_terms as "paymentTerms",
          ssl.credit_limit as "creditLimit",
          ssl.credit_period_days as "creditPeriodDays",
          ssl.priority,
          ssl.status
        FROM supplier.suppliers s
        JOIN supplier.supplier_store_links ssl ON ssl.supplier_id = s.id AND ssl.store_id = $1
        WHERE s.id = $2 AND ssl.status = 'active'`,
        [storeId, supplierId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Supplier not found or not linked to this store",
        });
      }

      return res.json({
        success: true,
        data: result.rows[0],
      });
    }

    // Get terms for all active suppliers linked to this store
    const result = await pool.query(
      `SELECT
        s.id as "supplierId",
        COALESCE(s.business_name, s.trade_name) as "supplierName",
        ssl.payment_terms as "paymentTerms",
        ssl.credit_limit as "creditLimit",
        ssl.credit_period_days as "creditPeriodDays",
        ssl.priority,
        ssl.status
      FROM supplier.suppliers s
      JOIN supplier.supplier_store_links ssl ON ssl.supplier_id = s.id AND ssl.store_id = $1
      WHERE ssl.status = 'active'
      ORDER BY ssl.priority ASC NULLS LAST, COALESCE(s.business_name, s.trade_name) ASC`,
      [storeId]
    );

    return res.json({
      success: true,
      data: result.rows,
    });
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[ReorderSupplierTerms] Error:", error.message);

    if (error.code === "42P01") {
      return res.json({
        success: true,
        data: supplierId ? null : [],
      });
    }

    return res.status(500).json({
      success: false,
      error: "Failed to load supplier terms",
    });
  }
});
