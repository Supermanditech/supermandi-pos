// SM-006: Supplier Product CRUD Routes
// SM-007: CSV Upload included
// Manages supplier product catalog

import { Router, Response, NextFunction } from "express";
import { getPool } from "../../../db/client";
import { requireSupplierAuth, SupplierAuthRequest } from "./auth";
import multer from "multer";
import { parse } from "csv-parse/sync";

const router = Router();

// Multer config for CSV upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  },
});

// =============================================================================
// ROUTES
// =============================================================================

/**
 * GET /api/v1/supplier/products
 * List all products for the authenticated supplier
 */
router.get("/products", requireSupplierAuth, async (req: SupplierAuthRequest, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: 'DB_UNAVAILABLE', message: 'Database unavailable' } });
      return;
    }

    const result = await pool.query(
      `SELECT
        id,
        name,
        category,
        brand,
        supplier_sku,
        barcode,
        purchase_price,
        mrp,
        moq,
        unit,
        stock_quantity,
        stock_status,
        is_active,
        approval_status,
        created_at,
        updated_at
      FROM catalog.supplier_products
      WHERE supplier_id = $1
      ORDER BY created_at DESC`,
      [req.supplierId]
    );

    res.json({
      data: result.rows.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        brand: p.brand,
        supplierSku: p.supplier_sku,
        barcode: p.barcode,
        purchasePrice: p.purchase_price,
        mrp: p.mrp,
        moq: p.moq,
        unit: p.unit,
        stockQuantity: p.stock_quantity,
        stockStatus: p.stock_status,
        isActive: p.is_active,
        approvalStatus: p.approval_status || 'pending',
        createdAt: p.created_at,
        updatedAt: p.updated_at,
      })),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/supplier/products
 * Create a new product
 */
router.post("/products", requireSupplierAuth, async (req: SupplierAuthRequest, res: Response, next: NextFunction) => {
  try {
    const {
      name,
      description,
      category,
      brand,
      barcode,
      supplierSku,
      purchasePrice,
      mrp,
      moq,
      unit,
    } = req.body;

    // Validation
    if (!name || !purchasePrice) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Name and purchase price are required' }
      });
      return;
    }

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: 'DB_UNAVAILABLE', message: 'Database unavailable' } });
      return;
    }

    const result = await pool.query(
      `INSERT INTO catalog.supplier_products (
        supplier_id,
        name,
        category,
        brand,
        barcode,
        supplier_sku,
        purchase_price,
        mrp,
        moq,
        unit,
        approval_status,
        is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', true)
      RETURNING
        id,
        name,
        category,
        brand,
        barcode,
        supplier_sku,
        purchase_price,
        mrp,
        moq,
        unit,
        approval_status,
        is_active,
        created_at`,
      [
        req.supplierId,
        name,
        category || null,
        brand || null,
        barcode || null,
        supplierSku || null,
        purchasePrice,
        mrp || null,
        moq || 1,
        unit || 'PCS',
      ]
    );

    const product = result.rows[0];

    res.status(201).json({
      data: {
        id: product.id,
        name: product.name,
        category: product.category,
        brand: product.brand,
        barcode: product.barcode,
        supplierSku: product.supplier_sku,
        purchasePrice: product.purchase_price,
        mrp: product.mrp,
        moq: product.moq,
        unit: product.unit,
        approvalStatus: product.approval_status,
        isActive: product.is_active,
        createdAt: product.created_at,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/v1/supplier/products/:id
 * Update a product
 */
router.patch("/products/:id", requireSupplierAuth, async (req: SupplierAuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      category,
      brand,
      barcode,
      supplierSku,
      purchasePrice,
      mrp,
      moq,
      unit,
    } = req.body;

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: 'DB_UNAVAILABLE', message: 'Database unavailable' } });
      return;
    }

    // Verify ownership
    const checkResult = await pool.query(
      `SELECT id FROM catalog.supplier_products WHERE id = $1 AND supplier_id = $2`,
      [id, req.supplierId]
    );

    if (checkResult.rows.length === 0) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Product not found' }
      });
      return;
    }

    // Build dynamic update
    const updates: string[] = [];
    const values: (string | number | null)[] = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (category !== undefined) {
      updates.push(`category = $${paramIndex++}`);
      values.push(category);
    }
    if (brand !== undefined) {
      updates.push(`brand = $${paramIndex++}`);
      values.push(brand);
    }
    if (barcode !== undefined) {
      updates.push(`barcode = $${paramIndex++}`);
      values.push(barcode);
    }
    if (supplierSku !== undefined) {
      updates.push(`supplier_sku = $${paramIndex++}`);
      values.push(supplierSku);
    }
    if (purchasePrice !== undefined) {
      updates.push(`purchase_price = $${paramIndex++}`);
      values.push(purchasePrice);
    }
    if (mrp !== undefined) {
      updates.push(`mrp = $${paramIndex++}`);
      values.push(mrp);
    }
    if (moq !== undefined) {
      updates.push(`moq = $${paramIndex++}`);
      values.push(moq);
    }
    if (unit !== undefined) {
      updates.push(`unit = $${paramIndex++}`);
      values.push(unit);
    }

    if (updates.length === 0) {
      res.status(400).json({
        error: { code: 'NO_UPDATES', message: 'No fields to update' }
      });
      return;
    }

    // If product was approved and is being edited, reset to pending
    updates.push(`approval_status = CASE WHEN approval_status = 'approved' THEN 'pending' ELSE approval_status END`);

    values.push(id);

    const result = await pool.query(
      `UPDATE catalog.supplier_products
       SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIndex}
       RETURNING
         id,
         name,
         category,
         brand,
         barcode,
         supplier_sku,
         purchase_price,
         mrp,
         moq,
         unit,
         approval_status,
         is_active,
         updated_at`,
      values
    );

    const product = result.rows[0];

    res.json({
      data: {
        id: product.id,
        name: product.name,
        category: product.category,
        brand: product.brand,
        barcode: product.barcode,
        supplierSku: product.supplier_sku,
        purchasePrice: product.purchase_price,
        mrp: product.mrp,
        moq: product.moq,
        unit: product.unit,
        approvalStatus: product.approval_status,
        isActive: product.is_active,
        updatedAt: product.updated_at,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/supplier/products/:id
 * Delete a product
 */
router.delete("/products/:id", requireSupplierAuth, async (req: SupplierAuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: 'DB_UNAVAILABLE', message: 'Database unavailable' } });
      return;
    }

    const result = await pool.query(
      `DELETE FROM catalog.supplier_products
       WHERE id = $1 AND supplier_id = $2
       RETURNING id`,
      [id, req.supplierId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Product not found' }
      });
      return;
    }

    res.json({ data: { success: true } });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/supplier/products/csv-upload
 * SM-007: Upload products via CSV
 */
router.post(
  "/products/csv-upload",
  requireSupplierAuth,
  upload.single('file'),
  async (req: SupplierAuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        res.status(400).json({
          error: { code: 'NO_FILE', message: 'CSV file is required' }
        });
        return;
      }

      const pool = getPool();
      if (!pool) {
        res.status(503).json({ error: { code: 'DB_UNAVAILABLE', message: 'Database unavailable' } });
        return;
      }

      // Parse CSV
      const csvContent = req.file.buffer.toString('utf-8');
      let records: Record<string, string>[];

      try {
        records = parse(csvContent, {
          columns: true,
          skip_empty_lines: true,
          trim: true,
        });
      } catch (parseError) {
        res.status(400).json({
          error: { code: 'PARSE_ERROR', message: 'Failed to parse CSV file' }
        });
        return;
      }

      const results = {
        totalRows: records.length,
        imported: 0,
        skipped: 0,
        errors: [] as { row: number; error: string }[],
      };

      // Process each row
      for (let i = 0; i < records.length; i++) {
        const row = records[i];
        const rowNum = i + 2; // Account for header row

        try {
          // Required fields
          const name = row['name'] || row['Name'] || row['product_name'] || row['Product Name'];
          const purchasePriceStr = row['purchase_price'] || row['Purchase Price'] || row['price'] || row['Price'];

          if (!name) {
            results.errors.push({ row: rowNum, error: 'Missing product name' });
            results.skipped++;
            continue;
          }

          if (!purchasePriceStr) {
            results.errors.push({ row: rowNum, error: 'Missing purchase price' });
            results.skipped++;
            continue;
          }

          const purchasePrice = Math.round(parseFloat(purchasePriceStr) * 100);
          if (isNaN(purchasePrice) || purchasePrice <= 0) {
            results.errors.push({ row: rowNum, error: 'Invalid purchase price' });
            results.skipped++;
            continue;
          }

          // Optional fields
          const category = row['category'] || row['Category'] || null;
          const brand = row['brand'] || row['Brand'] || null;
          const barcode = row['barcode'] || row['Barcode'] || row['ean'] || row['EAN'] || null;
          const supplierSku = row['sku'] || row['SKU'] || row['supplier_sku'] || null;
          const mrpStr = row['mrp'] || row['MRP'] || null;
          const mrp = mrpStr ? Math.round(parseFloat(mrpStr) * 100) : null;
          const moqStr = row['moq'] || row['MOQ'] || row['min_qty'] || null;
          const moq = moqStr ? parseInt(moqStr) || 1 : 1;
          const unit = row['unit'] || row['Unit'] || 'PCS';

          await pool.query(
            `INSERT INTO catalog.supplier_products (
              supplier_id,
              name,
              category,
              brand,
              barcode,
              supplier_sku,
              purchase_price,
              mrp,
              moq,
              unit,
              approval_status,
              is_active
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', true)`,
            [
              req.supplierId,
              name,
              category,
              brand,
              barcode,
              supplierSku,
              purchasePrice,
              mrp,
              moq,
              unit,
            ]
          );

          results.imported++;
        } catch (rowError) {
          results.errors.push({
            row: rowNum,
            error: rowError instanceof Error ? rowError.message : 'Unknown error',
          });
          results.skipped++;
        }
      }

      res.json({ data: results });
    } catch (error) {
      next(error);
    }
  }
);

export const supplierProductsRouter = router;
