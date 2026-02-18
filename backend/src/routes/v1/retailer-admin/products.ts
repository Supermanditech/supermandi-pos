// Retailer Admin Products Routes
// RCAT-PROD-001: Save Product + Cancel (Packaged)
// RCAT-PROD-002: Pack Unit custom option
// RCAT-PROD-003: Product Edit flow
// RCAT-PROD-004: Product Delete flow
// RCAT-LOOSE-001: Loose/Bulk product create
// RCAT-BULK-002: Bulk paste import
// GO-LIVE-132: Store-scoped via JWT (x-actor-id header from gateway)

import { Router, Request, Response } from "express";
import { getPool } from "../../../db/client";
import { getStoreId, requireStoreContext } from "../../../middleware/retailerStoreContext";
import {
  sanitizeHtml,
  validateSearchQuery,
  validateBarcode,
  validateCategoryId,
  validatePrice,
} from "@supermandi/common";
import { log } from "../../../lib/logger";
import { asError } from "../../../lib/errorUtils";
import {
  validateProductName as validateProductNameUnified,
  validateBarcode as validateBarcodeUnified,
  validatePrice as validatePriceUnified,
  validateStock as validateStockUnified,
} from "../../../utils/productValidation";

export const retailerAdminProductsRouter = Router();

// GO-LIVE-132: Apply store context middleware to all routes
retailerAdminProductsRouter.use(requireStoreContext);

/**
 * Generate a store-scoped barcode for LOOSE_BULK products
 * Format: 2{storePrefix}{sequence} - uses internal barcode prefix "2" per GS1 rules
 */
function generateStoreBarcode(storeId: string): string {
  const storePrefix = storeId.replace(/-/g, '').substring(0, 6);
  const timestamp = Date.now().toString().slice(-7);
  const random = Math.floor(Math.random() * 100).toString().padStart(2, '0');
  return `2${storePrefix}${timestamp}${random}`;
}

/**
 * Safe numeric conversion - never returns NaN
 */
function safeNumber(val: unknown, defaultVal = 0): number {
  if (val === null || val === undefined) return defaultVal;
  const num = Number(val);
  return isNaN(num) ? defaultVal : num;
}

// =============================================================================
// GET /api/v1/retailer-admin/products
// List all products for the store (with optional category/search filter)
// =============================================================================

retailerAdminProductsRouter.get("/products", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: { code: "INTERNAL_ERROR", message: "Database unavailable" } });

  // GO-LIVE-132: Store ID now guaranteed by requireStoreContext middleware
  const storeId = req.storeId!;

  const { categoryId, search, limit, offset } = req.query;
  const limitNum = Math.min(parseInt(limit as string, 10) || 200, 500);
  // AUD-064-B FIX: Ensure offset is non-negative
  const offsetNum = Math.max(parseInt(offset as string, 10) || 0, 0);

  try {
    let whereClause = "WHERE sp.store_id = $1 AND sp.is_active = true";
    const params: any[] = [storeId];
    let paramIndex = 2;

    if (categoryId && categoryId !== 'all') {
      // RCAT-CAT-001: Filter by taxonomy_id (UUID from fmcg_taxonomy)
      // Handle "Baaki" (Others) category - products with null taxonomy_id
      if (categoryId === 'f0000000-0000-0000-0000-00000000000f') {
        whereClause += ` AND sp.taxonomy_id IS NULL`;
      } else {
        whereClause += ` AND sp.taxonomy_id = $${paramIndex}`;
        params.push(categoryId);
        paramIndex++;
      }
    }

    // GO-LIVE-158: Validate and sanitize search query to prevent regex DoS
    if (search && typeof search === 'string' && search.trim()) {
      const searchValidation = validateSearchQuery(search);
      if (searchValidation.valid && searchValidation.value) {
        const term = `%${searchValidation.value}%`;
        whereClause += ` AND (p.name ILIKE $${paramIndex} OR sp.display_name ILIKE $${paramIndex} OR p.primary_barcode ILIKE $${paramIndex} OR COALESCE(sp.brand, p.brand) ILIKE $${paramIndex})`;
        params.push(term);
        paramIndex++;
      }
    }

    const result = await pool.query(
      `SELECT
        sp.id,
        sp.product_id as "productId",
        COALESCE(sp.display_name, p.name) as name,
        p.description,
        COALESCE(sp.brand, p.brand) as brand,
        p.category,
        p.unit,
        p.primary_barcode as "barcode",
        p.pack_size as "packSize",
        p.pack_unit as "packUnit",
        p.hsn_code as "hsn",
        p.default_gst_rate as "gstPercent",
        sp.product_mode as "mode",
        COALESCE(sp.sell_price, 0) as "sellPrice",
        COALESCE(sp.mrp, 0) as "mrp",
        COALESCE(sp.purchase_price, 0) as "purchasePrice",
        COALESCE(sb.current_qty, sp.current_stock, 0) as "stock",
        sp.low_stock_alert_qty as "lowStockAlertQty",
        sp.notes,
        sp.sold_by as "soldBy",
        sp.rate_unit as "rateUnit",
        sp.supplier_id as "supplierId",
        sp.taxonomy_id as "categoryId",
        sp.display_name as "alias",
        sp.metadata_updated_at as "metadataUpdatedAt",
        spb.barcode as "generatedBarcode"
      FROM catalog.store_products sp
      INNER JOIN catalog.products p ON p.id = sp.product_id
      LEFT JOIN inventory.stock_balances sb ON sb.store_id = sp.store_id AND sb.product_id = sp.product_id
      LEFT JOIN catalog.store_product_barcodes spb ON spb.store_product_id = sp.id AND spb.store_id = sp.store_id
      ${whereClause}
      ORDER BY sp.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limitNum, offsetNum]
    );

    // Get supplier names if needed
    const supplierIds = result.rows
      .filter(r => r.supplierId)
      .map(r => r.supplierId);

    let supplierMap: Record<string, string> = {};
    if (supplierIds.length > 0) {
      const supplierResult = await pool.query(
        `SELECT id, business_name FROM supplier.suppliers WHERE id = ANY($1)`,
        [supplierIds]
      );
      supplierMap = Object.fromEntries(
        supplierResult.rows.map(s => [s.id, s.business_name])
      );
    }

    const data = result.rows.map(row => ({
      ...row,
      sellPrice: safeNumber(row.sellPrice),
      purchasePrice: safeNumber(row.purchasePrice),
      mrp: safeNumber(row.mrp),
      stock: safeNumber(row.stock),
      supplierName: row.supplierId ? (supplierMap[row.supplierId] || null) : null,
    }));

    // GO-LIVE-261: Add lastUpdated timestamp for data freshness
    return res.json({
      success: true,
      data,
      count: data.length,
      lastUpdated: new Date().toISOString(),
    });
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[RetailerProducts] GET error:", error.message);

    if (error.code === "42P01" || error.code === "42703") {
      // Table or column doesn't exist
      return res.json({ success: true, data: [], count: 0 });
    }

    return res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Failed to load products" },
    });
  }
});

// =============================================================================
// POST /api/v1/retailer-admin/products
// RCAT-PROD-001: Create product (PACKAGED or LOOSE_BULK)
// Creates: product + store_product + barcode entry + opening stock ledger entry
// =============================================================================

retailerAdminProductsRouter.post("/products", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: { code: "INTERNAL_ERROR", message: "Database unavailable" } });

  const storeId = getStoreId(req);
  if (!storeId) {
    return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Store not identified" } });
  }

  const {
    mode, barcode, name, description, brand, alias, unit,
    purchasePrice, sellPrice, mrp, openingStockQty,
    supplierId, lowStockAlertQty, gstPercent, hsn, notes,
    packSize, packUnit, soldBy, rateUnit,
    categoryId, // RCAT-CAT-002: Store override for taxonomy_id
  } = req.body;

  // AUD-059-A/B FIX: Input validation bounds
  const MAX_PRICE_MINOR = 1000000000; // 10M INR = 1B paise
  const MAX_NAME_LENGTH = 200;
  const MAX_DESCRIPTION_LENGTH = 500;
  const MAX_BRAND_LENGTH = 100;

  // T-186: Validate required fields using unified product validation
  const nameValidation = validateProductNameUnified(name || '');
  if (!nameValidation.valid) {
    return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: nameValidation.error || "Product name is required" } });
  }
  // AUD-059-B FIX: Name length bounds (kept for backward compat, unified validator also checks)
  if (name && name.trim().length > MAX_NAME_LENGTH) {
    return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: `Product name exceeds ${MAX_NAME_LENGTH} characters` } });
  }
  // GO-LIVE-147: Sanitize product name for XSS prevention
  const sanitizedName = sanitizeHtml(name.trim());
  const sanitizedDescription = description ? sanitizeHtml(description.trim()) : null;
  const sanitizedBrand = brand ? sanitizeHtml(brand.trim()) : null;

  // AUD-059-B FIX: Description length bounds
  if (description && description.length > MAX_DESCRIPTION_LENGTH) {
    return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: `Description exceeds ${MAX_DESCRIPTION_LENGTH} characters` } });
  }
  // AUD-059-B FIX: Brand length bounds
  if (brand && brand.length > MAX_BRAND_LENGTH) {
    return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: `Brand exceeds ${MAX_BRAND_LENGTH} characters` } });
  }
  // GO-LIVE-148 + T-186: Barcode validation with both common and unified validators
  const barcodeValidation = validateBarcode(barcode);
  if (!barcodeValidation.valid) {
    return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: barcodeValidation.error } });
  }
  const validatedBarcode = barcodeValidation.value;
  // T-186: Additional unified barcode format check (EAN/UPC/custom)
  if (validatedBarcode) {
    const unifiedBarcodeCheck = validateBarcodeUnified(validatedBarcode);
    if (!unifiedBarcodeCheck.valid) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: unifiedBarcodeCheck.error } });
    }
  }

  // T-186: Unified price validation for sell price
  if (!sellPrice || sellPrice <= 0) {
    return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Valid sell price is required" } });
  }
  const sellPriceValidation = validatePriceUnified(sellPrice);
  if (!sellPriceValidation.valid) {
    return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: sellPriceValidation.error || "Sell price exceeds maximum allowed value" } });
  }

  // T-186: Unified price validation for purchase price
  if (!purchasePrice || purchasePrice <= 0) {
    return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Valid purchase price is required for ledger tracking" } });
  }
  const purchasePriceValidation = validatePriceUnified(purchasePrice);
  if (!purchasePriceValidation.valid) {
    return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: purchasePriceValidation.error || "Purchase price exceeds maximum allowed value" } });
  }
  // AUD-059-A FIX: MRP bounds
  if (mrp !== undefined && mrp !== null && (mrp < 0 || mrp > MAX_PRICE_MINOR)) {
    return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "MRP exceeds maximum allowed value" } });
  }

  // GO-LIVE-015: Validate opening stock is non-negative
  const MAX_OPENING_STOCK = 1000000; // 1 million units max
  const parsedOpeningStock = parseInt(openingStockQty);
  if (openingStockQty !== undefined && openingStockQty !== null && openingStockQty !== '') {
    if (isNaN(parsedOpeningStock) || parsedOpeningStock < 0) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Opening stock must be a non-negative number" } });
    }
    if (parsedOpeningStock > MAX_OPENING_STOCK) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: `Opening stock exceeds maximum allowed value of ${MAX_OPENING_STOCK}` } });
    }
  }

  const productMode = mode || 'PACKAGED';
  const stockQty = parsedOpeningStock || 0;

  // GO-LIVE-162: Validate category ID format if provided
  if (categoryId !== undefined && categoryId !== null && categoryId !== '') {
    const categoryValidation = validateCategoryId(categoryId);
    if (!categoryValidation.valid) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: categoryValidation.error }
      });
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Create the master product
    // GO-LIVE-147/148: Use sanitized values for XSS prevention and validated barcode
    const productResult = await client.query(
      `INSERT INTO catalog.products (
        name, description, brand, category, unit, pack_size, pack_unit,
        primary_barcode, hsn_code, default_gst_rate, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true)
      RETURNING id`,
      [
        sanitizedName,
        sanitizedDescription,
        sanitizedBrand,
        null, // category auto-derived later
        unit || 'PCS',
        packSize ? parseInt(packSize) : null,
        packUnit?.trim() || null,
        productMode === 'PACKAGED' && validatedBarcode ? validatedBarcode : null,
        hsn?.trim() || null,
        gstPercent !== undefined && gstPercent !== '' ? parseFloat(gstPercent) : null,
      ]
    );
    const productId = productResult.rows[0].id;

    // T-054: Auto-assign taxonomy if not explicitly provided (matches POS digitisation behavior)
    let resolvedCategoryId = categoryId || null;
    if (!resolvedCategoryId) {
      try {
        const taxonomyResult = await client.query(
          `SELECT catalog.assign_taxonomy_by_name($1) AS taxonomy_id`,
          [sanitizedName]
        );
        resolvedCategoryId = taxonomyResult.rows[0]?.taxonomy_id || null;
      } catch {
        // Taxonomy function may not exist — safe to ignore, product gets "Baaki" (Others)
      }
    }

    // 2. Create the store_product mapping
    // RCAT-CAT-002: Include taxonomy_id for category assignment (store override)
    // SYNC-PRD-001: Set display_name = name so product is immediately visible with correct name
    // GO-LIVE-147: Use sanitized name for display_name
    const storeProductResult = await client.query(
      `INSERT INTO catalog.store_products (
        store_id, product_id, sell_price, mrp, purchase_price,
        product_mode, current_stock, is_active,
        low_stock_alert_qty, notes, sold_by, rate_unit, supplier_id, taxonomy_id,
        display_name, metadata_updated_at, metadata_updated_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, $9, $10, $11, $12, $13, $14, NOW(), 'RETAILER_DASHBOARD')
      RETURNING id`,
      [
        storeId,
        productId,
        safeNumber(sellPrice),
        mrp ? safeNumber(mrp) : null,
        safeNumber(purchasePrice),
        productMode,
        stockQty,
        lowStockAlertQty ? parseInt(lowStockAlertQty) : null,
        notes ? sanitizeHtml(notes.trim()) : null,
        productMode === 'LOOSE_BULK' ? (soldBy || 'WEIGHT') : null,
        productMode === 'LOOSE_BULK' ? (rateUnit || 'KG') : null,
        supplierId || null,
        resolvedCategoryId,
        sanitizedName,
      ]
    );
    const storeProductId = storeProductResult.rows[0].id;

    // 3. Create barcode entry
    // GO-LIVE-148: Use validated barcode
    let generatedBarcode: string | null = null;
    if (productMode === 'PACKAGED' && validatedBarcode) {
      // Store the manufacturer barcode
      await client.query(
        `INSERT INTO catalog.store_product_barcodes (store_id, store_product_id, barcode, source)
         VALUES ($1, $2, $3, 'retailer_digitisation')
         ON CONFLICT (store_id, barcode) DO NOTHING`,
        [storeId, storeProductId, validatedBarcode]
      );
    } else if (productMode === 'LOOSE_BULK') {
      // Generate a store-scoped barcode
      generatedBarcode = generateStoreBarcode(storeId);
      await client.query(
        `INSERT INTO catalog.store_product_barcodes (store_id, store_product_id, barcode, source)
         VALUES ($1, $2, $3, 'supermandi_generated')`,
        [storeId, storeProductId, generatedBarcode]
      );
    }

    // 4. Create opening stock ledger entry if qty > 0 (R6: only create ledger when > 0)
    let ledgerEntryId: string | null = null;
    if (stockQty > 0) {
      const ledgerResult = await client.query(
        `INSERT INTO inventory.inventory_ledger (
          store_id, product_id, delta_qty, transaction_type,
          reference_type, stock_before, stock_after, unit_cost, source
        ) VALUES ($1, $2, $3, 'opening_stock', 'manual', 0, $3, $4, 'RETAILER_DASHBOARD')
        RETURNING id`,
        [storeId, productId, stockQty, safeNumber(purchasePrice)]
      );
      ledgerEntryId = ledgerResult.rows[0].id;
    }

    // 5. Always create stock_balances record (R6: consistent stock resolution for POS search JOIN)
    await client.query(
      `INSERT INTO inventory.stock_balances (store_id, product_id, current_qty, last_ledger_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (store_id, product_id) DO UPDATE SET
         current_qty = EXCLUDED.current_qty,
         last_ledger_id = COALESCE(EXCLUDED.last_ledger_id, inventory.stock_balances.last_ledger_id),
         updated_at = NOW()`,
      [storeId, productId, stockQty, ledgerEntryId]
    );

    await client.query("COMMIT");

    return res.status(201).json({
      ok: true,
      data: {
        storeId,
        productId,
        barcode: productMode === 'PACKAGED' ? (validatedBarcode || null) : null,
        generatedBarcode,
        ledgerEntryId,
        storeProduct: {
          productId,
          mode: productMode,
          name: sanitizedName,
          sellPrice: safeNumber(sellPrice),
          purchasePrice: safeNumber(purchasePrice),
          currentStock: stockQty,
        },
      },
    });
  } catch (_error: unknown) {
    const error = asError(_error);
    await client.query("ROLLBACK");
    log.error("[RetailerProducts] POST error:", error.message);

    if (error.code === "23505") {
      // Unique violation - likely barcode conflict
      if (error.constraint?.includes('barcode')) {
        return res.status(409).json({
          error: { code: "CONFLICT", message: "This barcode is already assigned to another product in your store" },
        });
      }
      return res.status(409).json({
        error: { code: "CONFLICT", message: "Product already exists" },
      });
    }
    if (error.code === "23514") {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Invalid field value" },
      });
    }

    return res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Failed to create product" },
    });
  } finally {
    client.release();
  }
});

// =============================================================================
// PATCH /api/v1/retailer-admin/products/:id
// RCAT-PROD-003: Update an existing product
// =============================================================================

retailerAdminProductsRouter.patch("/products/:id", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: { code: "INTERNAL_ERROR", message: "Database unavailable" } });

  const storeId = getStoreId(req);
  if (!storeId) {
    return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Store not identified" } });
  }

  const { id } = req.params;
  const {
    name, description, brand, unit, sellPrice, mrp, purchasePrice,
    lowStockAlertQty, gstPercent, hsn, notes,
    packSize, packUnit, soldBy, rateUnit, supplierId,
    categoryId, // RCAT-CAT-002: Store override for taxonomy_id
    openingStockQty, // Stock level update (absolute)
    mode, // PACKAGED or LOOSE_BULK
    alias, // Store-level display name
    metadataUpdatedAt, // AUD-025-B: ISO timestamp for last-write-wins comparison
    stockUpdatedAt, // RET-POS-SYNC-012: ISO timestamp for stock LWW comparison
  } = req.body;

  // AUD-025-B: Parse incoming timestamp for LWW comparison
  const incomingTimestamp = metadataUpdatedAt ? new Date(metadataUpdatedAt) : null;
  const validIncomingTimestamp = incomingTimestamp && !isNaN(incomingTimestamp.getTime()) ? incomingTimestamp : null;

  // GO-LIVE-162: Validate category ID format if provided
  if (categoryId !== undefined && categoryId !== null && categoryId !== '') {
    const categoryValidation = validateCategoryId(categoryId);
    if (!categoryValidation.valid) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: categoryValidation.error }
      });
    }
  }

  const client = await pool.connect();
  try {
    // Verify product belongs to this store
    const check = await client.query(
      `SELECT sp.id, sp.product_id
       FROM catalog.store_products sp
       WHERE sp.id = $1 AND sp.store_id = $2 AND sp.is_active = true`,
      [id, storeId]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Product not found in your store" },
      });
    }

    const productId = check.rows[0].product_id;

    await client.query("BEGIN");

    // Update master product fields
    await client.query(
      `UPDATE catalog.products SET
        name = COALESCE($2, name),
        description = $3,
        brand = $4,
        unit = COALESCE($5, unit),
        pack_size = $6,
        pack_unit = $7,
        hsn_code = $8,
        default_gst_rate = $9,
        updated_at = NOW()
      WHERE id = $1`,
      [
        productId,
        name?.trim() || null,
        description?.trim() || null,
        brand?.trim() || null,
        unit || null,
        packSize !== undefined ? (packSize ? parseInt(packSize) : null) : null,
        packUnit?.trim() || null,
        hsn?.trim() || null,
        gstPercent !== undefined && gstPercent !== '' ? parseFloat(gstPercent) : null,
      ]
    );

    // Update store_product fields
    // RCAT-CAT-002: Include taxonomy_id for category assignment (store override)
    // SYNC-PRD-001: display_name is the authoritative name for both POS and Dashboard
    // "Product Name" from the form is the display name shown everywhere
    const resolvedDisplayName = name?.trim() || alias?.trim() || null;
    // MT-8: Store-level brand override
    const resolvedBrand = brand?.trim() || null;

    // AUD-025-B: Build LWW guard clause if timestamp provided AND metadata field is being updated
    const isMetadataUpdate = resolvedDisplayName || resolvedBrand;
    const lwwGuard = (isMetadataUpdate && validIncomingTimestamp)
      ? `AND (metadata_updated_at IS NULL OR metadata_updated_at < $15)`
      : "";

    // SYNC-PRD-001: Only update metadata_updated_at when display_name actually changes
    // AUD-025-B: Apply LWW guard when updating metadata with client timestamp
    // MT-8: Include brand in store-level metadata updates
    const updateParams: any[] = [
      id,
      storeId,
      sellPrice !== undefined ? safeNumber(sellPrice) : null,
      mrp !== undefined ? (mrp ? safeNumber(mrp) : null) : null,
      purchasePrice !== undefined ? safeNumber(purchasePrice) : null,
      lowStockAlertQty !== undefined ? (lowStockAlertQty ? parseInt(lowStockAlertQty) : null) : null,
      notes?.trim() || null,
      soldBy || null,
      rateUnit || null,
      supplierId || null,
      categoryId || null,
      mode || null,
      resolvedDisplayName,
      resolvedBrand,
    ];
    if (isMetadataUpdate && validIncomingTimestamp) {
      updateParams.push(validIncomingTimestamp.toISOString());
    }

    const storeProductUpdate = await client.query(
      `UPDATE catalog.store_products SET
        sell_price = COALESCE($3, sell_price),
        mrp = $4,
        purchase_price = COALESCE($5, purchase_price),
        low_stock_alert_qty = $6,
        notes = $7,
        sold_by = $8,
        rate_unit = $9,
        supplier_id = $10,
        taxonomy_id = COALESCE($11, taxonomy_id),
        product_mode = COALESCE($12, product_mode),
        display_name = COALESCE($13, display_name),
        brand = COALESCE($14, brand),
        metadata_updated_at = CASE WHEN $13 IS NOT NULL OR $14 IS NOT NULL THEN NOW() ELSE metadata_updated_at END,
        metadata_updated_by = CASE WHEN $13 IS NOT NULL OR $14 IS NOT NULL THEN 'RETAILER_DASHBOARD' ELSE metadata_updated_by END,
        updated_at = NOW()
      WHERE id = $1 AND store_id = $2 ${lwwGuard}
      RETURNING id, metadata_updated_at`,
      updateParams
    );

    // AUD-025-B: Check for LWW conflict (0 rows updated when product exists)
    if ((storeProductUpdate.rowCount ?? 0) === 0 && isMetadataUpdate && validIncomingTimestamp) {
      // Product exists (we checked earlier), so this must be a timestamp conflict
      const existsCheck = await client.query(
        `SELECT id, metadata_updated_at FROM catalog.store_products WHERE id = $1 AND store_id = $2 AND is_active = true`,
        [id, storeId]
      );
      if (existsCheck.rowCount && existsCheck.rowCount > 0) {
        await client.query("ROLLBACK");
        // AUD-025-B: Stale update rejected with spec-compliant response
        return res.status(409).json({
          error: "stale_write",
          message: "Stale update rejected - server has newer data",
          incomingMetadataUpdatedAt: validIncomingTimestamp.toISOString(),
          currentMetadataUpdatedAt: existsCheck.rows[0].metadata_updated_at,
          entity: "store_product",
          storeProductId: existsCheck.rows[0].id
        });
      }
    }

    // Stock update: openingStockQty sets absolute stock level via ledger-first pattern
    if (openingStockQty !== undefined && typeof openingStockQty === 'number' && openingStockQty >= 0) {
      const stockResult = await client.query(
        `SELECT current_qty, updated_at FROM inventory.stock_balances WHERE store_id = $1 AND product_id = $2`,
        [storeId, productId]
      );
      const stockBefore = stockResult.rows[0]?.current_qty ?? 0;
      const serverStockUpdatedAt = stockResult.rows[0]?.updated_at;

      // RET-POS-SYNC-012: LWW guard — reject stale stock writes if client provides timestamp
      if (stockUpdatedAt && serverStockUpdatedAt) {
        const incoming = new Date(stockUpdatedAt);
        const server = new Date(serverStockUpdatedAt);
        if (!isNaN(incoming.getTime()) && server > incoming) {
          await client.query("ROLLBACK");
          return res.status(409).json({
            error: "stale_write",
            message: "Stale stock update rejected - server has newer data",
            incomingStockUpdatedAt: stockUpdatedAt,
            currentStockUpdatedAt: serverStockUpdatedAt,
          });
        }
      }

      const delta = openingStockQty - stockBefore;

      if (delta !== 0) {
        // Ledger entry for audit trail (only when stock actually changes)
        await client.query(
          `INSERT INTO inventory.inventory_ledger
           (store_id, product_id, delta_qty, transaction_type, stock_before, stock_after, unit_cost, source, notes)
           VALUES ($1, $2, $3, 'adjustment', $4, $5, $6, 'RETAILER_PORTAL', 'Stock updated from retailer dashboard')`,
          [storeId, productId, delta, stockBefore, openingStockQty, purchasePrice ? safeNumber(purchasePrice) : 0]
        );
      }

      // Always ensure stock_balances record exists (POS reads from this table)
      await client.query(
        `INSERT INTO inventory.stock_balances (store_id, product_id, current_qty)
         VALUES ($1, $2, $3)
         ON CONFLICT (store_id, product_id) DO UPDATE SET current_qty = $3, updated_at = NOW()`,
        [storeId, productId, openingStockQty]
      );

      // Always update denormalized stock for consistency
      await client.query(
        `UPDATE catalog.store_products SET current_stock = $3, updated_at = NOW() WHERE id = $1 AND store_id = $2`,
        [id, storeId, openingStockQty]
      );
    }

    await client.query("COMMIT");

    return res.json({
      ok: true,
      data: { id, productId },
      message: "Product updated successfully",
    });
  } catch (_error: unknown) {
    const error = asError(_error);
    await client.query("ROLLBACK");
    log.error("[RetailerProducts] PATCH error:", error.message);

    return res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Failed to update product" },
    });
  } finally {
    client.release();
  }
});

// =============================================================================
// DELETE /api/v1/retailer-admin/products/:id
// RCAT-PROD-004: Soft-delete a product (hide from store)
// =============================================================================

retailerAdminProductsRouter.delete("/products/:id", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: { code: "INTERNAL_ERROR", message: "Database unavailable" } });

  const storeId = getStoreId(req);
  if (!storeId) {
    return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Store not identified" } });
  }

  const { id } = req.params;

  try {
    const result = await pool.query(
      `UPDATE catalog.store_products
       SET is_active = false, updated_at = NOW()
       WHERE id = $1 AND store_id = $2 AND is_active = true
       RETURNING id, product_id`,
      [id, storeId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Product not found or already deleted" },
      });
    }

    return res.json({
      success: true,
      message: "Product removed from store",
    });
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[RetailerProducts] DELETE error:", error.message);

    return res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Failed to delete product" },
    });
  }
});

// =============================================================================
// POST /api/v1/retailer-admin/products/bulk
// RCAT-BULK-002: Bulk paste import (preview + commit combined)
// =============================================================================

retailerAdminProductsRouter.post("/products/bulk", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: { code: "INTERNAL_ERROR", message: "Database unavailable" } });

  const storeId = getStoreId(req);
  if (!storeId) {
    return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Store not identified" } });
  }

  const { products } = req.body;
  if (!Array.isArray(products) || products.length === 0) {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "No products provided" },
    });
  }

  if (products.length > 500) {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "Maximum 500 products per bulk import" },
    });
  }

  const client = await pool.connect();
  let imported = 0;
  let skipped = 0;
  const errors: { row: number; error: string }[] = [];

  try {
    await client.query("BEGIN");

    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      if (!p.name || !p.name.trim()) {
        errors.push({ row: i + 1, error: "Name is required" });
        skipped++;
        continue;
      }

      try {
        const productMode = p.mode || (p.barcode ? 'PACKAGED' : 'LOOSE_BULK');
        const pSellPrice = safeNumber(p.sellPrice);
        const pPurchasePrice = safeNumber(p.purchasePrice);
        const pStock = safeNumber(p.stock);

        // Create master product
        const prodResult = await client.query(
          `INSERT INTO catalog.products (name, brand, unit, primary_barcode, is_active)
           VALUES ($1, $2, $3, $4, true)
           RETURNING id`,
          [
            p.name.trim(),
            p.brand?.trim() || null,
            p.unit || 'PCS',
            productMode === 'PACKAGED' && p.barcode ? p.barcode.trim() : null,
          ]
        );
        const productId = prodResult.rows[0].id;

        // Create store_product
        // SYNC-PRD-001: Set display_name so product shows correctly across POS and Dashboard
        const spResult = await client.query(
          `INSERT INTO catalog.store_products (
            store_id, product_id, sell_price, mrp, purchase_price,
            product_mode, current_stock, is_active,
            display_name, metadata_updated_at, metadata_updated_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, NOW(), 'BULK_IMPORT')
          RETURNING id`,
          [storeId, productId, pSellPrice, p.mrp ? safeNumber(p.mrp) : null, pPurchasePrice, productMode, pStock, p.name.trim()]
        );
        const storeProductId = spResult.rows[0].id;

        // Create barcode
        if (productMode === 'PACKAGED' && p.barcode?.trim()) {
          await client.query(
            `INSERT INTO catalog.store_product_barcodes (store_id, store_product_id, barcode, source)
             VALUES ($1, $2, $3, 'retailer_digitisation')
             ON CONFLICT (store_id, barcode) DO NOTHING`,
            [storeId, storeProductId, p.barcode.trim()]
          );
        } else if (productMode === 'LOOSE_BULK') {
          const genBarcode = generateStoreBarcode(storeId);
          await client.query(
            `INSERT INTO catalog.store_product_barcodes (store_id, store_product_id, barcode, source)
             VALUES ($1, $2, $3, 'supermandi_generated')`,
            [storeId, storeProductId, genBarcode]
          );
        }

        // MT-7: Opening stock ledger entry + stock_balances
        let ledgerId: string | null = null;
        if (pStock > 0) {
          const ledgerResult = await client.query(
            `INSERT INTO inventory.inventory_ledger (
              store_id, product_id, delta_qty, transaction_type,
              reference_type, stock_before, stock_after, unit_cost, source
            ) VALUES ($1, $2, $3, 'opening_stock', 'manual', 0, $3, $4, 'BULK_IMPORT')
            RETURNING id`,
            [storeId, productId, pStock, pPurchasePrice]
          );
          ledgerId = ledgerResult.rows[0]?.id ?? null;
        }

        // MT-7: Always create stock_balances for consistent POS search JOIN
        await client.query(
          `INSERT INTO inventory.stock_balances (store_id, product_id, current_qty, last_ledger_id)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (store_id, product_id) DO UPDATE SET
             current_qty = EXCLUDED.current_qty,
             last_ledger_id = COALESCE(EXCLUDED.last_ledger_id, inventory.stock_balances.last_ledger_id),
             updated_at = NOW()`,
          [storeId, productId, pStock, ledgerId]
        );

        imported++;
      } catch (err: any) {
        if (err.code === "23505") {
          errors.push({ row: i + 1, error: `Duplicate barcode: ${p.barcode}` });
        } else {
          errors.push({ row: i + 1, error: err.message?.substring(0, 100) || "Unknown error" });
        }
        skipped++;
      }
    }

    await client.query("COMMIT");

    return res.json({
      success: true,
      imported,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
      message: `Imported ${imported} products${skipped > 0 ? `, ${skipped} skipped` : ''}`,
    });
  } catch (_error: unknown) {
    const error = asError(_error);
    await client.query("ROLLBACK");
    log.error("[RetailerProducts] BULK error:", error.message);

    return res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Bulk import failed" },
    });
  } finally {
    client.release();
  }
});

// =============================================================================
// POST /api/v1/retailer-admin/products/loose
// RCAT-LOOSE-001: Create loose/bulk product (convenience alias, same as POST /products with mode=LOOSE_BULK)
// =============================================================================

retailerAdminProductsRouter.post("/products/loose", async (req: Request, res: Response) => {
  // Set mode to LOOSE_BULK and forward to the main create handler
  req.body.mode = 'LOOSE_BULK';
  // Reuse the same handler logic by calling the main POST handler
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: { code: "INTERNAL_ERROR", message: "Database unavailable" } });

  const storeId = getStoreId(req);
  if (!storeId) {
    return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Store not identified" } });
  }

  const {
    name, description, brand, alias, unit,
    purchasePrice, sellPrice, mrp, openingStockQty,
    supplierId, lowStockAlertQty, gstPercent, hsn, notes,
    soldBy, rateUnit,
  } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Product name is required" } });
  }
  if (!sellPrice || sellPrice <= 0) {
    return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Valid sell price is required" } });
  }
  if (!purchasePrice || purchasePrice <= 0) {
    return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Valid purchase price is required" } });
  }

  // GO-LIVE-015: Validate opening stock is non-negative
  const MAX_OPENING_STOCK = 1000000;
  const parsedOpeningStock = parseInt(openingStockQty);
  if (openingStockQty !== undefined && openingStockQty !== null && openingStockQty !== '') {
    if (isNaN(parsedOpeningStock) || parsedOpeningStock < 0) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Opening stock must be a non-negative number" } });
    }
    if (parsedOpeningStock > MAX_OPENING_STOCK) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: `Opening stock exceeds maximum allowed value of ${MAX_OPENING_STOCK}` } });
    }
  }

  const stockQty = parsedOpeningStock || 0;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const productResult = await client.query(
      `INSERT INTO catalog.products (name, description, brand, unit, is_active)
       VALUES ($1, $2, $3, $4, true) RETURNING id`,
      [name.trim(), description?.trim() || null, brand?.trim() || null, unit || 'KG']
    );
    const productId = productResult.rows[0].id;

    // SYNC-PRD-001: Set display_name so product shows same name across POS and Dashboard
    const spResult = await client.query(
      `INSERT INTO catalog.store_products (
        store_id, product_id, sell_price, mrp, purchase_price,
        product_mode, current_stock, is_active,
        low_stock_alert_qty, notes, sold_by, rate_unit, supplier_id,
        display_name, metadata_updated_at, metadata_updated_by
      ) VALUES ($1, $2, $3, $4, $5, 'LOOSE_BULK', $6, true, $7, $8, $9, $10, $11, $12, NOW(), 'RETAILER_DASHBOARD')
      RETURNING id`,
      [
        storeId, productId,
        safeNumber(sellPrice), mrp ? safeNumber(mrp) : null, safeNumber(purchasePrice),
        stockQty,
        lowStockAlertQty ? parseInt(lowStockAlertQty) : null,
        notes?.trim() || null,
        soldBy || 'WEIGHT', rateUnit || 'KG',
        supplierId || null,
        name.trim(),
      ]
    );
    const storeProductId = spResult.rows[0].id;

    // Generate store-scoped barcode
    const generatedBarcode = generateStoreBarcode(storeId);
    await client.query(
      `INSERT INTO catalog.store_product_barcodes (store_id, store_product_id, barcode, source)
       VALUES ($1, $2, $3, 'supermandi_generated')`,
      [storeId, storeProductId, generatedBarcode]
    );

    // MT-7: Opening stock ledger + stock_balances
    let ledgerEntryId: string | null = null;
    if (stockQty > 0) {
      const ledgerResult = await client.query(
        `INSERT INTO inventory.inventory_ledger (
          store_id, product_id, delta_qty, transaction_type,
          reference_type, stock_before, stock_after, unit_cost, source
        ) VALUES ($1, $2, $3, 'opening_stock', 'manual', 0, $3, $4, 'RETAILER_DASHBOARD')
        RETURNING id`,
        [storeId, productId, stockQty, safeNumber(purchasePrice)]
      );
      ledgerEntryId = ledgerResult.rows[0].id;
    }

    // MT-7: Always create stock_balances for consistent POS search JOIN
    await client.query(
      `INSERT INTO inventory.stock_balances (store_id, product_id, current_qty, last_ledger_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (store_id, product_id) DO UPDATE SET
         current_qty = EXCLUDED.current_qty,
         last_ledger_id = COALESCE(EXCLUDED.last_ledger_id, inventory.stock_balances.last_ledger_id),
         updated_at = NOW()`,
      [storeId, productId, stockQty, ledgerEntryId]
    );

    await client.query("COMMIT");

    return res.status(201).json({
      ok: true,
      data: {
        storeId,
        productId,
        barcode: null,
        generatedBarcode,
        ledgerEntryId,
        storeProduct: {
          productId,
          mode: 'LOOSE_BULK',
          name: name.trim(),
          sellPrice: safeNumber(sellPrice),
          purchasePrice: safeNumber(purchasePrice),
          currentStock: stockQty,
        },
      },
    });
  } catch (_error: unknown) {
    const error = asError(_error);
    await client.query("ROLLBACK");
    log.error("[RetailerProducts] POST /loose error:", error.message);

    return res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Failed to create loose/bulk product" },
    });
  } finally {
    client.release();
  }
});

// =============================================================================
// GET /api/v1/retailer-admin/products/:id/sku.pdf
// RCAT-LOOSE-002: SKU PDF download (barcode label)
// Returns application/pdf with barcode label and product details
// =============================================================================

/**
 * Generate a minimal valid PDF with product barcode label
 * Uses raw PDF format (no external dependencies)
 */
function generateSkuPdf(product: { name: string; brand?: string; unit?: string; barcode: string; priceDisplay: string }): Buffer {
  const name = (product.name || '').substring(0, 40);
  const brand = (product.brand || '').substring(0, 30);
  const barcode = product.barcode;
  const price = product.priceDisplay;
  const unit = product.unit || '';

  // PDF page: 144x85 points (~50mm x 30mm label)
  const pageWidth = 144;
  const pageHeight = 85;

  // Build content stream with text positioning
  const lines: string[] = [];
  lines.push('BT');
  // Product name (bold, centered)
  lines.push('/F1 9 Tf');
  const nameX = Math.max(8, (pageWidth - name.length * 4.5) / 2);
  lines.push(`${nameX} ${pageHeight - 18} Td`);
  lines.push(`(${pdfEscape(name)}) Tj`);

  // Brand (if present)
  if (brand) {
    lines.push('/F1 6 Tf');
    const brandX = Math.max(8, (pageWidth - brand.length * 3) / 2);
    lines.push(`${brandX} ${pageHeight - 28} Td`);
    lines.push(`(${pdfEscape(brand)}) Tj`);
  }

  // Barcode value (large, centered - Code 128 represented as text)
  lines.push('/F2 14 Tf');
  const barcodeX = Math.max(8, (pageWidth - barcode.length * 7) / 2);
  lines.push(`${barcodeX} ${pageHeight - 48} Td`);
  lines.push(`(${pdfEscape(barcode)}) Tj`);

  // Barcode text (small, below barcode)
  lines.push('/F1 7 Tf');
  const bcTextX = Math.max(8, (pageWidth - barcode.length * 3.5) / 2);
  lines.push(`${bcTextX} ${pageHeight - 58} Td`);
  lines.push(`(${pdfEscape(barcode)}) Tj`);

  // Price (bottom right)
  if (price) {
    lines.push('/F1 8 Tf');
    lines.push(`${pageWidth - price.length * 4 - 10} 10 Td`);
    lines.push(`(${pdfEscape(price)}) Tj`);
  }

  // Unit (bottom left)
  if (unit) {
    lines.push('/F1 6 Tf');
    lines.push(`10 10 Td`);
    lines.push(`(${pdfEscape(unit)}) Tj`);
  }

  lines.push('ET');

  // Draw label border
  lines.push('0.5 w');
  lines.push(`4 4 ${pageWidth - 8} ${pageHeight - 8} re S`);

  const contentStream = lines.join('\n');

  // Build PDF objects
  const objects: string[] = [];
  const offsets: number[] = [];
  let pdf = '%PDF-1.4\n';

  // Object 1: Catalog
  offsets.push(pdf.length);
  const obj1 = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
  pdf += obj1;

  // Object 2: Pages
  offsets.push(pdf.length);
  const obj2 = `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`;
  pdf += obj2;

  // Object 3: Page
  offsets.push(pdf.length);
  const obj3 = `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj\n`;
  pdf += obj3;

  // Object 4: Content stream
  offsets.push(pdf.length);
  const streamBytes = Buffer.from(contentStream, 'utf-8');
  const obj4 = `4 0 obj\n<< /Length ${streamBytes.length} >>\nstream\n${contentStream}\nendstream\nendobj\n`;
  pdf += obj4;

  // Object 5: Font (Helvetica)
  offsets.push(pdf.length);
  const obj5 = '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n';
  pdf += obj5;

  // Object 6: Font (Courier for barcode)
  offsets.push(pdf.length);
  const obj6 = '6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>\nendobj\n';
  pdf += obj6;

  // Cross-reference table
  const xrefOffset = pdf.length;
  pdf += 'xref\n';
  pdf += `0 ${offsets.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (const offset of offsets) {
    pdf += `${offset.toString().padStart(10, '0')} 00000 n \n`;
  }

  // Trailer
  pdf += 'trailer\n';
  pdf += `<< /Size ${offsets.length + 1} /Root 1 0 R >>\n`;
  pdf += 'startxref\n';
  pdf += `${xrefOffset}\n`;
  pdf += '%%EOF\n';

  return Buffer.from(pdf, 'utf-8');
}

/**
 * Escape special PDF string characters
 */
function pdfEscape(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

retailerAdminProductsRouter.get("/products/:id/sku.pdf", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: { code: "INTERNAL_ERROR", message: "Database unavailable" } });

  const storeId = getStoreId(req);
  if (!storeId) {
    return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Store not identified" } });
  }

  const { id } = req.params;

  try {
    // Get product details
    // SYNC-PRD-001: Use display_name (store override) for label, fallback to products.name
    const result = await pool.query(
      `SELECT
        COALESCE(sp.display_name, p.name) as name, COALESCE(sp.brand, p.brand) as brand, p.unit,
        sp.sell_price, sp.product_mode,
        COALESCE(spb.barcode, p.primary_barcode) as barcode
      FROM catalog.store_products sp
      INNER JOIN catalog.products p ON p.id = sp.product_id
      LEFT JOIN catalog.store_product_barcodes spb ON spb.store_product_id = sp.id AND spb.store_id = sp.store_id
      WHERE (sp.id = $1 OR sp.product_id = $1) AND sp.store_id = $2 AND sp.is_active = true
      LIMIT 1`,
      [id, storeId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Product not found" },
      });
    }

    const product = result.rows[0];
    const barcodeValue = product.barcode || 'NO-BARCODE';
    const priceDisplay = product.sell_price ? `Rs. ${(product.sell_price / 100).toFixed(2)}` : '';

    // RCAT-LOOSE-002: Generate actual PDF (application/pdf)
    const pdfBuffer = generateSkuPdf({
      name: product.name,
      brand: product.brand,
      unit: product.unit,
      barcode: barcodeValue,
      priceDisplay,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="sku_${barcodeValue}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length.toString());
    return res.send(pdfBuffer);
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[RetailerProducts] SKU PDF error:", error.message);

    return res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Failed to generate SKU label" },
    });
  }
});
