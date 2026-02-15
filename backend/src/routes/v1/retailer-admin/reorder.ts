// CL-017: Retailer Admin Reorder Routes
// Mirrors POS reorder functionality for retailer web dashboard
// Allows retailers to view reorder suggestions and manage settings

import { Router, Request, Response } from "express";
import { getPool } from "../../../db/client";

export const retailerReorderRouter = Router();

function getStoreId(req: Request): string | null {
  const actorId = req.headers['x-actor-id'];
  return typeof actorId === 'string' ? actorId : null;
}

// =============================================================================
// GET /api/v1/retailer-admin/reorder/settings
// Get or initialize reorder settings for the store
// =============================================================================
retailerReorderRouter.get("/reorder/settings", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreId(req);
  if (!storeId) return res.status(401).json({ error: "Store not identified" });

  try {
    let result = await pool.query(
      `SELECT
        store_id as "storeId",
        is_enabled as "isEnabled",
        low_stock_threshold as "lowStockThreshold",
        reorder_window_days as "reorderWindowDays",
        auto_create_po as "autoCreatePo",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM reorder.store_reorder_settings
      WHERE store_id = $1`,
      [storeId]
    );

    if (result.rows.length === 0) {
      // Return defaults
      return res.json({
        data: {
          storeId,
          isEnabled: false,
          lowStockThreshold: 10,
          reorderWindowDays: 7,
          autoCreatePo: false,
          createdAt: null,
          updatedAt: null,
        },
      });
    }

    return res.json({ data: result.rows[0] });
  } catch (error: any) {
    console.error("[Retailer Reorder] Get settings error:", error.message);
    return res.status(500).json({ error: "Failed to get reorder settings" });
  }
});

// =============================================================================
// PUT /api/v1/retailer-admin/reorder/settings
// Update reorder settings for the store
// =============================================================================
retailerReorderRouter.put("/reorder/settings", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreId(req);
  if (!storeId) return res.status(401).json({ error: "Store not identified" });

  const { isEnabled, lowStockThreshold, reorderWindowDays, autoCreatePo } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO reorder.store_reorder_settings
        (store_id, is_enabled, low_stock_threshold, reorder_window_days, auto_create_po)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (store_id) DO UPDATE SET
        is_enabled = COALESCE($2, reorder.store_reorder_settings.is_enabled),
        low_stock_threshold = COALESCE($3, reorder.store_reorder_settings.low_stock_threshold),
        reorder_window_days = COALESCE($4, reorder.store_reorder_settings.reorder_window_days),
        auto_create_po = COALESCE($5, reorder.store_reorder_settings.auto_create_po),
        updated_at = NOW()
       RETURNING
        store_id as "storeId",
        is_enabled as "isEnabled",
        low_stock_threshold as "lowStockThreshold",
        reorder_window_days as "reorderWindowDays",
        auto_create_po as "autoCreatePo",
        updated_at as "updatedAt"`,
      [storeId, isEnabled, lowStockThreshold, reorderWindowDays, autoCreatePo]
    );

    return res.json({ data: result.rows[0] });
  } catch (error: any) {
    console.error("[Retailer Reorder] Update settings error:", error.message);
    return res.status(500).json({ error: "Failed to update reorder settings" });
  }
});

// =============================================================================
// GET /api/v1/retailer-admin/reorder/suggestions
// Get products that need reordering based on current stock vs threshold
// =============================================================================
retailerReorderRouter.get("/reorder/suggestions", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreId(req);
  if (!storeId) return res.status(401).json({ error: "Store not identified" });

  try {
    // Get reorder settings
    const settingsResult = await pool.query(
      `SELECT low_stock_threshold, is_enabled FROM reorder.store_reorder_settings WHERE store_id = $1`,
      [storeId]
    );

    const threshold = settingsResult.rows[0]?.low_stock_threshold ?? 10;

    // Get products below threshold
    const result = await pool.query(
      `SELECT
        sp.id as "storeProductId",
        sp.product_id as "productId",
        COALESCE(sp.display_name, p.name) as "productName",
        p.category,
        p.unit,
        COALESCE(sb.current_qty, sp.current_stock, 0) as "currentStock",
        sp.purchase_price as "purchasePrice",
        sp.sell_price as "sellPrice",
        $2::integer as "threshold"
      FROM catalog.store_products sp
      JOIN catalog.products p ON p.id = sp.product_id
      LEFT JOIN inventory.stock_balances sb ON sb.store_id = sp.store_id AND sb.product_id = sp.product_id
      WHERE sp.store_id = $1
        AND sp.is_active = true
        AND p.is_active = true
        AND COALESCE(sb.current_qty, sp.current_stock, 0) <= $2
      ORDER BY COALESCE(sb.current_qty, sp.current_stock, 0) ASC
      LIMIT 100`,
      [storeId, threshold]
    );

    return res.json({
      data: result.rows,
      total: result.rows.length,
      threshold,
    });
  } catch (error: any) {
    console.error("[Retailer Reorder] Suggestions error:", error.message);
    return res.status(500).json({ error: "Failed to get reorder suggestions" });
  }
});

// =============================================================================
// GET /api/v1/retailer-admin/reorder/pending
// Get pending reorder records for the store
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
        COALESCE(p.name, 'Unknown') as "productName",
        pr.current_stock as "currentStock",
        pr.threshold,
        pr.suggested_qty as "suggestedQty",
        pr.status,
        pr.created_at as "createdAt"
      FROM reorder.pending_reorders pr
      JOIN catalog.products p ON p.id = pr.product_id
      WHERE pr.store_id = $1
        AND pr.status = 'pending'
      ORDER BY pr.created_at DESC
      LIMIT $2 OFFSET $3`,
      [storeId, limit, offset]
    );

    return res.json({ data: result.rows, total: result.rows.length });
  } catch (error: any) {
    console.error("[Retailer Reorder] Pending error:", error.message);
    return res.status(500).json({ error: "Failed to get pending reorders" });
  }
});
