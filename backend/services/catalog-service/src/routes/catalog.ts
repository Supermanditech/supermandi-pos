// Catalog Routes - V3.0.9 compliant
// Store catalog endpoints with unified product view

import { Router, Request, Response, NextFunction } from 'express';
import type { Router as RouterType } from 'express';
import { ApiError, ERROR_CODES } from '@supermandi/common';
import { getStoreCatalog, getStoreCatalogProduct } from '../services/catalogService.js';
import { config } from '../config.js';

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

/**
 * GET /stores/:storeId/catalog/categories
 * Get distinct categories available in the store's catalog.
 */
router.get(
  '/stores/:storeId/catalog/categories',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { storeId } = req.params;

      // Import query function for this endpoint
      const { query } = await import('@supermandi/common');

      const categoriesSql = `
        SELECT DISTINCT p.category
        FROM catalog.products p
        JOIN catalog.supplier_product_map spm ON spm.product_id = p.id
        JOIN catalog.supplier_products sp ON sp.id = spm.supplier_product_id
        JOIN supplier.supplier_store_links ssl ON ssl.supplier_id = sp.supplier_id
        WHERE ssl.store_id = $1
          AND ssl.status = 'active'
          AND p.is_active = true
          AND p.category IS NOT NULL
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

export default router;
