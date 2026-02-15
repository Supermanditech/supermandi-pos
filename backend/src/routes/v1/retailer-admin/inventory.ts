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
 * URL-004: Minimal health check — no version/env leak
 * Public (no JWT required) — used by Cloud Run readiness probes
 */
retailerAdminInventoryRouter.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
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
// STORE INFO - AUD-RWEB-API-001
// =============================================================================

/**
 * GET /api/v1/retailer-admin/store
 * Get store information for the authenticated retailer
 *
 * Returns: { storeId, storeName, storeCode, isActive }
 */
retailerAdminInventoryRouter.get("/store", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreId(req);
  if (!storeId) {
    return res.status(401).json({ error: "Store not identified" });
  }

  try {
    const result = await pool.query(
      `SELECT
        id as "storeId",
        name as "storeName",
        code as "storeCode",
        (status = 'ACTIVE') as "isActive"
      FROM platform.stores
      WHERE id = $1`,
      [storeId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Store not found" },
      });
    }

    return res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error("[RetailerStore] Error:", error.message);
    return res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Failed to load store info" },
    });
  }
});

// =============================================================================
// DAILY SUMMARY - AUD-RWEB-API-001
// =============================================================================

/**
 * GET /api/v1/retailer-admin/daily-summary
 * Get daily sales summary for the authenticated retailer's store
 *
 * Query params:
 * - date: ISO date string (YYYY-MM-DD), defaults to today
 *
 * Returns: { date, totalSales, totalBills, averageBillValue, paymentBreakdown, itemsSold, topSellingItems }
 */
retailerAdminInventoryRouter.get("/daily-summary", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreId(req);
  if (!storeId) {
    return res.status(401).json({ error: "Store not identified" });
  }

  // Parse date parameter, default to today in IST
  const dateParam = req.query.date as string | undefined;
  const targetDate = dateParam || new Date().toISOString().split('T')[0];

  try {
    // RCAT-FIX-003: POS sales use status PAID_CASH/PAID_UPI/PAID_DUE (not 'completed')
    // Also derive payment mode from status when payment_mode column is NULL
    const salesResult = await pool.query(
      `SELECT
        COUNT(*)::integer as "totalBills",
        COALESCE(SUM(total_minor), 0)::bigint as "totalSales",
        COALESCE(SUM(CASE WHEN payment_mode = 'CASH' OR status = 'PAID_CASH' THEN total_minor ELSE 0 END), 0)::bigint as "cashTotal",
        COALESCE(SUM(CASE WHEN payment_mode = 'UPI' OR status = 'PAID_UPI' THEN total_minor ELSE 0 END), 0)::bigint as "upiTotal",
        COALESCE(SUM(CASE WHEN payment_mode = 'CARD' THEN total_minor ELSE 0 END), 0)::bigint as "cardTotal",
        COALESCE(SUM(CASE WHEN payment_mode = 'DUE' OR status = 'DUE' THEN total_minor ELSE 0 END), 0)::bigint as "creditTotal",
        COALESCE(SUM(CASE WHEN payment_mode = 'SPLIT' THEN total_minor ELSE 0 END), 0)::bigint as "splitTotal"
      FROM public.sales
      WHERE store_id = $1
        AND status IN ('completed', 'PAID_CASH', 'PAID_UPI', 'DUE', 'SPLIT')
        AND DATE(created_at AT TIME ZONE 'Asia/Kolkata') = $2::date`,
      [storeId, targetDate]
    );

    const salesRow = salesResult.rows[0] || {};
    const totalBills = Number(salesRow.totalBills) || 0;
    const totalSales = Number(salesRow.totalSales) || 0;
    const averageBillValue = totalBills > 0 ? Math.round(totalSales / totalBills) : 0;

    // RCAT-FIX-003: Include POS sale statuses
    const itemsResult = await pool.query(
      `SELECT COALESCE(SUM(si.quantity), 0)::integer as "itemsSold"
      FROM public.sale_items si
      JOIN public.sales s ON s.id = si.sale_id
      WHERE s.store_id = $1
        AND s.status IN ('completed', 'PAID_CASH', 'PAID_UPI', 'DUE', 'SPLIT')
        AND DATE(s.created_at AT TIME ZONE 'Asia/Kolkata') = $2::date`,
      [storeId, targetDate]
    );
    const itemsSold = Number(itemsResult.rows[0]?.itemsSold) || 0;

    // CL-007: Include all valid POS sale statuses for top selling items
    const topItemsResult = await pool.query(
      `SELECT
        si.variant_id as "productId",
        COALESCE(si.name, si.item_name, 'Unknown Product') as "productName",
        SUM(si.quantity)::integer as "quantitySold",
        SUM(si.line_total_minor)::bigint as "totalAmount"
      FROM public.sale_items si
      JOIN public.sales s ON s.id = si.sale_id
      WHERE s.store_id = $1
        AND s.status IN ('completed', 'PAID_CASH', 'PAID_UPI', 'DUE', 'SPLIT')
        AND DATE(s.created_at AT TIME ZONE 'Asia/Kolkata') = $2::date
      GROUP BY si.variant_id, si.name, si.item_name
      ORDER BY SUM(si.quantity) DESC
      LIMIT 10`,
      [storeId, targetDate]
    );

    const topSellingItems = topItemsResult.rows.map(row => ({
      productId: row.productId,
      productName: row.productName,
      quantitySold: Number(row.quantitySold) || 0,
      totalAmount: Number(row.totalAmount) || 0,
    }));

    return res.json({
      success: true,
      data: {
        date: targetDate,
        totalSales,
        totalBills,
        averageBillValue,
        paymentBreakdown: {
          cash: Number(salesRow.cashTotal) || 0,
          upi: Number(salesRow.upiTotal) || 0,
          card: Number(salesRow.cardTotal) || 0,
          credit: Number(salesRow.creditTotal) || 0,
        },
        itemsSold,
        topSellingItems,
      },
    });
  } catch (error: any) {
    console.error("[RetailerDailySummary] Error:", error.message);

    // If tables don't exist yet, return empty summary
    if (error.code === "42P01") {
      return res.json({
        success: true,
        data: {
          date: targetDate,
          totalSales: 0,
          totalBills: 0,
          averageBillValue: 0,
          paymentBreakdown: { cash: 0, upi: 0, card: 0, credit: 0 },
          itemsSold: 0,
          topSellingItems: [],
        },
      });
    }

    return res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Failed to load daily summary" },
    });
  }
});

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
    // P1-INV-001: Server-side pagination for 10K store readiness
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

    // P1-INV-001: Get total count + aggregate totals across ALL products (not just page)
    const countResult = await pool.query(
      `SELECT
        COUNT(*)::int as "totalProducts",
        COALESCE(SUM(COALESCE(sb.current_qty, sp.current_stock, 0)), 0)::bigint as "totalStockQty"
      FROM catalog.store_products sp
      LEFT JOIN inventory.stock_balances sb ON sb.store_id = sp.store_id AND sb.product_id = sp.product_id
      WHERE sp.store_id = $1
        AND (sp.is_active = true OR sp.is_active IS NULL)`,
      [storeId]
    );
    const totalProducts = Number(countResult.rows[0]?.totalProducts) || 0;
    const totalStockQty = Number(countResult.rows[0]?.totalStockQty) || 0;

    // CA-1.4-004: Query store_products with canonical stock from stock_balances
    // Prioritize inventory.stock_balances as the source of truth, fallback to sp.current_stock
    // P1-INV-001: Added LIMIT/OFFSET for pagination
    const result = await pool.query(
      `SELECT
        sp.product_id as "productId",
        COALESCE(sp.display_name, p.name) as "productName",
        p.primary_barcode as "barcode",
        COALESCE(sb.current_qty, sp.current_stock, 0) as "totalStockQty",
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
      LEFT JOIN inventory.stock_balances sb ON sb.store_id = sp.store_id AND sb.product_id = sp.product_id
      WHERE sp.store_id = $1
        AND (sp.is_active = true OR sp.is_active IS NULL)
      ORDER BY COALESCE(sp.display_name, p.name) ASC
      LIMIT $2 OFFSET $3`,
      [storeId, limit, offset]
    );

    // RCAT-METRICS-001: Ensure numeric types (bigint comes as string from pg)
    const data = result.rows.map(row => ({
      ...row,
      totalStockQty: Number(row.totalStockQty) || 0,
      totalPurchaseValue: Number(row.totalPurchaseValue) || 0,
      totalSellRevenue: Number(row.totalSellRevenue) || 0,
    }));

    // RCAT-METRICS-001: Compute totals server-side for accuracy
    // P1-INV-001: totalProducts and totalStockQty from COUNT query (all products)
    const totals = {
      totalProducts,
      totalStockQty,
      totalPurchaseValue: data.reduce((sum, r) => sum + r.totalPurchaseValue, 0),
      totalSellRevenue: data.reduce((sum, r) => sum + r.totalSellRevenue, 0),
    };

    // GO-LIVE-261: Add lastUpdated timestamp for data freshness
    return res.json({
      success: true,
      data,
      totals,
      pagination: {
        total: totalProducts,
        limit,
        offset,
        hasMore: offset + limit < totalProducts,
      },
      lastUpdated: new Date().toISOString(),
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
 * - supplierId: T-062: filter by supplier UUID (optional)
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

  const { productId, transactionType, supplierId, startDate, endDate, limit = "50", offset = "0" } = req.query;

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

    // T-062: Supplier filter
    if (supplierId && typeof supplierId === "string") {
      whereClause += ` AND il.supplier_id = $${paramIndex}::uuid`;
      params.push(supplierId);
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
    // AUD-064-B FIX: Ensure offset is non-negative
    const offsetNum = Math.max(parseInt(offset as string, 10) || 0, 0);

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
    // T-062: Added supplier_id, adjustment_reason, reversal fields, notes
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
        il.supplier_id as "supplierId",
        il.adjustment_reason as "adjustmentReason",
        il.reversal_of_id as "reversalOfId",
        il.reversed_by_id as "reversedById",
        il.source,
        il.notes,
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

    // GO-LIVE-261: Add lastUpdated timestamp for data freshness
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
      lastUpdated: new Date().toISOString(),
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
    // CA-1.4-004: Use canonical stock from stock_balances with fallback to current_stock
    const result = await pool.query(
      `WITH store_counts AS (
        SELECT
          COALESCE(sp.taxonomy_id, 'f0000000-0000-0000-0000-00000000000f') as taxonomy_id,
          COUNT(*) as product_count,
          COALESCE(SUM(COALESCE(sb.current_qty, sp.current_stock, 0) * sp.sell_price), 0) as stock_value
        FROM catalog.store_products sp
        LEFT JOIN inventory.stock_balances sb ON sb.store_id = sp.store_id AND sb.product_id = sp.product_id
        WHERE sp.store_id = $1
          AND (sp.is_active = true OR sp.is_active IS NULL)
        GROUP BY COALESCE(sp.taxonomy_id, 'f0000000-0000-0000-0000-00000000000f')
      ),
      total_counts AS (
        SELECT
          COUNT(*) as total_products,
          COALESCE(SUM(COALESCE(sb.current_qty, sp.current_stock, 0) * sp.sell_price), 0) as total_stock_value
        FROM catalog.store_products sp
        LEFT JOIN inventory.stock_balances sb ON sb.store_id = sp.store_id AND sb.product_id = sp.product_id
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

    // GO-LIVE-261: Add lastUpdated timestamp for data freshness
    return res.json({
      success: true,
      data: categories,
      count: categories.length,
      lastUpdated: new Date().toISOString(),
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

// =============================================================================
// AUD-RWEB-UNUSED-001: Removed GET /categories/:categoryId/products endpoint
// Per RCAT-DEPLOYMENT-CHECKLIST.md: "Not in API-RCAT spec, risks divergence"
// Products should be fetched via /products endpoint with category filter instead
// =============================================================================

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

// =============================================================================
// FEATURE FLAGS - RCAT-FIX-004
// =============================================================================

/**
 * GET /api/v1/retailer-admin/feature-flags
 * RCAT-FIX-004: Feature flags for retailer-admin portal
 * Resolves global flags + store-level overrides (same logic as POS ui-status)
 *
 * Returns: { features: { buyEnabled, reorderEnabled, bnplEnabled, ... } }
 */
retailerAdminInventoryRouter.get("/feature-flags", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreId(req);
  if (!storeId) {
    return res.status(401).json({ error: "Store not identified" });
  }

  // Defaults (all enabled)
  const features: Record<string, boolean> = {
    buyEnabled: true,
    reorderEnabled: true,
    bnplEnabled: true,
    creditEnabled: false,
    voiceEnabled: false,
    categoryBrowsingEnabled: true,
  };

  try {
    // SA-P0-005: Resolve global flags + store overrides
    const ffRes = await pool.query(
      `SELECT g.flag_key,
              COALESCE(s.enabled, g.enabled) AS effective
       FROM platform.feature_flags g
       LEFT JOIN platform.feature_flags s
         ON s.flag_key = g.flag_key AND s.scope_type = 'store' AND s.scope_id = $1::uuid
       WHERE g.scope_type = 'global'`,
      [storeId]
    );

    for (const row of ffRes.rows) {
      if (row.flag_key in features) {
        features[row.flag_key] = Boolean(row.effective);
      }
    }

    // Also check reorder_settings for reorderEnabled override
    const reorderRes = await pool.query(
      `SELECT reorder_enabled FROM reorder_settings WHERE store_id = $1`,
      [storeId]
    );
    if (reorderRes.rows[0] !== undefined) {
      features.reorderEnabled = Boolean(reorderRes.rows[0].reorder_enabled);
    }
  } catch {
    // feature_flags or reorder_settings may not exist — defaults apply
  }

  return res.json({
    success: true,
    data: { features },
  });
});
