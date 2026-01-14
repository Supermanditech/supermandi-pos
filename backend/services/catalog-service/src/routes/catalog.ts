// Catalog Routes - V3.0.10 compliant
// Store catalog endpoints with unified product view
//
// DEV-064: CRITICAL ROUTE ORDERING
// The /categories route MUST be defined BEFORE /:productId to prevent
// "categories" from being captured as a productId parameter.
// Order: /catalog → /catalog/categories → /catalog/:productId

import { Router, Request, Response, NextFunction } from 'express';
import type { Router as RouterType } from 'express';
import { ApiError, ERROR_CODES } from '@supermandi/common';
import { getStoreCatalog, getStoreCatalogProduct } from '../services/catalogService.js';
import { searchStoreProducts, getStoreProductByBarcode, type StoreSearchGroup } from '../db/queries.js';
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
