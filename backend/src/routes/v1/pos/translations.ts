/**
 * Translation Routes - I18N-009
 *
 * API endpoints for store-level translation overrides
 */

import { Router, Request, Response, NextFunction } from "express";
import type { Pool } from "pg";
import { getPool } from "../../../db/client";
import {
  saveTranslationOverride,
  getLocalizedProduct,
  getLocalizedProductsWithQuota,
  isLocaleSupported,
  getQuotaStatus,
  type SupportedLocale,
} from "../../../services/translationService";
import { HttpError } from "../../../lib/httpError";

const router = Router();
type TranslationRequest = Request & { storeId?: string; locale?: string };

// SEC-005 GAP: Translation mutation routes (PATCH/POST/DELETE) do not use requireDeviceToken
// or requireActiveStore. The storeId comes from an unknown upstream context (possibly gateway
// headers). Adding requireActiveStore here would fail because storeId is not set via posDevice.
// TODO: Add requireDeviceToken + requireActiveStore to mutation routes when auth chain is clarified.

function requirePool(): Pool {
  const pool = getPool();
  if (!pool) {
    throw new HttpError(503, "database_unavailable");
  }
  return pool;
}

/**
 * GET /translations/product/:productId
 * Get localized product info for current store and locale
 */
router.get(
  "/product/:productId",
  async (req: TranslationRequest, res: Response, next: NextFunction) => {
    try {
      const pool = requirePool();
      const { productId } = req.params;
      const storeId = req.storeId; // Set by deviceToken middleware
      const locale = req.locale || "en";

      if (!productId) {
        throw new HttpError(400, "product_id_required");
      }

      // Fetch base product info
      const productResult = await pool.query(
        `SELECT id, name, brand FROM catalog.products WHERE id = $1`,
        [productId]
      );

      if (productResult.rows.length === 0) {
        throw new HttpError(404, "product_not_found");
      }

      const product = productResult.rows[0];
      const localized = await getLocalizedProduct(
        pool,
        {
          id: product.id,
          name: product.name,
          brand: product.brand,
        },
        locale as SupportedLocale,
        storeId
      );

      res.json({
        product: localized,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PATCH /translations/product/:productId/override
 * Set store-level translation override
 *
 * Body: {
 *   locale: "hi",
 *   nameOverride: "Custom Hindi name",
 *   descriptionOverride: "Custom description" (optional)
 * }
 */
router.patch(
  "/product/:productId/override",
  async (req: TranslationRequest, res: Response, next: NextFunction) => {
    try {
      const pool = requirePool();
      const { productId } = req.params;
      const storeId = req.storeId;
      const { locale, nameOverride, descriptionOverride } = req.body;

      if (!productId) {
        throw new HttpError(400, "product_id_required");
      }

      if (!storeId) {
        throw new HttpError(401, "store_not_identified");
      }

      if (!locale || !isLocaleSupported(locale)) {
        throw new HttpError(400, "invalid_locale");
      }

      if (!nameOverride && !descriptionOverride) {
        throw new HttpError(400, "no_override_provided");
      }

      // Verify product exists
      const productResult = await pool.query(
        `SELECT id FROM catalog.products WHERE id = $1`,
        [productId]
      );

      if (productResult.rows.length === 0) {
        throw new HttpError(404, "product_not_found");
      }

      // Save override
      await saveTranslationOverride(
        pool,
        storeId,
        productId,
        locale as SupportedLocale,
        nameOverride || null,
        descriptionOverride || null
      );

      res.json({
        success: true,
        message: "translation_override_saved",
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /translations/products/bulk
 * Bulk translate products for current store and locale
 * GO-LIVE-TR-005: Batch translation endpoint
 *
 * Body: {
 *   productIds: ["uuid1", "uuid2", ...],
 *   locale?: "hi" (defaults to request locale)
 * }
 *
 * Returns: {
 *   products: TranslatedProduct[]
 * }
 */
router.post(
  "/products/bulk",
  async (req: TranslationRequest, res: Response, next: NextFunction) => {
    try {
      const pool = requirePool();
      const storeId = req.storeId;
      const { productIds, locale: requestedLocale } = req.body;
      const locale = requestedLocale || req.locale || "en";

      if (!Array.isArray(productIds) || productIds.length === 0) {
        throw new HttpError(400, "product_ids_required");
      }

      if (productIds.length > 100) {
        throw new HttpError(400, "max_100_products_per_request");
      }

      if (!isLocaleSupported(locale)) {
        throw new HttpError(400, "invalid_locale");
      }

      // Fetch base product info
      const productsResult = await pool.query(
        `SELECT id, name, brand FROM catalog.products WHERE id = ANY($1)`,
        [productIds]
      );

      if (productsResult.rows.length === 0) {
        return res.json({ products: [] });
      }

      const products = productsResult.rows.map((row) => ({
        id: row.id,
        name: row.name,
        brand: row.brand,
      }));

      // TR-PEND-004: Use quota-aware localization
      const result = await getLocalizedProductsWithQuota(
        pool,
        products,
        locale as SupportedLocale,
        storeId!
      );

      res.json({
        products: result.products,
        locale,
        count: result.products.length,
        quotaExceeded: result.quotaExceeded,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /translations/quota
 * Get current store's translation quota status
 * TR-PEND-004: Cost + Quota Guards
 */
router.get(
  "/quota",
  async (req: TranslationRequest, res: Response, next: NextFunction) => {
    try {
      const pool = requirePool();
      const storeId = req.storeId;

      if (!storeId) {
        throw new HttpError(401, "store_not_identified");
      }

      const quota = await getQuotaStatus(pool, storeId);

      res.json({
        quota: {
          productsUsed: quota.productsUsed,
          productsRemaining: quota.productsRemaining,
          charactersUsed: quota.charactersUsed,
          charactersRemaining: quota.charactersRemaining,
          isExceeded: quota.isExceeded,
          resetAt: quota.resetAt.toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /translations/product/:productId/override
 * Remove store-level translation override
 *
 * Query: ?locale=hi
 */
router.delete(
  "/product/:productId/override",
  async (req: TranslationRequest, res: Response, next: NextFunction) => {
    try {
      const pool = requirePool();
      const { productId } = req.params;
      const storeId = req.storeId;
      const locale = req.query.locale as string;

      if (!productId) {
        throw new HttpError(400, "product_id_required");
      }

      if (!storeId) {
        throw new HttpError(401, "store_not_identified");
      }

      if (!locale || !isLocaleSupported(locale)) {
        throw new HttpError(400, "invalid_locale");
      }

      await pool.query(
        `DELETE FROM catalog.translation_overrides
         WHERE store_id = $1 AND product_id = $2 AND locale = $3`,
        [storeId, productId, locale]
      );

      res.json({
        success: true,
        message: "translation_override_removed",
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
