// Retailer Portal Routes - Store Owner API
// Routes for retailer portal: products, inventory, suppliers, compliance, imports
// These routes require JWT with store_id claim - enforced by middleware

import crypto from 'crypto';
import { Router, Request, Response, NextFunction } from 'express';
import { ApiError, query, withTransaction } from '@supermandi/common';
import { config } from '../config';
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
} from '../db/retailerAdminQueries';

// Retailer Catalog Service - shared module for catalog operations (API-RCAT-001)
import {
  generateSupermandiBarcode,
  createProductWithStoreProduct,
  attachStoreBarcodeMapping,
  checkDuplicateBarcode,
  updateStoreProductStock,
  linkSupplierToStoreProduct,
  storeUnverifiedSupplierInfo,
  createPendingSupplierRequest,
  findVerifiedSupplierByName,
  verifySupplierLink,
  createSupplierProductLink,
  type ProductMode,
} from '../services/retailerCatalogService';

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
// MIGRATION 014 COLUMN DETECTION (RCAT-SUP-FORM-001)
// =============================================================================

/**
 * Cache for migration 014 column existence check.
 * Avoids repeated DB queries for column existence on every request.
 * Reset on server restart; that's fine since migrations are applied rarely.
 */
let migration014ColumnsExist: boolean | null = null;

/**
 * Check if migration 014 (supplier extended fields) columns exist.
 * Caches result for performance - only queries DB once per server lifetime.
 */
async function checkMigration014Applied(): Promise<boolean> {
  if (migration014ColumnsExist !== null) {
    return migration014ColumnsExist;
  }

  try {
    // Check for one of the migration 014 columns on each table
    const result = await query<{ exists: boolean }>(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'supplier'
          AND table_name = 'suppliers'
          AND column_name = 'fssai'
      ) as exists`
    );
    migration014ColumnsExist = result[0]?.exists === true;
    console.log(`[migration014] Extended supplier columns exist: ${migration014ColumnsExist}`);
    return migration014ColumnsExist;
  } catch (err) {
    console.error('[migration014] Failed to check column existence:', err);
    // Assume columns don't exist on error - safer default
    migration014ColumnsExist = false;
    return false;
  }
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

    // R6.BE.016: Validate date format before parsing
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date as string)) {
      res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
      return;
    }

    // Default to today in IST timezone
    const targetDate = date
      ? new Date(date as string + 'T00:00:00+05:30')
      : new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const dateStr = targetDate.toISOString().split('T')[0];

    // STBT-190.1: Query public.sales (retailers schema does not exist)
    // Column fixes: total_amount→total_minor, items_count→subquery, bill_date→created_at
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
        COALESCE(SUM(s.total_minor), 0) as total_sales,
        COUNT(*) as total_bills,
        (SELECT COALESCE(SUM(si.quantity), 0)
         FROM public.sale_items si
         JOIN public.sales s2 ON si.sale_id = s2.id
         WHERE s2.store_id = $1
           AND DATE(s2.created_at AT TIME ZONE 'Asia/Kolkata') = $2
           AND s2.status NOT IN ('cancelled', 'voided')
        ) as items_sold,
        COALESCE(SUM(CASE WHEN s.payment_mode = 'CASH' THEN s.total_minor ELSE 0 END), 0) as cash_total,
        COALESCE(SUM(CASE WHEN s.payment_mode = 'UPI' THEN s.total_minor ELSE 0 END), 0) as upi_total,
        COALESCE(SUM(CASE WHEN s.payment_mode = 'CARD' THEN s.total_minor ELSE 0 END), 0) as card_total,
        COALESCE(SUM(CASE WHEN s.payment_mode = 'DUE' THEN s.total_minor ELSE 0 END), 0) as credit_total
       FROM public.sales s
       WHERE s.store_id = $1
         AND DATE(s.created_at AT TIME ZONE 'Asia/Kolkata') = $2
         AND s.status NOT IN ('cancelled', 'voided')`,
      [storeId, dateStr]
    );

    const summary = salesResult[0];
    const totalSales = parseInt(summary?.total_sales || '0', 10);
    const totalBills = parseInt(summary?.total_bills || '0', 10);
    const itemsSold = parseInt(summary?.items_sold || '0', 10);

    // STBT-190.1: Top selling items from public.sale_items + public.sales
    // Column fixes: si.product_name→si.name, si.total_amount→si.line_total_minor
    const topItemsResult = await query<{
      product_id: string;
      product_name: string;
      quantity_sold: string;
      total_amount: string;
    }>(
      `SELECT
        si.product_id,
        COALESCE(p.name, si.name, 'Unknown Product') as product_name,
        SUM(si.quantity) as quantity_sold,
        SUM(si.line_total_minor) as total_amount
       FROM public.sale_items si
       JOIN public.sales s ON si.sale_id = s.id
       LEFT JOIN catalog.products p ON si.product_id = p.id
       WHERE s.store_id = $1
         AND DATE(s.created_at AT TIME ZONE 'Asia/Kolkata') = $2
         AND s.status NOT IN ('cancelled', 'voided')
       GROUP BY si.product_id, p.name, si.name
       ORDER BY SUM(si.line_total_minor) DESC
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
// INVENTORY SUMMARY (Ticket 4: opening_stock affects purchase totals)
// =============================================================================

/**
 * GET /retailer-admin/inventory-summary
 * Get inventory value summary for the store.
 *
 * EPIC: Retailer Dashboard → POS Retailer-Owned Catalog (API-RCAT-003)
 *
 * Total Purchase Value includes:
 * - opening_stock: Initial inventory from retailer dashboard
 * - purchase_received: GRN receipts from purchase orders
 *
 * This ensures dashboard reports correctly account for opening stock entries.
 */
router.get(
  '/inventory-summary',
  asyncHandler(async (req, res) => {
    const { storeId } = getRetailerContext(req);

    // Calculate Total Purchase Value including opening_stock
    // Per Ticket 4: opening_stock must affect purchase value totals
    const purchaseValueResult = await query<{
      total_purchase_value: string;
      opening_stock_value: string;
      purchase_received_value: string;
      total_stock_qty: string;
      product_count: string;
    }>(
      `SELECT
         COALESCE(SUM(CASE WHEN il.transaction_type IN ('opening_stock', 'purchase_received')
                          THEN il.delta_qty * COALESCE(il.unit_cost, 0) ELSE 0 END), 0)::BIGINT AS total_purchase_value,
         COALESCE(SUM(CASE WHEN il.transaction_type = 'opening_stock'
                          THEN il.delta_qty * COALESCE(il.unit_cost, 0) ELSE 0 END), 0)::BIGINT AS opening_stock_value,
         COALESCE(SUM(CASE WHEN il.transaction_type = 'purchase_received'
                          THEN il.delta_qty * COALESCE(il.unit_cost, 0) ELSE 0 END), 0)::BIGINT AS purchase_received_value,
         COALESCE(SUM(sb.current_qty), 0)::BIGINT AS total_stock_qty,
         COUNT(DISTINCT sb.product_id)::INTEGER AS product_count
       FROM inventory.stock_balances sb
       LEFT JOIN inventory.inventory_ledger il ON il.store_id = sb.store_id AND il.product_id = sb.product_id
       WHERE sb.store_id = $1`,
      [storeId]
    );

    const summary = purchaseValueResult[0];

    res.json({
      success: true,
      data: {
        // Total value in minor units (paise) - includes opening_stock per Ticket 4
        totalPurchaseValue: parseInt(summary?.total_purchase_value || '0', 10),
        // Breakdown by source
        openingStockValue: parseInt(summary?.opening_stock_value || '0', 10),
        purchaseReceivedValue: parseInt(summary?.purchase_received_value || '0', 10),
        // Inventory counts
        totalStockQty: parseInt(summary?.total_stock_qty || '0', 10),
        productCount: parseInt(summary?.product_count || '0', 10),
      },
    });
  })
);

// =============================================================================
// CATEGORIES (Ticket 3: WEB-RCAT-001 - Categories auto-sync from POS)
// =============================================================================

/**
 * GET /retailer-admin/categories
 * Returns store categories using the same source as POS (FMCG taxonomy).
 *
 * EPIC: Retailer Dashboard → POS Retailer-Owned Catalog (WEB-RCAT-001)
 *
 * Categories are auto-derived from product names via taxonomy keywords.
 * Dashboard must NOT maintain its own category list - this ensures
 * Dashboard and POS always show the same categories.
 */
router.get(
  '/categories',
  asyncHandler(async (req, res) => {
    const { storeId } = getRetailerContext(req);

    // Query FMCG taxonomy categories with product counts for this store
    // This is the SAME query used by catalog-service for POS
    const result = await query<{
      id: string;
      label_en: string;
      label_hi: string | null;
      icon_key: string | null;
      sort_order: number;
      product_count: string;
    }>(
      `WITH store_counts AS (
         SELECT sp.taxonomy_id, COUNT(*) AS product_count
         FROM catalog.store_products sp
         WHERE sp.store_id = $1 AND sp.is_active = true
         GROUP BY sp.taxonomy_id
       ),
       total_count AS (
         SELECT COUNT(*) AS total
         FROM catalog.store_products sp
         WHERE sp.store_id = $1 AND sp.is_active = true
       )
       SELECT ft.id, ft.label_en, ft.label_hi, ft.icon_key, ft.sort_order,
              CASE
                WHEN ft.label_en = 'Sab' THEN (SELECT total FROM total_count)
                ELSE COALESCE(sc.product_count, 0)
              END AS product_count
       FROM catalog.fmcg_taxonomy ft
       LEFT JOIN store_counts sc ON sc.taxonomy_id = ft.id
       WHERE ft.is_active = true
         AND (ft.label_en = 'Sab' OR sc.product_count > 0)
       ORDER BY ft.sort_order ASC`,
      [storeId]
    );

    res.json({
      success: true,
      data: result.map((cat) => ({
        id: cat.id,
        labelEn: cat.label_en,
        labelHi: cat.label_hi,
        iconKey: cat.icon_key,
        sortOrder: cat.sort_order,
        productCount: parseInt(cat.product_count, 10),
      })),
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

    let whereClause = 'sp.store_id = $1 AND sp.is_active = true';
    const params: (string | number)[] = [storeId];

    if (search) {
      params.push(`%${search}%`);
      whereClause += ` AND (p.name ILIKE $${params.length} OR p.primary_barcode ILIKE $${params.length})`;
    }

    // Get products with current stock, category, brand, supplier
    // FIX: Use stock_balances instead of inventory.inventory, return camelCase for frontend
    // EXTENDED: Include new fields per E2E Go-Live spec (lowStockAlertQty, gstPercent, hsn, notes, etc.)
    const result = await query<StoreProduct>(
      `SELECT p.id, p.primary_barcode AS barcode, p.name, p.description, p.unit,
              p.category AS "categoryId", p.brand,
              p.hsn_code AS hsn,
              p.default_gst_rate AS "gstPercent",
              p.pack_size AS "packSize",
              p.pack_unit AS "packUnit",
              sp.product_mode AS mode,
              sp.display_name AS alias,
              sp.purchase_price AS "purchasePrice", sp.sell_price AS "sellPrice", sp.mrp,
              COALESCE(sb.current_qty, sp.current_stock, 0) as stock,
              sp.low_stock_alert_qty AS "lowStockAlertQty",
              sp.notes,
              sp.sold_by AS "soldBy",
              sp.rate_unit AS "rateUnit",
              sp.created_at,
              sp.supplier_id AS "supplierId",
              COALESCE(spb.barcode, p.primary_barcode) AS "generatedBarcode"
       FROM catalog.store_products sp
       JOIN catalog.products p ON sp.product_id = p.id
       LEFT JOIN inventory.stock_balances sb ON sb.product_id = sp.product_id AND sb.store_id = sp.store_id
       LEFT JOIN catalog.store_product_barcodes spb ON spb.store_product_id = sp.id AND spb.store_id = sp.store_id
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
 * Create a new product for the store (Retailer-Owned Catalog)
 *
 * EPIC: Retailer Dashboard → POS Retailer-Owned Catalog (API-RCAT-001)
 *
 * Contract changes from E2E Go-Live Document:
 * - mode: PACKAGED | LOOSE_BULK (required)
 * - category: NOT accepted (auto-derived via taxonomy)
 * - purchasePrice: required for ledger effect
 * - openingStockQty: creates opening_stock ledger entry when > 0
 * - barcode: optional for PACKAGED, rejected for LOOSE_BULK (server generates)
 *
 * Response includes: storeId, productId, barcode, generatedBarcode, ledgerEntryId, storeProduct
 */
router.post(
  '/products',
  asyncHandler(async (req, res) => {
    const { userId, storeId } = getRetailerContext(req);
    const {
      barcode: rawBarcode,
      name,
      description,
      mode,  // Required: 'PACKAGED' | 'LOOSE_BULK'
      brand,
      alias,  // Local name / alternate name
      unit = 'PCS',
      packSize,
      packUnit,
      soldBy,  // For LOOSE_BULK: KG/LTR/PCS
      rateUnit,  // For LOOSE_BULK: ₹/KG etc
      purchasePrice,
      sellPrice,
      mrp,
      openingStockQty = 0,
      lowStockAlertQty,
      gstPercent,
      hsn,
      notes,
      supplierId,
      supplierName,
    } = req.body as {
      barcode?: string;
      name: string;
      description?: string;
      mode: 'PACKAGED' | 'LOOSE_BULK';
      brand?: string;
      alias?: string;
      unit?: string;
      packSize?: number;
      packUnit?: string;
      soldBy?: string;
      rateUnit?: string;
      purchasePrice: number;
      sellPrice: number;
      mrp?: number;
      openingStockQty?: number;
      lowStockAlertQty?: number;
      gstPercent?: number;
      hsn?: string;
      notes?: string;
      supplierId?: string;
      supplierName?: string;
    };

    // ==========================================================================
    // VALIDATION
    // ==========================================================================

    // Required fields
    if (!name) {
      throw ApiError.badRequest('Product name is required', 'name');
    }
    if (!mode || !['PACKAGED', 'LOOSE_BULK'].includes(mode)) {
      throw ApiError.badRequest('Mode is required and must be PACKAGED or LOOSE_BULK', 'mode');
    }
    if (sellPrice === undefined || sellPrice < 0) {
      throw ApiError.badRequest('Valid sell price is required', 'sellPrice');
    }
    if (purchasePrice === undefined || purchasePrice < 0) {
      throw ApiError.badRequest('Valid purchase price is required', 'purchasePrice');
    }

    // Prices must be positive integers (paise/minor units)
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

    // Mode-specific validation
    let barcode: string | null = null;
    let generatedBarcode: string | null = null;

    if (mode === 'PACKAGED') {
      // PACKAGED: barcode optional, normalize if present (trim, no spaces)
      if (rawBarcode) {
        barcode = rawBarcode.trim().replace(/\s+/g, '');
        if (!barcode) {
          barcode = null;
        }
      }
    } else if (mode === 'LOOSE_BULK') {
      // LOOSE_BULK: barcode must NOT be accepted from client
      if (rawBarcode) {
        throw ApiError.badRequest(
          'Barcode must not be provided for LOOSE_BULK products. Server will generate a store-scoped barcode.',
          'barcode'
        );
      }
      // Generate store-scoped barcode using shared service (API-RCAT-001 reuse)
      generatedBarcode = generateSupermandiBarcode();
      barcode = generatedBarcode;
    }

    // Check for duplicate barcode within store using shared service (API-RCAT-001 reuse)
    if (barcode && mode === 'PACKAGED') {
      const isDuplicate = await checkDuplicateBarcode(storeId, barcode);
      if (isDuplicate) {
        throw ApiError.conflict('DUPLICATE_BARCODE', `Product with barcode ${barcode} already exists in this store`);
      }
    }

    // ==========================================================================
    // AUDIT LOG (LEDGER-FIRST)
    // ==========================================================================
    await writeAuditLog({
      actorUserId: userId,
      storeId,
      action: 'product.create',
      resourceType: 'store_product',
      requestBody: { mode, barcode, name, brand, sellPrice, purchasePrice, mrp, openingStockQty, supplierId, supplierName },
      req,
    });

    // ==========================================================================
    // CREATE PRODUCT (API-RCAT-001: using shared catalog service)
    // ==========================================================================

    // Create product and store_product using shared service
    // NOTE: category is NOT set here - it will be auto-derived via taxonomy keywords
    const { productId, storeProductId } = await createProductWithStoreProduct(
      {
        // catalog.products fields
        primaryBarcode: mode === 'PACKAGED' ? barcode : null,
        name,
        description: description || null,
        unit,
        brand: brand || null,
        hsn: hsn || null,
        gstPercent: gstPercent || null,
        packSize: packSize || null,
        packUnit: packUnit || null,
      },
      {
        // catalog.store_products fields
        storeId,
        mode: mode as ProductMode,
        purchasePrice,
        sellPrice,
        mrp: mrp || null,
        displayName: alias || null,
        lowStockAlertQty: lowStockAlertQty || null,
        notes: notes || null,
        soldBy: mode === 'LOOSE_BULK' ? (soldBy || 'WEIGHT') : null,
        rateUnit: mode === 'LOOSE_BULK' ? (rateUnit || 'KG') : null,
      }
    );

    // ==========================================================================
    // BARCODE MAPPING (API-RCAT-001: using shared catalog service)
    // ==========================================================================
    // Insert into store_product_barcodes for POS barcode lookup
    // This ensures store-scoped uniqueness: (store_id, barcode)
    if (barcode) {
      const barcodeSource = mode === 'LOOSE_BULK' ? 'supermandi_generated' : 'manual';
      const maxRetries = mode === 'LOOSE_BULK' ? 3 : 1;

      // Use shared service for barcode mapping (handles collision retry for LOOSE_BULK)
      const finalBarcode = await attachStoreBarcodeMapping(
        {
          storeId,
          storeProductId,
          barcode,
          source: barcodeSource,
        },
        maxRetries
      );

      // Update barcode if it was regenerated due to collision
      if (mode === 'LOOSE_BULK' && finalBarcode !== barcode) {
        generatedBarcode = finalBarcode;
        barcode = finalBarcode;
      }
    }

    // ==========================================================================
    // OPENING STOCK LEDGER ENTRY (Ticket 4: opening_stock type)
    // API-RCAT-001: Calls inventory-service per "No Double Coding" reuse rule
    // ==========================================================================
    let ledgerEntryId: string | null = null;

    if (openingStockQty > 0) {
      // Call inventory-service via HTTP (reuse pattern per spec)
      const inventoryUrl = `${config.services.inventoryService}/stores/${storeId}/inventory/transactions`;

      try {
        const inventoryResponse = await fetch(inventoryUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Service-Name': 'platform-service',
            'X-User-Id': userId,
          },
          body: JSON.stringify({
            items: [{
              productId,
              quantity: openingStockQty,
              unitCost: purchasePrice,
            }],
            transactionType: 'opening_stock',
            referenceType: 'manual',
            referenceId: productId,
            notes: notes || 'Opening stock from retailer dashboard',
          }),
        });

        if (!inventoryResponse.ok) {
          const errorData = await inventoryResponse.json().catch(() => ({}));
          throw new Error((errorData as { error?: { message?: string } }).error?.message || 'Failed to create opening stock ledger entry');
        }

        const inventoryData = await inventoryResponse.json() as {
          data?: { ledgerEntries?: Array<{ id: string }> };
        };
        ledgerEntryId = inventoryData.data?.ledgerEntries?.[0]?.id || null;
      } catch (error) {
        // Log but don't fail product creation - ledger entry is important but not critical
        console.error('Opening stock ledger entry failed:', error);
        // Fallback: create ledger entry directly if inventory-service is unavailable
        const ledgerResult = await query<{ id: string }>(
          `INSERT INTO inventory.inventory_ledger
           (store_id, product_id, delta_qty, transaction_type, stock_before, stock_after, unit_cost, source, notes)
           VALUES ($1, $2, $3, 'opening_stock', 0, $3, $4, 'RETAILER_PORTAL', $5)
           RETURNING id`,
          [storeId, productId, openingStockQty, purchasePrice, notes || 'Opening stock from retailer dashboard']
        );
        ledgerEntryId = ledgerResult[0]?.id || null;

        // Fallback: Update stock_balances directly
        await query(
          `INSERT INTO inventory.stock_balances (store_id, product_id, current_qty)
           VALUES ($1, $2, $3)
           ON CONFLICT (store_id, product_id) DO UPDATE SET current_qty = $3, updated_at = NOW()`,
          [storeId, productId, openingStockQty]
        );
      }

      // Update store_products.current_stock for denormalized access using shared service
      await updateStoreProductStock(storeId, productId, openingStockQty);
    }

    // ==========================================================================
    // SUPPLIER LINKING (API-RCAT-001: using shared catalog service)
    // ==========================================================================
    // 10K STORE SCALE: Supplier linking with verified-only enforcement
    let supplierVerified = false;
    let supplierLinked = false;
    let pendingSupplierRequestId: string | null = null;
    let supplierNameRaw: string | null = null;

    if (supplierId) {
      // CRITICAL: Verify supplier link using shared service
      const supplierCheck = await verifySupplierLink(storeId, supplierId);

      if (!supplierCheck.exists) {
        throw ApiError.badRequest(
          'Supplier not found or not linked to this store. Add supplier first via Suppliers page.',
          'supplierId'
        );
      }

      // 10K STORE SCALE: BLOCK unverified supplier links (not just warn)
      if (!supplierCheck.verified) {
        throw ApiError.badRequest(
          `Supplier "${supplierCheck.businessName}" is not verified. Only verified suppliers can be linked to products. Request supplier verification first.`,
          'supplierId'
        );
      }

      supplierLinked = true;
      supplierVerified = true;

      // Update store_product with verified supplier_id using shared service
      await linkSupplierToStoreProduct(storeProductId, supplierId, storeId);

      // Create supplier-product link using shared service
      await createSupplierProductLink(supplierId, name, brand || null, purchasePrice);

    } else if (supplierName && supplierName.trim()) {
      // 10K STORE SCALE: Unverified supplier name path
      // Search for matching verified supplier by name first using shared service
      supplierNameRaw = supplierName.trim();

      const matchingSupplier = await findVerifiedSupplierByName(storeId, supplierNameRaw);

      if (matchingSupplier) {
        // Found verified supplier - link it using shared service
        supplierLinked = true;
        supplierVerified = true;
        await linkSupplierToStoreProduct(storeProductId, matchingSupplier.id, storeId);
      } else {
        // No verified supplier found - create pending enrollment request using shared service
        pendingSupplierRequestId = await createPendingSupplierRequest(storeId, supplierNameRaw);

        // Store raw name and pending request ID using shared service
        await storeUnverifiedSupplierInfo(storeProductId, supplierNameRaw, pendingSupplierRequestId, storeId);

        supplierLinked = false;
        supplierVerified = false;
      }
    }

    // ==========================================================================
    // RESPONSE (API-RCAT-001 contract)
    // ==========================================================================
    res.status(201).json({
      ok: true,
      data: {
        storeId,
        productId,
        barcode: mode === 'PACKAGED' ? barcode : null,
        generatedBarcode: mode === 'LOOSE_BULK' ? generatedBarcode : null,
        ledgerEntryId,
        storeProduct: {
          productId,
          mode,
          name,
          brand: brand || null,
          alias: alias || null,
          unit,
          sellPrice,
          mrp: mrp || null,
          purchasePrice,
          currentStock: openingStockQty,
        },
        // Supplier linking status (backward compatible)
        supplierId: supplierLinked ? supplierId : undefined,
        supplierName: supplierNameRaw,
        supplierVerified,
        pendingSupplierRequestId,
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
    const {
      name, description, category, categoryId, brand, alias,
      purchasePrice, sellPrice, mrp, supplierId,
      unit, mode,
      notes, lowStockAlertQty, gstPercent, hsn,
      packSize, packUnit, soldBy, rateUnit,
      openingStockQty,
    } = req.body as {
      name?: string;
      description?: string;
      category?: string;
      categoryId?: string;
      brand?: string;
      alias?: string;
      purchasePrice?: number;
      sellPrice?: number;
      mrp?: number;
      supplierId?: string;
      unit?: string;
      mode?: string;
      notes?: string;
      lowStockAlertQty?: number;
      gstPercent?: number;
      hsn?: string;
      packSize?: number;
      packUnit?: string;
      soldBy?: string;
      rateUnit?: string;
      openingStockQty?: number;
    };

    // Verify product belongs to store
    const existing = await query(
      `SELECT sp.id FROM catalog.store_products sp
       WHERE sp.store_id = $1 AND sp.product_id = $2 AND sp.is_active = true`,
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
      requestBody: req.body,
      req,
    });

    // Build update query for store_products (prices, stock settings, mode-specific)
    const spUpdates: string[] = [];
    const spParams: (number | string | null)[] = [];
    let spIndex = 1;

    if (purchasePrice !== undefined) {
      spUpdates.push(`purchase_price = $${spIndex++}`);
      spParams.push(purchasePrice);
    }
    if (sellPrice !== undefined) {
      spUpdates.push(`sell_price = $${spIndex++}`);
      spParams.push(sellPrice);
    }
    if (mrp !== undefined) {
      spUpdates.push(`mrp = $${spIndex++}`);
      spParams.push(mrp);
    }
    if (supplierId !== undefined) {
      spUpdates.push(`supplier_id = $${spIndex++}`);
      spParams.push(supplierId || null);
    }
    if (alias !== undefined) {
      spUpdates.push(`display_name = $${spIndex++}`);
      spParams.push(alias || null);
    }
    if (notes !== undefined) {
      spUpdates.push(`notes = $${spIndex++}`);
      spParams.push(notes || null);
    }
    if (lowStockAlertQty !== undefined) {
      spUpdates.push(`low_stock_alert_qty = $${spIndex++}`);
      spParams.push(lowStockAlertQty);
    }
    if (mode !== undefined) {
      spUpdates.push(`product_mode = $${spIndex++}`);
      spParams.push(mode);
    }
    if (soldBy !== undefined) {
      spUpdates.push(`sold_by = $${spIndex++}`);
      spParams.push(soldBy || null);
    }
    if (rateUnit !== undefined) {
      spUpdates.push(`rate_unit = $${spIndex++}`);
      spParams.push(rateUnit || null);
    }

    if (spUpdates.length > 0) {
      spParams.push(storeId, id);
      await query(
        `UPDATE catalog.store_products
         SET ${spUpdates.join(', ')}, updated_at = NOW()
         WHERE store_id = $${spIndex++} AND product_id = $${spIndex}`,
        spParams
      );
    }

    // Build update query for products (name, description, category, brand, unit, tax, packaging)
    const productUpdates: string[] = [];
    const productParams: (string | number | null)[] = [];
    let productIndex = 1;

    if (name !== undefined) {
      productUpdates.push(`name = $${productIndex++}`);
      productParams.push(name);
    }
    if (description !== undefined) {
      productUpdates.push(`description = $${productIndex++}`);
      productParams.push(description || null);
    }
    // Handle both category and categoryId (frontend sends categoryId)
    const resolvedCategory = categoryId || category;
    if (resolvedCategory !== undefined) {
      productUpdates.push(`category = $${productIndex++}`);
      productParams.push(resolvedCategory || null);
    }
    if (brand !== undefined) {
      productUpdates.push(`brand = $${productIndex++}`);
      productParams.push(brand || null);
    }
    if (unit !== undefined) {
      productUpdates.push(`unit = $${productIndex++}`);
      productParams.push(unit);
    }
    if (gstPercent !== undefined) {
      productUpdates.push(`default_gst_rate = $${productIndex++}`);
      productParams.push(gstPercent);
    }
    if (hsn !== undefined) {
      productUpdates.push(`hsn_code = $${productIndex++}`);
      productParams.push(hsn || null);
    }
    if (packSize !== undefined) {
      productUpdates.push(`pack_size = $${productIndex++}`);
      productParams.push(packSize);
    }
    if (packUnit !== undefined) {
      productUpdates.push(`pack_unit = $${productIndex++}`);
      productParams.push(packUnit || null);
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

    // Stock update: openingStockQty sets absolute stock level via ledger entry
    // FIX-007: All 3 writes (ledger + stock_balances + store_products) in single transaction
    if (openingStockQty !== undefined && typeof openingStockQty === 'number') {
      await withTransaction(async (tx) => {
        const currentStockRows = await tx.query<{ current_qty: number }>(
          `SELECT current_qty FROM inventory.stock_balances WHERE store_id = $1 AND product_id = $2 FOR UPDATE`,
          [storeId, id]
        );
        const stockBefore = currentStockRows[0]?.current_qty || 0;
        const delta = openingStockQty - stockBefore;

        if (delta !== 0) {
          // Ledger-first: write audit entry
          await tx.query(
            `INSERT INTO inventory.inventory_ledger
             (store_id, product_id, delta_qty, transaction_type, stock_before, stock_after, unit_cost, source, notes)
             VALUES ($1, $2, $3, 'adjustment', $4, $5, $6, 'RETAILER_PORTAL', 'Stock updated from retailer dashboard')`,
            [storeId, id, delta, stockBefore, openingStockQty, purchasePrice || 0]
          );

          // Update authoritative stock
          await tx.query(
            `INSERT INTO inventory.stock_balances (store_id, product_id, current_qty)
             VALUES ($1, $2, $3)
             ON CONFLICT (store_id, product_id) DO UPDATE SET current_qty = $3, updated_at = NOW()`,
            [storeId, id, openingStockQty]
          );

          // Update denormalized stock for fast reads
          await tx.query(
            `UPDATE catalog.store_products SET current_stock = $3 WHERE store_id = $1 AND product_id = $2`,
            [storeId, id, openingStockQty]
          );
        }
      });
    }

    res.json({
      success: true,
      data: { id, message: 'Product updated' },
    });
  })
);

/**
 * GET /retailer-admin/products/:productId/sku.pdf
 * Download SKU barcode label sheet for a product.
 *
 * EPIC: Retailer Dashboard → POS Retailer-Owned Catalog (API-RCAT-004)
 *
 * Returns actual PDF (application/pdf) with barcode labels.
 * Includes: store name, product name, barcode image (Code128), barcode text.
 *
 * Query params:
 * - tier: TIER_1 (24 labels/page, default) or TIER_2 (40 labels/page)
 * - count: number of labels (default 24)
 */
router.get(
  '/products/:productId/sku.pdf',
  asyncHandler(async (req, res) => {
    const { storeId } = getRetailerContext(req);
    const { productId } = req.params;
    const { tier = 'TIER_1', count = '24' } = req.query;

    // Validate tier
    const validTier = tier === 'TIER_2' ? 'TIER_2' : 'TIER_1';
    const labelCount = Math.min(96, Math.max(1, parseInt(count as string, 10) || 24));

    // Get product and barcode info - must belong to this store
    const productResult = await query<{
      product_id: string;
      name: string;
      barcode: string | null;
      product_mode: string | null;
      store_name: string;
    }>(
      `SELECT sp.product_id, p.name,
              COALESCE(spb.barcode, p.primary_barcode) AS barcode,
              sp.product_mode,
              s.name AS store_name
       FROM catalog.store_products sp
       JOIN catalog.products p ON sp.product_id = p.id
       JOIN platform.stores s ON s.id = sp.store_id
       LEFT JOIN catalog.store_product_barcodes spb ON spb.store_product_id = sp.id AND spb.store_id = sp.store_id
       WHERE sp.store_id = $1 AND sp.product_id = $2 AND sp.is_active = true`,
      [storeId, productId]
    );

    if (productResult.length === 0) {
      throw ApiError.notFound('Product not found or does not belong to this store');
    }

    const product = productResult[0]!;

    if (!product.barcode) {
      throw ApiError.badRequest('Product does not have a barcode. Cannot generate SKU labels.');
    }

    // Generate actual PDF (API-RCAT-004 spec: must return application/pdf)
    const { generateSingleProductLabelPdf } = await import('../services/barcodeSheetService.js');

    const pdfBuffer = await generateSingleProductLabelPdf(
      {
        barcode: product.barcode,
        name: product.name,
        storeName: product.store_name,
      },
      validTier as 'TIER_1' | 'TIER_2',
      labelCount
    );

    // Return actual PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="sku-${product.barcode}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
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
 *
 * Query params:
 * - page: Page number (default 1)
 * - limit: Items per page (default 50, max 100)
 * - productId: Filter by product UUID
 * - transactionType: Filter by transaction type (opening_stock, sale, purchase_received, adjustment, etc.)
 * - startDate: Filter entries from this date (inclusive, ISO 8601 format)
 * - endDate: Filter entries until this date (inclusive, ISO 8601 format)
 *
 * RET-AUD-034: Added date range and transaction type filters
 */
router.get(
  '/inventory',
  asyncHandler(async (req, res) => {
    const { storeId } = getRetailerContext(req);
    const { page = '1', limit = '50', productId, transactionType, startDate, endDate } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10)));
    const offset = (pageNum - 1) * limitNum;

    let whereClause = 'il.store_id = $1';
    const params: (string | number | Date)[] = [storeId];

    // Product filter
    if (productId) {
      params.push(productId as string);
      whereClause += ` AND il.product_id = $${params.length}`;
    }

    // Transaction type filter (RET-AUD-034)
    if (transactionType) {
      const validTypes = ['opening_stock', 'sale', 'purchase_received', 'adjustment', 'return', 'wastage', 'transfer'];
      const txType = (transactionType as string).toLowerCase();
      if (validTypes.includes(txType)) {
        params.push(txType);
        whereClause += ` AND il.transaction_type = $${params.length}`;
      }
    }

    // Date range filter (RET-AUD-034)
    if (startDate) {
      const start = new Date(startDate as string);
      if (!isNaN(start.getTime())) {
        params.push(start);
        whereClause += ` AND il.created_at >= $${params.length}`;
      }
    }

    if (endDate) {
      const end = new Date(endDate as string);
      if (!isNaN(end.getTime())) {
        // Set to end of day for inclusive end date
        end.setHours(23, 59, 59, 999);
        params.push(end);
        whereClause += ` AND il.created_at <= $${params.length}`;
      }
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
      filters: {
        productId: productId || null,
        transactionType: transactionType || null,
        startDate: startDate || null,
        endDate: endDate || null,
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
 *
 * RCAT-SUP-001: Added structured logging + dev debug payload
 */
router.get('/suppliers', async (req, res) => {
  const reqId = `sup-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;
  const isDev = config.env !== 'production';

  // Structured log helper
  const log = (level: 'info' | 'error', msg: string, extra?: Record<string, unknown>) => {
    const entry = { reqId, endpoint: 'GET /suppliers', level, msg, ts: new Date().toISOString(), ...extra };
    if (level === 'error') {
      console.error(JSON.stringify(entry));
    } else {
      console.log(JSON.stringify(entry));
    }
  };

  try {
    // Extract context - may throw if headers missing
    const userId = req.headers['x-user-id'] as string;
    const storeId = req.headers['x-actor-id'] as string;

    // Parse query parameters for server-side filtering (RCAT-SUP-API-001)
    const searchQuery = (req.query.query as string)?.trim() || '';
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 100, 1), 500); // 1-500, default 100
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0); // default 0

    log('info', 'Request received', { userId, storeId, searchQuery, limit, offset, headers: isDev ? req.headers : undefined });

    if (!userId || !storeId) {
      log('error', 'Missing auth headers', { userId: !!userId, storeId: !!storeId });
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        _debug: isDev ? { reqId, reason: 'Missing x-user-id or x-actor-id header' } : undefined,
      });
    }

    // Check migration 014 before querying extended columns (RCAT-SUP-DB-001 / RCAT-SUP-API-001)
    const extendedColumnsExist = await checkMigration014Applied();
    log('info', 'Executing suppliers query', { storeId, searchQuery, extendedColumnsExist });

    // Build WHERE clause with optional search filter
    // Search on: business_name, trade_name, primary_phone, gstin (case-insensitive)
    const params: (string | number)[] = [storeId];
    let searchClause = '';
    if (searchQuery) {
      const searchPattern = `%${searchQuery.toLowerCase()}%`;
      params.push(searchPattern);
      searchClause = `
        AND (
          LOWER(s.business_name) LIKE $2
          OR LOWER(COALESCE(s.trade_name, '')) LIKE $2
          OR COALESCE(s.primary_phone, '') LIKE $2
          OR LOWER(COALESCE(s.gstin, '')) LIKE $2
        )`;
    }

    // Add limit and offset params
    params.push(limit, offset);
    const limitParam = searchQuery ? '$3' : '$2';
    const offsetParam = searchQuery ? '$4' : '$3';

    // Build SELECT columns conditionally based on migration 014 status
    const extendedSupplierCols = extendedColumnsExist
      ? `s.fssai,
         COALESCE(s.whatsapp_enabled, false) as "whatsappEnabled",
         s.secondary_phone as "secondaryPhone",
         s.area,`
      : `NULL as fssai,
         false as "whatsappEnabled",
         NULL as "secondaryPhone",
         NULL as area,`;

    const extendedLinkCols = extendedColumnsExist
      ? `COALESCE(ssl.payment_terms, 'Cash') as "paymentTerms",
         COALESCE(ssl.delivery_charges, 0) as "deliveryCharges",
         ssl.delivery_schedule as "deliverySchedule",
         COALESCE(ssl.returns_allowed, false) as "returnsAllowed",
         COALESCE(ssl.returns_window, 0) as "returnsWindow",
         COALESCE(ssl.tax_invoice_provided, false) as "taxInvoiceProvided",
         ssl.price_source as "priceSource",
         ssl.service_area as "serviceArea",
         ssl.delivery_address as "deliveryAddress",
         COALESCE(ssl.categories_supplied, '[]'::jsonb) as "categoriesSupplied",
         ssl.brands_supplied as "brandsSupplied",
         ssl.ordering_channel as "orderingChannel",
         ssl.notes,`
      : `'Cash' as "paymentTerms",
         0 as "deliveryCharges",
         NULL as "deliverySchedule",
         false as "returnsAllowed",
         0 as "returnsWindow",
         false as "taxInvoiceProvided",
         NULL as "priceSource",
         NULL as "serviceArea",
         NULL as "deliveryAddress",
         '[]'::jsonb as "categoriesSupplied",
         NULL as "brandsSupplied",
         NULL as "orderingChannel",
         NULL as notes,`;

    const result = await query(
      `SELECT
         s.id,
         s.business_name as "businessName",
         s.trade_name as "tradeName",
         s.business_type as "supplierType",
         CASE WHEN s.gstin LIKE 'XX%' THEN NULL ELSE s.gstin END as gstin,
         s.pan,
         ${extendedSupplierCols}
         s.primary_phone as "primaryPhone",
         s.primary_email as email,
         s.address_line1 as "addressLine1",
         s.address_line2 as "addressLine2",
         s.city,
         s.state,
         s.pincode,
         COALESCE(ssl.credit_days, 0) as "creditDays",
         COALESCE(ssl.min_order_value, 0) as "minOrderValue",
         ${extendedLinkCols}
         COALESCE(s.verification_status, 'unverified') as "verificationStatus",
         (s.gstin IS NOT NULL AND s.gstin NOT LIKE 'XX%' AND s.verification_status = 'verified') as "isSupermandi",
         CASE WHEN s.verification_status = 'verified' THEN LEFT(s.id::text, 8) ELSE NULL END as "supplierCode",
         s.business_name as name,
         s.primary_phone as phone,
         CONCAT_WS(', ', NULLIF(s.address_line1, ''), NULLIF(s.city, ''), NULLIF(s.state, '')) as address
       FROM supplier.suppliers s
       JOIN supplier.supplier_store_links ssl ON s.id = ssl.supplier_id
       WHERE ssl.store_id = $1 AND ssl.status = 'active'${searchClause}
       ORDER BY
         CASE s.verification_status WHEN 'verified' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
         s.business_name
       LIMIT ${limitParam} OFFSET ${offsetParam}`,
      params
    );

    // Map result (all fields now come from DB with COALESCE defaults)
    const mappedResult = result.map((s: Record<string, unknown>) => ({
      id: s.id,
      businessName: s.businessName,
      tradeName: s.tradeName,
      supplierType: s.supplierType,
      gstin: s.gstin,
      pan: s.pan,
      fssai: s.fssai,
      primaryPhone: s.primaryPhone,
      whatsappEnabled: s.whatsappEnabled,
      secondaryPhone: s.secondaryPhone,
      email: s.email,
      addressLine1: s.addressLine1,
      addressLine2: s.addressLine2,
      area: s.area,
      city: s.city,
      state: s.state,
      pincode: s.pincode,
      paymentTerms: s.paymentTerms,
      creditDays: s.creditDays,
      minOrderValue: s.minOrderValue,
      deliveryCharges: s.deliveryCharges,
      deliverySchedule: s.deliverySchedule,
      returnsAllowed: s.returnsAllowed,
      returnsWindow: s.returnsWindow,
      taxInvoiceProvided: s.taxInvoiceProvided,
      priceSource: s.priceSource,
      serviceArea: s.serviceArea,
      deliveryAddress: s.deliveryAddress,
      categoriesSupplied: s.categoriesSupplied,
      brandsSupplied: s.brandsSupplied,
      orderingChannel: s.orderingChannel,
      notes: s.notes,
      verificationStatus: s.verificationStatus,
      isSupermandi: s.isSupermandi,
      supplierCode: s.supplierCode,
      name: s.name,
      phone: s.phone,
      address: s.address,
    }));

    log('info', 'Query success', { count: mappedResult.length, searchQuery, limit, offset });

    // Get total count for pagination (only if using search or pagination)
    let totalCount = mappedResult.length;
    if (searchQuery || offset > 0 || mappedResult.length === limit) {
      const countParams: string[] = [storeId];
      let countSearchClause = '';
      if (searchQuery) {
        const searchPattern = `%${searchQuery.toLowerCase()}%`;
        countParams.push(searchPattern);
        countSearchClause = `
          AND (
            LOWER(s.business_name) LIKE $2
            OR LOWER(COALESCE(s.trade_name, '')) LIKE $2
            OR COALESCE(s.primary_phone, '') LIKE $2
            OR LOWER(COALESCE(s.gstin, '')) LIKE $2
          )`;
      }
      const countResult = await query(
        `SELECT COUNT(*) as total
         FROM supplier.suppliers s
         JOIN supplier.supplier_store_links ssl ON s.id = ssl.supplier_id
         WHERE ssl.store_id = $1 AND ssl.status = 'active'${countSearchClause}`,
        countParams
      ) as { total: string }[];
      totalCount = parseInt(countResult[0]?.total || '0', 10);
    }

    return res.json({
      success: true,
      data: mappedResult,
      pagination: {
        total: totalCount,
        limit,
        offset,
        hasMore: offset + mappedResult.length < totalCount,
      },
      _debug: isDev ? { reqId, searchQuery } : undefined,
    });
  } catch (err: unknown) {
    // Extract postgres-specific error fields
    const pgErr = err as {
      message?: string;
      code?: string;
      detail?: string;
      hint?: string;
      position?: string;
      schema?: string;
      table?: string;
      column?: string;
      constraint?: string;
      stack?: string;
    };

    log('error', 'Suppliers query failed', {
      message: pgErr.message,
      pgCode: pgErr.code,
      pgDetail: pgErr.detail,
      pgHint: pgErr.hint,
      pgPosition: pgErr.position,
      pgSchema: pgErr.schema,
      pgTable: pgErr.table,
      pgColumn: pgErr.column,
      pgConstraint: pgErr.constraint,
      stack: pgErr.stack,
    });

    // Return error with debug info in dev
    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: isDev ? pgErr.message : 'An unexpected error occurred',
      },
      _debug: isDev
        ? {
            reqId,
            message: pgErr.message,
            pgCode: pgErr.code,
            pgDetail: pgErr.detail,
            pgHint: pgErr.hint,
            pgSchema: pgErr.schema,
            pgTable: pgErr.table,
            pgColumn: pgErr.column,
          }
        : undefined,
    });
  }
});

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
    // Check if migration 014 columns exist (RCAT-SUP-FORM-001)
    const extendedColumnsExist = await checkMigration014Applied();
    const warnings: string[] = [];

    if (!supplierId) {
      // gstin is NOT NULL and max 15 chars, generate placeholder for informal suppliers
      // Format: XX + 13 random base36 chars = 15 chars total (like: XX1ABC2DEF3GHI)
      const effectiveGstin = gstin || `XX${(Date.now().toString(36) + Math.random().toString(36).substring(2)).substring(0, 13)}`.toUpperCase();

      if (extendedColumnsExist) {
        // Full insert with migration 014 columns
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
            'unverified'
          ]
        );
        supplierId = result[0]!.id;
      } else {
        // Base insert with only migration 003 columns (graceful degradation)
        const result = await query<{ id: string }>(
          `INSERT INTO supplier.suppliers (
            business_name, trade_name, business_type, gstin, pan,
            primary_phone, primary_email,
            address_line1, address_line2, city, state, pincode,
            verification_status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           RETURNING id`,
          [
            effectiveBusinessName,
            tradeName || null,
            supplierType || null,
            effectiveGstin,
            pan || null,
            effectivePrimaryPhone || null,
            email || null,
            effectiveAddressLine1 || null,
            addressLine2 || null,
            city || null,
            state || null,
            pincode || null,
            'unverified'
          ]
        );
        supplierId = result[0]!.id;

        // Track which fields were not saved
        if (fssai) warnings.push('fssai');
        if (whatsappEnabled) warnings.push('whatsappEnabled');
        if (secondaryPhone) warnings.push('secondaryPhone');
        if (area) warnings.push('area');
      }

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

    if (extendedColumnsExist) {
      // Full insert/update with migration 014 columns
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
    } else {
      // Base insert/update with only migration 003 columns (graceful degradation)
      await query(
        `INSERT INTO supplier.supplier_store_links (
          supplier_id, store_id, status, credit_days, min_order_value
        ) VALUES ($1, $2, 'active', $3, $4)
         ON CONFLICT (supplier_id, store_id) DO UPDATE SET
           status = 'active',
           credit_days = COALESCE(EXCLUDED.credit_days, supplier.supplier_store_links.credit_days),
           min_order_value = COALESCE(EXCLUDED.min_order_value, supplier.supplier_store_links.min_order_value),
           updated_at = NOW()`,
        [supplierId, storeId, creditDaysNum, minOrderValueNum]
      );

      // Track which store_link fields were not saved
      if (paymentTerms && paymentTerms !== 'Cash') warnings.push('paymentTerms');
      if (deliveryChargesNum > 0) warnings.push('deliveryCharges');
      if (deliverySchedule) warnings.push('deliverySchedule');
      if (returnsAllowed) warnings.push('returnsAllowed');
      if (returnsWindowNum > 0) warnings.push('returnsWindow');
      if (taxInvoiceProvided) warnings.push('taxInvoiceProvided');
      if (priceSource) warnings.push('priceSource');
      if (serviceArea) warnings.push('serviceArea');
      if (deliveryAddress) warnings.push('deliveryAddress');
      if (categoriesSupplied && categoriesSupplied.length > 0) warnings.push('categoriesSupplied');
      if (brandsSupplied) warnings.push('brandsSupplied');
      if (orderingChannel) warnings.push('orderingChannel');
      if (notes) warnings.push('notes');
    }

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
      warnings: warnings.length > 0 ? warnings : undefined,
      migrationRequired: warnings.length > 0 ? 'Some fields could not be saved. Admin must apply migration 014.' : undefined,
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

    // RCAT-SUP-FORM-001: Check if migration 014 columns exist for graceful degradation
    const extendedColumnsExist = await checkMigration014Applied();
    const warnings: string[] = [];

    // Build update query for supplier.suppliers (only if not verified)
    const supplierUpdates: string[] = [];
    const supplierParams: (string | boolean | null)[] = [];
    let paramIndex = 1;

    if (!isVerified) {
      // Section A fields (base migration 003 columns)
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
      // Section A extended fields (migration 014)
      if (fssai !== undefined) {
        if (extendedColumnsExist) {
          supplierUpdates.push(`fssai = $${paramIndex++}`);
          supplierParams.push(fssai?.trim() || null);
        } else if (fssai) {
          warnings.push('fssai');
        }
      }

      // Section B fields (contact & address - base migration 003)
      if (primaryPhone !== undefined || phone !== undefined) {
        const effectivePhone = primaryPhone || phone;
        supplierUpdates.push(`primary_phone = $${paramIndex++}`);
        supplierParams.push(effectivePhone?.trim() || null);
      }
      // Section B extended fields (migration 014)
      if (whatsappEnabled !== undefined) {
        if (extendedColumnsExist) {
          supplierUpdates.push(`whatsapp_enabled = $${paramIndex++}`);
          supplierParams.push(whatsappEnabled);
        } else if (whatsappEnabled) {
          warnings.push('whatsappEnabled');
        }
      }
      if (secondaryPhone !== undefined) {
        if (extendedColumnsExist) {
          supplierUpdates.push(`secondary_phone = $${paramIndex++}`);
          supplierParams.push(secondaryPhone?.trim() || null);
        } else if (secondaryPhone) {
          warnings.push('secondaryPhone');
        }
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
      // Section B extended field (migration 014)
      if (area !== undefined) {
        if (extendedColumnsExist) {
          supplierUpdates.push(`area = $${paramIndex++}`);
          supplierParams.push(area?.trim() || null);
        } else if (area) {
          warnings.push('area');
        }
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

    // Section C: Commercial Terms (base migration 003 columns)
    if (creditDays !== undefined) {
      linkUpdates.push(`credit_days = $${linkParamIndex++}`);
      linkParams.push(parseInt(String(creditDays), 10) || 0);
    }
    if (minOrderValue !== undefined) {
      linkUpdates.push(`min_order_value = $${linkParamIndex++}`);
      linkParams.push(parseInt(String(minOrderValue), 10) || 0);
    }

    // Section C: Commercial Terms (migration 014 columns)
    if (paymentTerms !== undefined) {
      if (extendedColumnsExist) {
        linkUpdates.push(`payment_terms = $${linkParamIndex++}`);
        linkParams.push(paymentTerms || 'Cash');
      } else if (paymentTerms && paymentTerms !== 'Cash') {
        warnings.push('paymentTerms');
      }
    }
    if (deliveryCharges !== undefined) {
      if (extendedColumnsExist) {
        linkUpdates.push(`delivery_charges = $${linkParamIndex++}`);
        linkParams.push(parseInt(String(deliveryCharges), 10) || 0);
      } else if (parseInt(String(deliveryCharges), 10) > 0) {
        warnings.push('deliveryCharges');
      }
    }
    if (deliverySchedule !== undefined) {
      if (extendedColumnsExist) {
        linkUpdates.push(`delivery_schedule = $${linkParamIndex++}`);
        linkParams.push(deliverySchedule?.trim() || null);
      } else if (deliverySchedule) {
        warnings.push('deliverySchedule');
      }
    }
    if (returnsAllowed !== undefined) {
      if (extendedColumnsExist) {
        linkUpdates.push(`returns_allowed = $${linkParamIndex++}`);
        linkParams.push(returnsAllowed);
      } else if (returnsAllowed) {
        warnings.push('returnsAllowed');
      }
    }
    if (returnsWindow !== undefined) {
      if (extendedColumnsExist) {
        linkUpdates.push(`returns_window = $${linkParamIndex++}`);
        linkParams.push(parseInt(String(returnsWindow), 10) || 0);
      } else if (parseInt(String(returnsWindow), 10) > 0) {
        warnings.push('returnsWindow');
      }
    }
    if (taxInvoiceProvided !== undefined) {
      if (extendedColumnsExist) {
        linkUpdates.push(`tax_invoice_provided = $${linkParamIndex++}`);
        linkParams.push(taxInvoiceProvided);
      } else if (taxInvoiceProvided) {
        warnings.push('taxInvoiceProvided');
      }
    }
    if (priceSource !== undefined) {
      if (extendedColumnsExist) {
        linkUpdates.push(`price_source = $${linkParamIndex++}`);
        linkParams.push(priceSource?.trim() || null);
      } else if (priceSource) {
        warnings.push('priceSource');
      }
    }
    if (serviceArea !== undefined) {
      if (extendedColumnsExist) {
        linkUpdates.push(`service_area = $${linkParamIndex++}`);
        linkParams.push(serviceArea?.trim() || null);
      } else if (serviceArea) {
        warnings.push('serviceArea');
      }
    }
    if (deliveryAddress !== undefined) {
      if (extendedColumnsExist) {
        linkUpdates.push(`delivery_address = $${linkParamIndex++}`);
        linkParams.push(deliveryAddress?.trim() || null);
      } else if (deliveryAddress) {
        warnings.push('deliveryAddress');
      }
    }

    // Section D: Operational Metadata (migration 014 columns)
    if (categoriesSupplied !== undefined) {
      if (extendedColumnsExist) {
        linkUpdates.push(`categories_supplied = $${linkParamIndex++}`);
        linkParams.push(JSON.stringify(categoriesSupplied || []));
      } else if (categoriesSupplied && categoriesSupplied.length > 0) {
        warnings.push('categoriesSupplied');
      }
    }
    if (brandsSupplied !== undefined) {
      if (extendedColumnsExist) {
        linkUpdates.push(`brands_supplied = $${linkParamIndex++}`);
        linkParams.push(brandsSupplied?.trim() || null);
      } else if (brandsSupplied) {
        warnings.push('brandsSupplied');
      }
    }
    if (orderingChannel !== undefined) {
      if (extendedColumnsExist) {
        linkUpdates.push(`ordering_channel = $${linkParamIndex++}`);
        linkParams.push(orderingChannel?.trim() || null);
      } else if (orderingChannel) {
        warnings.push('orderingChannel');
      }
    }
    if (notes !== undefined) {
      if (extendedColumnsExist) {
        linkUpdates.push(`notes = $${linkParamIndex++}`);
        linkParams.push(notes?.trim() || null);
      } else if (notes) {
        warnings.push('notes');
      }
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
      warnings: warnings.length > 0 ? warnings : undefined,
      migrationRequired: warnings.length > 0 ? 'Some fields could not be saved. Admin must apply migration 014.' : undefined,
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
          // PORTAL-AUTH-001: Use primary_phone column (not phone) - matches supplier.suppliers schema
          if (supplierPhone) {
            const existing = await query<{ id: string }>(
              `SELECT id FROM supplier.suppliers WHERE primary_phone = $1`,
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
