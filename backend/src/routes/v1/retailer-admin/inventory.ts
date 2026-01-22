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
        sp.name as "productName",
        sp.barcode,
        COALESCE(sp.stock_on_hand, 0) as "totalStockQty",
        COALESCE(
          (SELECT SUM(ABS(delta_qty) * COALESCE(unit_cost, 0))
           FROM catalog.inventory_ledger il
           WHERE il.store_id = sp.store_id
             AND il.product_id = sp.product_id
             AND il.transaction_type IN ('purchase_received', 'opening_stock')),
          0
        )::bigint as "totalPurchaseValue",
        COALESCE(
          (SELECT SUM(ABS(delta_qty) * COALESCE(unit_cost, 0))
           FROM catalog.inventory_ledger il
           WHERE il.store_id = sp.store_id
             AND il.product_id = sp.product_id
             AND il.transaction_type = 'sale'),
          0
        )::bigint as "totalSellRevenue"
      FROM catalog.store_products sp
      WHERE sp.store_id = $1
        AND (sp.is_active = true OR sp.is_active IS NULL)
      ORDER BY sp.name ASC`,
      [storeId]
    );

    return res.json({
      success: true,
      data: result.rows,
    });
  } catch (error: any) {
    console.error("[RetailerInventory] Error:", error.message);

    // If table doesn't exist, return empty list
    if (error.code === "42P01") {
      return res.json({
        success: true,
        data: [],
      });
    }

    return res.status(500).json({
      success: false,
      error: "Failed to load inventory",
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

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM catalog.inventory_ledger il ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.total || "0", 10);

    // Get paginated results with product details
    const result = await pool.query(
      `SELECT
        il.id,
        il.store_id as "storeId",
        il.product_id as "productId",
        sp.name as "productName",
        sp.barcode,
        il.delta_qty as "deltaQty",
        il.transaction_type as "transactionType",
        il.reference_type as "referenceType",
        il.reference_id as "referenceId",
        il.stock_before as "stockBefore",
        il.stock_after as "stockAfter",
        il.unit_cost as "unitCost",
        il.created_at as "createdAt"
      FROM catalog.inventory_ledger il
      LEFT JOIN catalog.store_products sp ON sp.store_id = il.store_id AND sp.product_id = il.product_id
      ${whereClause}
      ORDER BY il.created_at DESC
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
    console.error("[RetailerLedger] Error:", error.message);

    // If table doesn't exist, return empty list
    if (error.code === "42P01") {
      return res.json({
        success: true,
        data: [],
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
      error: "Failed to load ledger entries",
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
    // Get FMCG taxonomy categories with product counts for this store
    // Includes "Sab" (All) category with total count
    const result = await pool.query(
      `WITH store_counts AS (
        SELECT
          COALESCE(sp.taxonomy_id, 'f0000000-0000-0000-0000-00000000000f') as taxonomy_id,
          COUNT(*) as product_count,
          COALESCE(SUM(sp.stock_on_hand * sp.sell_price), 0) as stock_value
        FROM catalog.store_products sp
        WHERE sp.store_id = $1
          AND (sp.is_active = true OR sp.is_active IS NULL)
        GROUP BY COALESCE(sp.taxonomy_id, 'f0000000-0000-0000-0000-00000000000f')
      ),
      total_counts AS (
        SELECT
          COUNT(*) as total_products,
          COALESCE(SUM(sp.stock_on_hand * sp.sell_price), 0) as total_stock_value
        FROM catalog.store_products sp
        WHERE sp.store_id = $1
          AND (sp.is_active = true OR sp.is_active IS NULL)
      )
      SELECT
        ft.id,
        ft.label_en as "labelEn",
        ft.label_hi as "labelHi",
        ft.icon_key as "iconKey",
        ft.sort_order as "sortOrder",
        CASE
          WHEN ft.sort_order = 0 THEN (SELECT total_products FROM total_counts)
          ELSE COALESCE(sc.product_count, 0)
        END as "productCount",
        CASE
          WHEN ft.sort_order = 0 THEN (SELECT total_stock_value FROM total_counts)
          ELSE COALESCE(sc.stock_value, 0)
        END::bigint as "stockValue"
      FROM catalog.fmcg_taxonomy ft
      LEFT JOIN store_counts sc ON ft.id = sc.taxonomy_id
      WHERE ft.is_active = true
      ORDER BY ft.sort_order ASC`,
      [storeId]
    );

    return res.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
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
      whereClause += ` AND (sp.name ILIKE $${paramIndex} OR sp.barcode ILIKE $${paramIndex})`;
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
        sp.name as "productName",
        sp.barcode,
        sp.brand,
        sp.sell_price as "sellPrice",
        sp.mrp,
        COALESCE(sp.stock_on_hand, 0) as "currentStock",
        sp.taxonomy_id as "taxonomyId",
        sp.mode,
        sp.unit
      FROM catalog.store_products sp
      ${whereClause}
      ORDER BY sp.name ASC
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
