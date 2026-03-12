// SA-P2-006: Product Category Manual Override — SuperAdmin catalog management
// Allows SuperAdmin to list categories, browse products, and override product categories

import { Router } from "express";
import { getPool } from "../../../db/client";
import { requireAdminToken, requirePermission } from "../../../middleware/adminToken";
import { log } from "../../../lib/logger";
import { asError } from "../../../lib/errorUtils";

export const adminCatalogRouter = Router();

// All routes require admin authentication
adminCatalogRouter.use(requireAdminToken);

// ITER4-P1-018: UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUUID(value: string): boolean {
  return UUID_REGEX.test(value);
}

// =============================================================================
// GET /api/v1/admin/catalog/categories
// SA-P2-006: List all unique categories with product counts
// Aggregates from both catalog.products and catalog.supplier_products
// =============================================================================
adminCatalogRouter.get(
  "/catalog/categories",
  requirePermission("catalog", "read"),
  async (_req, res) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "database unavailable" });

    try {
      // Get categories from supplier_products (which have edited_category overrides)
      const result = await pool.query(
        `SELECT
          COALESCE(sp.edited_category, sp.category) AS category,
          COUNT(*)::int AS "productCount"
        FROM catalog.supplier_products sp
        WHERE sp.is_active = true
          AND COALESCE(sp.edited_category, sp.category) IS NOT NULL
          AND COALESCE(sp.edited_category, sp.category) != ''
        GROUP BY COALESCE(sp.edited_category, sp.category)
        ORDER BY COALESCE(sp.edited_category, sp.category) ASC`
      );

      return res.json({
        success: true,
        data: result.rows,
        count: result.rows.length,
      });
    } catch (_error: unknown) {
      const error = asError(_error);
      log.error("[SA-P2-006] List categories error:", error.message);

      if (error.code === "42P01" || error.code === "42703") {
        return res.json({ success: true, data: [], count: 0 });
      }

      return res.status(500).json({
        success: false,
        error: "Failed to load categories",
      });
    }
  }
);

// =============================================================================
// GET /api/v1/admin/catalog/products
// SA-P2-006: List supplier products with their categories (paginated, searchable)
// =============================================================================
adminCatalogRouter.get(
  "/catalog/products",
  requirePermission("catalog", "read"),
  async (req, res) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "database unavailable" });

    const q = req.query.q as string | undefined;
    const category = req.query.category as string | undefined;
    const page = Math.max(parseInt(req.query.page as string) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
    const offset = (page - 1) * limit;

    try {
      let whereClause = "WHERE sp.is_active = true";
      const params: any[] = [];
      let paramIndex = 1;

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

      // Count query
      const countResult = await pool.query(
        `SELECT COUNT(*) AS total
         FROM catalog.supplier_products sp
         ${whereClause}`,
        params
      );
      const total = parseInt(countResult.rows[0]?.total || "0", 10);

      // Products query
      const result = await pool.query(
        `SELECT
          sp.id,
          sp.name,
          COALESCE(sp.edited_name, sp.name) AS "displayName",
          sp.category AS "originalCategory",
          sp.edited_category AS "editedCategory",
          COALESCE(sp.edited_category, sp.category) AS "currentCategory",
          sp.brand,
          sp.barcode,
          sp.supplier_sku AS "supplierSku",
          sp.purchase_price AS "purchasePrice",
          sp.mrp,
          sp.approval_status AS "approvalStatus",
          sp.supplier_id AS "supplierId",
          COALESCE(s.business_name, s.trade_name, 'Unknown') AS "supplierName",
          sp.created_at AS "createdAt",
          sp.updated_at AS "updatedAt",
          sp.hsn_code AS "hsnCode",
          sp.default_gst_rate AS "defaultGstRate",
          sp.net_content_value AS "netContentValue",
          sp.net_content_unit AS "netContentUnit",
          sp.manufacturer_name AS "manufacturerName",
          sp.country_of_origin AS "countryOfOrigin",
          sp.shelf_life_days AS "shelfLifeDays"
        FROM catalog.supplier_products sp
        LEFT JOIN supplier.suppliers s ON s.id = sp.supplier_id
        ${whereClause}
        ORDER BY COALESCE(sp.edited_name, sp.name) ASC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, limit, offset]
      );

      return res.json({
        success: true,
        data: result.rows,
        pagination: {
          page,
          limit,
          total,
          hasMore: offset + result.rows.length < total,
        },
        filters: {
          search: q?.trim() || null,
          category: category?.trim() || null,
        },
      });
    } catch (_error: unknown) {
      const error = asError(_error);
      log.error("[SA-P2-006] List products error:", error.message);

      if (error.code === "42P01" || error.code === "42703") {
        return res.json({
          success: true,
          data: [],
          pagination: { page: 1, limit, total: 0, hasMore: false },
          filters: { search: null, category: null },
        });
      }

      return res.status(500).json({
        success: false,
        error: "Failed to load products",
      });
    }
  }
);

// =============================================================================
// PATCH /api/v1/admin/catalog/products/:productId/category
// SA-P2-006: Override a product's category (sets edited_category field)
// =============================================================================
adminCatalogRouter.patch(
  "/catalog/products/:productId/category",
  requirePermission("catalog", "write"),
  async (req, res) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "database unavailable" });

    const { productId } = req.params;

    // Validate UUID
    if (!productId || !isValidUUID(productId)) {
      return res.status(400).json({ error: "productId must be a valid UUID" });
    }

    const { category } = req.body as { category?: string };

    // Category can be a non-empty string or null (to clear override)
    if (category !== undefined && category !== null) {
      if (typeof category !== "string" || category.trim().length === 0) {
        return res.status(400).json({ error: "category must be a non-empty string or null" });
      }
      if (category.trim().length > 100) {
        return res.status(400).json({ error: "category must be 100 characters or fewer" });
      }
    }

    const trimmedCategory = category === null ? null : category?.trim() || null;

    try {
      // Get current product to verify existence and track changes
      const checkResult = await pool.query(
        `SELECT id, name, category, edited_category
         FROM catalog.supplier_products
         WHERE id = $1::uuid`,
        [productId]
      );

      if (checkResult.rowCount === 0) {
        return res.status(404).json({ error: "Product not found" });
      }

      const current = checkResult.rows[0];

      // Update edited_category
      const updateResult = await pool.query(
        `UPDATE catalog.supplier_products
         SET edited_category = $1, updated_at = NOW()
         WHERE id = $2::uuid
         RETURNING
           id,
           name,
           COALESCE(edited_name, name) AS "displayName",
           category AS "originalCategory",
           edited_category AS "editedCategory",
           COALESCE(edited_category, category) AS "currentCategory"`,
        [trimmedCategory, productId]
      );

      const updated = updateResult.rows[0];

      log.info(
        `[SA-P2-006] Category override: product=${productId} from="${current.edited_category || current.category}" to="${trimmedCategory || current.category}" by admin`
      );

      return res.json({
        success: true,
        data: updated,
        change: {
          from: current.edited_category || current.category,
          to: trimmedCategory || current.category,
          overrideCleared: trimmedCategory === null,
        },
      });
    } catch (_error: unknown) {
      const error = asError(_error);
      log.error("[SA-P2-006] Category override error:", error.message);

      return res.status(500).json({
        success: false,
        error: "Failed to update product category",
      });
    }
  }
);
