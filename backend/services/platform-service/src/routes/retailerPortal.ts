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
// 10K STORE SCALE: AUDIT LEDGER (LEDGER-FIRST MUTATIONS)
// =============================================================================

/**
 * Write to audit log BEFORE performing mutation.
 * This ensures all CRUD operations have an audit trail.
 *
 * 10K Store Scale Rule: Ledger-first means:
 * 1. Write intent to audit_log
 * 2. Perform mutation
 * 3. If mutation fails, audit_log shows failed attempt
 *
 * This provides compliance and debugging trail.
 */
async function writeAuditLog(params: {
  actorUserId: string;
  storeId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  requestBody?: Record<string, unknown>;
  req?: Request;
}): Promise<void> {
  const { actorUserId, storeId, action, resourceType, resourceId, requestBody, req } = params;

  // Sanitize request body - remove sensitive fields
  let sanitizedBody = requestBody;
  if (sanitizedBody) {
    const { password, token, secret, apiKey, ...safe } = sanitizedBody as Record<string, unknown>;
    sanitizedBody = safe;
  }

  await query(
    `INSERT INTO admin.audit_log (
      actor_user_id, store_id, action, resource_type, resource_id,
      request_body, actor_ip, actor_user_agent
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      actorUserId,
      storeId,
      action,
      resourceType,
      resourceId || null,
      sanitizedBody ? JSON.stringify(sanitizedBody) : null,
      req?.ip || req?.headers['x-forwarded-for'] || null,
      req?.headers['user-agent'] || null,
    ]
  ).catch((err) => {
    // Don't fail the main operation if audit logging fails
    // But do log it for monitoring
    console.error('[audit_log] Failed to write audit log:', err);
  });
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
      `SELECT id, code, name, CONCAT_WS(', ', address_line1, address_line2, city, state, pincode) AS address, phone, status
       FROM platform.stores WHERE id = $1`,
      [storeId]
    );

    const store = result[0];
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
// DAILY SUMMARY (WEB-002)
// =============================================================================

/**
 * GET /retailer-admin/daily-summary
 * Get today's sales summary for the store (same data as POS widget)
 * Query params: date (optional, YYYY-MM-DD format, defaults to today)
 */
router.get(
  '/daily-summary',
  asyncHandler(async (req, res) => {
    const { storeId } = getRetailerContext(req);
    const { date } = req.query;

    // Default to today in IST timezone
    const targetDate = date
      ? new Date(date as string)
      : new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const dateStr = targetDate.toISOString().split('T')[0];

    // Get sales summary for the date
    // FIX: Use retailers.sales instead of pos.bills, items_count instead of total_items
    const salesResult = await query<{
      total_sales: string;
      total_bills: string;
      items_sold: string;
      cash_total: string;
      upi_total: string;
      card_total: string;
      credit_total: string;
    }>(
      `SELECT
        COALESCE(SUM(total_amount), 0) as total_sales,
        COUNT(*) as total_bills,
        COALESCE(SUM(items_count), 0) as items_sold,
        COALESCE(SUM(CASE WHEN payment_mode = 'CASH' THEN total_amount ELSE 0 END), 0) as cash_total,
        COALESCE(SUM(CASE WHEN payment_mode = 'UPI' THEN total_amount ELSE 0 END), 0) as upi_total,
        COALESCE(SUM(CASE WHEN payment_mode = 'CARD' THEN total_amount ELSE 0 END), 0) as card_total,
        COALESCE(SUM(CASE WHEN payment_mode = 'DUE' THEN total_amount ELSE 0 END), 0) as credit_total
       FROM retailers.sales
       WHERE store_id = $1 AND DATE(bill_date AT TIME ZONE 'Asia/Kolkata') = $2`,
      [storeId, dateStr]
    );

    const summary = salesResult[0];
    const totalSales = parseInt(summary?.total_sales || '0', 10);
    const totalBills = parseInt(summary?.total_bills || '0', 10);
    const itemsSold = parseInt(summary?.items_sold || '0', 10);

    // Get top selling items
    // FIX: Use retailers.sale_items and retailers.sales instead of pos.bill_items/pos.bills
    const topItemsResult = await query<{
      product_id: string;
      product_name: string;
      quantity_sold: string;
      total_amount: string;
    }>(
      `SELECT
        si.product_id,
        COALESCE(p.name, si.product_name, 'Unknown Product') as product_name,
        SUM(si.quantity) as quantity_sold,
        SUM(si.total_amount) as total_amount
       FROM retailers.sale_items si
       JOIN retailers.sales s ON si.sale_id = s.id
       LEFT JOIN catalog.products p ON si.product_id = p.id
       WHERE s.store_id = $1 AND DATE(s.bill_date AT TIME ZONE 'Asia/Kolkata') = $2
       GROUP BY si.product_id, p.name, si.product_name
       ORDER BY SUM(si.total_amount) DESC
       LIMIT 5`,
      [storeId, dateStr]
    );

    res.json({
      success: true,
      data: {
        date: dateStr,
        totalSales,
        totalBills,
        averageBillValue: totalBills > 0 ? Math.round(totalSales / totalBills) : 0,
        paymentBreakdown: {
          cash: parseInt(summary?.cash_total || '0', 10),
          upi: parseInt(summary?.upi_total || '0', 10),
          card: parseInt(summary?.card_total || '0', 10),
          credit: parseInt(summary?.credit_total || '0', 10),
        },
        itemsSold,
        topSellingItems: topItemsResult.map((item) => ({
          productId: item.product_id,
          productName: item.product_name,
          quantitySold: parseInt(item.quantity_sold, 10),
          totalAmount: parseInt(item.total_amount, 10),
        })),
      },
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
      whereClause += ` AND (p.name ILIKE $${params.length} OR p.primary_barcode ILIKE $${params.length})`;
    }

    // Get products with current stock, category, brand, supplier
    // FIX: Use stock_balances instead of inventory.inventory, return camelCase for frontend
    const result = await query<StoreProduct>(
      `SELECT p.id, p.primary_barcode AS barcode, p.name, p.description, p.unit,
              p.category, p.brand,
              sp.purchase_price AS "purchasePrice", sp.sell_price AS "sellPrice", sp.mrp,
              COALESCE(sb.current_qty, sp.current_stock, 0) as stock,
              CASE WHEN p.primary_barcode IS NOT NULL THEN 'branded' ELSE 'loose' END as type,
              sp.created_at,
              NULL as "supplierId", NULL as "supplierName"
       FROM catalog.store_products sp
       JOIN catalog.products p ON sp.product_id = p.id
       LEFT JOIN inventory.stock_balances sb ON sb.product_id = sp.product_id AND sb.store_id = sp.store_id
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

    const total = parseInt(countResult[0]?.count || '0', 10);

    res.json({
      success: true,
      data: result,
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
 * Supports: category, brand, supplierId for linking to suppliers
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
      category,
      brand,
      unit = 'pcs',
      purchasePrice,
      sellPrice,
      mrp,
      openingStock = 0,
      supplierId,
      supplierName, // 10K Store Scale: raw supplier name for unverified path
    } = req.body as {
      barcode?: string;
      name: string;
      description?: string;
      type?: string;
      category?: string;
      brand?: string;
      unit?: string;
      purchasePrice: number;
      sellPrice: number;
      mrp?: number;
      openingStock?: number;
      supplierId?: string;
      supplierName?: string; // Raw name when no supplierId
    };

    // Validate required fields
    if (!name) {
      throw ApiError.badRequest('Product name is required', 'name');
    }
    // 10K Store Scale: Category is required for proper taxonomy
    if (!category) {
      throw ApiError.badRequest('Category is required', 'category');
    }
    if (sellPrice === undefined || sellPrice < 0) {
      throw ApiError.badRequest('Valid sell price is required', 'sellPrice');
    }
    if (purchasePrice === undefined || purchasePrice < 0) {
      throw ApiError.badRequest('Valid purchase price is required', 'purchasePrice');
    }
    // 10K Store Scale: Prices must be positive integers (paise)
    // Warn if decimal values detected (should be in minor units)
    if (!Number.isInteger(sellPrice) || !Number.isInteger(purchasePrice)) {
      throw ApiError.badRequest(
        'Prices must be integers in paise (minor units). E.g., ₹10.50 = 1050 paise.',
        'sellPrice'
      );
    }
    if (mrp !== undefined && !Number.isInteger(mrp)) {
      throw ApiError.badRequest(
        'MRP must be an integer in paise (minor units). E.g., ₹10.50 = 1050 paise.',
        'mrp'
      );
    }

    // Check for duplicate barcode within store
    if (barcode) {
      const existing = await query(
        `SELECT sp.id FROM catalog.store_products sp
         JOIN catalog.products p ON sp.product_id = p.id
         WHERE sp.store_id = $1 AND p.primary_barcode = $2`,
        [storeId, barcode]
      );
      if (existing.length > 0) {
        throw ApiError.conflict('DUPLICATE_BARCODE', `Product with barcode ${barcode} already exists`);
      }
    }

    // 10K STORE SCALE: LEDGER-FIRST - write audit log BEFORE mutation
    await writeAuditLog({
      actorUserId: userId,
      storeId,
      action: 'product.create',
      resourceType: 'store_product',
      requestBody: { barcode, name, category, brand, sellPrice, purchasePrice, mrp, supplierId, supplierName },
      req,
    });

    // Create product and store_product in transaction
    const productResult = await query<{ id: string; store_product_id: string }>(
      `WITH new_product AS (
         INSERT INTO catalog.products (primary_barcode, name, description, unit, category, brand)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id
       )
       INSERT INTO catalog.store_products (store_id, product_id, purchase_price, sell_price, mrp)
       SELECT $7, id, $8, $9, $10 FROM new_product
       RETURNING product_id as id, id as store_product_id`,
      [barcode || null, name, description || null, unit, category || null, brand || null, storeId, purchasePrice, sellPrice, mrp || null]
    );

    const productId = productResult[0]!.id;
    const storeProductId = productResult[0]!.store_product_id;

    // Insert into store_product_barcodes for POS barcode lookup
    if (barcode) {
      await query(
        `INSERT INTO catalog.store_product_barcodes (store_id, store_product_id, barcode, source)
         VALUES ($1, $2, $3, 'manual')
         ON CONFLICT (store_id, barcode) DO NOTHING`,
        [storeId, storeProductId, barcode]
      );
    }

    // Add opening stock if provided
    // FIX: Use stock_balances table and correct ledger columns
    if (openingStock > 0) {
      // Create ledger entry first (idempotent)
      await query(
        `INSERT INTO inventory.inventory_ledger
         (store_id, product_id, delta_qty, transaction_type, stock_before, stock_after, source, notes)
         VALUES ($1, $2, $3, 'adjustment', 0, $3, 'RETAILER_PORTAL', 'Opening stock from retailer portal')`,
        [storeId, productId, openingStock]
      );

      // Update stock_balances
      await query(
        `INSERT INTO inventory.stock_balances (store_id, product_id, current_qty)
         VALUES ($1, $2, $3)
         ON CONFLICT (store_id, product_id) DO UPDATE SET current_qty = $3, updated_at = NOW()`,
        [storeId, productId, openingStock]
      );

      // Also update store_products.current_stock for denormalized access
      await query(
        `UPDATE catalog.store_products SET current_stock = $3 WHERE store_id = $1 AND product_id = $2`,
        [storeId, productId, openingStock]
      );
    }

    // 10K STORE SCALE: Supplier linking with verified-only enforcement
    let supplierVerified = false;
    let supplierLinked = false;
    let pendingSupplierRequestId: string | null = null;
    let supplierNameRaw: string | null = null;

    if (supplierId) {
      // CRITICAL: If supplierId is provided, it MUST be a verified supplier
      // This enforces the 10K Store Scale rule - no linking to unverified suppliers
      const supplierLink = await query<{
        supplier_id: string;
        business_name: string;
        verification_status: string;
        is_supermandi: boolean;
      }>(
        `SELECT ssl.supplier_id,
                s.business_name,
                COALESCE(s.verification_status, 'unverified') as verification_status,
                (s.gstin IS NOT NULL AND s.gstin NOT LIKE 'XX%' AND s.verification_status = 'verified') as is_supermandi
         FROM supplier.supplier_store_links ssl
         JOIN supplier.suppliers s ON ssl.supplier_id = s.id
         WHERE ssl.supplier_id = $1 AND ssl.store_id = $2 AND ssl.status = 'active'`,
        [supplierId, storeId]
      );

      if (supplierLink.length === 0) {
        throw ApiError.badRequest(
          'Supplier not found or not linked to this store. Add supplier first via Suppliers page.',
          'supplierId'
        );
      }

      // 10K STORE SCALE: BLOCK unverified supplier links (not just warn)
      if (!supplierLink[0]!.is_supermandi) {
        throw ApiError.badRequest(
          `Supplier "${supplierLink[0]!.business_name}" is not verified. Only verified suppliers can be linked to products. Request supplier verification first.`,
          'supplierId'
        );
      }

      supplierLinked = true;
      supplierVerified = true;

      // Update store_product with verified supplier_id
      await query(
        `UPDATE catalog.store_products SET supplier_id = $1 WHERE id = $2`,
        [supplierId, storeProductId]
      );

      // Create supplier-product link
      await query(
        `INSERT INTO catalog.supplier_products (supplier_id, name, category, brand, purchase_price, is_active)
         VALUES ($1, $2, $3, $4, $5, true)
         ON CONFLICT DO NOTHING`,
        [supplierId, name, category || null, brand || null, purchasePrice]
      ).catch(() => {
        // Table might not exist yet, silently ignore
      });

    } else if (supplierName && supplierName.trim()) {
      // 10K STORE SCALE: Unverified supplier name path
      // Search for matching verified supplier by name first
      supplierNameRaw = supplierName.trim();

      const matchingSupplier = await query<{
        id: string;
        business_name: string;
        is_supermandi: boolean;
      }>(
        `SELECT s.id, s.business_name,
                (s.gstin IS NOT NULL AND s.gstin NOT LIKE 'XX%' AND s.verification_status = 'verified') as is_supermandi
         FROM supplier.suppliers s
         JOIN supplier.supplier_store_links ssl ON s.id = ssl.supplier_id
         WHERE ssl.store_id = $1 AND ssl.status = 'active'
           AND (s.business_name ILIKE $2 OR s.trade_name ILIKE $2)
         LIMIT 1`,
        [storeId, `%${supplierNameRaw}%`]
      );

      if (matchingSupplier.length > 0 && matchingSupplier[0]!.is_supermandi) {
        // Found verified supplier - link it
        supplierLinked = true;
        supplierVerified = true;
        await query(
          `UPDATE catalog.store_products SET supplier_id = $1, supplier_name_raw = NULL WHERE id = $2`,
          [matchingSupplier[0]!.id, storeProductId]
        );
      } else {
        // No verified supplier found - create pending enrollment request
        const pendingResult = await query<{ id: string }>(
          `INSERT INTO supplier.supplier_requests (store_id, requested_name, status)
           VALUES ($1, $2, 'pending')
           RETURNING id`,
          [storeId, supplierNameRaw]
        );

        pendingSupplierRequestId = pendingResult[0]?.id || null;

        // Store raw name and pending request ID on product
        await query(
          `UPDATE catalog.store_products
           SET supplier_name_raw = $1, pending_supplier_request_id = $2
           WHERE id = $3`,
          [supplierNameRaw, pendingSupplierRequestId, storeProductId]
        );

        supplierLinked = false;
        supplierVerified = false;
      }
    }

    res.status(201).json({
      success: true,
      data: {
        id: productId,
        barcode,
        name,
        category,
        brand,
        sellPrice,
        purchasePrice,
        openingStock,
        supplierId: supplierLinked ? supplierId : undefined,
        supplierName: supplierNameRaw,
        supplierVerified,
        pendingSupplierRequestId,
        // 10K Store Scale status message
        supplierStatus: supplierVerified
          ? 'verified'
          : pendingSupplierRequestId
            ? 'pending_enrollment'
            : supplierId
              ? 'invalid'
              : 'none',
      },
    });
  })
);

/**
 * PATCH /retailer-admin/products/:id
 * Update a product - supports name, description, category, brand, prices
 */
router.patch(
  '/products/:id',
  asyncHandler(async (req, res) => {
    const { userId, storeId } = getRetailerContext(req);
    const { id } = req.params;
    const { name, description, category, brand, purchasePrice, sellPrice, mrp, supplierId } = req.body as {
      name?: string;
      description?: string;
      category?: string;
      brand?: string;
      purchasePrice?: number;
      sellPrice?: number;
      mrp?: number;
      supplierId?: string;
    };

    // Verify product belongs to store
    const existing = await query(
      `SELECT sp.id FROM catalog.store_products sp
       WHERE sp.store_id = $1 AND sp.product_id = $2`,
      [storeId, id]
    );

    if (existing.length === 0) {
      throw ApiError.notFound('Product');
    }

    // 10K STORE SCALE: LEDGER-FIRST - write audit log BEFORE mutation
    await writeAuditLog({
      actorUserId: userId,
      storeId,
      action: 'product.update',
      resourceType: 'store_product',
      resourceId: id,
      requestBody: { name, description, category, brand, purchasePrice, sellPrice, mrp, supplierId },
      req,
    });

    // Build update query for store_products (prices)
    const priceUpdates: string[] = [];
    const priceParams: (number | string)[] = [];
    let priceIndex = 1;

    if (purchasePrice !== undefined) {
      priceUpdates.push(`purchase_price = $${priceIndex++}`);
      priceParams.push(purchasePrice);
    }
    if (sellPrice !== undefined) {
      priceUpdates.push(`sell_price = $${priceIndex++}`);
      priceParams.push(sellPrice);
    }
    if (mrp !== undefined) {
      priceUpdates.push(`mrp = $${priceIndex++}`);
      priceParams.push(mrp);
    }

    if (priceUpdates.length > 0) {
      priceParams.push(storeId, id);
      await query(
        `UPDATE catalog.store_products
         SET ${priceUpdates.join(', ')}, updated_at = NOW()
         WHERE store_id = $${priceIndex++} AND product_id = $${priceIndex}`,
        priceParams
      );
    }

    // Build update query for products (name, description, category, brand)
    const productUpdates: string[] = [];
    const productParams: (string | null)[] = [];
    let productIndex = 1;

    if (name !== undefined) {
      productUpdates.push(`name = $${productIndex++}`);
      productParams.push(name);
    }
    if (description !== undefined) {
      productUpdates.push(`description = $${productIndex++}`);
      productParams.push(description || null);
    }
    if (category !== undefined) {
      productUpdates.push(`category = $${productIndex++}`);
      productParams.push(category || null);
    }
    if (brand !== undefined) {
      productUpdates.push(`brand = $${productIndex++}`);
      productParams.push(brand || null);
    }

    if (productUpdates.length > 0) {
      productParams.push(id);
      await query(
        `UPDATE catalog.products
         SET ${productUpdates.join(', ')}, updated_at = NOW()
         WHERE id = $${productIndex}`,
        productParams
      );
    }

    res.json({
      success: true,
      data: { id, message: 'Product updated' },
    });
  })
);

/**
 * DELETE /retailer-admin/products/:id
 * Delete a product from the store (soft delete)
 */
router.delete(
  '/products/:id',
  asyncHandler(async (req, res) => {
    const { storeId } = getRetailerContext(req);
    const { id } = req.params;

    // Verify product belongs to store
    const existing = await query(
      `SELECT sp.id FROM catalog.store_products sp
       WHERE sp.store_id = $1 AND sp.product_id = $2`,
      [storeId, id]
    );

    if (existing.length === 0) {
      throw ApiError.notFound('Product');
    }

    // Soft delete - set is_active to false
    await query(
      `UPDATE catalog.store_products SET is_active = false, updated_at = NOW()
       WHERE store_id = $1 AND product_id = $2`,
      [storeId, id]
    );

    res.json({
      success: true,
      data: { id, message: 'Product deleted' },
    });
  })
);

/**
 * POST /retailer-admin/products/bulk
 * Bulk create products for the store (high-volume inline upload)
 */
router.post(
  '/products/bulk',
  asyncHandler(async (req, res) => {
    const { storeId } = getRetailerContext(req);
    const { products } = req.body as {
      products: Array<{
        name: string;
        barcode?: string;
        category?: string;
        brand?: string;
        sellPrice: number;
        purchasePrice?: number;
        mrp?: number;
        unit?: string;
        stock?: number;
        type?: string;
      }>;
    };

    if (!products || !Array.isArray(products) || products.length === 0) {
      throw ApiError.badRequest('Products array is required', 'products');
    }

    if (products.length > 100) {
      throw ApiError.badRequest('Maximum 100 products per batch', 'products');
    }

    let imported = 0;
    const errors: Array<{ index: number; name: string; error: string }> = [];

    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      try {
        if (!p.name || !p.sellPrice) {
          errors.push({ index: i, name: p.name || '(empty)', error: 'Name and sell price required' });
          continue;
        }

        // Check for duplicate barcode
        if (p.barcode) {
          const existing = await query(
            `SELECT 1 FROM catalog.store_products sp
             JOIN catalog.products prod ON sp.product_id = prod.id
             WHERE sp.store_id = $1 AND prod.primary_barcode = $2`,
            [storeId, p.barcode]
          );
          if (existing.length > 0) {
            errors.push({ index: i, name: p.name, error: `Duplicate barcode: ${p.barcode}` });
            continue;
          }
        }

        // Create product
        const productResult = await query<{ id: string; store_product_id: string }>(
          `WITH new_product AS (
             INSERT INTO catalog.products (primary_barcode, name, unit, category, brand)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id
           )
           INSERT INTO catalog.store_products (store_id, product_id, purchase_price, sell_price, mrp, current_stock)
           SELECT $6, id, $7, $8, $9, $10 FROM new_product
           RETURNING product_id as id, id as store_product_id`,
          [
            p.barcode || null,
            p.name,
            p.unit || 'pcs',
            p.category || null,
            p.brand || null,
            storeId,
            p.purchasePrice || 0,
            p.sellPrice,
            p.mrp || null,
            p.stock || 0,
          ]
        );

        // Add barcode lookup entry
        if (p.barcode && productResult[0]) {
          await query(
            `INSERT INTO catalog.store_product_barcodes (store_id, store_product_id, barcode, source)
             VALUES ($1, $2, $3, 'bulk_import')
             ON CONFLICT (store_id, barcode) DO NOTHING`,
            [storeId, productResult[0].store_product_id, p.barcode]
          );
        }

        imported++;
      } catch (err) {
        errors.push({ index: i, name: p.name, error: err instanceof Error ? err.message : 'Unknown error' });
      }
    }

    res.status(201).json({
      success: true,
      data: {
        imported,
        total: products.length,
        errors: errors.length > 0 ? errors : undefined,
      },
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

    // FIX: Use correct column names (transaction_type, delta_qty instead of movement_type, quantity)
    const result = await query<{
      id: string;
      product_id: string;
      product_name: string;
      transaction_type: string;
      delta_qty: number;
      source: string | null;
      notes: string | null;
      created_at: Date;
    }>(
      `SELECT il.id, il.product_id, p.name as product_name,
              il.transaction_type, il.delta_qty, il.source, il.notes, il.created_at
       FROM inventory.inventory_ledger il
       JOIN catalog.products p ON il.product_id = p.id
       WHERE ${whereClause}
       ORDER BY il.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limitNum, offset]
    );

    res.json({
      success: true,
      data: result,
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
 * Returns full supplier details with verification status and store-specific terms
 */
router.get(
  '/suppliers',
  asyncHandler(async (req, res) => {
    const { storeId } = getRetailerContext(req);

    const result = await query<{
      id: string;
      // Section A: Identity & Compliance
      businessName: string;
      tradeName: string | null;
      supplierType: string | null;
      gstin: string | null;
      pan: string | null;
      fssai: string | null;
      // Section B: Contact & Address
      primaryPhone: string | null;
      whatsappEnabled: boolean;
      secondaryPhone: string | null;
      email: string | null;
      addressLine1: string | null;
      addressLine2: string | null;
      area: string | null;
      city: string | null;
      state: string | null;
      pincode: string | null;
      // Section C: Commercial Terms (from store_links)
      paymentTerms: string | null;
      creditDays: number;
      minOrderValue: number;
      deliveryCharges: number;
      deliverySchedule: string | null;
      returnsAllowed: boolean;
      returnsWindow: number;
      taxInvoiceProvided: boolean;
      priceSource: string | null;
      serviceArea: string | null;
      deliveryAddress: string | null;
      // Section D: Operational Metadata (from store_links)
      categoriesSupplied: string[];
      brandsSupplied: string | null;
      orderingChannel: string | null;
      notes: string | null;
      // Status & metadata
      verificationStatus: string;
      isSupermandi: boolean;
      supplierCode: string | null;
      // Legacy fields for backward compatibility
      name: string;
      phone: string | null;
      address: string | null;
    }>(
      `SELECT
         s.id,
         -- Section A: Identity & Compliance
         s.business_name as "businessName",
         s.trade_name as "tradeName",
         s.business_type as "supplierType",
         CASE WHEN s.gstin LIKE 'XX%' THEN NULL ELSE s.gstin END as gstin,
         s.pan,
         s.fssai,
         -- Section B: Contact & Address
         s.primary_phone as "primaryPhone",
         COALESCE(s.whatsapp_enabled, false) as "whatsappEnabled",
         s.secondary_phone as "secondaryPhone",
         s.primary_email as email,
         s.address_line1 as "addressLine1",
         s.address_line2 as "addressLine2",
         s.area,
         s.city,
         s.state,
         s.pincode,
         -- Section C: Commercial Terms (from store_links)
         COALESCE(ssl.payment_terms, 'Cash') as "paymentTerms",
         COALESCE(ssl.credit_days, 0) as "creditDays",
         COALESCE(ssl.min_order_value, 0) as "minOrderValue",
         COALESCE(ssl.delivery_charges, 0) as "deliveryCharges",
         ssl.delivery_schedule as "deliverySchedule",
         COALESCE(ssl.returns_allowed, false) as "returnsAllowed",
         COALESCE(ssl.returns_window, 0) as "returnsWindow",
         COALESCE(ssl.tax_invoice_provided, false) as "taxInvoiceProvided",
         ssl.price_source as "priceSource",
         ssl.service_area as "serviceArea",
         ssl.delivery_address as "deliveryAddress",
         -- Section D: Operational Metadata (from store_links)
         COALESCE(ssl.categories_supplied, '[]'::jsonb) as "categoriesSupplied",
         ssl.brands_supplied as "brandsSupplied",
         ssl.ordering_channel as "orderingChannel",
         ssl.notes,
         -- Status & metadata
         COALESCE(s.verification_status, 'unverified') as "verificationStatus",
         (s.gstin IS NOT NULL AND s.gstin NOT LIKE 'XX%' AND s.verification_status = 'verified') as "isSupermandi",
         CASE WHEN s.verification_status = 'verified' THEN LEFT(s.id::text, 8) ELSE NULL END as "supplierCode",
         -- Legacy fields
         s.business_name as name,
         s.primary_phone as phone,
         CONCAT_WS(', ', NULLIF(s.address_line1, ''), NULLIF(s.city, ''), NULLIF(s.state, '')) as address
       FROM supplier.suppliers s
       JOIN supplier.supplier_store_links ssl ON s.id = ssl.supplier_id
       WHERE ssl.store_id = $1 AND ssl.status = 'active'
       ORDER BY
         CASE s.verification_status WHEN 'verified' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
         s.business_name`,
      [storeId]
    );

    res.json({
      success: true,
      data: result,
    });
  })
);

/**
 * POST /retailer-admin/suppliers
 * Create or link a supplier to the store
 * Note: For informal suppliers without GSTIN, a placeholder is generated
 */
router.post(
  '/suppliers',
  asyncHandler(async (req, res) => {
    const { userId, storeId } = getRetailerContext(req);

    // Full 4-section supplier form fields
    const {
      // Section A: Identity & Compliance
      supplierType,
      businessName,  // Required
      tradeName,
      gstin,
      pan,
      fssai,
      // Section B: Contact & Address
      primaryPhone,
      whatsappEnabled,
      secondaryPhone,
      email,
      addressLine1,
      addressLine2,
      area,
      city,
      state,
      pincode,
      // Section C: Commercial Terms (stored on store_links)
      paymentTerms,
      creditDays,
      minOrderValue,
      deliveryCharges,
      deliverySchedule,
      returnsAllowed,
      returnsWindow,
      taxInvoiceProvided,
      priceSource,
      serviceArea,
      deliveryAddress,
      // Section D: Operational Metadata (stored on store_links)
      categoriesSupplied,
      brandsSupplied,
      orderingChannel,
      notes,
      // Legacy field mapping
      name,  // Maps to businessName
      phone,  // Maps to primaryPhone
      address,  // Maps to addressLine1
    } = req.body as {
      supplierType?: string;
      businessName?: string;
      tradeName?: string;
      gstin?: string;
      pan?: string;
      fssai?: string;
      primaryPhone?: string;
      whatsappEnabled?: boolean;
      secondaryPhone?: string;
      email?: string;
      addressLine1?: string;
      addressLine2?: string;
      area?: string;
      city?: string;
      state?: string;
      pincode?: string;
      paymentTerms?: string;
      creditDays?: string | number;
      minOrderValue?: string | number;
      deliveryCharges?: string | number;
      deliverySchedule?: string;
      returnsAllowed?: boolean;
      returnsWindow?: string | number;
      taxInvoiceProvided?: boolean;
      priceSource?: string;
      serviceArea?: string;
      deliveryAddress?: string;
      categoriesSupplied?: string[];
      brandsSupplied?: string;
      orderingChannel?: string;
      notes?: string;
      // Legacy
      name?: string;
      phone?: string;
      address?: string;
    };

    // Support legacy field names
    const effectiveBusinessName = businessName || name;
    const effectivePrimaryPhone = primaryPhone || phone;
    const effectiveAddressLine1 = addressLine1 || address;

    if (!effectiveBusinessName) {
      throw ApiError.badRequest('Supplier name is required', 'businessName');
    }

    // 10K STORE SCALE: LEDGER-FIRST - write audit log BEFORE mutation
    await writeAuditLog({
      actorUserId: userId,
      storeId,
      action: 'supplier.create',
      resourceType: 'supplier_store_link',
      requestBody: {
        businessName: effectiveBusinessName,
        gstin,
        primaryPhone: effectivePrimaryPhone,
        city,
        state,
      },
      req,
    });

    // Determine if this is a real GSTIN or informal supplier
    const hasRealGstin = gstin && !gstin.startsWith('XX') && gstin.length >= 10;
    let supplierId: string | null = null;
    let linkedToVerified = false;
    let pendingRequestCreated = false;

    // STEP 1: If real GSTIN provided, check for verified supplier first
    if (hasRealGstin) {
      const verifiedResult = await query<{ id: string; verification_status: string }>(
        `SELECT id, verification_status FROM supplier.suppliers
         WHERE gstin = $1 AND verification_status = 'verified'`,
        [gstin]
      );

      if (verifiedResult.length > 0) {
        // Found verified supplier - auto-link
        supplierId = verifiedResult[0]!.id;
        linkedToVerified = true;
      }
    }

    // STEP 2: If not linked to verified supplier, check for existing supplier by phone or GSTIN
    if (!supplierId) {
      let existingSupplier: { id: string } | null = null;

      if (effectivePrimaryPhone) {
        const byPhone = await query<{ id: string }>(
          `SELECT id FROM supplier.suppliers WHERE primary_phone = $1`,
          [effectivePrimaryPhone]
        );
        existingSupplier = byPhone[0] || null;
      }

      if (!existingSupplier && gstin) {
        const byGstin = await query<{ id: string }>(
          `SELECT id FROM supplier.suppliers WHERE gstin = $1`,
          [gstin]
        );
        existingSupplier = byGstin[0] || null;
      }

      if (existingSupplier) {
        supplierId = existingSupplier.id;
      }
    }

    // STEP 3: Create new supplier if not found
    if (!supplierId) {
      // gstin is NOT NULL and max 15 chars, generate placeholder for informal suppliers
      // Format: XX + 13 random base36 chars = 15 chars total (like: XX1ABC2DEF3GHI)
      const effectiveGstin = gstin || `XX${(Date.now().toString(36) + Math.random().toString(36).substring(2)).substring(0, 13)}`.toUpperCase();

      const result = await query<{ id: string }>(
        `INSERT INTO supplier.suppliers (
          business_name, trade_name, business_type, gstin, pan, fssai,
          primary_phone, whatsapp_enabled, secondary_phone, primary_email,
          address_line1, address_line2, area, city, state, pincode,
          verification_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
         RETURNING id`,
        [
          effectiveBusinessName,
          tradeName || null,
          supplierType || null,
          effectiveGstin,
          pan || null,
          fssai || null,
          effectivePrimaryPhone || null,
          whatsappEnabled || false,
          secondaryPhone || null,
          email || null,
          effectiveAddressLine1 || null,
          addressLine2 || null,
          area || null,
          city || null,
          state || null,
          pincode || null,
          'pending'
        ]
      );
      supplierId = result[0]!.id;

      // STEP 4: ALWAYS create pending request for SuperAdmin review for new suppliers
      // This ensures ALL new suppliers (with or without GSTIN) can be verified
      // The approved_supplier_id links this request to the supplier we just created
      await query(
        `INSERT INTO supplier.supplier_requests (
          store_id, requested_gstin, requested_name, requested_phone, requested_email, status,
          approved_supplier_id
        ) VALUES ($1, $2, $3, $4, $5, 'pending', $6)
         ON CONFLICT DO NOTHING`,
        [storeId, gstin || null, effectiveBusinessName, effectivePrimaryPhone || null, email || null, supplierId]
      );
      pendingRequestCreated = true;
    }

    // Link supplier to store with commercial terms and operational metadata
    const creditDaysNum = creditDays ? parseInt(String(creditDays), 10) || 0 : 0;
    const minOrderValueNum = minOrderValue ? parseInt(String(minOrderValue), 10) || 0 : 0;
    const deliveryChargesNum = deliveryCharges ? parseInt(String(deliveryCharges), 10) || 0 : 0;
    const returnsWindowNum = returnsWindow ? parseInt(String(returnsWindow), 10) || 0 : 0;

    await query(
      `INSERT INTO supplier.supplier_store_links (
        supplier_id, store_id, status,
        payment_terms, credit_days, min_order_value, delivery_charges,
        delivery_schedule, returns_allowed, returns_window, tax_invoice_provided,
        price_source, service_area, delivery_address,
        categories_supplied, brands_supplied, ordering_channel, notes
      ) VALUES ($1, $2, 'active', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       ON CONFLICT (supplier_id, store_id) DO UPDATE SET
         status = 'active',
         payment_terms = COALESCE(EXCLUDED.payment_terms, supplier.supplier_store_links.payment_terms),
         credit_days = COALESCE(EXCLUDED.credit_days, supplier.supplier_store_links.credit_days),
         min_order_value = COALESCE(EXCLUDED.min_order_value, supplier.supplier_store_links.min_order_value),
         delivery_charges = COALESCE(EXCLUDED.delivery_charges, supplier.supplier_store_links.delivery_charges),
         delivery_schedule = COALESCE(EXCLUDED.delivery_schedule, supplier.supplier_store_links.delivery_schedule),
         returns_allowed = COALESCE(EXCLUDED.returns_allowed, supplier.supplier_store_links.returns_allowed),
         returns_window = COALESCE(EXCLUDED.returns_window, supplier.supplier_store_links.returns_window),
         tax_invoice_provided = COALESCE(EXCLUDED.tax_invoice_provided, supplier.supplier_store_links.tax_invoice_provided),
         price_source = COALESCE(EXCLUDED.price_source, supplier.supplier_store_links.price_source),
         service_area = COALESCE(EXCLUDED.service_area, supplier.supplier_store_links.service_area),
         delivery_address = COALESCE(EXCLUDED.delivery_address, supplier.supplier_store_links.delivery_address),
         categories_supplied = COALESCE(EXCLUDED.categories_supplied, supplier.supplier_store_links.categories_supplied),
         brands_supplied = COALESCE(EXCLUDED.brands_supplied, supplier.supplier_store_links.brands_supplied),
         ordering_channel = COALESCE(EXCLUDED.ordering_channel, supplier.supplier_store_links.ordering_channel),
         notes = COALESCE(EXCLUDED.notes, supplier.supplier_store_links.notes),
         updated_at = NOW()`,
      [
        supplierId, storeId,
        paymentTerms || 'Cash',
        creditDaysNum,
        minOrderValueNum,
        deliveryChargesNum,
        deliverySchedule || null,
        returnsAllowed || false,
        returnsWindowNum,
        taxInvoiceProvided || false,
        priceSource || null,
        serviceArea || null,
        deliveryAddress || null,
        JSON.stringify(categoriesSupplied || []),
        brandsSupplied || null,
        orderingChannel || null,
        notes || null
      ]
    );

    res.status(201).json({
      success: true,
      data: {
        id: supplierId,
        businessName: effectiveBusinessName,
        phone: effectivePrimaryPhone,
        gstin: gstin || null,
        linked: true,
        linkedToVerified,
        pendingRequestCreated,
      },
    });
  })
);

/**
 * PATCH /retailer-admin/suppliers/:id
 * Update a supplier linked to the store
 * Note: Only updates fields on the store link or supplier if it's a retailer-owned supplier
 */
router.patch(
  '/suppliers/:id',
  asyncHandler(async (req, res) => {
    const { userId, storeId } = getRetailerContext(req);
    const { id } = req.params;

    // Full 4-section supplier form fields
    const {
      // Section A: Identity & Compliance
      supplierType,
      businessName,
      tradeName,
      pan,
      fssai,
      // Section B: Contact & Address
      primaryPhone,
      whatsappEnabled,
      secondaryPhone,
      email,
      addressLine1,
      addressLine2,
      area,
      city,
      state,
      pincode,
      // Section C: Commercial Terms (stored on store_links)
      paymentTerms,
      creditDays,
      minOrderValue,
      deliveryCharges,
      deliverySchedule,
      returnsAllowed,
      returnsWindow,
      taxInvoiceProvided,
      priceSource,
      serviceArea,
      deliveryAddress,
      // Section D: Operational Metadata (stored on store_links)
      categoriesSupplied,
      brandsSupplied,
      orderingChannel,
      notes,
      // Legacy field mapping
      name,
      phone,
      address,
    } = req.body as {
      supplierType?: string;
      businessName?: string;
      tradeName?: string;
      pan?: string;
      fssai?: string;
      primaryPhone?: string;
      whatsappEnabled?: boolean;
      secondaryPhone?: string;
      email?: string;
      addressLine1?: string;
      addressLine2?: string;
      area?: string;
      city?: string;
      state?: string;
      pincode?: string;
      paymentTerms?: string;
      creditDays?: string | number;
      minOrderValue?: string | number;
      deliveryCharges?: string | number;
      deliverySchedule?: string;
      returnsAllowed?: boolean;
      returnsWindow?: string | number;
      taxInvoiceProvided?: boolean;
      priceSource?: string;
      serviceArea?: string;
      deliveryAddress?: string;
      categoriesSupplied?: string[];
      brandsSupplied?: string;
      orderingChannel?: string;
      notes?: string;
      // Legacy
      name?: string;
      phone?: string;
      address?: string;
    };

    // Check if supplier is linked to this store
    const linkResult = await query<{ supplier_id: string }>(
      `SELECT supplier_id FROM supplier.supplier_store_links
       WHERE supplier_id = $1 AND store_id = $2 AND status = 'active'`,
      [id, storeId]
    );

    if (linkResult.length === 0) {
      throw ApiError.notFound('Supplier');
    }

    // 10K STORE SCALE: LEDGER-FIRST - write audit log BEFORE mutation
    await writeAuditLog({
      actorUserId: userId,
      storeId,
      action: 'supplier.update',
      resourceType: 'supplier_store_link',
      resourceId: id,
      requestBody: { businessName, tradeName, primaryPhone, city, state, creditDays, minOrderValue },
      req,
    });

    // Check if this is a SuperMandi supplier (cannot edit supplier base fields)
    const supplierResult = await query<{ verification_status: string }>(
      `SELECT verification_status FROM supplier.suppliers WHERE id = $1`,
      [id]
    );

    const isVerified = supplierResult[0]?.verification_status === 'verified';

    // Build update query for supplier.suppliers (only if not verified)
    const supplierUpdates: string[] = [];
    const supplierParams: (string | boolean | null)[] = [];
    let paramIndex = 1;

    if (!isVerified) {
      // Section A fields
      if (businessName !== undefined || name !== undefined) {
        const effectiveName = businessName || name;
        supplierUpdates.push(`business_name = $${paramIndex++}`);
        supplierParams.push(effectiveName?.trim() || null);
      }
      if (tradeName !== undefined) {
        supplierUpdates.push(`trade_name = $${paramIndex++}`);
        supplierParams.push(tradeName?.trim() || null);
      }
      if (supplierType !== undefined) {
        supplierUpdates.push(`business_type = $${paramIndex++}`);
        supplierParams.push(supplierType?.trim() || null);
      }
      if (pan !== undefined) {
        supplierUpdates.push(`pan = $${paramIndex++}`);
        supplierParams.push(pan?.trim() || null);
      }
      if (fssai !== undefined) {
        supplierUpdates.push(`fssai = $${paramIndex++}`);
        supplierParams.push(fssai?.trim() || null);
      }

      // Section B fields (contact & address)
      if (primaryPhone !== undefined || phone !== undefined) {
        const effectivePhone = primaryPhone || phone;
        supplierUpdates.push(`primary_phone = $${paramIndex++}`);
        supplierParams.push(effectivePhone?.trim() || null);
      }
      if (whatsappEnabled !== undefined) {
        supplierUpdates.push(`whatsapp_enabled = $${paramIndex++}`);
        supplierParams.push(whatsappEnabled);
      }
      if (secondaryPhone !== undefined) {
        supplierUpdates.push(`secondary_phone = $${paramIndex++}`);
        supplierParams.push(secondaryPhone?.trim() || null);
      }
      if (email !== undefined) {
        supplierUpdates.push(`primary_email = $${paramIndex++}`);
        supplierParams.push(email?.trim() || null);
      }
      if (addressLine1 !== undefined || address !== undefined) {
        const effectiveAddress = addressLine1 || address;
        supplierUpdates.push(`address_line1 = $${paramIndex++}`);
        supplierParams.push(effectiveAddress?.trim() || null);
      }
      if (addressLine2 !== undefined) {
        supplierUpdates.push(`address_line2 = $${paramIndex++}`);
        supplierParams.push(addressLine2?.trim() || null);
      }
      if (area !== undefined) {
        supplierUpdates.push(`area = $${paramIndex++}`);
        supplierParams.push(area?.trim() || null);
      }
      if (city !== undefined) {
        supplierUpdates.push(`city = $${paramIndex++}`);
        supplierParams.push(city?.trim() || null);
      }
      if (state !== undefined) {
        supplierUpdates.push(`state = $${paramIndex++}`);
        supplierParams.push(state?.trim() || null);
      }
      if (pincode !== undefined) {
        supplierUpdates.push(`pincode = $${paramIndex++}`);
        supplierParams.push(pincode?.trim() || null);
      }

      // Update supplier if any fields changed
      if (supplierUpdates.length > 0) {
        supplierParams.push(id);
        await query(
          `UPDATE supplier.suppliers SET ${supplierUpdates.join(', ')}, updated_at = NOW() WHERE id = $${paramIndex}`,
          supplierParams
        );
      }
    }

    // Build update query for store_links (always allowed - these are store-specific)
    const linkUpdates: string[] = [];
    const linkParams: (string | number | boolean | null)[] = [];
    let linkParamIndex = 1;

    // Section C: Commercial Terms
    if (paymentTerms !== undefined) {
      linkUpdates.push(`payment_terms = $${linkParamIndex++}`);
      linkParams.push(paymentTerms || 'Cash');
    }
    if (creditDays !== undefined) {
      linkUpdates.push(`credit_days = $${linkParamIndex++}`);
      linkParams.push(parseInt(String(creditDays), 10) || 0);
    }
    if (minOrderValue !== undefined) {
      linkUpdates.push(`min_order_value = $${linkParamIndex++}`);
      linkParams.push(parseInt(String(minOrderValue), 10) || 0);
    }
    if (deliveryCharges !== undefined) {
      linkUpdates.push(`delivery_charges = $${linkParamIndex++}`);
      linkParams.push(parseInt(String(deliveryCharges), 10) || 0);
    }
    if (deliverySchedule !== undefined) {
      linkUpdates.push(`delivery_schedule = $${linkParamIndex++}`);
      linkParams.push(deliverySchedule?.trim() || null);
    }
    if (returnsAllowed !== undefined) {
      linkUpdates.push(`returns_allowed = $${linkParamIndex++}`);
      linkParams.push(returnsAllowed);
    }
    if (returnsWindow !== undefined) {
      linkUpdates.push(`returns_window = $${linkParamIndex++}`);
      linkParams.push(parseInt(String(returnsWindow), 10) || 0);
    }
    if (taxInvoiceProvided !== undefined) {
      linkUpdates.push(`tax_invoice_provided = $${linkParamIndex++}`);
      linkParams.push(taxInvoiceProvided);
    }
    if (priceSource !== undefined) {
      linkUpdates.push(`price_source = $${linkParamIndex++}`);
      linkParams.push(priceSource?.trim() || null);
    }
    if (serviceArea !== undefined) {
      linkUpdates.push(`service_area = $${linkParamIndex++}`);
      linkParams.push(serviceArea?.trim() || null);
    }
    if (deliveryAddress !== undefined) {
      linkUpdates.push(`delivery_address = $${linkParamIndex++}`);
      linkParams.push(deliveryAddress?.trim() || null);
    }

    // Section D: Operational Metadata
    if (categoriesSupplied !== undefined) {
      linkUpdates.push(`categories_supplied = $${linkParamIndex++}`);
      linkParams.push(JSON.stringify(categoriesSupplied || []));
    }
    if (brandsSupplied !== undefined) {
      linkUpdates.push(`brands_supplied = $${linkParamIndex++}`);
      linkParams.push(brandsSupplied?.trim() || null);
    }
    if (orderingChannel !== undefined) {
      linkUpdates.push(`ordering_channel = $${linkParamIndex++}`);
      linkParams.push(orderingChannel?.trim() || null);
    }
    if (notes !== undefined) {
      linkUpdates.push(`notes = $${linkParamIndex++}`);
      linkParams.push(notes?.trim() || null);
    }

    // Update store_links if any fields changed
    if (linkUpdates.length > 0) {
      linkParams.push(id);
      linkParams.push(storeId);
      await query(
        `UPDATE supplier.supplier_store_links SET ${linkUpdates.join(', ')}, updated_at = NOW()
         WHERE supplier_id = $${linkParamIndex++} AND store_id = $${linkParamIndex}`,
        linkParams
      );
    }

    const totalChanges = supplierUpdates.length + linkUpdates.length;
    if (totalChanges === 0) {
      res.json({ success: true, data: { id, message: 'No changes made' } });
      return;
    }

    res.json({
      success: true,
      data: {
        id,
        message: 'Supplier updated',
        fieldsUpdated: totalChanges,
        supplierFieldsSkipped: isVerified && supplierUpdates.length > 0
          ? 'Verified supplier base fields cannot be edited'
          : undefined
      },
    });
  })
);

/**
 * DELETE /retailer-admin/suppliers/:id
 * Remove supplier link from the store (soft delete - sets status to 'inactive')
 */
router.delete(
  '/suppliers/:id',
  asyncHandler(async (req, res) => {
    const { storeId } = getRetailerContext(req);
    const { id } = req.params;

    // Check if supplier is linked to this store
    const linkResult = await query<{ supplier_id: string }>(
      `SELECT supplier_id FROM supplier.supplier_store_links
       WHERE supplier_id = $1 AND store_id = $2 AND status = 'active'`,
      [id, storeId]
    );

    if (linkResult.length === 0) {
      throw ApiError.notFound('Supplier');
    }

    // Soft delete: set status to 'inactive'
    await query(
      `UPDATE supplier.supplier_store_links
       SET status = 'inactive', updated_at = NOW()
       WHERE supplier_id = $1 AND store_id = $2`,
      [id, storeId]
    );

    res.json({
      success: true,
      data: { id, message: 'Supplier removed from store' },
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
             WHERE sp.store_id = $1 AND p.primary_barcode = $2`,
            [storeId, barcode]
          );
          if (existing[0]) {
            productId = existing[0].product_id;
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
          // FIX: Use primary_barcode instead of barcode, remove type column (doesn't exist)
          const result = await query<{ id: string; store_product_id: string }>(
            `WITH new_product AS (
               INSERT INTO catalog.products (primary_barcode, name, description, unit)
               VALUES ($1, $2, $3, $4)
               RETURNING id
             )
             INSERT INTO catalog.store_products (store_id, product_id, purchase_price, sell_price, mrp)
             SELECT $5, id, $6, $7, $8 FROM new_product
             RETURNING product_id as id, id as store_product_id`,
            [barcode, name, description, unit, storeId, purchasePrice, sellPrice, mrp]
          );
          productId = result[0]!.id;
          const storeProductId = result[0]!.store_product_id;

          // Insert into store_product_barcodes for POS barcode lookup
          if (barcode) {
            await query(
              `INSERT INTO catalog.store_product_barcodes (store_id, store_product_id, barcode, source)
               VALUES ($1, $2, $3, 'manual')
               ON CONFLICT (store_id, barcode) DO NOTHING`,
              [storeId, storeProductId, barcode]
            );
          }
          productsCreated++;
        }

        // Add stock if provided (idempotent with source tracking)
        // CRITICAL: Ledger entry must succeed before updating inventory to ensure retry-safety
        // FIX: Use correct columns and stock_balances table
        if (stock > 0 && productId) {
          // Get current stock for ledger entry
          const currentStockResult = await query<{ current_qty: number }>(
            `SELECT current_qty FROM inventory.stock_balances WHERE store_id = $1 AND product_id = $2`,
            [storeId, productId]
          );
          const stockBefore = currentStockResult[0]?.current_qty || 0;
          const stockAfter = stockBefore + stock;

          // Try to insert ledger entry first (idempotent via unique index)
          const ledgerResult = await query<{ id: string }>(
            `INSERT INTO inventory.inventory_ledger
             (store_id, product_id, delta_qty, transaction_type, stock_before, stock_after, source, source_id, notes)
             VALUES ($1, $2, $3, 'adjustment', $4, $5, 'CSV_IMPORT', $6, $7)
             ON CONFLICT DO NOTHING
             RETURNING id`,
            [storeId, productId, stock, stockBefore, stockAfter, id, `Import: ${importJob.file_name}`]
          );

          // Only update stock if ledger entry was actually inserted (not a retry)
          if (ledgerResult.length > 0) {
            await query(
              `INSERT INTO inventory.stock_balances (store_id, product_id, current_qty)
               VALUES ($1, $2, $3)
               ON CONFLICT (store_id, product_id) DO UPDATE SET current_qty = stock_balances.current_qty + $3, updated_at = NOW()`,
              [storeId, productId, stock]
            );

            // Also update denormalized stock
            await query(
              `UPDATE catalog.store_products SET current_stock = current_stock + $3 WHERE store_id = $1 AND product_id = $2`,
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
            supplierId = existing[0]?.id || null;
          }

          if (!supplierId && supplierGstin) {
            const existing = await query<{ id: string }>(
              `SELECT id FROM supplier.suppliers WHERE gstin = $1`,
              [supplierGstin]
            );
            supplierId = existing[0]?.id || null;
          }

          if (!supplierId) {
            // Create new supplier
            const result = await query<{ id: string }>(
              `INSERT INTO supplier.suppliers (name, phone, gstin)
               VALUES ($1, $2, $3)
               RETURNING id`,
              [supplierName, supplierPhone || null, supplierGstin || null]
            );
            supplierId = result[0]!.id;
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
