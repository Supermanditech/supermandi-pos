// SM-006: Supplier Product CRUD Routes
// SM-007: CSV Upload included
// Manages supplier product catalog

import { Router, Response, NextFunction } from "express";
import { getPool } from "../../../db/client";
import { requireSupplierAuth, SupplierAuthRequest } from "./auth";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { validateMoq, validatePrice } from "@supermandi/common";

const router = Router();

// GL-WF-057: Valid FMCG categories from taxonomy
const VALID_CATEGORIES = [
  'Atta-Dal',
  'Chawal',
  'Masala',
  'Tel-Ghee',
  'Namkeen',
  'Biscuit',
  'Chai-Coffee',
  'Cold Drink',
  'Doodh',
  'Sabun',
  'Safai',
  'Baby',
  'Paan-Supari',
  'Baaki',
];

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
 * GL-WF-063: Supports pagination via page and limit query params
 */
router.get("/products", requireSupplierAuth, async (req: SupplierAuthRequest, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: 'DB_UNAVAILABLE', message: 'Database unavailable' } });
      return;
    }

    // GL-WF-063: Parse pagination parameters
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;

    // GL-WF-063: Get total count for pagination
    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM catalog.supplier_products WHERE supplier_id = $1`,
      [req.supplierId]
    );
    const total = parseInt(countResult.rows[0]?.total || '0');

    // GL-WF-036: Include rejection_reason in product list
    // GL-WF-063: Add LIMIT and OFFSET for pagination
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
        rejection_reason,
        created_at,
        updated_at
      FROM catalog.supplier_products
      WHERE supplier_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3`,
      [req.supplierId, limit, offset]
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
        rejectionReason: p.rejection_reason, // GL-WF-036
        createdAt: p.created_at,
        updatedAt: p.updated_at,
      })),
      // GL-WF-063: Pagination metadata
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
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

    // GL-WF-017: Validate MRP >= Purchase Price
    if (mrp !== undefined && mrp !== null && mrp < purchasePrice) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'MRP must be greater than or equal to purchase price' }
      });
      return;
    }

    // GL-WF-056: Validate barcode format (GTIN: 8, 12, 13, or 14 digits)
    if (barcode && !/^\d{8}$|^\d{12,14}$/.test(barcode)) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Barcode must be a valid GTIN format (8, 12, 13, or 14 digits)' }
      });
      return;
    }

    // GL-WF-057: Validate category against FMCG taxonomy
    if (category && !VALID_CATEGORIES.includes(category)) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}` }
      });
      return;
    }

    // GO-LIVE-163: Validate MOQ bounds (positive integer, max 10000)
    if (moq !== undefined && moq !== null) {
      const moqValidation = validateMoq(moq);
      if (!moqValidation.valid) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: moqValidation.error }
        });
        return;
      }
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

    // GL-WF-017: Validate MRP >= Purchase Price if both are being updated
    if (mrp !== undefined && purchasePrice !== undefined && mrp < purchasePrice) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'MRP must be greater than or equal to purchase price' }
      });
      return;
    }

    // GL-WF-017: If only MRP is being updated, check against existing purchase price
    if (mrp !== undefined && purchasePrice === undefined) {
      const existingResult = await pool.query(
        `SELECT purchase_price FROM catalog.supplier_products WHERE id = $1`,
        [id]
      );
      if (existingResult.rows[0] && mrp < existingResult.rows[0].purchase_price) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'MRP must be greater than or equal to purchase price' }
        });
        return;
      }
    }

    // GL-WF-017: If only purchase price is being updated, check against existing MRP
    if (purchasePrice !== undefined && mrp === undefined) {
      const existingResult = await pool.query(
        `SELECT mrp FROM catalog.supplier_products WHERE id = $1`,
        [id]
      );
      if (existingResult.rows[0]?.mrp && existingResult.rows[0].mrp < purchasePrice) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Purchase price cannot exceed existing MRP' }
        });
        return;
      }
    }

    // GL-WF-056: Validate barcode format if being updated
    if (barcode && !/^\d{8}$|^\d{12,14}$/.test(barcode)) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Barcode must be a valid GTIN format (8, 12, 13, or 14 digits)' }
      });
      return;
    }

    // GL-WF-057: Validate category against FMCG taxonomy if being updated
    if (category && !VALID_CATEGORIES.includes(category)) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}` }
      });
      return;
    }

    // GO-LIVE-163: Validate MOQ bounds if being updated
    if (moq !== undefined && moq !== null) {
      const moqValidation = validateMoq(moq);
      if (!moqValidation.valid) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: moqValidation.error }
        });
        return;
      }
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
