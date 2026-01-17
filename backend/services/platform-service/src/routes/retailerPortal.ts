// Retailer Portal Routes - Store Owner API
// Routes for retailer portal: products, inventory, suppliers, compliance, imports
// These routes require JWT with store_id claim - enforced by middleware

import crypto from 'crypto';
import { Router, Request, Response, NextFunction } from 'express';
import { ApiError, query } from '@supermandi/common';
import {
  generateSignedUploadUrl,
  generateSignedDownloadUrl,
  checkFileExists,
  calculateSha256,
  getFileContent,
  isValidComplianceMimeType,
  isValidImportMimeType,
  getMaxFileSize,
} from '@supermandi/common';
import {
  createComplianceDocument,
  confirmComplianceDocumentUpload,
  getComplianceDocuments,
  getComplianceDocumentById,
  createCsvImport,
  checkDuplicateCsvImport,
  getCsvImportById,
  getCsvImports,
  startCsvValidation,
  completeCsvValidation,
  startCsvCommit,
  completeCsvCommit,
  failCsvImport,
  type ValidationError,
} from '../db/retailerAdminQueries.js';

const router: Router = Router();

// =============================================================================
// ASYNC HANDLER
// =============================================================================

type AsyncHandler<P = Record<string, string>> = (
  req: Request<P>,
  res: Response,
  next: NextFunction
) => Promise<void>;

function asyncHandler<P = Record<string, string>>(fn: AsyncHandler<P>): AsyncHandler<P> {
  return async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

// =============================================================================
// MIDDLEWARE - Extract store context from JWT
// =============================================================================

interface RetailerContext {
  userId: string;
  storeId: string;
}

function getRetailerContext(req: Request): RetailerContext {
  const userId = req.headers['x-user-id'] as string;
  const storeId = req.headers['x-actor-id'] as string;

  if (!userId || !storeId) {
    throw ApiError.unauthorized('Authentication required');
  }

  return { userId, storeId };
}

// =============================================================================
// STORE INFO
// =============================================================================

/**
 * GET /retailer-admin/store
 * Get current store details
 */
router.get(
  '/store',
  asyncHandler(async (req, res) => {
    const { storeId } = getRetailerContext(req);

    const result = await query<{
      id: string;
      code: string;
      name: string;
      address: string | null;
      phone: string | null;
      status: string;
    }>(
      `SELECT id, code, name, address, phone, status
       FROM platform.stores WHERE id = $1`,
      [storeId]
    );

    const store = result.rows[0];
    if (!store) {
      throw ApiError.notFound('Store');
    }

    res.json({
      success: true,
      data: store,
    });
  })
);

// =============================================================================
// PRODUCTS (Store Catalog)
// =============================================================================

interface StoreProduct {
  id: string;
  barcode: string | null;
  name: string;
  description: string | null;
  type: string;
  unit: string;
  purchase_price: number;
  sell_price: number;
  mrp: number | null;
  current_stock: number;
  created_at: Date;
}

/**
 * GET /retailer-admin/products
 * List products for the store
 */
router.get(
  '/products',
  asyncHandler(async (req, res) => {
    const { storeId } = getRetailerContext(req);
    const { page = '1', limit = '50', search } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10)));
    const offset = (pageNum - 1) * limitNum;

    let whereClause = 'sp.store_id = $1';
    const params: (string | number)[] = [storeId];

    if (search) {
      params.push(`%${search}%`);
      whereClause += ` AND (p.name ILIKE $${params.length} OR p.barcode ILIKE $${params.length})`;
    }

    // Get products with current stock
    const result = await query<StoreProduct>(
      `SELECT p.id, p.barcode, p.name, p.description, p.type, p.unit,
              sp.purchase_price, sp.sell_price, sp.mrp,
              COALESCE(i.quantity, 0) as current_stock,
              sp.created_at
       FROM catalog.store_products sp
       JOIN catalog.products p ON sp.product_id = p.id
       LEFT JOIN inventory.inventory i ON i.product_id = p.id AND i.store_id = sp.store_id
       WHERE ${whereClause}
       ORDER BY sp.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limitNum, offset]
    );

    // Get total count
    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count
       FROM catalog.store_products sp
       JOIN catalog.products p ON sp.product_id = p.id
       WHERE ${whereClause}`,
      params
    );

    const total = parseInt(countResult.rows[0]?.count || '0', 10);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  })
);

/**
 * POST /retailer-admin/products
 * Create a new product for the store
 */
router.post(
  '/products',
  asyncHandler(async (req, res) => {
    const { userId, storeId } = getRetailerContext(req);
    const {
      barcode,
      name,
      description,
      type = 'branded',
      unit = 'pcs',
      purchasePrice,
      sellPrice,
      mrp,
      openingStock = 0,
    } = req.body as {
      barcode?: string;
      name: string;
      description?: string;
      type?: string;
      unit?: string;
      purchasePrice: number;
      sellPrice: number;
      mrp?: number;
      openingStock?: number;
    };

    // Validate required fields
    if (!name) {
      throw ApiError.badRequest('Product name is required', 'name');
    }
    if (sellPrice === undefined || sellPrice < 0) {
      throw ApiError.badRequest('Valid sell price is required', 'sellPrice');
    }
    if (purchasePrice === undefined || purchasePrice < 0) {
      throw ApiError.badRequest('Valid purchase price is required', 'purchasePrice');
    }

    // Check for duplicate barcode within store
    if (barcode) {
      const existing = await query(
        `SELECT sp.id FROM catalog.store_products sp
         JOIN catalog.products p ON sp.product_id = p.id
         WHERE sp.store_id = $1 AND p.barcode = $2`,
        [storeId, barcode]
      );
      if (existing.rows.length > 0) {
        throw ApiError.conflict('DUPLICATE_BARCODE', `Product with barcode ${barcode} already exists`);
      }
    }

    // Create product and store_product in transaction
    const productResult = await query<{ id: string }>(
      `WITH new_product AS (
         INSERT INTO catalog.products (barcode, name, description, type, unit)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id
       )
       INSERT INTO catalog.store_products (store_id, product_id, purchase_price, sell_price, mrp)
       SELECT $6, id, $7, $8, $9 FROM new_product
       RETURNING product_id as id`,
      [barcode || null, name, description || null, type, unit, storeId, purchasePrice, sellPrice, mrp || null]
    );

    const productId = productResult.rows[0]!.id;

    // Add opening stock if provided
    if (openingStock > 0) {
      await query(
        `INSERT INTO inventory.inventory (store_id, product_id, quantity)
         VALUES ($1, $2, $3)
         ON CONFLICT (store_id, product_id) DO UPDATE SET quantity = $3`,
        [storeId, productId, openingStock]
      );

      // Create ledger entry for opening stock
      await query(
        `INSERT INTO inventory.inventory_ledger
         (store_id, product_id, movement_type, quantity, source, source_id, notes)
         VALUES ($1, $2, 'INWARD', $3, 'RETAILER_PORTAL', NULL, 'Opening stock from retailer portal')`,
        [storeId, productId, openingStock]
      );
    }

    res.status(201).json({
      success: true,
      data: {
        id: productId,
        barcode,
        name,
        sellPrice,
        purchasePrice,
        openingStock,
      },
    });
  })
);

/**
 * PATCH /retailer-admin/products/:id
 * Update a product
 */
router.patch(
  '/products/:id',
  asyncHandler(async (req, res) => {
    const { storeId } = getRetailerContext(req);
    const { id } = req.params;
    const { purchasePrice, sellPrice, mrp } = req.body as {
      purchasePrice?: number;
      sellPrice?: number;
      mrp?: number;
    };

    // Verify product belongs to store
    const existing = await query(
      `SELECT sp.id FROM catalog.store_products sp
       WHERE sp.store_id = $1 AND sp.product_id = $2`,
      [storeId, id]
    );

    if (existing.rows.length === 0) {
      throw ApiError.notFound('Product');
    }

    // Build update query
    const updates: string[] = [];
    const params: (number | string)[] = [];
    let paramIndex = 1;

    if (purchasePrice !== undefined) {
      updates.push(`purchase_price = $${paramIndex++}`);
      params.push(purchasePrice);
    }
    if (sellPrice !== undefined) {
      updates.push(`sell_price = $${paramIndex++}`);
      params.push(sellPrice);
    }
    if (mrp !== undefined) {
      updates.push(`mrp = $${paramIndex++}`);
      params.push(mrp);
    }

    if (updates.length === 0) {
      res.json({ success: true, data: { id, message: 'No changes made' } });
      return;
    }

    params.push(storeId, id);
    await query(
      `UPDATE catalog.store_products
       SET ${updates.join(', ')}
       WHERE store_id = $${paramIndex++} AND product_id = $${paramIndex}`,
      params
    );

    res.json({
      success: true,
      data: { id, message: 'Product updated' },
    });
  })
);

// =============================================================================
// INVENTORY
// =============================================================================

/**
 * GET /retailer-admin/inventory
 * Get inventory ledger for the store
 */
router.get(
  '/inventory',
  asyncHandler(async (req, res) => {
    const { storeId } = getRetailerContext(req);
    const { page = '1', limit = '50', productId } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10)));
    const offset = (pageNum - 1) * limitNum;

    let whereClause = 'il.store_id = $1';
    const params: (string | number)[] = [storeId];

    if (productId) {
      params.push(productId as string);
      whereClause += ` AND il.product_id = $${params.length}`;
    }

    const result = await query<{
      id: string;
      product_id: string;
      product_name: string;
      movement_type: string;
      quantity: number;
      source: string | null;
      notes: string | null;
      created_at: Date;
    }>(
      `SELECT il.id, il.product_id, p.name as product_name,
              il.movement_type, il.quantity, il.source, il.notes, il.created_at
       FROM inventory.inventory_ledger il
       JOIN catalog.products p ON il.product_id = p.id
       WHERE ${whereClause}
       ORDER BY il.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limitNum, offset]
    );

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
      },
    });
  })
);

// =============================================================================
// SUPPLIERS
// =============================================================================

/**
 * GET /retailer-admin/suppliers
 * List suppliers linked to the store
 */
router.get(
  '/suppliers',
  asyncHandler(async (req, res) => {
    const { storeId } = getRetailerContext(req);

    const result = await query<{
      id: string;
      name: string;
      phone: string | null;
      gstin: string | null;
      address: string | null;
    }>(
      `SELECT s.id, s.name, s.phone, s.gstin, s.address
       FROM supplier.suppliers s
       JOIN supplier.supplier_store_links ssl ON s.id = ssl.supplier_id
       WHERE ssl.store_id = $1 AND ssl.is_active = true
       ORDER BY s.name`,
      [storeId]
    );

    res.json({
      success: true,
      data: result.rows,
    });
  })
);

/**
 * POST /retailer-admin/suppliers
 * Create or link a supplier to the store
 */
router.post(
  '/suppliers',
  asyncHandler(async (req, res) => {
    const { storeId } = getRetailerContext(req);
    const { name, phone, gstin, address } = req.body as {
      name: string;
      phone?: string;
      gstin?: string;
      address?: string;
    };

    if (!name) {
      throw ApiError.badRequest('Supplier name is required', 'name');
    }

    // Check if supplier already exists by phone or GSTIN
    let existingSupplier: { id: string } | null = null;

    if (phone) {
      const byPhone = await query<{ id: string }>(
        `SELECT id FROM supplier.suppliers WHERE phone = $1`,
        [phone]
      );
      existingSupplier = byPhone.rows[0] || null;
    }

    if (!existingSupplier && gstin) {
      const byGstin = await query<{ id: string }>(
        `SELECT id FROM supplier.suppliers WHERE gstin = $1`,
        [gstin]
      );
      existingSupplier = byGstin.rows[0] || null;
    }

    let supplierId: string;

    if (existingSupplier) {
      supplierId = existingSupplier.id;
    } else {
      // Create new supplier
      const result = await query<{ id: string }>(
        `INSERT INTO supplier.suppliers (name, phone, gstin, address)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [name, phone || null, gstin || null, address || null]
      );
      supplierId = result.rows[0]!.id;
    }

    // Link supplier to store
    await query(
      `INSERT INTO supplier.supplier_store_links (supplier_id, store_id, is_active)
       VALUES ($1, $2, true)
       ON CONFLICT (supplier_id, store_id) DO UPDATE SET is_active = true`,
      [supplierId, storeId]
    );

    res.status(201).json({
      success: true,
      data: {
        id: supplierId,
        name,
        phone,
        gstin,
        linked: true,
      },
    });
  })
);

// =============================================================================
// COMPLIANCE DOCUMENTS
// =============================================================================

/**
 * POST /retailer-admin/compliance/upload
 * Request a signed upload URL for a compliance document
 */
router.post(
  '/compliance/upload',
  asyncHandler(async (req, res) => {
    const { userId, storeId } = getRetailerContext(req);
    const { documentType, fileName, mimeType, fileSize } = req.body as {
      documentType: string;
      fileName: string;
      mimeType: string;
      fileSize: number;
    };

    // Validate document type
    const validTypes = ['gstin', 'fssai', 'shop_license', 'pan', 'trade_license', 'other'];
    if (!validTypes.includes(documentType)) {
      throw ApiError.badRequest(`Invalid document type. Must be one of: ${validTypes.join(', ')}`, 'documentType');
    }

    // Validate MIME type
    if (!isValidComplianceMimeType(mimeType)) {
      throw ApiError.badRequest('Invalid file type. Must be PDF, JPG, or PNG.', 'mimeType');
    }

    // Validate file size
    const maxSize = getMaxFileSize('compliance');
    if (fileSize > maxSize) {
      throw ApiError.badRequest(`File too large. Maximum size is ${maxSize / 1024 / 1024}MB.`, 'fileSize');
    }

    // Generate document ID
    const docId = crypto.randomUUID();

    // Generate signed upload URL
    const { uploadUrl, bucket, objectKey, expiresAt } = await generateSignedUploadUrl({
      storeId,
      documentId: docId,
      fileName,
      mimeType,
      bucketType: 'compliance',
    });

    // Create pending document record
    await createComplianceDocument({
      storeId,
      documentType,
      fileName,
      gcsBucket: bucket,
      gcsObjectKey: objectKey,
      mimeType,
      fileSize,
      fileSha256: '', // Will be updated on confirm
      uploadedByUserId: userId,
    });

    res.json({
      success: true,
      data: {
        documentId: docId,
        uploadUrl,
        expiresAt,
        bucket,
        objectKey,
      },
    });
  })
);

/**
 * POST /retailer-admin/compliance/confirm
 * Confirm a compliance document upload
 */
router.post(
  '/compliance/confirm',
  asyncHandler(async (req, res) => {
    const { storeId } = getRetailerContext(req);
    const { documentId } = req.body as { documentId: string };

    if (!documentId) {
      throw ApiError.badRequest('Document ID is required', 'documentId');
    }

    const doc = await getComplianceDocumentById(documentId);
    if (!doc || doc.store_id !== storeId) {
      throw ApiError.notFound('Document');
    }

    if (doc.status !== 'pending') {
      throw ApiError.badRequest(`Document already in status: ${doc.status}`);
    }

    // Verify file exists in GCS
    const { exists } = await checkFileExists(doc.gcs_bucket, doc.gcs_object_key);
    if (!exists) {
      throw ApiError.badRequest('File not found in storage. Please upload again.');
    }

    // Mark as uploaded
    const updated = await confirmComplianceDocumentUpload(documentId);

    res.json({
      success: true,
      data: {
        id: updated?.id,
        status: updated?.status,
        uploadedAt: updated?.uploaded_at,
      },
    });
  })
);

/**
 * GET /retailer-admin/compliance
 * List compliance documents for the store
 */
router.get(
  '/compliance',
  asyncHandler(async (req, res) => {
    const { storeId } = getRetailerContext(req);

    const docs = await getComplianceDocuments(storeId);

    res.json({
      success: true,
      data: docs.map((doc) => ({
        id: doc.id,
        documentType: doc.document_type,
        fileName: doc.file_name,
        mimeType: doc.mime_type,
        fileSize: doc.file_size,
        status: doc.status,
        rejectionReason: doc.rejection_reason,
        uploadedAt: doc.uploaded_at,
        verifiedAt: doc.verified_at,
        createdAt: doc.created_at,
      })),
    });
  })
);

/**
 * GET /retailer-admin/compliance/:id/download
 * Get signed download URL for a compliance document
 */
router.get(
  '/compliance/:id/download',
  asyncHandler(async (req, res) => {
    const { storeId } = getRetailerContext(req);
    const { id } = req.params;

    const doc = await getComplianceDocumentById(id);
    if (!doc || doc.store_id !== storeId) {
      throw ApiError.notFound('Document');
    }

    if (doc.status === 'pending') {
      throw ApiError.badRequest('Document not yet uploaded');
    }

    const { downloadUrl, expiresAt } = await generateSignedDownloadUrl({
      bucket: doc.gcs_bucket,
      objectKey: doc.gcs_object_key,
    });

    res.json({
      success: true,
      data: {
        downloadUrl,
        expiresAt,
        fileName: doc.file_name,
        mimeType: doc.mime_type,
      },
    });
  })
);

// =============================================================================
// CSV IMPORTS
// =============================================================================

/**
 * POST /retailer-admin/imports/upload
 * Upload a CSV file and create an import job
 */
router.post(
  '/imports/upload',
  asyncHandler(async (req, res) => {
    const { userId, storeId } = getRetailerContext(req);
    const { fileName, mimeType, fileSize, mode = 'merge', force = false } = req.body as {
      fileName: string;
      mimeType: string;
      fileSize: number;
      mode?: 'replace' | 'merge' | 'skipExisting';
      force?: boolean;
    };

    // Validate MIME type
    if (!isValidImportMimeType(mimeType)) {
      throw ApiError.badRequest('Invalid file type. Must be CSV.', 'mimeType');
    }

    // Validate file size
    const maxSize = getMaxFileSize('imports');
    if (fileSize > maxSize) {
      throw ApiError.badRequest(`File too large. Maximum size is ${maxSize / 1024 / 1024}MB.`, 'fileSize');
    }

    // Generate import ID
    const importId = crypto.randomUUID();

    // Generate signed upload URL
    const { uploadUrl, bucket, objectKey, expiresAt } = await generateSignedUploadUrl({
      storeId,
      documentId: importId,
      fileName,
      mimeType,
      bucketType: 'imports',
    });

    // Create import job record (will be updated with hash after upload)
    await createCsvImport({
      storeId,
      fileName,
      fileSha256: '', // Updated after upload
      gcsBucket: bucket,
      gcsObjectKey: objectKey,
      importMode: mode,
      uploadedByUserId: userId,
    });

    res.json({
      success: true,
      data: {
        importId,
        uploadUrl,
        expiresAt,
        mode,
      },
    });
  })
);

/**
 * POST /retailer-admin/imports/:id/validate
 * Validate an uploaded CSV file
 */
router.post(
  '/imports/:id/validate',
  asyncHandler(async (req, res) => {
    const { storeId } = getRetailerContext(req);
    const { id } = req.params;

    const importJob = await getCsvImportById(id);
    if (!importJob || importJob.store_id !== storeId) {
      throw ApiError.notFound('Import job');
    }

    if (importJob.status !== 'pending') {
      throw ApiError.badRequest(`Cannot validate import with status: ${importJob.status}`);
    }

    // Start validation
    await startCsvValidation(id);

    try {
      // Get file content from GCS
      const content = await getFileContent(importJob.gcs_bucket!, importJob.gcs_object_key!);
      const fileSha256 = calculateSha256(content);

      // Check for duplicate (already imported same file)
      const duplicate = await checkDuplicateCsvImport(storeId, fileSha256);
      if (duplicate && importJob.import_mode !== 'replace') {
        const warning: ValidationError = {
          row: 0,
          field: 'file',
          error: `File was previously imported on ${duplicate.committed_at}. Use mode=replace or force=true to re-import.`,
        };
        await completeCsvValidation({
          id,
          totalRows: 0,
          validRows: 0,
          errorRows: 1,
          validationErrors: [warning],
        });

        res.json({
          success: true,
          data: {
            id,
            status: 'validated',
            warning: warning.error,
          },
        });
        return;
      }

      // Parse CSV content
      const csvText = content.toString('utf-8');
      const lines = csvText.split('\n').filter((line) => line.trim());

      if (lines.length < 2) {
        throw ApiError.badRequest('CSV file is empty or has no data rows');
      }

      // Get headers
      const headers = lines[0]!.split(',').map((h) => h.trim().toLowerCase());
      const requiredHeaders = ['name', 'sell_price'];

      for (const required of requiredHeaders) {
        if (!headers.includes(required)) {
          throw ApiError.badRequest(`Missing required column: ${required}`);
        }
      }

      // Validate rows
      const errors: ValidationError[] = [];
      let validRows = 0;

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i]!.split(',').map((v) => v.trim());
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => {
          row[h] = values[idx] || '';
        });

        // Validate required fields
        if (!row['name']) {
          errors.push({ row: i + 1, field: 'name', error: 'Name is required' });
          continue;
        }

        const sellPrice = parseFloat(row['sell_price'] || '');
        if (isNaN(sellPrice) || sellPrice < 0) {
          errors.push({ row: i + 1, field: 'sell_price', error: 'Invalid sell price' });
          continue;
        }

        validRows++;
      }

      // Complete validation
      await completeCsvValidation({
        id,
        totalRows: lines.length - 1,
        validRows,
        errorRows: errors.length,
        validationErrors: errors.length > 0 ? errors.slice(0, 100) : null, // Limit errors
      });

      res.json({
        success: true,
        data: {
          id,
          status: 'validated',
          totalRows: lines.length - 1,
          validRows,
          errorRows: errors.length,
          errors: errors.slice(0, 20), // Return first 20 errors
        },
      });
    } catch (error) {
      await failCsvImport(id, [{ row: 0, field: 'file', error: (error as Error).message }]);
      throw error;
    }
  })
);

/**
 * GET /retailer-admin/imports/:id
 * Get import job status
 */
router.get(
  '/imports/:id',
  asyncHandler(async (req, res) => {
    const { storeId } = getRetailerContext(req);
    const { id } = req.params;

    const importJob = await getCsvImportById(id);
    if (!importJob || importJob.store_id !== storeId) {
      throw ApiError.notFound('Import job');
    }

    res.json({
      success: true,
      data: {
        id: importJob.id,
        fileName: importJob.file_name,
        status: importJob.status,
        importMode: importJob.import_mode,
        totalRows: importJob.total_rows,
        validRows: importJob.valid_rows,
        errorRows: importJob.error_rows,
        productsCreated: importJob.products_created,
        productsUpdated: importJob.products_updated,
        suppliersCreated: importJob.suppliers_created,
        validationErrors: importJob.validation_errors,
        validatedAt: importJob.validated_at,
        committedAt: importJob.committed_at,
        createdAt: importJob.created_at,
      },
    });
  })
);

/**
 * POST /retailer-admin/imports/:id/commit
 * Commit a validated import
 */
router.post(
  '/imports/:id/commit',
  asyncHandler(async (req, res) => {
    const { storeId } = getRetailerContext(req);
    const { id } = req.params;

    const importJob = await getCsvImportById(id);
    if (!importJob || importJob.store_id !== storeId) {
      throw ApiError.notFound('Import job');
    }

    if (importJob.status !== 'validated') {
      throw ApiError.badRequest(`Cannot commit import with status: ${importJob.status}`);
    }

    if (importJob.error_rows > 0 && importJob.valid_rows === 0) {
      throw ApiError.badRequest('Cannot commit import with all rows invalid');
    }

    // Start commit
    await startCsvCommit(id);

    try {
      // Get file content from GCS
      const content = await getFileContent(importJob.gcs_bucket!, importJob.gcs_object_key!);
      const csvText = content.toString('utf-8');
      const lines = csvText.split('\n').filter((line) => line.trim());
      const headers = lines[0]!.split(',').map((h) => h.trim().toLowerCase());

      let productsCreated = 0;
      let productsUpdated = 0;
      let suppliersCreated = 0;

      // Process each valid row
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i]!.split(',').map((v) => v.trim());
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => {
          row[h] = values[idx] || '';
        });

        // Skip invalid rows
        if (!row['name'] || !row['sell_price']) continue;

        const barcode = row['barcode'] || null;
        const name = row['name']!;
        const description = row['description'] || null;
        const type = row['type'] || 'branded';
        const unit = row['unit'] || 'pcs';
        const purchasePrice = parseFloat(row['purchase_price'] || '0');
        const sellPrice = parseFloat(row['sell_price']!);
        const mrp = row['mrp'] ? parseFloat(row['mrp']) : null;
        const stock = parseInt(row['stock'] || '0', 10);

        // Check if product exists by barcode
        let productId: string | null = null;
        let isUpdate = false;

        if (barcode) {
          const existing = await query<{ product_id: string }>(
            `SELECT sp.product_id FROM catalog.store_products sp
             JOIN catalog.products p ON sp.product_id = p.id
             WHERE sp.store_id = $1 AND p.barcode = $2`,
            [storeId, barcode]
          );
          if (existing.rows[0]) {
            productId = existing.rows[0].product_id;
            isUpdate = true;
          }
        }

        if (isUpdate && productId) {
          // Update existing product
          if (importJob.import_mode !== 'skipExisting') {
            await query(
              `UPDATE catalog.store_products
               SET purchase_price = $3, sell_price = $4, mrp = $5
               WHERE store_id = $1 AND product_id = $2`,
              [storeId, productId, purchasePrice, sellPrice, mrp]
            );
            productsUpdated++;
          }
        } else {
          // Create new product
          const result = await query<{ id: string }>(
            `WITH new_product AS (
               INSERT INTO catalog.products (barcode, name, description, type, unit)
               VALUES ($1, $2, $3, $4, $5)
               RETURNING id
             )
             INSERT INTO catalog.store_products (store_id, product_id, purchase_price, sell_price, mrp)
             SELECT $6, id, $7, $8, $9 FROM new_product
             RETURNING product_id as id`,
            [barcode, name, description, type, unit, storeId, purchasePrice, sellPrice, mrp]
          );
          productId = result.rows[0]!.id;
          productsCreated++;
        }

        // Add stock if provided (idempotent with source tracking)
        // CRITICAL: Ledger entry must succeed before updating inventory to ensure retry-safety
        if (stock > 0 && productId) {
          // Try to insert ledger entry first (idempotent via unique index)
          const ledgerResult = await query(
            `INSERT INTO inventory.inventory_ledger
             (store_id, product_id, movement_type, quantity, source, source_id, notes)
             VALUES ($1, $2, 'INWARD', $3, 'CSV_IMPORT', $4, $5)
             ON CONFLICT DO NOTHING
             RETURNING id`,
            [storeId, productId, stock, id, `Import: ${importJob.file_name}`]
          );

          // Only update inventory if ledger entry was actually inserted (not a retry)
          if (ledgerResult.rowCount && ledgerResult.rowCount > 0) {
            await query(
              `INSERT INTO inventory.inventory (store_id, product_id, quantity)
               VALUES ($1, $2, $3)
               ON CONFLICT (store_id, product_id) DO UPDATE SET quantity = inventory.inventory.quantity + $3`,
              [storeId, productId, stock]
            );
          }
        }

        // Handle supplier if provided
        const supplierName = row['supplier_name'];
        const supplierPhone = row['supplier_phone'];
        const supplierGstin = row['supplier_gstin'];

        if (supplierName) {
          let supplierId: string | null = null;

          // Try to find existing supplier
          if (supplierPhone) {
            const existing = await query<{ id: string }>(
              `SELECT id FROM supplier.suppliers WHERE phone = $1`,
              [supplierPhone]
            );
            supplierId = existing.rows[0]?.id || null;
          }

          if (!supplierId && supplierGstin) {
            const existing = await query<{ id: string }>(
              `SELECT id FROM supplier.suppliers WHERE gstin = $1`,
              [supplierGstin]
            );
            supplierId = existing.rows[0]?.id || null;
          }

          if (!supplierId) {
            // Create new supplier
            const result = await query<{ id: string }>(
              `INSERT INTO supplier.suppliers (name, phone, gstin)
               VALUES ($1, $2, $3)
               RETURNING id`,
              [supplierName, supplierPhone || null, supplierGstin || null]
            );
            supplierId = result.rows[0]!.id;
            suppliersCreated++;
          }

          // Link supplier to store
          await query(
            `INSERT INTO supplier.supplier_store_links (supplier_id, store_id, is_active)
             VALUES ($1, $2, true)
             ON CONFLICT (supplier_id, store_id) DO UPDATE SET is_active = true`,
            [supplierId, storeId]
          );
        }
      }

      // Complete commit
      await completeCsvCommit({
        id,
        productsCreated,
        productsUpdated,
        suppliersCreated,
      });

      res.json({
        success: true,
        data: {
          id,
          status: 'committed',
          productsCreated,
          productsUpdated,
          suppliersCreated,
        },
      });
    } catch (error) {
      await failCsvImport(id, [{ row: 0, field: 'commit', error: (error as Error).message }]);
      throw error;
    }
  })
);

/**
 * GET /retailer-admin/imports
 * List import jobs for the store
 */
router.get(
  '/imports',
  asyncHandler(async (req, res) => {
    const { storeId } = getRetailerContext(req);
    const { limit = '20' } = req.query;

    const imports = await getCsvImports(storeId, parseInt(limit as string, 10));

    res.json({
      success: true,
      data: imports.map((imp) => ({
        id: imp.id,
        fileName: imp.file_name,
        status: imp.status,
        importMode: imp.import_mode,
        totalRows: imp.total_rows,
        validRows: imp.valid_rows,
        errorRows: imp.error_rows,
        productsCreated: imp.products_created,
        productsUpdated: imp.products_updated,
        committedAt: imp.committed_at,
        createdAt: imp.created_at,
      })),
    });
  })
);

export default router;
