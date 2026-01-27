// Supplier Products Routes
// SM-006: Supplier Product CRUD API

import { Router, Request, Response, NextFunction } from 'express';
import type { Router as RouterType } from 'express';
import { ApiError, ERROR_CODES, query, queryOne } from '@supermandi/common';
import { supplierAuth, AuthenticatedRequest } from '../middleware/supplierAuth.js';

const router: RouterType = Router();

// =============================================================================
// TYPES
// =============================================================================

interface CreateProductBody {
  skuCode: string;
  name: string;
  brand?: string;
  category?: string;
  barcode?: string;
  mrp?: number;
  purchasePrice: number;
  moq: number;
  stockQty?: number;
}

interface UpdateProductBody {
  name?: string;
  brand?: string;
  category?: string;
  barcode?: string;
  mrp?: number;
  purchasePrice?: number;
  moq?: number;
  stockQty?: number;
}

interface SupplierProductRow {
  id: string;
  supplier_id: string;
  supplier_sku: string;
  barcode: string | null;
  name: string;
  category: string | null;
  brand: string | null;
  mrp: number | null;
  purchase_price: number;
  stock_quantity: number;
  moq: number;
  approval_status: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// PRODUCT ENDPOINTS
// =============================================================================

/**
 * POST /products
 * Create a new product for the authenticated supplier
 */
router.post(
  '/products',
  supplierAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { supplier } = req as AuthenticatedRequest;
      const body = req.body as CreateProductBody;

      // Validate required fields
      if (!body.skuCode || !body.name || body.purchasePrice === undefined || body.moq === undefined) {
        throw new ApiError(
          422,
          ERROR_CODES.VALIDATION_ERROR,
          'Missing required fields: skuCode, name, purchasePrice, moq'
        );
      }

      // Validate prices are positive integers
      if (body.purchasePrice < 0 || !Number.isInteger(body.purchasePrice)) {
        throw new ApiError(
          422,
          ERROR_CODES.VALIDATION_ERROR,
          'purchasePrice must be a positive integer (in paise)'
        );
      }

      if (body.mrp !== undefined && (body.mrp < 0 || !Number.isInteger(body.mrp))) {
        throw new ApiError(
          422,
          ERROR_CODES.VALIDATION_ERROR,
          'mrp must be a positive integer (in paise)'
        );
      }

      // Validate barcode format (8-14 digits)
      if (body.barcode && !/^\d{8,14}$/.test(body.barcode)) {
        throw new ApiError(
          422,
          ERROR_CODES.VALIDATION_ERROR,
          'Barcode must be 8-14 digits'
        );
      }

      // Check for duplicate SKU for this supplier
      const existingSku = await queryOne<{ id: string }>(
        `SELECT id FROM catalog.supplier_products
         WHERE supplier_id = $1 AND supplier_sku = $2`,
        [supplier.supplierId, body.skuCode]
      );

      if (existingSku) {
        throw new ApiError(
          409,
          ERROR_CODES.CONFLICT,
          `SKU code '${body.skuCode}' already exists for this supplier`
        );
      }

      // Insert product with approval_status = 'pending'
      const result = await queryOne<{ id: string }>(
        `INSERT INTO catalog.supplier_products (
          supplier_id, supplier_sku, barcode, name, category, brand,
          mrp, purchase_price, stock_quantity, moq,
          approval_status, is_active
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', true
        ) RETURNING id`,
        [
          supplier.supplierId,
          body.skuCode,
          body.barcode || null,
          body.name,
          body.category || null,
          body.brand || null,
          body.mrp || null,
          body.purchasePrice,
          body.stockQty || 0,
          body.moq,
        ]
      );

      if (!result) {
        throw new ApiError(500, ERROR_CODES.INTERNAL_ERROR, 'Failed to create product');
      }

      // Log the submission
      await query(
        `INSERT INTO supplier.approval_logs (entity_type, entity_id, action, to_status, actor_id)
         VALUES ('product', $1, 'submit', 'pending', $2)`,
        [result.id, supplier.supplierId]
      );

      res.status(201).json({
        productId: result.id,
        supplierProductId: result.id,
        approvalStatus: 'pending',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /products
 * List products for the authenticated supplier
 */
router.get(
  '/products',
  supplierAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { supplier } = req as AuthenticatedRequest;

      // Parse query params
      const statusParam = req.query.status as string | undefined;
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const offset = (page - 1) * limit;

      // Build status filter
      let statusFilter = '';
      const params: unknown[] = [supplier.supplierId];
      let paramIndex = 2;

      if (statusParam) {
        const statuses = statusParam.split(',').map(s => s.trim());
        const validStatuses = ['pending', 'approved', 'rejected'];
        const filtered = statuses.filter(s => validStatuses.includes(s));

        if (filtered.length > 0) {
          statusFilter = ` AND approval_status = ANY($${paramIndex})`;
          params.push(filtered);
          paramIndex++;
        }
      }

      // Get total count
      const countResult = await queryOne<{ count: string }>(
        `SELECT COUNT(*) as count FROM catalog.supplier_products
         WHERE supplier_id = $1 ${statusFilter}`,
        params
      );
      const total = parseInt(countResult?.count || '0', 10);

      // Get products
      params.push(limit, offset);
      const products = await query<SupplierProductRow>(
        `SELECT id, supplier_id, supplier_sku, barcode, name, category, brand,
                mrp, purchase_price, stock_quantity, moq,
                approval_status, is_active, created_at, updated_at
         FROM catalog.supplier_products
         WHERE supplier_id = $1 ${statusFilter}
         ORDER BY created_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        params
      );

      res.json({
        products: products.map(p => ({
          id: p.id,
          skuCode: p.supplier_sku,
          name: p.name,
          brand: p.brand,
          category: p.category,
          barcode: p.barcode,
          mrp: p.mrp,
          purchasePrice: p.purchase_price,
          stockQty: p.stock_quantity,
          moq: p.moq,
          approvalStatus: p.approval_status,
          isActive: p.is_active,
          createdAt: p.created_at,
          updatedAt: p.updated_at,
        })),
        total,
        page,
        limit,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /products/:productId
 * Get a single product by ID
 */
router.get(
  '/products/:productId',
  supplierAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { supplier } = req as AuthenticatedRequest;
      const { productId } = req.params;

      const product = await queryOne<SupplierProductRow>(
        `SELECT id, supplier_id, supplier_sku, barcode, name, category, brand,
                mrp, purchase_price, stock_quantity, moq,
                approval_status, is_active, created_at, updated_at
         FROM catalog.supplier_products
         WHERE id = $1 AND supplier_id = $2`,
        [productId, supplier.supplierId]
      );

      if (!product) {
        throw new ApiError(404, ERROR_CODES.NOT_FOUND, 'Product not found');
      }

      res.json({
        id: product.id,
        skuCode: product.supplier_sku,
        name: product.name,
        brand: product.brand,
        category: product.category,
        barcode: product.barcode,
        mrp: product.mrp,
        purchasePrice: product.purchase_price,
        stockQty: product.stock_quantity,
        moq: product.moq,
        approvalStatus: product.approval_status,
        isActive: product.is_active,
        createdAt: product.created_at,
        updatedAt: product.updated_at,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /products/:productId
 * Update a product - if approved, triggers re-approval
 */
router.put(
  '/products/:productId',
  supplierAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { supplier } = req as AuthenticatedRequest;
      const { productId } = req.params;
      const body = req.body as UpdateProductBody;

      // Get existing product
      const existing = await queryOne<SupplierProductRow>(
        `SELECT id, supplier_id, approval_status
         FROM catalog.supplier_products
         WHERE id = $1 AND supplier_id = $2`,
        [productId, supplier.supplierId]
      );

      if (!existing) {
        throw new ApiError(404, ERROR_CODES.NOT_FOUND, 'Product not found');
      }

      // Validate barcode if provided
      if (body.barcode && !/^\d{8,14}$/.test(body.barcode)) {
        throw new ApiError(
          422,
          ERROR_CODES.VALIDATION_ERROR,
          'Barcode must be 8-14 digits'
        );
      }

      // Build update query
      const updates: string[] = [];
      const values: unknown[] = [];
      let paramIndex = 1;

      if (body.name !== undefined) {
        updates.push(`name = $${paramIndex++}`);
        values.push(body.name);
      }
      if (body.brand !== undefined) {
        updates.push(`brand = $${paramIndex++}`);
        values.push(body.brand);
      }
      if (body.category !== undefined) {
        updates.push(`category = $${paramIndex++}`);
        values.push(body.category);
      }
      if (body.barcode !== undefined) {
        updates.push(`barcode = $${paramIndex++}`);
        values.push(body.barcode);
      }
      if (body.mrp !== undefined) {
        updates.push(`mrp = $${paramIndex++}`);
        values.push(body.mrp);
      }
      if (body.purchasePrice !== undefined) {
        updates.push(`purchase_price = $${paramIndex++}`);
        values.push(body.purchasePrice);
      }
      if (body.moq !== undefined) {
        updates.push(`moq = $${paramIndex++}`);
        values.push(body.moq);
      }
      if (body.stockQty !== undefined) {
        updates.push(`stock_quantity = $${paramIndex++}`);
        values.push(body.stockQty);
      }

      if (updates.length === 0) {
        throw new ApiError(422, ERROR_CODES.VALIDATION_ERROR, 'No fields to update');
      }

      // If product was approved, reset to pending for re-approval
      const wasApproved = existing.approval_status === 'approved';
      if (wasApproved) {
        updates.push(`approval_status = $${paramIndex++}`);
        values.push('pending');
        updates.push(`approved_at = $${paramIndex++}`);
        values.push(null);
        updates.push(`approved_by = $${paramIndex++}`);
        values.push(null);
      }

      updates.push(`updated_at = NOW()`);
      values.push(productId, supplier.supplierId);

      await query(
        `UPDATE catalog.supplier_products
         SET ${updates.join(', ')}
         WHERE id = $${paramIndex} AND supplier_id = $${paramIndex + 1}`,
        values
      );

      // Log the edit
      await query(
        `INSERT INTO supplier.approval_logs (entity_type, entity_id, action, from_status, to_status, actor_id, changes)
         VALUES ('product', $1, 'edit', $2, $3, $4, $5)`,
        [
          productId,
          existing.approval_status,
          wasApproved ? 'pending' : existing.approval_status,
          supplier.supplierId,
          JSON.stringify(body),
        ]
      );

      res.json({
        productId,
        approvalStatus: wasApproved ? 'pending' : existing.approval_status,
        message: wasApproved
          ? 'Product updated. Re-approval required.'
          : 'Product updated successfully.',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PATCH /products/:productId/stock
 * Update stock quantity only (doesn't trigger re-approval)
 */
router.patch(
  '/products/:productId/stock',
  supplierAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { supplier } = req as AuthenticatedRequest;
      const { productId } = req.params;
      const { stockQty } = req.body as { stockQty: number };

      if (stockQty === undefined || stockQty < 0) {
        throw new ApiError(
          422,
          ERROR_CODES.VALIDATION_ERROR,
          'stockQty must be a non-negative integer'
        );
      }

      const result = await query(
        `UPDATE catalog.supplier_products
         SET stock_quantity = $1, updated_at = NOW()
         WHERE id = $2 AND supplier_id = $3
         RETURNING id`,
        [stockQty, productId, supplier.supplierId]
      );

      if (result.length === 0) {
        throw new ApiError(404, ERROR_CODES.NOT_FOUND, 'Product not found');
      }

      res.json({
        productId,
        stockQty,
        message: 'Stock updated successfully.',
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
