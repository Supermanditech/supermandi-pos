// Retailer Admin Inventory Routes - V3.0.10 compliant
// Inventory endpoints for retailer dashboard
// FE-RETAILER-CAT-001: Categories UI from POS taxonomy
// RCAT-DEPLOY-001: Health endpoint for gateway routing verification

import { Router, Request, Response } from "express";
import { getPool } from "../../../db/client";

// Git SHA and build time for health endpoint
const GIT_SHA = process.env['GIT_SHA'] || 'dev';
const BUILD_TIME = process.env['BUILD_TIME'] || new Date().toISOString();

export const retailerAdminInventoryRouter = Router();

// =============================================================================
// HEALTH ENDPOINT - RCAT-DEPLOY-001
// =============================================================================

/**
 * GET /api/v1/retailer-admin/health
 * Health check endpoint for gateway routing verification
 * Returns version info and git SHA for deployment verification
 * This endpoint is public (no JWT required)
 */
retailerAdminInventoryRouter.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "retailer-admin-api",
    version: "3.0.10",
    gitSha: GIT_SHA,
    buildTime: BUILD_TIME,
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || "development",
  });
});

/**
 * Get store ID from gateway-provided headers
 * Gateway sets x-actor-id after JWT verification
 */
function getStoreId(req: Request): string | null {
  const actorId = req.headers['x-actor-id'];
  return typeof actorId === 'string' ? actorId : null;
}

// =============================================================================
// INVENTORY OVERVIEW - FE-RETAILER-INVENTORY-001
// =============================================================================

/**
 * GET /api/v1/retailer-admin/inventory
 * Get inventory overview with aggregated values
 *
 * Returns array of products with:
 * - productId, productName, barcode
 * - totalStockQty: current stock on hand
 * - totalPurchaseValue: sum of inward costs (paise)
 * - totalSellRevenue: sum of sales (paise)
 */
retailerAdminInventoryRouter.get("/inventory", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreId(req);
  if (!storeId) {
    return res.status(401).json({ error: "Store not identified" });
  }

  try {
    // Query store_products for current stock and calculate aggregates from ledger
    const result = await pool.query(
      `SELECT
        sp.product_id as "productId",
        COALESCE(sp.display_name, p.name) as "productName",
        p.primary_barcode as "barcode",
        COALESCE(sp.current_stock, 0) as "totalStockQty",
        COALESCE(
          (SELECT SUM(ABS(delta_qty) * COALESCE(unit_cost, 0))
           FROM inventory.inventory_ledger il
           WHERE il.store_id = sp.store_id
             AND il.product_id = sp.product_id
             AND il.transaction_type IN ('purchase_received', 'opening_stock')),
          0
        )::bigint as "totalPurchaseValue",
        COALESCE(
          (SELECT SUM(ABS(delta_qty) * COALESCE(unit_cost, 0))
           FROM inventory.inventory_ledger il
           WHERE il.store_id = sp.store_id
             AND il.product_id = sp.product_id
             AND il.transaction_type = 'sale'),
          0
        )::bigint as "totalSellRevenue"
      FROM catalog.store_products sp
      JOIN catalog.products p ON p.id = sp.product_id
      WHERE sp.store_id = $1
        AND (sp.is_active = true OR sp.is_active IS NULL)
      ORDER BY COALESCE(sp.display_name, p.name) ASC`,
      [storeId]
    );

    // RCAT-METRICS-001: Ensure numeric types (bigint comes as string from pg)
    const data = result.rows.map(row => ({
      ...row,
      totalStockQty: Number(row.totalStockQty) || 0,
      totalPurchaseValue: Number(row.totalPurchaseValue) || 0,
      totalSellRevenue: Number(row.totalSellRevenue) || 0,
    }));

    // RCAT-METRICS-001: Compute totals server-side for accuracy
    const totals = {
      totalProducts: data.length,
      totalStockQty: data.reduce((sum, r) => sum + r.totalStockQty, 0),
      totalPurchaseValue: data.reduce((sum, r) => sum + r.totalPurchaseValue, 0),
      totalSellRevenue: data.reduce((sum, r) => sum + r.totalSellRevenue, 0),
    };

    return res.json({
      success: true,
      data,
      totals,
    });
  } catch (error: any) {
    console.error("[RetailerInventory] Error:", error.message);

    // If table doesn't exist, return empty list
    if (error.code === "42P01") {
      return res.json({
        success: true,
        data: [],
        totals: { totalProducts: 0, totalStockQty: 0, totalPurchaseValue: 0, totalSellRevenue: 0 },
      });
    }

    return res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Failed to load inventory" },
    });
  }
});

// =============================================================================
// LEDGER HISTORY - FE-RETAILER-INVENTORY-001
// =============================================================================

/**
 * GET /api/v1/retailer-admin/inventory/ledger
 * Get ledger entries for retailer dashboard
 *
 * Query params:
 * - productId: filter by product (optional)
 * - transactionType: filter by type (sale, purchase_received, etc.)
 * - startDate: filter from date (ISO string)
 * - endDate: filter to date (ISO string)
 * - limit: page size (default 50, max 200)
 * - offset: pagination offset
 */
retailerAdminInventoryRouter.get("/inventory/ledger", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreId(req);
  if (!storeId) {
    return res.status(401).json({ error: "Store not identified" });
  }

  const { productId, transactionType, startDate, endDate, limit = "50", offset = "0" } = req.query;

  try {
    let whereClause = "WHERE il.store_id = $1";
    const params: any[] = [storeId];
    let paramIndex = 2;

    if (productId && typeof productId === "string") {
      whereClause += ` AND il.product_id = $${paramIndex}`;
      params.push(productId);
      paramIndex++;
    }

    if (transactionType && typeof transactionType === "string") {
      whereClause += ` AND il.transaction_type = $${paramIndex}`;
      params.push(transactionType);
      paramIndex++;
    }

    if (startDate && typeof startDate === "string") {
      whereClause += ` AND il.created_at >= $${paramIndex}`;
      params.push(new Date(startDate).toISOString());
      paramIndex++;
    }

    if (endDate && typeof endDate === "string") {
      whereClause += ` AND il.created_at <= $${paramIndex}`;
      params.push(new Date(endDate).toISOString());
      paramIndex++;
    }

    const limitNum = Math.min(parseInt(limit as string, 10) || 50, 200);
    const offsetNum = parseInt(offset as string, 10) || 0;

    // RCAT-LEDGER-001: Get totals (totalSkus, totalEntries, todaysMovements) for summary
    const totalsResult = await pool.query(
      `SELECT
        COUNT(*) as "totalEntries",
        COUNT(DISTINCT il.product_id) as "totalSkus",
        COUNT(*) FILTER (WHERE il.created_at >= CURRENT_DATE) as "todaysMovements"
      FROM inventory.inventory_ledger il
      WHERE il.store_id = $1`,
      [storeId]
    );
    const totals = {
      totalSkus: parseInt(totalsResult.rows[0]?.totalSkus || "0", 10),
      totalEntries: parseInt(totalsResult.rows[0]?.totalEntries || "0", 10),
      todaysMovements: parseInt(totalsResult.rows[0]?.todaysMovements || "0", 10),
    };

    // Get total count (for current filter)
    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM inventory.inventory_ledger il ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.total || "0", 10);

    // Get paginated results with product details
    const result = await pool.query(
      `SELECT
        il.id,
        il.store_id as "storeId",
        il.product_id as "productId",
        COALESCE(sp.display_name, p.name) as "productName",
        p.primary_barcode as "barcode",
        il.delta_qty as "deltaQty",
        il.transaction_type as "transactionType",
        il.reference_type as "referenceType",
        il.reference_id as "referenceId",
        il.stock_before as "stockBefore",
        il.stock_after as "stockAfter",
        il.unit_cost as "unitCost",
        il.created_at as "createdAt"
      FROM inventory.inventory_ledger il
      LEFT JOIN catalog.store_products sp ON sp.store_id = il.store_id AND sp.product_id = il.product_id
      LEFT JOIN catalog.products p ON p.id = il.product_id
      ${whereClause}
      ORDER BY il.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limitNum, offsetNum]
    );

    // RCAT-INV-001: Ensure numeric types for all ledger entry values
    const entries = result.rows.map(row => ({
      ...row,
      deltaQty: Number(row.deltaQty) || 0,
      stockBefore: Number(row.stockBefore) || 0,
      stockAfter: Number(row.stockAfter) || 0,
      unitCost: Number(row.unitCost) || 0,
    }));

    return res.json({
      success: true,
      data: entries,
      totals,
      pagination: {
        total,
        limit: limitNum,
        offset: offsetNum,
        hasMore: offsetNum + result.rows.length < total,
      },
    });
  } catch (error: any) {
    console.error("[RetailerLedger] Error:", error.message);

    // If table doesn't exist, return empty list
    if (error.code === "42P01") {
      return res.json({
        success: true,
        data: [],
        totals: { totalSkus: 0, totalEntries: 0, todaysMovements: 0 },
        pagination: {
          total: 0,
          limit: 50,
          offset: 0,
          hasMore: false,
        },
      });
    }

    return res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Failed to load ledger entries" },
    });
  }
});

// =============================================================================
// CATEGORIES - FE-RETAILER-CAT-001
// =============================================================================

/**
 * GET /api/v1/retailer-admin/categories
 * Get FMCG taxonomy categories with product counts for the store
 *
 * Returns array of categories with:
 * - id, labelEn, labelHi, iconKey, sortOrder
 * - productCount: number of products in this category
 * - stockValue: total stock value (paise) for products in category
 */
retailerAdminInventoryRouter.get("/categories", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreId(req);
  if (!storeId) {
    return res.status(401).json({ error: "Store not identified" });
  }

  try {
    // RCAT-CAT-002: Get FMCG taxonomy categories with product counts + store overrides
    // Joins with store_category_overrides for rename/hide support
    const result = await pool.query(
      `WITH store_counts AS (
        SELECT
          COALESCE(sp.taxonomy_id, 'f0000000-0000-0000-0000-00000000000f') as taxonomy_id,
          COUNT(*) as product_count,
          COALESCE(SUM(sp.current_stock * sp.sell_price), 0) as stock_value
        FROM catalog.store_products sp
        WHERE sp.store_id = $1
          AND (sp.is_active = true OR sp.is_active IS NULL)
        GROUP BY COALESCE(sp.taxonomy_id, 'f0000000-0000-0000-0000-00000000000f')
      ),
      total_counts AS (
        SELECT
          COUNT(*) as total_products,
          COALESCE(SUM(sp.current_stock * sp.sell_price), 0) as total_stock_value
        FROM catalog.store_products sp
        WHERE sp.store_id = $1
          AND (sp.is_active = true OR sp.is_active IS NULL)
      )
      SELECT
        ft.id,
        COALESCE(sco.display_name_en, ft.label_en) as "labelEn",
        COALESCE(sco.display_name_hi, ft.label_hi) as "labelHi",
        ft.icon_key as "iconKey",
        ft.sort_order as "sortOrder",
        CASE
          WHEN ft.sort_order = 0 THEN (SELECT total_products FROM total_counts)
          ELSE COALESCE(sc.product_count, 0)
        END as "productCount",
        CASE
          WHEN ft.sort_order = 0 THEN (SELECT total_stock_value FROM total_counts)
          ELSE COALESCE(sc.stock_value, 0)
        END::bigint as "stockValue",
        COALESCE(sco.is_hidden, false) as "isHidden"
      FROM catalog.fmcg_taxonomy ft
      LEFT JOIN store_counts sc ON ft.id = sc.taxonomy_id
      LEFT JOIN catalog.store_category_overrides sco ON sco.category_id = ft.id AND sco.store_id = $1
      WHERE ft.is_active = true
      ORDER BY ft.sort_order ASC`,
      [storeId]
    );

    // RCAT-CAT-003: Ensure numeric types (bigint comes as string from pg)
    // RCAT-CAT-002: Include isHidden flag for store overrides
    const categories = result.rows.map(row => ({
      ...row,
      productCount: Number(row.productCount) || 0,
      stockValue: Number(row.stockValue) || 0,
      isHidden: row.isHidden === true,
    }));

    return res.json({
      success: true,
      data: categories,
      count: categories.length,
    });
  } catch (error: any) {
    console.error("[RetailerCategories] Error:", error.message);

    // If fmcg_taxonomy table doesn't exist, return default categories
    if (error.code === "42P01") {
      // Return minimal default categories when table doesn't exist
      return res.json({
        success: true,
        data: [
          { id: "all", labelEn: "All", labelHi: "सभी", iconKey: "view-grid", sortOrder: 0, productCount: 0, stockValue: 0 },
        ],
        count: 1,
      });
    }

    return res.status(500).json({
      success: false,
      error: "Failed to load categories",
    });
  }
});

/**
 * GET /api/v1/retailer-admin/categories/:categoryId/products
 * Get products in a specific category
 *
 * Path params:
 * - categoryId: FMCG taxonomy ID (or 'all' for all products)
 *
 * Query params:
 * - limit: page size (default 50, max 200)
 * - offset: pagination offset
 * - search: filter by product name
 */
retailerAdminInventoryRouter.get("/categories/:categoryId/products", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreId(req);
  if (!storeId) {
    return res.status(401).json({ error: "Store not identified" });
  }

  const { categoryId } = req.params;
  const { limit = "50", offset = "0", search } = req.query;

  try {
    let whereClause = "WHERE sp.store_id = $1 AND (sp.is_active = true OR sp.is_active IS NULL)";
    const params: any[] = [storeId];
    let paramIndex = 2;

    // Filter by category (unless 'all' or the "Sab" category ID)
    const isAllCategory = categoryId === 'all' || categoryId === 'f0000000-0000-0000-0000-000000000001';
    if (!isAllCategory) {
      // Handle "Baaki" (Others) category - products with null taxonomy_id
      if (categoryId === 'f0000000-0000-0000-0000-00000000000f') {
        whereClause += ` AND sp.taxonomy_id IS NULL`;
      } else {
        whereClause += ` AND sp.taxonomy_id = $${paramIndex}`;
        params.push(categoryId);
        paramIndex++;
      }
    }

    // Search filter
    if (search && typeof search === "string") {
      whereClause += ` AND (COALESCE(sp.display_name, p.name) ILIKE $${paramIndex} OR p.primary_barcode ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    const limitNum = Math.min(parseInt(limit as string, 10) || 50, 200);
    const offsetNum = parseInt(offset as string, 10) || 0;

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM catalog.store_products sp ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.total || "0", 10);

    // Get products
    const result = await pool.query(
      `SELECT
        sp.product_id as "productId",
        COALESCE(sp.display_name, p.name) as "productName",
        p.primary_barcode as "barcode",
        p.brand,
        sp.sell_price as "sellPrice",
        sp.mrp,
        COALESCE(sp.current_stock, 0) as "currentStock",
        sp.taxonomy_id as "taxonomyId",
        'PACKAGED' as "mode",
        p.unit
      FROM catalog.store_products sp
      LEFT JOIN catalog.products p ON p.id = sp.product_id
      ${whereClause}
      ORDER BY COALESCE(sp.display_name, p.name) ASC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limitNum, offsetNum]
    );

    return res.json({
      success: true,
      data: result.rows,
      pagination: {
        total,
        limit: limitNum,
        offset: offsetNum,
        hasMore: offsetNum + result.rows.length < total,
      },
    });
  } catch (error: any) {
    console.error("[RetailerCategoryProducts] Error:", error.message);

    if (error.code === "42P01") {
      return res.json({
        success: true,
        data: [],
        pagination: { total: 0, limit: 50, offset: 0, hasMore: false },
      });
    }

    return res.status(500).json({
      success: false,
      error: "Failed to load category products",
    });
  }
});

// =============================================================================
// PATCH /api/v1/retailer-admin/categories/:categoryId
// RCAT-CAT-002: Rename a category (store override)
// =============================================================================

/**
 * PATCH /api/v1/retailer-admin/categories/:categoryId
 * Create/update a store-level category override (rename)
 *
 * Body:
 * - displayNameEn: new English display name (optional)
 * - displayNameHi: new Hindi display name (optional)
 */
retailerAdminInventoryRouter.patch("/categories/:categoryId", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: { code: "INTERNAL_ERROR", message: "Database unavailable" } });

  const storeId = getStoreId(req);
  if (!storeId) {
    return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Store not identified" } });
  }

  const { categoryId } = req.params;
  const { displayNameEn, displayNameHi } = req.body;

  if (!displayNameEn && !displayNameHi) {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "At least one display name is required" },
    });
  }

  try {
    // Verify category exists in taxonomy
    const catCheck = await pool.query(
      `SELECT id FROM catalog.fmcg_taxonomy WHERE id = $1 AND is_active = true`,
      [categoryId]
    );
    if (catCheck.rows.length === 0) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Category not found" } });
    }

    // Upsert store override
    await pool.query(
      `INSERT INTO catalog.store_category_overrides (store_id, category_id, display_name_en, display_name_hi)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (store_id, category_id) DO UPDATE SET
         display_name_en = COALESCE($3, catalog.store_category_overrides.display_name_en),
         display_name_hi = COALESCE($4, catalog.store_category_overrides.display_name_hi),
         updated_at = NOW()`,
      [storeId, categoryId, displayNameEn?.trim() || null, displayNameHi?.trim() || null]
    );

    return res.json({
      success: true,
      message: "Category renamed for your store",
    });
  } catch (error: any) {
    console.error("[RetailerCategories] PATCH error:", error.message);

    if (error.code === "42P01") {
      return res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Category overrides table not found. Run migration 034." },
      });
    }

    return res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Failed to rename category" },
    });
  }
});

// =============================================================================
// DELETE /api/v1/retailer-admin/categories/:categoryId
// RCAT-CAT-002: Hide/unhide a category for this store
// =============================================================================

/**
 * DELETE /api/v1/retailer-admin/categories/:categoryId
 * Toggle is_hidden on the store category override
 * Does NOT delete from global taxonomy - just hides for this store
 */
retailerAdminInventoryRouter.delete("/categories/:categoryId", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: { code: "INTERNAL_ERROR", message: "Database unavailable" } });

  const storeId = getStoreId(req);
  if (!storeId) {
    return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Store not identified" } });
  }

  const { categoryId } = req.params;

  try {
    // Verify category exists in taxonomy
    const catCheck = await pool.query(
      `SELECT id FROM catalog.fmcg_taxonomy WHERE id = $1 AND is_active = true`,
      [categoryId]
    );
    if (catCheck.rows.length === 0) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Category not found" } });
    }

    // Upsert store override with is_hidden toggled
    // If override exists, toggle; if not, create with is_hidden=true
    const existing = await pool.query(
      `SELECT is_hidden FROM catalog.store_category_overrides WHERE store_id = $1 AND category_id = $2`,
      [storeId, categoryId]
    );

    const newHiddenState = existing.rows.length > 0 ? !existing.rows[0].is_hidden : true;

    await pool.query(
      `INSERT INTO catalog.store_category_overrides (store_id, category_id, is_hidden)
       VALUES ($1, $2, $3)
       ON CONFLICT (store_id, category_id) DO UPDATE SET
         is_hidden = $3,
         updated_at = NOW()`,
      [storeId, categoryId, newHiddenState]
    );

    return res.json({
      success: true,
      isHidden: newHiddenState,
      message: newHiddenState ? "Category hidden for your store" : "Category restored for your store",
    });
  } catch (error: any) {
    console.error("[RetailerCategories] DELETE error:", error.message);

    if (error.code === "42P01") {
      return res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Category overrides table not found. Run migration 034." },
      });
    }

    return res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Failed to toggle category visibility" },
    });
  }
});
