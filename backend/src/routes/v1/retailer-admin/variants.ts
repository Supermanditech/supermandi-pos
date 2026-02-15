// T-057: Retail Variant CRUD for LOOSE_BULK Products
// Endpoints:
//   GET    /products/:id/variants        — List variants for a store product
//   POST   /products/:id/variants        — Create variant(s)
//   PATCH  /products/:id/variants/:vid   — Update a variant
//   DELETE /products/:id/variants/:vid   — Soft-delete a variant

import { Router, Request, Response } from "express";
import { getPool } from "../../../db/client";
import { getStoreId, requireStoreContext } from "../../../middleware/retailerStoreContext";
import { sanitizeHtml } from "@supermandi/common";

export const retailerAdminVariantsRouter = Router();

retailerAdminVariantsRouter.use(requireStoreContext);

// Max price in minor units (paise): ₹10,00,000 = 10000000 paise
const MAX_PRICE_MINOR = 10_000_000;
const VALID_BASE_UNITS = ['KG', 'GM', 'LTR', 'ML', 'PCS', 'DOZEN'] as const;

/**
 * Generate a variant barcode (prefix 3) using the same approach as LOOSE_BULK barcodes (prefix 2)
 * Format: 3{storePrefix6}{timestamp7}{random2} = 16 chars
 */
function generateVariantBarcode(storeId: string): string {
  const storePrefix = storeId.replace(/-/g, '').substring(0, 6);
  const timestamp = Date.now().toString().slice(-7);
  const random = Math.floor(Math.random() * 100).toString().padStart(2, '0');
  return `3${storePrefix}${timestamp}${random}`;
}

// =============================================================================
// GET /api/v1/retailer-admin/products/:id/variants
// List all variants for a LOOSE_BULK store product
// =============================================================================
retailerAdminVariantsRouter.get(
  "/products/:id/variants",
  async (req: Request, res: Response) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: { code: "INTERNAL_ERROR", message: "Database unavailable" } });

    const storeId = req.storeId!;
    const storeProductId = req.params.id;

    try {
      // Verify store product exists and belongs to this store
      const spCheck = await pool.query(
        `SELECT id, product_mode FROM catalog.store_products
         WHERE id = $1 AND store_id = $2 AND is_active = true`,
        [storeProductId, storeId]
      );

      if (spCheck.rows.length === 0) {
        return res.status(404).json({ error: { code: "NOT_FOUND", message: "Product not found" } });
      }

      if (spCheck.rows[0].product_mode !== 'LOOSE_BULK') {
        return res.status(400).json({
          error: { code: "VALIDATION_ERROR", message: "Variants are only available for LOOSE_BULK products" }
        });
      }

      const result = await pool.query(
        `SELECT
          id,
          store_product_id AS "storeProductId",
          variant_label AS "variantLabel",
          variant_qty AS "variantQty",
          base_unit AS "baseUnit",
          sell_price_minor AS "sellPriceMinor",
          barcode,
          is_active AS "isActive",
          sort_order AS "sortOrder",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM catalog.product_retail_variants
        WHERE store_product_id = $1 AND is_active = true
        ORDER BY sort_order ASC, created_at ASC`,
        [storeProductId]
      );

      return res.json({ ok: true, data: result.rows });
    } catch (error: any) {
      console.error("[Variants] GET error:", error.message);
      return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to fetch variants" } });
    }
  }
);

// =============================================================================
// POST /api/v1/retailer-admin/products/:id/variants
// Create one or more variants for a LOOSE_BULK store product
// Body: { variants: [{ label, qty, baseUnit, sellPriceMinor, sortOrder? }] }
// =============================================================================
retailerAdminVariantsRouter.post(
  "/products/:id/variants",
  async (req: Request, res: Response) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: { code: "INTERNAL_ERROR", message: "Database unavailable" } });

    const storeId = req.storeId!;
    const storeProductId = req.params.id;
    const { variants } = req.body;

    // Validate input
    if (!Array.isArray(variants) || variants.length === 0) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "variants array is required and must not be empty" }
      });
    }

    if (variants.length > 20) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Maximum 20 variants per request" }
      });
    }

    // Validate each variant
    for (let i = 0; i < variants.length; i++) {
      const v = variants[i];
      if (!v.label || typeof v.label !== 'string' || v.label.trim().length === 0) {
        return res.status(400).json({
          error: { code: "VALIDATION_ERROR", message: `Variant ${i + 1}: label is required` }
        });
      }
      if (v.label.length > 100) {
        return res.status(400).json({
          error: { code: "VALIDATION_ERROR", message: `Variant ${i + 1}: label exceeds 100 characters` }
        });
      }
      if (!v.qty || typeof v.qty !== 'number' || v.qty <= 0) {
        return res.status(400).json({
          error: { code: "VALIDATION_ERROR", message: `Variant ${i + 1}: qty must be a positive number` }
        });
      }
      if (!v.baseUnit || !VALID_BASE_UNITS.includes(v.baseUnit)) {
        return res.status(400).json({
          error: { code: "VALIDATION_ERROR", message: `Variant ${i + 1}: baseUnit must be one of ${VALID_BASE_UNITS.join(', ')}` }
        });
      }
      if (v.sellPriceMinor === undefined || typeof v.sellPriceMinor !== 'number' || v.sellPriceMinor < 0) {
        return res.status(400).json({
          error: { code: "VALIDATION_ERROR", message: `Variant ${i + 1}: sellPriceMinor must be a non-negative number` }
        });
      }
      if (v.sellPriceMinor > MAX_PRICE_MINOR) {
        return res.status(400).json({
          error: { code: "VALIDATION_ERROR", message: `Variant ${i + 1}: sellPriceMinor exceeds maximum` }
        });
      }
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Verify store product exists, belongs to this store, and is LOOSE_BULK
      const spCheck = await client.query(
        `SELECT id, product_mode FROM catalog.store_products
         WHERE id = $1 AND store_id = $2 AND is_active = true
         FOR UPDATE`,
        [storeProductId, storeId]
      );

      if (spCheck.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: { code: "NOT_FOUND", message: "Product not found" } });
      }

      if (spCheck.rows[0].product_mode !== 'LOOSE_BULK') {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error: { code: "VALIDATION_ERROR", message: "Variants can only be created for LOOSE_BULK products" }
        });
      }

      // Get current max sort_order
      const maxSortResult = await client.query(
        `SELECT COALESCE(MAX(sort_order), -1) AS max_sort
         FROM catalog.product_retail_variants
         WHERE store_product_id = $1 AND is_active = true`,
        [storeProductId]
      );
      let nextSort = (maxSortResult.rows[0]?.max_sort ?? -1) + 1;

      const created: any[] = [];

      for (const v of variants) {
        const barcode = generateVariantBarcode(storeId);
        const sanitizedLabel = sanitizeHtml(v.label.trim());
        const sortOrder = v.sortOrder !== undefined ? v.sortOrder : nextSort++;

        const insertResult = await client.query(
          `INSERT INTO catalog.product_retail_variants (
            store_product_id, variant_label, variant_qty, base_unit,
            sell_price_minor, barcode, is_active, sort_order
          ) VALUES ($1, $2, $3, $4, $5, $6, true, $7)
          RETURNING
            id,
            store_product_id AS "storeProductId",
            variant_label AS "variantLabel",
            variant_qty AS "variantQty",
            base_unit AS "baseUnit",
            sell_price_minor AS "sellPriceMinor",
            barcode,
            is_active AS "isActive",
            sort_order AS "sortOrder",
            created_at AS "createdAt"`,
          [storeProductId, sanitizedLabel, v.qty, v.baseUnit, v.sellPriceMinor, barcode, sortOrder]
        );

        created.push(insertResult.rows[0]);
      }

      await client.query("COMMIT");

      return res.status(201).json({ ok: true, data: created });
    } catch (error: any) {
      await client.query("ROLLBACK");
      console.error("[Variants] POST error:", error.message);

      if (error.code === '23505') {
        return res.status(409).json({
          error: { code: "CONFLICT", message: "Barcode collision — please retry" }
        });
      }
      if (error.message?.includes('LOOSE_BULK')) {
        return res.status(400).json({
          error: { code: "VALIDATION_ERROR", message: error.message }
        });
      }

      return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to create variants" } });
    } finally {
      client.release();
    }
  }
);

// =============================================================================
// PATCH /api/v1/retailer-admin/products/:id/variants/:vid
// Update a variant (label, price, qty, active status, sort order)
// =============================================================================
retailerAdminVariantsRouter.patch(
  "/products/:id/variants/:vid",
  async (req: Request, res: Response) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: { code: "INTERNAL_ERROR", message: "Database unavailable" } });

    const storeId = req.storeId!;
    const storeProductId = req.params.id;
    const variantId = req.params.vid;
    const { label, qty, baseUnit, sellPriceMinor, sortOrder, isActive } = req.body;

    // Validate optional fields
    if (label !== undefined) {
      if (typeof label !== 'string' || label.trim().length === 0) {
        return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "label must be a non-empty string" } });
      }
      if (label.length > 100) {
        return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "label exceeds 100 characters" } });
      }
    }
    if (qty !== undefined && (typeof qty !== 'number' || qty <= 0)) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "qty must be a positive number" } });
    }
    if (baseUnit !== undefined && !VALID_BASE_UNITS.includes(baseUnit)) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: `baseUnit must be one of ${VALID_BASE_UNITS.join(', ')}` }
      });
    }
    if (sellPriceMinor !== undefined) {
      if (typeof sellPriceMinor !== 'number' || sellPriceMinor < 0) {
        return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "sellPriceMinor must be non-negative" } });
      }
      if (sellPriceMinor > MAX_PRICE_MINOR) {
        return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "sellPriceMinor exceeds maximum" } });
      }
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Verify variant belongs to the correct store product and store
      const checkResult = await client.query(
        `SELECT v.id, v.variant_label
         FROM catalog.product_retail_variants v
         JOIN catalog.store_products sp ON sp.id = v.store_product_id
         WHERE v.id = $1 AND v.store_product_id = $2 AND sp.store_id = $3`,
        [variantId, storeProductId, storeId]
      );

      if (checkResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: { code: "NOT_FOUND", message: "Variant not found" } });
      }

      // Build dynamic SET clause
      const setClauses: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (label !== undefined) {
        setClauses.push(`variant_label = $${paramIndex++}`);
        values.push(sanitizeHtml(label.trim()));
      }
      if (qty !== undefined) {
        setClauses.push(`variant_qty = $${paramIndex++}`);
        values.push(qty);
      }
      if (baseUnit !== undefined) {
        setClauses.push(`base_unit = $${paramIndex++}`);
        values.push(baseUnit);
      }
      if (sellPriceMinor !== undefined) {
        setClauses.push(`sell_price_minor = $${paramIndex++}`);
        values.push(sellPriceMinor);
      }
      if (sortOrder !== undefined) {
        setClauses.push(`sort_order = $${paramIndex++}`);
        values.push(sortOrder);
      }
      if (isActive !== undefined) {
        setClauses.push(`is_active = $${paramIndex++}`);
        values.push(isActive);
      }

      if (setClauses.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "No fields to update" } });
      }

      setClauses.push(`updated_at = NOW()`);
      values.push(variantId);

      const updateResult = await client.query(
        `UPDATE catalog.product_retail_variants
         SET ${setClauses.join(', ')}
         WHERE id = $${paramIndex}
         RETURNING
           id,
           store_product_id AS "storeProductId",
           variant_label AS "variantLabel",
           variant_qty AS "variantQty",
           base_unit AS "baseUnit",
           sell_price_minor AS "sellPriceMinor",
           barcode,
           is_active AS "isActive",
           sort_order AS "sortOrder",
           updated_at AS "updatedAt"`,
        values
      );

      await client.query("COMMIT");

      return res.json({ ok: true, data: updateResult.rows[0] });
    } catch (error: any) {
      await client.query("ROLLBACK");
      console.error("[Variants] PATCH error:", error.message);
      return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to update variant" } });
    } finally {
      client.release();
    }
  }
);

// =============================================================================
// DELETE /api/v1/retailer-admin/products/:id/variants/:vid
// Soft-delete a variant (set is_active = false)
// =============================================================================
retailerAdminVariantsRouter.delete(
  "/products/:id/variants/:vid",
  async (req: Request, res: Response) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: { code: "INTERNAL_ERROR", message: "Database unavailable" } });

    const storeId = req.storeId!;
    const storeProductId = req.params.id;
    const variantId = req.params.vid;

    try {
      // Verify variant belongs to the correct store product and store
      const checkResult = await pool.query(
        `SELECT v.id
         FROM catalog.product_retail_variants v
         JOIN catalog.store_products sp ON sp.id = v.store_product_id
         WHERE v.id = $1 AND v.store_product_id = $2 AND sp.store_id = $3 AND v.is_active = true`,
        [variantId, storeProductId, storeId]
      );

      if (checkResult.rows.length === 0) {
        return res.status(404).json({ error: { code: "NOT_FOUND", message: "Variant not found" } });
      }

      await pool.query(
        `UPDATE catalog.product_retail_variants
         SET is_active = false, updated_at = NOW()
         WHERE id = $1`,
        [variantId]
      );

      return res.json({ ok: true, message: "Variant deactivated" });
    } catch (error: any) {
      console.error("[Variants] DELETE error:", error.message);
      return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to delete variant" } });
    }
  }
);
