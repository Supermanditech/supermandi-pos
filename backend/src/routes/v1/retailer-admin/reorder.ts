// T-243: Retailer Admin Reorder Routes (fixed to match 007 canonical schema)
// Mirrors POS reorder functionality for retailer web dashboard
// Allows retailers to view reorder suggestions and manage settings

import { Router, Request, Response } from "express";
import { getPool } from "../../../db/client";
import { log } from "../../../lib/logger";
import { asError } from "../../../lib/errorUtils";

export const retailerReorderRouter = Router();

function getStoreId(req: Request): string | null {
  // x-actor-id is set by API gateway from JWT — this is the canonical
  // store isolation method for retailer-admin routes
  const actorId = req.headers['x-actor-id'];
  return typeof actorId === 'string' ? actorId : null;
}

// =============================================================================
// GET /api/v1/retailer-admin/reorder/settings
// Get or initialize reorder settings for the store
// Schema: reorder.store_reorder_settings (migration 007 + 150)
// =============================================================================
retailerReorderRouter.get("/reorder/settings", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreId(req);
  if (!storeId) return res.status(401).json({ error: "Store not identified" });

  try {
    const result = await pool.query(
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
      return res.json({
        data: {
          storeId,
          reorderEnabled: true,
          requireApproval: true,
          notifyOnLowStock: true,
          autoApproveThreshold: null,
          defaultLeadDays: 3,
          updatedAt: null,
        },
      });
    }

    return res.json({ data: result.rows[0] });
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[Retailer Reorder] Get settings error:", error.message);
    return res.status(500).json({ error: "Failed to get reorder settings" });
  }
});

// =============================================================================
// PUT /api/v1/retailer-admin/reorder/settings
// Update reorder settings for the store
// Schema: reorder.store_reorder_settings (migration 007 + 150)
// =============================================================================
retailerReorderRouter.put("/reorder/settings", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreId(req);
  if (!storeId) return res.status(401).json({ error: "Store not identified" });

  const {
    reorderEnabled,
    requireApproval,
    notifyOnLowStock,
    autoApproveThreshold,
    defaultLeadDays,
  } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO reorder.store_reorder_settings
        (store_id, reorder_enabled, require_approval, notify_on_low_stock, auto_approve_threshold, default_lead_days)
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

    return res.json({ data: result.rows[0] });
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[Retailer Reorder] Update settings error:", error.message);
    return res.status(500).json({ error: "Failed to update reorder settings" });
  }
});

// =============================================================================
// GET /api/v1/retailer-admin/reorder/suggestions
// Get products that need reordering based on reorder policies
// Uses reorder_policies for per-product thresholds, stock_balances for current stock
// =============================================================================
retailerReorderRouter.get("/reorder/suggestions", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreId(req);
  if (!storeId) return res.status(401).json({ error: "Store not identified" });

  try {
    const result = await pool.query(
      `SELECT
        sp.id as "storeProductId",
        sp.product_id as "productId",
        COALESCE(sp.display_name, p.name) as "productName",
        p.category,
        p.unit,
        COALESCE(sb.current_qty, 0) as "currentStock",
        rp.min_stock as "minStock",
        rp.target_stock as "targetStock",
        rp.max_reorder_qty as "maxReorderQty",
        sp.purchase_price as "purchasePrice",
        sp.sell_price as "sellPrice"
      FROM reorder.reorder_policies rp
      JOIN catalog.store_products sp ON sp.store_id = rp.store_id AND sp.product_id = rp.product_id
      JOIN catalog.products p ON p.id = rp.product_id
      LEFT JOIN inventory.stock_balances sb ON sb.store_id = rp.store_id AND sb.product_id = rp.product_id
      WHERE rp.store_id = $1
        AND rp.is_enabled = true
        AND sp.is_active = true
        AND COALESCE(sb.current_qty, 0) <= rp.min_stock
      ORDER BY COALESCE(sb.current_qty, 0) ASC
      LIMIT 100`,
      [storeId]
    );

    return res.json({
      data: result.rows,
      total: result.rows.length,
    });
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[Retailer Reorder] Suggestions error:", error.message);
    return res.status(500).json({ error: "Failed to get reorder suggestions" });
  }
});

// =============================================================================
// GET /api/v1/retailer-admin/reorder/pending
// Get pending reorder records for the store
// Schema: reorder.pending_reorders (migration 007)
// =============================================================================
retailerReorderRouter.get("/reorder/pending", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreId(req);
  if (!storeId) return res.status(401).json({ error: "Store not identified" });

  const limit = Math.min(parseInt(String(req.query.limit)) || 50, 100);
  const offset = Math.max(parseInt(String(req.query.offset)) || 0, 0);

  try {
    const result = await pool.query(
      `SELECT
        pr.id,
        pr.store_id as "storeId",
        pr.product_id as "productId",
        pr.product_name as "productName",
        pr.current_stock as "currentStock",
        pr.min_threshold as "minThreshold",
        pr.target_stock as "targetStock",
        pr.suggested_quantity as "suggestedQuantity",
        pr.suggested_supplier_name as "supplierName",
        pr.suggested_unit_price as "unitPrice",
        pr.status,
        pr.expires_at as "expiresAt",
        pr.created_at as "createdAt"
      FROM reorder.pending_reorders pr
      WHERE pr.store_id = $1
        AND pr.status = 'pending'
      ORDER BY pr.created_at DESC
      LIMIT $2 OFFSET $3`,
      [storeId, limit, offset]
    );

    return res.json({ data: result.rows, total: result.rows.length });
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[Retailer Reorder] Pending error:", error.message);
    return res.status(500).json({ error: "Failed to get pending reorders" });
  }
});
