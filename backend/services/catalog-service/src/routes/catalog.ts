// Catalog Routes - V3.0.10 compliant
// Store catalog endpoints with unified product view
//
// DEV-064: CRITICAL ROUTE ORDERING
// The /categories route MUST be defined BEFORE /:productId to prevent
// "categories" from being captured as a productId parameter.
// Order: /catalog → /catalog/categories → /catalog/:productId

import { Router, Request, Response, NextFunction } from 'express';
import type { Router as RouterType } from 'express';
import { ApiError, ERROR_CODES, query } from '@supermandi/common';
import { getStoreCatalog, getStoreCatalogProduct } from '../services/catalogService';
import { searchStoreProducts, getStoreProductByBarcode, type StoreSearchGroup } from '../db/queries';
import { config } from '../config';

const router: RouterType = Router();

// =============================================================================
// STORE CATALOG ENDPOINTS
// =============================================================================

/**
 * GET /stores/:storeId/catalog
 * Get the unified catalog for a store.
 *
 * CRITICAL: Only returns products that are:
 * 1. Mapped via supplier_product_map
 * 2. From suppliers linked to the store (active status)
 *
 * Query params:
 * - q: Search query (optional, min 2 chars if provided)
 * - category: Filter by category (optional)
 * - inStockOnly: Only return in-stock products (optional, default false)
 * - page: Page number (default 1)
 * - limit: Items per page (default 50, max 200)
 */
router.get(
  '/stores/:storeId/catalog',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { storeId } = req.params;
      const q = req.query.q as string | undefined;
      const category = req.query.category as string | undefined;
      const inStockOnly = req.query.inStockOnly === 'true';
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || config.search.defaultLimit;

      // Validate search query if provided
      if (q && q.trim().length > 0 && q.trim().length < 2) {
        throw new ApiError(
          400,
          ERROR_CODES.VALIDATION_ERROR,
          'Search query (q) must be at least 2 characters'
        );
      }

      // Validate page
      if (page < 1) {
        throw new ApiError(
          400,
          ERROR_CODES.VALIDATION_ERROR,
          'Page must be at least 1'
        );
      }

      const result = await getStoreCatalog({
        storeId,
        search: q?.trim(),
        category,
        inStockOnly,
        page,
        limit,
      });

      res.json({
        success: true,
        data: result.products,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          hasMore: result.hasMore,
        },
        filters: {
          search: q?.trim() || null,
          category: category || null,
          inStockOnly,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /stores/:storeId/catalog/categories
 * Get distinct categories available in the store's catalog.
 *
 * NOTE: This route MUST come before /:productId to avoid "categories" being
 * interpreted as a productId parameter.
 */
router.get(
  '/stores/:storeId/catalog/categories',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { storeId } = req.params;

      // SM-003: Add visibility filter for verified suppliers + approved products
      const categoriesSql = `
        SELECT DISTINCT p.category
        FROM catalog.products p
        JOIN catalog.supplier_product_map spm ON spm.product_id = p.id
        JOIN catalog.supplier_products sp ON sp.id = spm.supplier_product_id
        JOIN supplier.suppliers s ON s.id = sp.supplier_id
        JOIN supplier.supplier_store_links ssl ON ssl.supplier_id = sp.supplier_id
        WHERE ssl.store_id = $1
          AND ssl.status = 'active'
          AND p.is_active = true
          AND p.category IS NOT NULL
          AND s.verification_status = 'verified'
          AND sp.approval_status = 'approved'
        ORDER BY p.category ASC
      `;

      const rows = await query<{ category: string }>(categoriesSql, [storeId]);
      const categories = rows.map((r) => r.category);

      res.json({
        success: true,
        data: categories,
        count: categories.length,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /stores/:storeId/catalog/:productId
 * Get a single product from the store's catalog.
 *
 * Returns 404 if:
 * - Product doesn't exist
 * - Product is not mapped via supplier_product_map
 * - No linked supplier offers this product
 */
router.get(
  '/stores/:storeId/catalog/:productId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { storeId, productId } = req.params;

      const product = await getStoreCatalogProduct(storeId, productId);

      res.json({
        success: true,
        data: product,
      });
    } catch (error) {
      next(error);
    }
  }
);

// =============================================================================
// CAT-003: FMCG Taxonomy-based Category Browsing
// =============================================================================

/**
 * GET /stores/:storeId/categories
 * Get FMCG taxonomy categories that have products in this store.
 *
 * Returns only categories where store has count > 0 sellable SKUs.
 * Includes "Sab" (all) category with total count.
 *
 * Response: Array sorted by sort_order with:
 * - id, label_en, label_hi, icon_key, sort_order, product_count
 */
router.get(
  '/stores/:storeId/categories',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { storeId } = req.params;

      if (!storeId) {
        throw new ApiError(
          400,
          ERROR_CODES.VALIDATION_ERROR,
          'storeId is required'
        );
      }

      // Get categories with product counts for this store
      // Include "Sab" (all) category with total count
      const categoriesSql = `
        WITH store_counts AS (
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
          ft.label_en,
          ft.label_hi,
          ft.icon_key,
          ft.sort_order,
          CASE
            WHEN ft.label_en = 'Sab' THEN (SELECT total FROM total_count)
            ELSE COALESCE(sc.product_count, 0)
          END AS product_count
        FROM catalog.fmcg_taxonomy ft
        LEFT JOIN store_counts sc ON sc.taxonomy_id = ft.id
        WHERE ft.is_active = true
          AND (
            ft.label_en = 'Sab'  -- Always include "All" category
            OR sc.product_count > 0  -- Include categories with products
          )
        ORDER BY ft.sort_order ASC
      `;

      const rows = await query<{
        id: string;
        label_en: string;
        label_hi: string | null;
        icon_key: string;
        sort_order: number;
        product_count: number;
      }>(categoriesSql, [storeId]);

      res.json({
        success: true,
        data: rows.map(r => ({
          id: r.id,
          labelEn: r.label_en,
          labelHi: r.label_hi,
          iconKey: r.icon_key,
          sortOrder: r.sort_order,
          productCount: Number(r.product_count),
        })),
        count: rows.length,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /stores/:storeId/categories/:taxonomyId/products
 * Get products in a specific FMCG category for this store.
 *
 * Query params:
 * - limit: Max results (default 50, max 100)
 * - cursor: Pagination cursor (base64 encoded created_at)
 * - includeZeroStock: Include out-of-stock items (default true)
 *
 * Special case: taxonomyId = "all" returns all products
 */
router.get(
  '/stores/:storeId/categories/:taxonomyId/products',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { storeId, taxonomyId } = req.params;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const cursor = req.query.cursor as string | undefined;
      const includeZeroStock = req.query.includeZeroStock !== 'false';

      if (!storeId) {
        throw new ApiError(
          400,
          ERROR_CODES.VALIDATION_ERROR,
          'storeId is required'
        );
      }

      // Decode cursor (base64 encoded timestamp)
      let cursorTimestamp: Date | null = null;
      if (cursor) {
        try {
          const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
          cursorTimestamp = new Date(decoded);
          if (isNaN(cursorTimestamp.getTime())) {
            cursorTimestamp = null;
          }
        } catch {
          // Invalid cursor, ignore
        }
      }

      // Build query based on whether it's "all" or a specific category
      const isAllCategory = taxonomyId.toLowerCase() === 'all' ||
                           taxonomyId === 'f0000000-0000-0000-0000-000000000001';

      const productsSql = `
        SELECT
          sp.id,
          sp.product_id,
          sp.display_name,
          sp.sell_price,
          sp.mrp,
          sp.current_stock,
          sp.taxonomy_id,
          sp.created_at,
          p.brand,
          COALESCE(
            (SELECT pb.barcode FROM catalog.product_barcodes pb WHERE pb.product_id = sp.product_id LIMIT 1),
            NULL
          ) AS barcode
        FROM catalog.store_products sp
        LEFT JOIN catalog.products p ON p.id = sp.product_id
        WHERE sp.store_id = $1
          AND sp.is_active = true
          ${!includeZeroStock ? 'AND sp.current_stock > 0' : ''}
          ${!isAllCategory ? 'AND sp.taxonomy_id = $2' : ''}
          ${cursorTimestamp ? `AND sp.created_at < $${isAllCategory ? 2 : 3}` : ''}
        ORDER BY sp.created_at DESC
        LIMIT $${isAllCategory ? (cursorTimestamp ? 3 : 2) : (cursorTimestamp ? 4 : 3)}
      `;

      // Build params array
      const params: (string | number | Date)[] = [storeId];
      if (!isAllCategory) {
        params.push(taxonomyId);
      }
      if (cursorTimestamp) {
        params.push(cursorTimestamp);
      }
      params.push(limit + 1); // Fetch one extra to check hasMore

      const rows = await query<{
        id: string;
        product_id: string;
        display_name: string;
        sell_price: number;
        mrp: number;
        current_stock: number;
        taxonomy_id: string | null;
        created_at: Date;
        brand: string | null;
        barcode: string | null;
      }>(productsSql, params);

      // Check if there are more results
      const hasMore = rows.length > limit;
      const products = hasMore ? rows.slice(0, limit) : rows;

      // Generate next cursor
      let nextCursor: string | null = null;
      if (hasMore && products.length > 0) {
        const lastProduct = products[products.length - 1];
        nextCursor = Buffer.from(lastProduct.created_at.toISOString()).toString('base64');
      }

      res.json({
        success: true,
        data: products.map(p => ({
          id: p.id,
          productId: p.product_id,
          displayName: p.display_name,
          sellPrice: p.sell_price,
          mrp: p.mrp,
          currentStock: p.current_stock,
          taxonomyId: p.taxonomy_id,
          brand: p.brand,
          barcode: p.barcode,
        })),
        pagination: {
          limit,
          hasMore,
          nextCursor,
        },
        context: 'SELL',
      });
    } catch (error) {
      next(error);
    }
  }
);

// =============================================================================
// SEARCH-SELL-001: Store Product Search (SELL context only)
// =============================================================================

/**
 * GET /stores/:storeId/store-products/search
 * Search store products for SELL context.
 *
 * CRITICAL BOUNDARY: This endpoint ONLY searches products that exist
 * in catalog.store_products (products the store has onboarded/received).
 * It does NOT search supplier catalog.
 *
 * Query params:
 * - q: Search query (required, min 2 chars)
 * - limit: Max results (default 30)
 * - includeZeroStock: Include out-of-stock items (default true)
 *
 * Returns grouped results for 2-step add UX:
 * - groups[].displayName - Product family name
 * - groups[].matches[] - Individual SKUs to pick from
 */
router.get(
  '/stores/:storeId/store-products/search',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { storeId } = req.params;
      const q = req.query.q as string | undefined;
      const limit = parseInt(req.query.limit as string) || 30;
      const includeZeroStock = req.query.includeZeroStock !== 'false';

      // TENANT-001: storeId is required
      if (!storeId) {
        throw new ApiError(
          400,
          ERROR_CODES.VALIDATION_ERROR,
          'storeId is required'
        );
      }

      // Validate search query
      if (!q || q.trim().length < 2) {
        throw new ApiError(
          400,
          ERROR_CODES.VALIDATION_ERROR,
          'Search query (q) is required and must be at least 2 characters'
        );
      }

      const result = await searchStoreProducts(storeId, q.trim(), {
        limit: Math.min(limit, 100),
        includeZeroStock,
      });

      res.json({
        success: true,
        data: result.groups,
        total: result.total,
        context: 'SELL', // Explicit context marker
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /stores/:storeId/store-products/lookup
 * Direct barcode lookup for SELL context (scanner use).
 *
 * CRITICAL: Returns null if product not in store catalog.
 * This is intentional - forces "sell-first onboarding" flow.
 *
 * Query params:
 * - barcode: Exact barcode to look up (required)
 */
router.get(
  '/stores/:storeId/store-products/lookup',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { storeId } = req.params;
      const barcode = req.query.barcode as string | undefined;

      if (!storeId) {
        throw new ApiError(
          400,
          ERROR_CODES.VALIDATION_ERROR,
          'storeId is required'
        );
      }

      if (!barcode || barcode.trim().length === 0) {
        throw new ApiError(
          400,
          ERROR_CODES.VALIDATION_ERROR,
          'barcode is required'
        );
      }

      const result = await getStoreProductByBarcode(storeId, barcode.trim());

      if (!result) {
        // Product not in store catalog - return 404
        // Frontend should trigger "sell-first onboarding" flow
        res.status(404).json({
          success: false,
          error: 'PRODUCT_NOT_IN_STORE_CATALOG',
          message: 'Product not found in store catalog. Use sell-first flow to onboard.',
          barcode: barcode.trim(),
        });
        return;
      }

      res.json({
        success: true,
        data: result,
        context: 'SELL',
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
