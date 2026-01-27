// Catalog Routes - V3.0.10 compliant
// AUD-GOLIVE-003: Store catalog endpoints for POS mobile app
// GO-LIVE: Uses requireDeviceToken middleware for POS device authentication

import { Router, Request, Response } from "express";
import { getPool } from "../../db/client";
import { requireDeviceToken, PosDeviceContext } from "../../middleware/deviceToken";

export const catalogRouter = Router();

/**
 * GO-LIVE: Get store ID from device token (set by requireDeviceToken middleware)
 * The middleware already validates store isolation via enforceStoreBinding
 */
function getStoreIdFromDevice(req: Request): string {
  const posDevice = (req as any).posDevice as PosDeviceContext;
  return posDevice.storeId!;
}

// =============================================================================
// STORE CATALOG ENDPOINTS
// =============================================================================

/**
 * GET /api/v1/catalog/stores/:storeId/catalog
 * AUD-GOLIVE-003: Get paginated catalog for a store.
 * Returns products available for the store to sell.
 * GO-LIVE: Requires device token authentication
 */
catalogRouter.get("/stores/:storeId/catalog", requireDeviceToken, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreIdFromDevice(req);
  const q = req.query.q as string | undefined;
  const category = req.query.category as string | undefined;
  const inStockOnly = req.query.inStockOnly === "true";
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const offset = (page - 1) * limit;

  try {
    let whereClause = "WHERE sp.store_id = $1 AND sp.is_active = true";
    const params: any[] = [storeId];
    let paramIndex = 2;

    // Search filter
    if (q && q.trim().length >= 2) {
      whereClause += ` AND (
        sp.display_name ILIKE $${paramIndex}
        OR p.name ILIKE $${paramIndex}
        OR p.primary_barcode ILIKE $${paramIndex}
      )`;
      params.push(`%${q.trim()}%`);
      paramIndex++;
    }

    // Category filter
    if (category && category.trim().length > 0) {
      whereClause += ` AND p.category = $${paramIndex}`;
      params.push(category.trim());
      paramIndex++;
    }

    // In stock filter
    if (inStockOnly) {
      whereClause += ` AND COALESCE(sb.current_qty, sp.current_stock, 0) > 0`;
    }

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) as total
       FROM catalog.store_products sp
       LEFT JOIN catalog.products p ON p.id = sp.product_id
       LEFT JOIN inventory.stock_balances sb ON sb.store_id = sp.store_id AND sb.product_id = sp.product_id
       ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.total || "0", 10);

    // Get paginated products
    const result = await pool.query(
      `SELECT
        sp.id,
        sp.product_id as "productId",
        COALESCE(sp.display_name, p.name) as name,
        p.brand,
        p.category,
        p.primary_barcode as "primaryBarcode",
        sp.sell_price as "sellPrice",
        sp.mrp,
        COALESCE(sb.current_qty, sp.current_stock, 0) as "currentStock",
        CASE
          WHEN COALESCE(sb.current_qty, sp.current_stock, 0) <= 0 THEN 'out_of_stock'
          WHEN COALESCE(sb.current_qty, sp.current_stock, 0) <= 5 THEN 'low_stock'
          ELSE 'in_stock'
        END as "stockStatus",
        p.is_active as "isActive"
      FROM catalog.store_products sp
      LEFT JOIN catalog.products p ON p.id = sp.product_id
      LEFT JOIN inventory.stock_balances sb ON sb.store_id = sp.store_id AND sb.product_id = sp.product_id
      ${whereClause}
      ORDER BY COALESCE(sp.display_name, p.name) ASC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    // Format response to match frontend expectations
    const products = result.rows.map((row) => ({
      id: row.productId || row.id,
      name: row.name,
      brand: row.brand,
      category: row.category,
      primaryBarcode: row.primaryBarcode,
      bestPrice: row.sellPrice || 0,
      minMoq: 1,
      supplierCount: 1,
      stockStatus: row.stockStatus,
      isActive: row.isActive !== false,
      suppliers: [],
    }));

    return res.json({
      success: true,
      data: products,
      pagination: {
        page,
        limit,
        total,
        hasMore: offset + products.length < total,
      },
      filters: {
        search: q?.trim() || null,
        category: category || null,
        inStockOnly,
      },
    });
  } catch (error: any) {
    console.error("[Catalog] List error:", error.message);

    if (error.code === "42P01") {
      return res.json({
        success: true,
        data: [],
        pagination: { page: 1, limit: 50, total: 0, hasMore: false },
        filters: { search: null, category: null, inStockOnly: false },
      });
    }

    return res.status(500).json({
      success: false,
      error: "Failed to load catalog",
    });
  }
});

/**
 * GET /api/v1/catalog/stores/:storeId/catalog/categories
 * AUD-GOLIVE-003: Get distinct categories in the store's catalog.
 * GO-LIVE: Requires device token authentication
 */
catalogRouter.get("/stores/:storeId/catalog/categories", requireDeviceToken, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreIdFromDevice(req);

  try {
    const result = await pool.query(
      `SELECT DISTINCT p.category
       FROM catalog.store_products sp
       JOIN catalog.products p ON p.id = sp.product_id
       WHERE sp.store_id = $1
         AND sp.is_active = true
         AND p.category IS NOT NULL
         AND p.category != ''
       ORDER BY p.category ASC`,
      [storeId]
    );

    const categories = result.rows.map((r) => r.category);

    return res.json({
      success: true,
      data: categories,
      count: categories.length,
    });
  } catch (error: any) {
    console.error("[Catalog] Categories error:", error.message);

    if (error.code === "42P01") {
      return res.json({
        success: true,
        data: [],
        count: 0,
      });
    }

    return res.status(500).json({
      success: false,
      error: "Failed to load categories",
    });
  }
});

/**
 * GET /api/v1/catalog/stores/:storeId/catalog/:productId
 * AUD-GOLIVE-003: Get a single product from the store's catalog.
 * GO-LIVE: Requires device token authentication
 */
catalogRouter.get("/stores/:storeId/catalog/:productId", requireDeviceToken, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreIdFromDevice(req);
  const { productId } = req.params;

  try {
    const result = await pool.query(
      `SELECT
        sp.id as "storeProductId",
        sp.product_id as "productId",
        COALESCE(sp.display_name, p.name) as name,
        p.description,
        p.brand,
        p.category,
        p.unit,
        p.primary_barcode as "primaryBarcode",
        p.hsn_code as "hsnCode",
        p.default_gst_rate as "defaultGstRate",
        sp.sell_price as "sellPrice",
        sp.mrp,
        COALESCE(sb.current_qty, sp.current_stock, 0) as "currentStock",
        CASE
          WHEN COALESCE(sb.current_qty, sp.current_stock, 0) <= 0 THEN 'out_of_stock'
          WHEN COALESCE(sb.current_qty, sp.current_stock, 0) <= 5 THEN 'low_stock'
          ELSE 'in_stock'
        END as "stockStatus",
        p.is_active as "isActive"
      FROM catalog.store_products sp
      LEFT JOIN catalog.products p ON p.id = sp.product_id
      LEFT JOIN inventory.stock_balances sb ON sb.store_id = sp.store_id AND sb.product_id = sp.product_id
      WHERE sp.store_id = $1
        AND (sp.product_id = $2 OR sp.id = $2)
        AND sp.is_active = true`,
      [storeId, productId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Product not found in store catalog",
      });
    }

    const row = result.rows[0];

    return res.json({
      success: true,
      data: {
        id: row.productId || row.storeProductId,
        name: row.name,
        description: row.description,
        brand: row.brand,
        category: row.category,
        unit: row.unit,
        primaryBarcode: row.primaryBarcode,
        hsnCode: row.hsnCode,
        defaultGstRate: row.defaultGstRate,
        isActive: row.isActive !== false,
        bestPrice: row.sellPrice || 0,
        minMoq: 1,
        supplierCount: 1,
        stockStatus: row.stockStatus,
        suppliers: [],
      },
    });
  } catch (error: any) {
    console.error("[Catalog] Get product error:", error.message);

    if (error.code === "42P01") {
      return res.status(404).json({
        success: false,
        error: "Product not found",
      });
    }

    return res.status(500).json({
      success: false,
      error: "Failed to load product",
    });
  }
});

// =============================================================================
// SM-003: BUY FLOW CATALOG - Supplier Products for Purchase
// CRITICAL: Only shows verified suppliers + approved products
// =============================================================================

/**
 * GET /api/v1/catalog/stores/:storeId/buy-catalog
 * SM-003: Get supplier products available for retailer to purchase.
 * VISIBILITY RULES:
 * - Only suppliers with status='verified'
 * - Only products with approval_status='approved'
 * - Only products from suppliers linked to this store
 * - Prices include SuperMandi margin
 */
catalogRouter.get("/stores/:storeId/buy-catalog", requireDeviceToken, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreIdFromDevice(req);
  const q = req.query.q as string | undefined;
  const category = req.query.category as string | undefined;
  const supplierId = req.query.supplierId as string | undefined;
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const offset = (page - 1) * limit;

  try {
    let whereClause = `
      WHERE s.status = 'verified'
        AND sp.approval_status = 'approved'
        AND sp.is_active = true
        AND ssl.store_id = $1
        AND ssl.status = 'active'
    `;
    const params: any[] = [storeId];
    let paramIndex = 2;

    // Search filter
    if (q && q.trim().length >= 2) {
      whereClause += ` AND (
        COALESCE(sp.edited_name, sp.name) ILIKE $${paramIndex}
        OR sp.barcode ILIKE $${paramIndex}
        OR sp.supplier_sku ILIKE $${paramIndex}
      )`;
      params.push(`%${q.trim()}%`);
      paramIndex++;
    }

    // Category filter
    if (category && category.trim().length > 0) {
      whereClause += ` AND COALESCE(sp.edited_category, sp.category) = $${paramIndex}`;
      params.push(category.trim());
      paramIndex++;
    }

    // Supplier filter
    if (supplierId) {
      whereClause += ` AND sp.supplier_id = $${paramIndex}`;
      params.push(supplierId);
      paramIndex++;
    }

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) as total
       FROM catalog.supplier_products sp
       JOIN supplier.suppliers s ON s.id = sp.supplier_id
       JOIN supplier.supplier_store_links ssl ON ssl.supplier_id = s.id
       ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.total || "0", 10);

    // Get paginated products with margin applied
    const result = await pool.query(
      `SELECT
        sp.id,
        COALESCE(sp.edited_name, sp.name) AS name,
        COALESCE(sp.edited_category, sp.category) AS category,
        sp.brand,
        sp.barcode,
        sp.supplier_sku AS "supplierSku",
        sp.purchase_price AS "supplierPrice",
        sp.purchase_price + COALESCE(sp.supermandi_margin_minor, 0) AS "retailerPrice",
        COALESCE(sp.supermandi_margin_minor, 0) AS margin,
        COALESCE(sp.margin_percent, 0) AS "marginPercent",
        s.business_name AS "supplierName",
        s.id AS "supplierId",
        sp.bnpl_eligible AS "bnplEligible",
        sp.bnpl_max_days AS "bnplMaxDays",
        sp.stock_quantity AS "stockQty",
        sp.stock_status AS "stockStatus",
        sp.moq,
        sp.unit,
        sp.mrp
      FROM catalog.supplier_products sp
      JOIN supplier.suppliers s ON s.id = sp.supplier_id
      JOIN supplier.supplier_store_links ssl ON ssl.supplier_id = s.id
      ${whereClause}
      ORDER BY COALESCE(sp.edited_name, sp.name) ASC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    const products = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      brand: row.brand,
      barcode: row.barcode,
      supplierSku: row.supplierSku,
      supplierPrice: row.supplierPrice,
      retailerPrice: row.retailerPrice,
      margin: row.margin,
      marginPercent: parseFloat(row.marginPercent) || 0,
      supplierName: row.supplierName,
      supplierId: row.supplierId,
      bnplEligible: row.bnplEligible || false,
      bnplMaxDays: row.bnplMaxDays || 0,
      stockQty: row.stockQty || 0,
      stockStatus: row.stockStatus || 'available',
      moq: row.moq || 1,
      unit: row.unit || 'PCS',
      mrp: row.mrp,
    }));

    return res.json({
      success: true,
      data: products,
      pagination: {
        page,
        limit,
        total,
        hasMore: offset + products.length < total,
      },
      filters: {
        search: q?.trim() || null,
        category: category || null,
        supplierId: supplierId || null,
      },
      context: "BUY",
    });
  } catch (error: any) {
    console.error("[SM-003] Buy catalog error:", error.message);

    // If tables don't exist yet, return empty response
    if (error.code === "42P01" || error.code === "42703") {
      return res.json({
        success: true,
        data: [],
        pagination: { page: 1, limit: 50, total: 0, hasMore: false },
        filters: { search: null, category: null, supplierId: null },
        context: "BUY",
      });
    }

    return res.status(500).json({
      success: false,
      error: "Failed to load buy catalog",
    });
  }
});

/**
 * GET /api/v1/catalog/stores/:storeId/buy-catalog/categories
 * SM-003: Get categories available in buy catalog (only from approved products)
 */
catalogRouter.get("/stores/:storeId/buy-catalog/categories", requireDeviceToken, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreIdFromDevice(req);

  try {
    const result = await pool.query(
      `SELECT DISTINCT COALESCE(sp.edited_category, sp.category) AS category
       FROM catalog.supplier_products sp
       JOIN supplier.suppliers s ON s.id = sp.supplier_id
       JOIN supplier.supplier_store_links ssl ON ssl.supplier_id = s.id
       WHERE s.status = 'verified'
         AND sp.approval_status = 'approved'
         AND sp.is_active = true
         AND ssl.store_id = $1
         AND ssl.status = 'active'
         AND COALESCE(sp.edited_category, sp.category) IS NOT NULL
         AND COALESCE(sp.edited_category, sp.category) != ''
       ORDER BY category ASC`,
      [storeId]
    );

    const categories = result.rows.map((r) => r.category);

    return res.json({
      success: true,
      data: categories,
      count: categories.length,
    });
  } catch (error: any) {
    console.error("[SM-003] Buy catalog categories error:", error.message);

    if (error.code === "42P01" || error.code === "42703") {
      return res.json({
        success: true,
        data: [],
        count: 0,
      });
    }

    return res.status(500).json({
      success: false,
      error: "Failed to load categories",
    });
  }
});

/**
 * GET /api/v1/catalog/stores/:storeId/buy-catalog/suppliers
 * SM-003: Get verified suppliers linked to this store
 */
catalogRouter.get("/stores/:storeId/buy-catalog/suppliers", requireDeviceToken, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreIdFromDevice(req);

  try {
    const result = await pool.query(
      `SELECT
        s.id,
        s.business_name AS "businessName",
        s.trade_name AS "tradeName",
        s.city,
        s.rating,
        ssl.credit_days AS "creditDays",
        ssl.min_order_value AS "minOrderValue",
        ssl.is_preferred AS "isPreferred",
        COUNT(sp.id) AS "productCount"
       FROM supplier.suppliers s
       JOIN supplier.supplier_store_links ssl ON ssl.supplier_id = s.id
       LEFT JOIN catalog.supplier_products sp ON sp.supplier_id = s.id
         AND sp.approval_status = 'approved'
         AND sp.is_active = true
       WHERE s.status = 'verified'
         AND ssl.store_id = $1
         AND ssl.status = 'active'
       GROUP BY s.id, s.business_name, s.trade_name, s.city, s.rating,
                ssl.credit_days, ssl.min_order_value, ssl.is_preferred
       ORDER BY ssl.is_preferred DESC, s.business_name ASC`,
      [storeId]
    );

    const suppliers = result.rows.map((r) => ({
      id: r.id,
      businessName: r.businessName,
      tradeName: r.tradeName,
      city: r.city,
      rating: parseFloat(r.rating) || 3.0,
      creditDays: r.creditDays || 0,
      minOrderValue: r.minOrderValue || 0,
      isPreferred: r.isPreferred || false,
      productCount: parseInt(r.productCount) || 0,
    }));

    return res.json({
      success: true,
      data: suppliers,
      count: suppliers.length,
    });
  } catch (error: any) {
    console.error("[SM-003] Buy catalog suppliers error:", error.message);

    if (error.code === "42P01" || error.code === "42703") {
      return res.json({
        success: true,
        data: [],
        count: 0,
      });
    }

    return res.status(500).json({
      success: false,
      error: "Failed to load suppliers",
    });
  }
});

// =============================================================================
// FMCG TAXONOMY ENDPOINTS (CAT-003)
// =============================================================================

/**
 * GET /api/v1/catalog/stores/:storeId/categories
 * AUD-GOLIVE-003: Get FMCG taxonomy categories with product counts.
 * GO-LIVE: Requires device token authentication
 */
catalogRouter.get("/stores/:storeId/categories", requireDeviceToken, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreIdFromDevice(req);

  try {
    // Try to get FMCG taxonomy categories
    const result = await pool.query(
      `WITH store_counts AS (
        SELECT
          sp.taxonomy_id,
          COUNT(*) AS product_count
        FROM catalog.store_products sp
        WHERE sp.store_id = $1
          AND sp.is_active = true
        GROUP BY sp.taxonomy_id
      ),
      total_count AS (
        SELECT COUNT(*) AS total
        FROM catalog.store_products sp
        WHERE sp.store_id = $1
          AND sp.is_active = true
      )
      SELECT
        ft.id,
        ft.label_en as "labelEn",
        ft.label_hi as "labelHi",
        ft.icon_key as "iconKey",
        ft.sort_order as "sortOrder",
        CASE
          WHEN ft.label_en = 'Sab' THEN (SELECT total FROM total_count)
          ELSE COALESCE(sc.product_count, 0)
        END AS "productCount"
      FROM catalog.fmcg_taxonomy ft
      LEFT JOIN store_counts sc ON sc.taxonomy_id = ft.id
      WHERE ft.is_active = true
        AND (
          ft.label_en = 'Sab'
          OR sc.product_count > 0
        )
      ORDER BY ft.sort_order ASC`,
      [storeId]
    );

    // If fmcg_taxonomy table doesn't exist, return default "All" category
    if (result.rows.length === 0) {
      const countResult = await pool.query(
        `SELECT COUNT(*) as total FROM catalog.store_products WHERE store_id = $1 AND is_active = true`,
        [storeId]
      );
      const total = parseInt(countResult.rows[0]?.total || "0", 10);

      return res.json({
        success: true,
        data: [
          {
            id: "all",
            labelEn: "Sab",
            labelHi: "सब",
            iconKey: "grid",
            sortOrder: 0,
            productCount: total,
          },
        ],
        count: 1,
      });
    }

    return res.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
    });
  } catch (error: any) {
    console.error("[Catalog] FMCG categories error:", error.message);

    // If tables don't exist, return minimal response
    if (error.code === "42P01") {
      return res.json({
        success: true,
        data: [
          {
            id: "all",
            labelEn: "Sab",
            labelHi: "सब",
            iconKey: "grid",
            sortOrder: 0,
            productCount: 0,
          },
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
 * GET /api/v1/catalog/stores/:storeId/categories/:taxonomyId/products
 * AUD-GOLIVE-003: Get products in a specific FMCG category.
 * GO-LIVE: Requires device token authentication
 */
catalogRouter.get("/stores/:storeId/categories/:taxonomyId/products", requireDeviceToken, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreIdFromDevice(req);
  const { taxonomyId } = req.params;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
  const cursor = req.query.cursor as string | undefined;
  const includeZeroStock = req.query.includeZeroStock !== "false";

  const isAllCategory = taxonomyId.toLowerCase() === "all" || taxonomyId === "f0000000-0000-0000-0000-000000000001";

  try {
    let whereClause = "WHERE sp.store_id = $1 AND sp.is_active = true";
    const params: any[] = [storeId];
    let paramIndex = 2;

    if (!isAllCategory) {
      whereClause += ` AND sp.taxonomy_id = $${paramIndex}`;
      params.push(taxonomyId);
      paramIndex++;
    }

    if (!includeZeroStock) {
      whereClause += ` AND COALESCE(sb.current_qty, sp.current_stock, 0) > 0`;
    }

    // Cursor-based pagination
    let cursorTimestamp: Date | null = null;
    if (cursor) {
      try {
        const decoded = Buffer.from(cursor, "base64").toString("utf-8");
        cursorTimestamp = new Date(decoded);
        if (!isNaN(cursorTimestamp.getTime())) {
          whereClause += ` AND sp.created_at < $${paramIndex}`;
          params.push(cursorTimestamp);
          paramIndex++;
        }
      } catch {
        // Invalid cursor, ignore
      }
    }

    const result = await pool.query(
      `SELECT
        sp.id,
        sp.product_id as "productId",
        COALESCE(sp.display_name, p.name) as "displayName",
        sp.sell_price as "sellPrice",
        sp.mrp,
        COALESCE(sb.current_qty, sp.current_stock, 0) as "currentStock",
        sp.taxonomy_id as "taxonomyId",
        sp.created_at as "createdAt",
        p.brand,
        COALESCE(p.primary_barcode, '') as barcode
      FROM catalog.store_products sp
      LEFT JOIN catalog.products p ON p.id = sp.product_id
      LEFT JOIN inventory.stock_balances sb ON sb.store_id = sp.store_id AND sb.product_id = sp.product_id
      ${whereClause}
      ORDER BY sp.created_at DESC
      LIMIT $${paramIndex}`,
      [...params, limit + 1]
    );

    const hasMore = result.rows.length > limit;
    const products = hasMore ? result.rows.slice(0, limit) : result.rows;

    let nextCursor: string | null = null;
    if (hasMore && products.length > 0) {
      const lastProduct = products[products.length - 1];
      nextCursor = Buffer.from(lastProduct.createdAt.toISOString()).toString("base64");
    }

    return res.json({
      success: true,
      data: products.map((p: any) => ({
        id: p.id,
        productId: p.productId,
        displayName: p.displayName,
        sellPrice: p.sellPrice,
        mrp: p.mrp,
        currentStock: p.currentStock,
        taxonomyId: p.taxonomyId,
        brand: p.brand,
        barcode: p.barcode,
      })),
      pagination: {
        limit,
        hasMore,
        nextCursor,
      },
      context: "SELL",
    });
  } catch (error: any) {
    console.error("[Catalog] Category products error:", error.message);

    if (error.code === "42P01") {
      return res.json({
        success: true,
        data: [],
        pagination: { limit, hasMore: false, nextCursor: null },
        context: "SELL",
      });
    }

    return res.status(500).json({
      success: false,
      error: "Failed to load products",
    });
  }
});
