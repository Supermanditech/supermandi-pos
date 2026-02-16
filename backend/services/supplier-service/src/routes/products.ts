// Supplier Products Routes
// SM-006: Supplier Product CRUD API
// SM-007: Supplier CSV Bulk Upload API

import { Router, Request, Response, NextFunction } from 'express';
import type { Router as RouterType } from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { ApiError, ERROR_CODES, query, queryOne } from '@supermandi/common';
import { supplierAuth, AuthenticatedRequest } from '../middleware/supplierAuth';

// =============================================================================
// MULTER CONFIGURATION (SM-007)
// =============================================================================

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  },
});

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

// =============================================================================
// CSV BULK UPLOAD (SM-007)
// =============================================================================

interface CsvRow {
  sku_code: string;
  name: string;
  brand?: string;
  category?: string;
  barcode?: string;
  mrp?: string;
  purchase_price: string;
  moq: string;
  stock_qty?: string;
}

interface CsvError {
  row: number;
  error: string;
}

/**
 * POST /products/csv-upload
 * Bulk upload products from CSV file
 * Max file size: 5MB, Max rows: 1000
 */
router.post(
  '/products/csv-upload',
  supplierAuth,
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { supplier } = req as AuthenticatedRequest;
      const file = req.file;

      if (!file) {
        throw new ApiError(400, ERROR_CODES.VALIDATION_ERROR, 'No CSV file provided');
      }

      // Parse CSV content
      const csvContent = file.buffer.toString('utf-8');
      let records: CsvRow[];

      try {
        records = parse(csvContent, {
          columns: true,
          skip_empty_lines: true,
          trim: true,
          relax_column_count: true,
        }) as CsvRow[];
      } catch (parseError) {
        throw new ApiError(400, ERROR_CODES.VALIDATION_ERROR, 'Invalid CSV format');
      }

      // Validate row count
      if (records.length === 0) {
        throw new ApiError(400, ERROR_CODES.VALIDATION_ERROR, 'CSV file is empty');
      }

      if (records.length > 1000) {
        throw new ApiError(
          400,
          ERROR_CODES.VALIDATION_ERROR,
          `CSV file has ${records.length} rows, maximum allowed is 1000`
        );
      }

      // Get existing SKUs for this supplier to check duplicates
      const existingSkus = await query<{ supplier_sku: string }>(
        `SELECT supplier_sku FROM catalog.supplier_products WHERE supplier_id = $1`,
        [supplier.supplierId]
      );
      const existingSkuSet = new Set(existingSkus.map(r => r.supplier_sku));

      // Process each row
      const errors: CsvError[] = [];
      const validProducts: Array<{
        skuCode: string;
        name: string;
        brand: string | null;
        category: string | null;
        barcode: string | null;
        mrp: number | null;
        purchasePrice: number;
        moq: number;
        stockQty: number;
      }> = [];
      const seenSkus = new Set<string>();

      for (let i = 0; i < records.length; i++) {
        const row = records[i];
        const rowNum = i + 2; // +2 because row 1 is header, and we're 0-indexed

        // Validate required fields
        if (!row.sku_code || row.sku_code.trim() === '') {
          errors.push({ row: rowNum, error: 'Missing required field: sku_code' });
          continue;
        }
        if (!row.name || row.name.trim() === '') {
          errors.push({ row: rowNum, error: 'Missing required field: name' });
          continue;
        }
        if (!row.purchase_price || row.purchase_price.trim() === '') {
          errors.push({ row: rowNum, error: 'Missing required field: purchase_price' });
          continue;
        }
        if (!row.moq || row.moq.trim() === '') {
          errors.push({ row: rowNum, error: 'Missing required field: moq' });
          continue;
        }

        const skuCode = row.sku_code.trim();
        const name = row.name.trim();
        const brand = row.brand?.trim() || null;
        const category = row.category?.trim() || null;
        const barcode = row.barcode?.trim() || null;

        // Parse numeric values
        const purchasePrice = parseInt(row.purchase_price, 10);
        const moq = parseInt(row.moq, 10);
        const mrp = row.mrp ? parseInt(row.mrp, 10) : null;
        const stockQty = row.stock_qty ? parseInt(row.stock_qty, 10) : 0;

        // Validate purchase price
        if (isNaN(purchasePrice) || purchasePrice < 0) {
          errors.push({ row: rowNum, error: 'purchase_price must be a positive integer (in paise)' });
          continue;
        }

        // Validate MOQ
        if (isNaN(moq) || moq < 1) {
          errors.push({ row: rowNum, error: 'moq must be a positive integer >= 1' });
          continue;
        }

        // Validate MRP if provided
        if (mrp !== null && (isNaN(mrp) || mrp < 0)) {
          errors.push({ row: rowNum, error: 'mrp must be a positive integer (in paise)' });
          continue;
        }

        // Validate stock qty
        if (isNaN(stockQty) || stockQty < 0) {
          errors.push({ row: rowNum, error: 'stock_qty must be a non-negative integer' });
          continue;
        }

        // Validate barcode format (8-14 digits)
        if (barcode && !/^\d{8,14}$/.test(barcode)) {
          errors.push({ row: rowNum, error: 'Invalid barcode format (must be 8-14 digits)' });
          continue;
        }

        // Check for duplicate SKU in existing products
        if (existingSkuSet.has(skuCode)) {
          errors.push({ row: rowNum, error: `Duplicate SKU code: ${skuCode} already exists` });
          continue;
        }

        // Check for duplicate SKU within this CSV
        if (seenSkus.has(skuCode)) {
          errors.push({ row: rowNum, error: `Duplicate SKU code: ${skuCode} appears multiple times in CSV` });
          continue;
        }

        seenSkus.add(skuCode);
        validProducts.push({
          skuCode,
          name,
          brand,
          category,
          barcode,
          mrp,
          purchasePrice,
          moq,
          stockQty,
        });
      }

      // FIX-009: Batch INSERT instead of N+1 individual queries
      // Process in chunks of 100 to stay within param limits
      const BATCH_SIZE = 100;
      let imported = 0;

      for (let batchStart = 0; batchStart < validProducts.length; batchStart += BATCH_SIZE) {
        const batch = validProducts.slice(batchStart, batchStart + BATCH_SIZE);
        const COLS_PER_ROW = 10;

        // Build multi-row VALUES clause
        const values: unknown[] = [];
        const placeholders: string[] = [];

        batch.forEach((product, idx) => {
          const base = idx * COLS_PER_ROW + 1;
          placeholders.push(
            `($${base}, $${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, 'pending', true)`
          );
          values.push(
            supplier.supplierId, product.skuCode, product.barcode, product.name,
            product.category, product.brand, product.mrp, product.purchasePrice,
            product.stockQty, product.moq,
          );
        });

        try {
          const insertedRows = await query<{ id: string; supplier_sku: string }>(
            `INSERT INTO catalog.supplier_products (
              supplier_id, supplier_sku, barcode, name, category, brand,
              mrp, purchase_price, stock_quantity, moq,
              approval_status, is_active
            ) VALUES ${placeholders.join(', ')}
            ON CONFLICT DO NOTHING
            RETURNING id, supplier_sku`,
            values
          );

          imported += insertedRows.length;

          // Batch INSERT approval logs for inserted products
          if (insertedRows.length > 0) {
            const logValues: unknown[] = [];
            const logPlaceholders: string[] = [];

            insertedRows.forEach((row, idx) => {
              const base = idx * 3 + 1;
              logPlaceholders.push(`('product', $${base}, 'submit', 'pending', $${base + 1}, $${base + 2})`);
              logValues.push(row.id, supplier.supplierId, JSON.stringify({ source: 'csv_upload', sku: row.supplier_sku }));
            });

            await query(
              `INSERT INTO supplier.approval_logs (entity_type, entity_id, action, to_status, actor_id, changes)
               VALUES ${logPlaceholders.join(', ')}`,
              logValues
            );
          }

          // Products skipped due to conflict → report as errors
          const insertedSkus = new Set(insertedRows.map(r => r.supplier_sku));
          for (const product of batch) {
            if (!insertedSkus.has(product.skuCode)) {
              errors.push({
                row: validProducts.indexOf(product) + 2,
                error: 'Duplicate barcode or constraint violation — product skipped',
              });
            }
          }
        } catch (dbError) {
          // Entire batch failed — report all products in batch
          const errorMessage = dbError instanceof Error ? dbError.message : 'Database error';
          for (const product of batch) {
            errors.push({
              row: validProducts.indexOf(product) + 2,
              error: `Batch insert failed: ${errorMessage}`,
            });
          }
        }
      }

      res.json({
        imported,
        failed: errors.length,
        errors: errors.slice(0, 100), // Limit error response to 100 errors
      });
    } catch (error) {
      // Handle multer errors
      if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            error: {
              code: ERROR_CODES.VALIDATION_ERROR,
              message: 'File size exceeds 5MB limit',
            },
          });
        }
      }
      next(error);
    }
  }
);

export default router;
