import { Router } from "express";
import { requireDeviceToken } from "../../../middleware/deviceToken";
import { requireActiveStore } from "../../../middleware/storeStatusGate";
import { getPool } from "../../../db/client";
import {
  createStoreProductFromDigitisation,
  type CreateStoreProductInput,
  type CreateStoreProductResult
} from "../../../services/storeProductDigitisationService";
import { log } from "../../../lib/logger";
// V3-HARDEN-130: Store isolation enforcement — every route goes through this
import { assertStoreId } from "../../../services/storeIsolation";
import type { Request as ExpressRequest } from "express";
function getStoreIdFromPosDevice(req: ExpressRequest, operation: string): string {
  const storeId = (req as any).posDevice?.storeId as string | null | undefined;
  assertStoreId(storeId, operation);
  return storeId;
}
// V3-FIX-132: Multilingual search support
import { expandHindiSearchTokens, normalizeQuantityTokens } from "../../../services/searchLocalization";
import {
  validateProductName as validateProductNameUnified,
  validateBarcode as validateBarcodeUnified,
  validatePrice as validatePriceUnified,
  validateStock as validateStockUnified,
} from "../../../utils/productValidation";
import { validatePriceBounds } from "../../../utils/priceBoundsValidator";
import { cacheGet, cacheSet } from "../../../db/redis";

// SCALE-D1: Barcode lookup cache TTL (5 minutes)
const BARCODE_CACHE_TTL = 300;

export const posStoreProductsRouter = Router();

/**
 * BLK-SP1: PostgreSQL NUMERIC type serializes as string in JSON (e.g. "10.000").
 * This helper ensures stock values are always returned as JS numbers in API responses.
 */
function parseStock(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  return isNaN(n) ? 0 : n;
}

// ITER3-003: Stock drift detection threshold (5 units or 10% difference triggers warning)
const STOCK_DRIFT_THRESHOLD = 5;
const STOCK_DRIFT_PERCENT = 0.1;

/**
 * ITER3-003: Log stock drift when stock_balances.current_qty differs from store_products.current_stock
 * This helps detect consistency issues between the authoritative and denormalized stock values.
 */
function logStockDriftIfDetected(params: {
  storeId: string;
  productId: string;
  storeProductId?: string;
  stockBalanceQty: number | null;
  storeProductStock: number | null;
  context: string;
}): void {
  const balanceQty = params.stockBalanceQty ?? 0;
  const productStock = params.storeProductStock ?? 0;
  const diff = Math.abs(balanceQty - productStock);
  const maxStock = Math.max(balanceQty, productStock, 1);
  const percentDiff = diff / maxStock;

  if (diff > STOCK_DRIFT_THRESHOLD || percentDiff > STOCK_DRIFT_PERCENT) {
    log.warn(
      `[ITER3-003] Stock drift detected: store=${params.storeId}, product=${params.productId}, ` +
      `storeProduct=${params.storeProductId || 'N/A'}, stock_balances=${balanceQty}, ` +
      `store_products=${productStock}, diff=${diff}, context=${params.context}`
    );
  }
}

type SuccessResult = Extract<CreateStoreProductResult, { success: true }>;
type ConflictResult = Extract<CreateStoreProductResult, { success: false; error: "CONFLICT" }>;
type ValidationResult = Extract<CreateStoreProductResult, { success: false; error: "VALIDATION" }>;

function isSuccessResult(result: CreateStoreProductResult): result is SuccessResult {
  return result.success;
}

function isConflictResult(result: CreateStoreProductResult): result is ConflictResult {
  return !result.success && "error" in result && result.error === "CONFLICT";
}

/**
 * POST /api/v1/pos/store-products
 * Create a store product during digitisation flow
 *
 * Request body:
 * {
 *   "barcode": "8901030000000",
 *   "name": "Parle-G",
 *   "sellPrice": 10,       // Minor units (paise) - REQUIRED
 *   "mrp": 10,             // Minor units (paise) - optional
 *   "initialStockQty": 48, // REQUIRED
 *   "unit": "pcs",         // optional
 *   "description": "",     // optional
 *   "brand": ""            // optional
 * }
 *
 * Response (201 Created):
 * {
 *   "storeProduct": {
 *     "storeProductId": "...",
 *     "name": "Parle-G",
 *     "barcode": "8901030000000",
 *     "sellPrice": 10,
 *     "mrp": 10,
 *     "stock": { "isKnown": true, "qty": 48 },
 *     "unit": "pcs",
 *     "brand": "",
 *     "description": "",
 *     "imageUrl": ""
 *   }
 * }
 *
 * Response (409 Conflict) - if barcode already mapped for this store:
 * {
 *   "error": "BARCODE_ALREADY_MAPPED",
 *   "message": "Barcode already exists for this store",
 *   "storeProduct": { ... existing product ... }
 * }
 *
 * Response (422 Validation Error):
 * {
 *   "error": "VALIDATION_ERROR",
 *   "message": "Sell price must be positive"
 * }
 */
// BUG-003: Enforce store must be ACTIVE for product creation
posStoreProductsRouter.post("/store-products", requireDeviceToken, requireActiveStore, async (req, res) => {
  const storeId = getStoreIdFromPosDevice(req, "pos/store-products");

  // AUD-073-A FIX: Extract variant and packSize from request body
  // V3-FIX-167: Extract canonical conversion fields
  const {
    barcode,
    name,
    sellPrice,
    purchasePrice,
    mrp,
    initialStockQty,
    unit,
    description,
    brand,
    variant,
    packSize,
    mode,
    procurementUnit,
    procurementPackQty,
    baseStockUnit,
    conversionConfirmed,
  } = req.body as Partial<CreateStoreProductInput & { conversionConfirmed?: boolean }>;

  // AUD-059-A/B FIX: Input validation bounds
  const MAX_PRICE_MINOR = 1000000000; // 10M INR = 1B paise
  const MAX_NAME_LENGTH = 200;
  const MAX_DESCRIPTION_LENGTH = 500;
  const MAX_BRAND_LENGTH = 100;
  const MAX_BARCODE_LENGTH = 50;

  // T-186: Unified barcode validation
  if (typeof barcode !== "string" || barcode.trim().length === 0) {
    return res.status(422).json({
      error: "VALIDATION_ERROR",
      message: "Barcode is required"
    });
  }
  const barcodeCheck = validateBarcodeUnified(barcode.trim());
  if (!barcodeCheck.valid) {
    return res.status(422).json({
      error: "VALIDATION_ERROR",
      message: barcodeCheck.error || `Barcode exceeds maximum length of ${MAX_BARCODE_LENGTH} characters`
    });
  }

  // T-186: Unified product name validation
  if (name && typeof name === "string" && name.trim().length > 0) {
    const nameCheck = validateProductNameUnified(name);
    if (!nameCheck.valid) {
      return res.status(422).json({
        error: "VALIDATION_ERROR",
        message: nameCheck.error || `Product name exceeds maximum length of ${MAX_NAME_LENGTH} characters`
      });
    }
  }

  // AUD-059-B FIX: Description length bounds
  if (description && typeof description === "string" && description.length > MAX_DESCRIPTION_LENGTH) {
    return res.status(422).json({
      error: "VALIDATION_ERROR",
      message: `Description exceeds maximum length of ${MAX_DESCRIPTION_LENGTH} characters`
    });
  }

  // AUD-059-B FIX: Brand length bounds
  if (brand && typeof brand === "string" && brand.length > MAX_BRAND_LENGTH) {
    return res.status(422).json({
      error: "VALIDATION_ERROR",
      message: `Brand exceeds maximum length of ${MAX_BRAND_LENGTH} characters`
    });
  }

  // sellPrice is optional for partial creation (P3: partial allowed, completed on dashboard later)
  if (sellPrice !== undefined && sellPrice !== null) {
    if (typeof sellPrice !== "number" || !Number.isFinite(sellPrice) || sellPrice <= 0) {
      return res.status(422).json({
        error: "VALIDATION_ERROR",
        message: "Sell price must be a positive number when provided"
      });
    }
    // AUD-059-A FIX: Price upper bounds
    if (sellPrice > MAX_PRICE_MINOR) {
      return res.status(422).json({
        error: "VALIDATION_ERROR",
        message: "Sell price exceeds maximum allowed value"
      });
    }
    // SA-P0-003: Global price bounds enforcement
    const sellBoundsCheck = await validatePriceBounds(sellPrice);
    if (!sellBoundsCheck.valid) {
      return res.status(422).json({
        error: "PRICE_OUT_OF_BOUNDS",
        message: sellBoundsCheck.error,
        min: sellBoundsCheck.min,
        max: sellBoundsCheck.max,
      });
    }
  }

  // AUD-059-A FIX: purchasePrice and mrp bounds
  if (purchasePrice !== undefined && purchasePrice !== null) {
    if (typeof purchasePrice !== "number" || !Number.isFinite(purchasePrice) || purchasePrice < 0 || purchasePrice > MAX_PRICE_MINOR) {
      return res.status(422).json({
        error: "VALIDATION_ERROR",
        message: "Purchase price must be a non-negative number within bounds"
      });
    }
  }
  if (mrp !== undefined && mrp !== null) {
    if (typeof mrp !== "number" || !Number.isFinite(mrp) || mrp < 0 || mrp > MAX_PRICE_MINOR) {
      return res.status(422).json({
        error: "VALIDATION_ERROR",
        message: "MRP must be a non-negative number within bounds"
      });
    }
  }

  // Default to 0 if not provided (R3: Opening Stock default = 0)
  const resolvedStockQty = typeof initialStockQty === "number" && Number.isFinite(initialStockQty) && initialStockQty >= 0
    ? Math.round(initialStockQty)
    : 0;

  try {
    // AUD-073-A FIX: Pass variant and packSize to service
    const result = await createStoreProductFromDigitisation(storeId, {
      barcode,
      name: name || "",
      sellPrice: sellPrice || undefined,
      purchasePrice: purchasePrice || undefined,
      mrp,
      initialStockQty: resolvedStockQty,
      unit,
      description,
      brand,
      variant,
      packSize,
      // V3-FIX-167: Pass canonical conversion fields to service
      mode,
      procurementUnit,
      procurementPackQty: procurementPackQty ? Number(procurementPackQty) : undefined,
      baseStockUnit,
      conversionConfirmed: conversionConfirmed ?? undefined,
    });

    if (isSuccessResult(result)) {
      return res.status(201).json({
        storeProduct: result.storeProduct
      });
    } else if (isConflictResult(result)) {
      return res.status(409).json({
        error: "BARCODE_ALREADY_MAPPED",
        message: "Barcode already exists for this store",
        storeProduct: result.existingProduct
      });
    }

    // Validation error
    const validationResult = result as ValidationResult;
    return res.status(422).json({
      error: "VALIDATION_ERROR",
      message: validationResult.message
    });
  } catch (error) {
    log.error("[storeProducts] Error creating store product:", error);
    return res.status(503).json({
      error: "SERVICE_UNAVAILABLE",
      message: "Database unavailable"
    });
  }
});

/**
 * GET /api/v1/pos/store-products/search?q=...&limit=...&includeZeroStock=...
 * Search store products for SELL context (text search with trigram similarity)
 * Returns authoritative stock from inventory.stock_balances
 */
posStoreProductsRouter.get("/store-products/search", requireDeviceToken, async (req, res) => {
  const storeId = getStoreIdFromPosDevice(req, "pos/store-products");
  const q = String(req.query.q || "").trim();
  const limit = Math.min(Math.max(parseInt(String(req.query.limit || "30"), 10) || 30, 1), 100);
  const includeZeroStock = req.query.includeZeroStock !== "false";
  // GCP-STG-0321: Optional category filter for SELL search
  const categoryFilter = req.query.category ? String(req.query.category).trim() : "";

  // AUD-059-C FIX: Search query length bounds (prevent DoS with huge queries)
  const MAX_SEARCH_QUERY_LENGTH = 100;
  if (q.length < 2) {
    return res.json({ success: true, data: [], total: 0, context: "SELL" });
  }
  if (q.length > MAX_SEARCH_QUERY_LENGTH) {
    return res.status(400).json({ error: "VALIDATION_ERROR", message: `Search query exceeds maximum length of ${MAX_SEARCH_QUERY_LENGTH} characters` });
  }

  const pool = getPool();
  if (!pool) {
    return res.status(503).json({ error: "SERVICE_UNAVAILABLE", message: "Database unavailable" });
  }

  try {
    const stockFilter = includeZeroStock ? "" : "AND COALESCE(sb.current_qty, sp.current_stock, 0) > 0";
    // V3-FIX-132: Tokenize with quantity normalization + Hindi alias expansion
    // Keep tokens >= 1 char (numbers from "1kg" are 1+ char), filter empties, cap at 5 raw
    const rawTokens = normalizeQuantityTokens(q).filter(t => t.length >= 1).slice(0, 5);
    // Separate numeric tokens (for unit/content matching) and text tokens (for name/brand)
    const numericTokens = rawTokens.filter(t => /^\d+$/.test(t));
    const textTokens = rawTokens.filter(t => !/^\d+$/.test(t) && t.length >= 2);
    const expandedTextTokens = expandHindiSearchTokens(textTokens).slice(0, 8);
    // Recombine: text tokens for name/brand search, numeric tokens for unit/content matching
    const tokens = [...expandedTextTokens, ...numericTokens].slice(0, 10);
    if (tokens.filter(t => t.length >= 2).length === 0 && numericTokens.length === 0) {
      return res.json({ success: true, data: [], total: 0, context: "SELL" });
    }

    // Build dynamic WHERE and scoring for token-based OR matching
    // Each token is checked against name, display_name, brand, primary_barcode, store barcodes
    // Any token matching is sufficient (OR across tokens)
    const params: Array<string | number> = [storeId];

    // GCP-STG-0321: Category filter — case-insensitive exact match on p.category
    let categoryClause = "";
    if (categoryFilter) {
      params.push(categoryFilter);
      categoryClause = `AND LOWER(p.category) = LOWER($${params.length})`;
    }
    const tokenWhereClauses: string[] = [];
    const tokenScoreCases: string[] = [];

    for (const token of tokens) {
      params.push(token);
      const idx = params.length; // $idx references this token

      // T-132 + V3-FIX-132: Fuzzy/typo-tolerant search + unit/content matching
      tokenWhereClauses.push(`(
        p.primary_barcode = $${idx}
        OR spb.barcode = $${idx}
        OR p.name ILIKE '%' || $${idx} || '%'
        OR COALESCE(sp.display_name, '') ILIKE '%' || $${idx} || '%'
        OR COALESCE(p.brand, '') ILIKE '%' || $${idx} || '%'
        OR COALESCE(p.unit, '') ILIKE $${idx}
        OR COALESCE(p.net_content_unit, '') ILIKE $${idx}
        OR CAST(COALESCE(p.net_content_value, 0) AS TEXT) = $${idx}
        OR similarity(p.name, $${idx}) > 0.3
        OR similarity(COALESCE(sp.display_name, ''), $${idx}) > 0.3
        OR similarity(COALESCE(p.brand, ''), $${idx}) > 0.3
      )`);

      // T-132: Enhanced scoring with display_name similarity for typo tolerance
      tokenScoreCases.push(`CASE
        WHEN p.primary_barcode = $${idx} OR spb.barcode = $${idx} THEN 1000
        WHEN LOWER(p.name) = LOWER($${idx}) THEN 800
        WHEN LOWER(COALESCE(sp.display_name, '')) = LOWER($${idx}) THEN 800
        WHEN LOWER(p.name) LIKE LOWER($${idx}) || '%' THEN 700
        WHEN LOWER(COALESCE(sp.display_name, '')) LIKE LOWER($${idx}) || '%' THEN 700
        WHEN similarity(p.name, $${idx}) > 0.5 THEN 500 + similarity(p.name, $${idx}) * 100
        WHEN similarity(COALESCE(sp.display_name, ''), $${idx}) > 0.5 THEN 500 + similarity(COALESCE(sp.display_name, ''), $${idx}) * 100
        WHEN p.name ILIKE '%' || $${idx} || '%' THEN 300
        WHEN COALESCE(sp.display_name, '') ILIKE '%' || $${idx} || '%' THEN 300
        WHEN COALESCE(p.brand, '') ILIKE '%' || $${idx} || '%' THEN 250
        WHEN similarity(p.name, $${idx}) > 0.3 THEN 200 + similarity(p.name, $${idx}) * 100
        WHEN similarity(COALESCE(sp.display_name, ''), $${idx}) > 0.3 THEN 200 + similarity(COALESCE(sp.display_name, ''), $${idx}) * 100
        WHEN similarity(COALESCE(p.brand, ''), $${idx}) > 0.3 THEN 150 + similarity(COALESCE(p.brand, ''), $${idx}) * 100
        ELSE 50
      END`);
    }

    params.push(limit);
    const limitIdx = params.length;

    const whereClause = tokenWhereClauses.join("\n        OR ");
    const scoreExpr = tokenScoreCases.length === 1
      ? tokenScoreCases[0]
      : `GREATEST(${tokenScoreCases.join(", ")})`;

    const searchSql = `
      WITH ranked_products AS (
        SELECT DISTINCT ON (sp.id)
          sp.id as store_product_id,
          sp.product_id,
          sp.sell_price,
          sp.mrp,
          sp.purchase_price,
          sp.display_name as sp_display_name,
          sp.product_mode,
          sp.metadata_updated_at,
          COALESCE(sb.current_qty, sp.current_stock, 0) as current_stock,
          p.name,
          COALESCE(sp.brand, p.brand) as brand,
          p.category,
          p.unit,
          p.primary_barcode,
          spb.barcode as store_barcode,
          GREATEST(sp.updated_at, p.updated_at) as updated_at,
          LOWER(TRIM(COALESCE(sp.display_name, p.name, ''))) || '::' || LOWER(TRIM(COALESCE(sp.brand, p.brand, ''))) as group_key,
          (${scoreExpr}) as priority_score,
          COALESCE(sp.image_url, p.image_url) AS image_url,
          p.default_gst_rate AS gst_rate,
          p.net_content_value,
          p.net_content_unit,
          sp.sold_by,
          sp.rate_unit,
          sp.procurement_unit,
          sp.procurement_pack_qty,
          sp.base_stock_unit,
          sp.allow_fractional_sell,
          sp.conversion_precision,
          sp.conversion_confirmed,
          sp.low_stock_alert_qty,
          sp.notes,
          p.pack_size,
          p.pack_unit
        FROM catalog.store_products sp
        JOIN catalog.products p ON p.id = sp.product_id
        LEFT JOIN inventory.stock_balances sb ON sb.store_id = sp.store_id AND sb.product_id = sp.product_id
        LEFT JOIN catalog.store_product_barcodes spb ON spb.store_product_id = sp.id AND spb.store_id = sp.store_id
        WHERE sp.store_id = $1
          AND sp.is_active = true
          AND p.is_active = true
          -- CL-013: If product has supplier links, at least one must be approved
          AND (
            NOT EXISTS (SELECT 1 FROM catalog.supplier_product_map spm WHERE spm.product_id = sp.product_id)
            OR EXISTS (
              SELECT 1 FROM catalog.supplier_product_map spm
              JOIN catalog.supplier_products sup ON sup.id = spm.supplier_product_id
              WHERE spm.product_id = sp.product_id AND sup.approval_status = 'approved'
            )
          )
          ${stockFilter}
          ${categoryClause}
          AND (
            ${whereClause}
          )
        ORDER BY sp.id, (${scoreExpr}) DESC
      )
      SELECT * FROM ranked_products
      ORDER BY priority_score DESC, name ASC
      LIMIT $${limitIdx}
    `;

    const result = await pool.query(searchSql, params);
    const rows = result.rows;

    // Group results by group_key
    const groupsMap = new Map<string, any>();
    for (const row of rows) {
      let group = groupsMap.get(row.group_key);
      if (!group) {
        group = {
          groupId: row.group_key,
          displayName: row.sp_display_name || row.name,  // SYNC-PRD-001: display_name is authoritative
          brand: row.brand || undefined,
          category: row.category || undefined,
          matches: [],
        };
        groupsMap.set(row.group_key, group);
      }
      group.matches.push({
        productId: row.product_id,
        storeProductId: row.store_product_id,
        barcode: row.store_barcode || row.primary_barcode || undefined,
        sellPrice: row.sell_price,
        mrp: row.mrp || undefined,
        purchasePrice: row.purchase_price || undefined,
        currentStock: parseStock(row.current_stock),
        unit: row.unit || "pcs",
        mode: row.product_mode || undefined,
        displayName: row.sp_display_name || undefined,
        updatedAt: row.updated_at || undefined,
        metadataUpdatedAt: row.metadata_updated_at || undefined,
        // SCALE-B1/E2: Sell tile display fields
        image_url: row.image_url || null,
        gst_rate: row.gst_rate != null ? Number(row.gst_rate) : null,
        net_content_value: row.net_content_value != null ? Number(row.net_content_value) : null,
        net_content_unit: row.net_content_unit || null,
        // V3-FIX-167: Canonical conversion profile in search results
        soldBy: row.sold_by || null,
        rateUnit: row.rate_unit || null,
        procurementUnit: row.procurement_unit || null,
        procurementPackQty: row.procurement_pack_qty != null ? Number(row.procurement_pack_qty) : null,
        baseStockUnit: row.base_stock_unit || null,
        allowFractionalSell: row.allow_fractional_sell || false,
        conversionPrecision: row.conversion_precision ?? 2,
        conversionConfirmed: row.conversion_confirmed ?? true,
        // GCP-STG-0288: low stock alert + notes
        lowStockAlertQty: row.low_stock_alert_qty != null ? Number(row.low_stock_alert_qty) : null,
        notes: row.notes || null,
        // GCP-STG-0309: case/pack size
        caseSize: row.pack_size != null ? Number(row.pack_size) : null,
        packUnit: row.pack_unit || null,
      });
    }

    const groups = Array.from(groupsMap.values());
    return res.json({ success: true, data: groups, total: rows.length, context: "SELL" });
  } catch (error) {
    log.error("[storeProducts] Search error:", error);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Search failed" });
  }
});

/**
 * GET /api/v1/pos/store-products/lookup?barcode=...
 * Direct barcode lookup for SELL context (scanner use)
 * Returns authoritative stock from inventory.stock_balances
 */
posStoreProductsRouter.get("/store-products/lookup", requireDeviceToken, async (req, res) => {
  const storeId = getStoreIdFromPosDevice(req, "pos/store-products");
  const barcode = String(req.query.barcode || "").trim();

  if (!barcode) {
    return res.status(400).json({ error: "VALIDATION_ERROR", message: "barcode is required" });
  }

  // SCALE-D1: Cache-first barcode lookup — barcode:{storeId}:{barcode}, TTL=5min
  const cacheKey = `barcode:${storeId}:${barcode}`;
  const cached = await cacheGet<object>(cacheKey);
  if (cached !== null) {
    return res.json(cached);
  }

  const pool = getPool();
  if (!pool) {
    return res.status(503).json({ error: "SERVICE_UNAVAILABLE", message: "Database unavailable" });
  }

  try {
    // ITER3-003: Also return individual stock values for drift detection
    const result = await pool.query(
      `SELECT
        sp.id as store_product_id,
        sp.product_id,
        p.name,
        COALESCE(sp.brand, p.brand) as brand,
        p.category,
        p.unit,
        p.primary_barcode,
        sp.sell_price,
        sp.mrp,
        sp.purchase_price,
        sp.display_name,
        sp.product_mode,
        sp.metadata_updated_at,
        COALESCE(sb.current_qty, sp.current_stock, 0) as current_stock,
        sb.current_qty as stock_balance_qty,
        sp.current_stock as store_product_stock,
        spb_match.barcode as store_barcode,
        p.manufacturer_name,
        p.country_of_origin,
        p.shelf_life_days,
        sp.batch_number,
        COALESCE(sp.image_url, p.image_url) AS image_url,
        p.default_gst_rate AS gst_rate,
        p.net_content_value,
        p.net_content_unit,
        sp.sold_by,
        sp.rate_unit,
        sp.procurement_unit,
        sp.procurement_pack_qty,
        sp.base_stock_unit,
        sp.allow_fractional_sell,
        sp.conversion_precision,
        sp.conversion_confirmed,
        sp.low_stock_alert_qty,
        sp.notes,
        p.pack_size,
        p.pack_unit
      FROM catalog.store_products sp
      JOIN catalog.products p ON p.id = sp.product_id
      LEFT JOIN inventory.stock_balances sb ON sb.store_id = sp.store_id AND sb.product_id = sp.product_id
      LEFT JOIN catalog.store_product_barcodes spb_match ON spb_match.store_product_id = sp.id AND spb_match.store_id = sp.store_id AND spb_match.barcode = $2
      WHERE sp.store_id = $1
        AND sp.is_active = true
        AND p.is_active = true
        -- CL-013: If product has supplier links, at least one must be approved
        AND (
          NOT EXISTS (SELECT 1 FROM catalog.supplier_product_map spm WHERE spm.product_id = sp.product_id)
          OR EXISTS (
            SELECT 1 FROM catalog.supplier_product_map spm
            JOIN catalog.supplier_products sup ON sup.id = spm.supplier_product_id
            WHERE spm.product_id = sp.product_id AND sup.approval_status = 'approved'
          )
        )
        AND (
          p.primary_barcode = $2
          OR spb_match.barcode IS NOT NULL
          OR EXISTS (
            SELECT 1 FROM catalog.product_barcodes pb
            WHERE pb.product_id = p.id AND pb.barcode = $2
          )
        )
      ORDER BY sp.updated_at DESC
      LIMIT 2`,
      [storeId, barcode]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "PRODUCT_NOT_IN_STORE_CATALOG",
        message: "Product not found in store catalog",
        barcode,
      });
    }

    // RCAT-PROD-014: Conflict detection — if multiple store_products match the same barcode
    if (result.rows.length > 1) {
      const ids = result.rows.map((r: any) => r.store_product_id);
      log.error(`[RCAT-PROD-014] Barcode conflict: store=${storeId}, barcode=${barcode}, products=[${ids.join(",")}]`);
      const canonical = result.rows[0]; // most recently updated
      return res.status(409).json({
        error: "BARCODE_CONFLICT",
        message: "Multiple products found for this barcode",
        productIds: ids,
        canonical: {
          productId: canonical.product_id,
          storeProductId: canonical.store_product_id,
          name: canonical.display_name || canonical.name,
          brand: canonical.brand || undefined,
          category: canonical.category || undefined,
          unit: canonical.unit || "pcs",
          barcode: canonical.store_barcode || canonical.primary_barcode || undefined,
          sellPrice: canonical.sell_price,
          mrp: canonical.mrp || undefined,
          purchasePrice: canonical.purchase_price || undefined,
          currentStock: parseStock(canonical.current_stock),
          displayName: canonical.display_name || undefined,
          mode: canonical.product_mode || undefined,
          metadataUpdatedAt: canonical.metadata_updated_at || undefined,
          manufacturerName: canonical.manufacturer_name || undefined,
          countryOfOrigin: canonical.country_of_origin || undefined,
          shelfLifeDays: canonical.shelf_life_days || undefined,
          batchNumber: canonical.batch_number || undefined,
          imageUrl: canonical.image_url || null,
          gstRate: canonical.gst_rate != null ? Number(canonical.gst_rate) : undefined,
          netContentValue: canonical.net_content_value != null ? Number(canonical.net_content_value) : undefined,
          netContentUnit: canonical.net_content_unit || undefined,
        },
      });
    }

    const row = result.rows[0];

    // ITER3-003: Detect stock drift between stock_balances and store_products
    logStockDriftIfDetected({
      storeId,
      productId: row.product_id,
      storeProductId: row.store_product_id,
      stockBalanceQty: row.stock_balance_qty,
      storeProductStock: row.store_product_stock,
      context: "lookup"
    });

    const responseBody = {
      success: true,
      data: {
        productId: row.product_id,
        storeProductId: row.store_product_id,
        name: row.display_name || row.name,  // SYNC-PRD-001: display_name is authoritative
        brand: row.brand || undefined,
        category: row.category || undefined,
        unit: row.unit || "pcs",
        barcode: row.store_barcode || row.primary_barcode || undefined,
        sellPrice: row.sell_price,
        mrp: row.mrp || undefined,
        purchasePrice: row.purchase_price || undefined,
        currentStock: parseStock(row.current_stock),
        displayName: row.display_name || undefined,
        mode: row.product_mode || undefined,
        metadataUpdatedAt: row.metadata_updated_at || undefined,
        manufacturerName: row.manufacturer_name || undefined,
        countryOfOrigin: row.country_of_origin || undefined,
        shelfLifeDays: row.shelf_life_days || undefined,
        batchNumber: row.batch_number || undefined,
        // SCALE-B1/E2: Sell tile display fields
        imageUrl: row.image_url || null,
        gstRate: row.gst_rate != null ? Number(row.gst_rate) : undefined,
        netContentValue: row.net_content_value != null ? Number(row.net_content_value) : undefined,
        netContentUnit: row.net_content_unit || undefined,
        // V3-FIX-167: Canonical conversion profile
        soldBy: row.sold_by || undefined,
        rateUnit: row.rate_unit || undefined,
        procurementUnit: row.procurement_unit || undefined,
        procurementPackQty: row.procurement_pack_qty != null ? Number(row.procurement_pack_qty) : undefined,
        baseStockUnit: row.base_stock_unit || undefined,
        allowFractionalSell: row.allow_fractional_sell || false,
        conversionPrecision: row.conversion_precision ?? 2,
        conversionConfirmed: row.conversion_confirmed || false,
        // GCP-STG-0288: low stock alert + notes
        lowStockAlertQty: row.low_stock_alert_qty != null ? Number(row.low_stock_alert_qty) : undefined,
        notes: row.notes || undefined,
        // GCP-STG-0309: case/pack size
        caseSize: row.pack_size != null ? Number(row.pack_size) : undefined,
        packUnit: row.pack_unit || undefined,
      },
      context: "SELL",
    };

    // SCALE-D1: Populate cache for future scans (best-effort, TTL=5min)
    await cacheSet(cacheKey, responseBody, BARCODE_CACHE_TTL);

    return res.json(responseBody);
  } catch (error) {
    log.error("[storeProducts] Lookup error:", error);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Lookup failed" });
  }
});

/**
 * GET /api/v1/pos/store-products/list?limit=...&offset=...&sort=fefo
 * List store products for tap-and-add SELL grid
 * Returns authoritative stock from inventory.stock_balances
 * SCALE-C3: Optional sort=fefo for FEFO (First Expired First Out) ordering
 */
posStoreProductsRouter.get("/store-products/list", requireDeviceToken, async (req, res) => {
  const storeId = getStoreIdFromPosDevice(req, "pos/store-products");
  const limit = Math.min(Math.max(parseInt(String(req.query.limit || "50"), 10) || 50, 1), 500); // GCP-STG-0295: raised from 200 to 500 to match POS client
  const offset = Math.max(parseInt(String(req.query.offset || "0"), 10) || 0, 0);
  // SCALE-C3: FEFO sort — earliest expiry first, NULL expiry last, then alpha
  const sortFefo = req.query.sort === "fefo";

  const pool = getPool();
  if (!pool) {
    return res.status(503).json({ error: "SERVICE_UNAVAILABLE", message: "Database unavailable" });
  }

  // SCALE-C3: ORDER BY clause changes based on sort param
  const orderByClause = sortFefo
    ? `ORDER BY
        CASE WHEN sp.expiry_date IS NULL THEN 1 ELSE 0 END,
        sp.expiry_date ASC,
        COALESCE(sp.display_name, p.name) ASC`
    : `ORDER BY COALESCE(sp.display_name, p.name) ASC`;

  try {
    const [dataResult, countResult] = await Promise.all([
      pool.query(
        `SELECT
          sp.id as store_product_id,
          sp.product_id,
          p.name,
          p.primary_barcode,
          spb.barcode as store_barcode,
          sp.sell_price,
          sp.mrp,
          sp.purchase_price,
          sp.display_name,
          sp.product_mode,
          sp.metadata_updated_at,
          sp.expiry_date,
          sp.batch_number,
          COALESCE(sb.current_qty, sp.current_stock, 0) as current_stock,
          COALESCE(sp.brand, p.brand) as brand,
          p.unit,
          p.category,
          GREATEST(sp.updated_at, p.updated_at) as updated_at,
          COALESCE(sp.image_url, p.image_url) AS image_url,
          p.default_gst_rate AS gst_rate,
          p.net_content_value,
          p.net_content_unit,
          sp.sold_by,
          sp.rate_unit,
          sp.procurement_unit,
          sp.procurement_pack_qty,
          sp.base_stock_unit,
          sp.allow_fractional_sell,
          sp.conversion_precision,
          sp.conversion_confirmed,
          p.description,
          p.hsn_code,
          sp.supplier_id,
          sup.business_name AS supplier_name,
          sp.low_stock_alert_qty,
          sp.notes,
          p.pack_size,
          p.pack_unit
        FROM catalog.store_products sp
        JOIN catalog.products p ON p.id = sp.product_id
        LEFT JOIN inventory.stock_balances sb ON sb.store_id = sp.store_id AND sb.product_id = sp.product_id
        LEFT JOIN supplier.suppliers sup ON sup.id = sp.supplier_id
        LEFT JOIN LATERAL (
          SELECT barcode FROM catalog.store_product_barcodes
          WHERE store_product_id = sp.id AND store_id = sp.store_id
          LIMIT 1
        ) spb ON true
        WHERE sp.store_id = $1
          AND sp.is_active = true
          AND p.is_active = true
          -- CL-013: If product has supplier links, at least one must be approved
          AND (
            NOT EXISTS (SELECT 1 FROM catalog.supplier_product_map spm WHERE spm.product_id = sp.product_id)
            OR EXISTS (
              SELECT 1 FROM catalog.supplier_product_map spm
              JOIN catalog.supplier_products sup ON sup.id = spm.supplier_product_id
              WHERE spm.product_id = sp.product_id AND sup.approval_status = 'approved'
            )
          )
        ${orderByClause}
        LIMIT $2 OFFSET $3`,
        [storeId, limit, offset]
      ),
      pool.query(
        `SELECT COUNT(*)::int as total
        FROM catalog.store_products sp
        JOIN catalog.products p ON p.id = sp.product_id
        WHERE sp.store_id = $1
          AND sp.is_active = true
          AND p.is_active = true`,
        [storeId]
      ),
    ]);

    const data = dataResult.rows.map((row: any) => ({
      storeProductId: row.store_product_id,
      productId: row.product_id,
      name: row.display_name || row.name,  // SYNC-PRD-001: display_name is authoritative
      barcode: row.store_barcode || row.primary_barcode || null,
      sellPrice: row.sell_price,
      mrp: row.mrp || null,
      purchasePrice: row.purchase_price || null,
      currentStock: parseStock(row.current_stock),
      brand: row.brand || null,
      unit: row.unit || "pcs",
      category: row.category || null,
      displayName: row.display_name || null,
      mode: row.product_mode || null,
      updatedAt: row.updated_at || null,
      metadataUpdatedAt: row.metadata_updated_at || null,
      // SCALE-C3: Expiry fields for FEFO support
      expiry_date: row.expiry_date || null,
      batch_number: row.batch_number || null,
      // SCALE-B1/E2: Sell tile display fields
      image_url: row.image_url || null,
      gst_rate: row.gst_rate != null ? Number(row.gst_rate) : null,
      net_content_value: row.net_content_value != null ? Number(row.net_content_value) : null,
      net_content_unit: row.net_content_unit || null,
      // V3-FIX-167: Canonical conversion profile
      soldBy: row.sold_by || null,
      rateUnit: row.rate_unit || null,
      procurementUnit: row.procurement_unit || null,
      procurementPackQty: row.procurement_pack_qty != null ? Number(row.procurement_pack_qty) : null,
      baseStockUnit: row.base_stock_unit || null,
      allowFractionalSell: row.allow_fractional_sell || false,
      conversionPrecision: row.conversion_precision ?? 2,
      conversionConfirmed: row.conversion_confirmed || false,
      // GCP-STG-0284: Additional fields for POS parity
      description: row.description || null,
      hsnCode: row.hsn_code || null,
      supplierId: row.supplier_id || null,
      supplierName: row.supplier_name || null,
      // GCP-STG-0288: low stock alert + notes
      lowStockAlertQty: row.low_stock_alert_qty != null ? Number(row.low_stock_alert_qty) : null,
      notes: row.notes || null,
      // GCP-STG-0309: case/pack size
      caseSize: row.pack_size != null ? Number(row.pack_size) : null,
      packUnit: row.pack_unit || null,
    }));

    const total = countResult.rows[0]?.total || 0;

    return res.json({ success: true, data, total, limit, offset, context: "SELL", sort: sortFefo ? "fefo" : "default" });
  } catch (error) {
    log.error("[storeProducts] List error:", error);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "List failed" });
  }
});

/**
 * GET /api/v1/pos/store-products/freshness?since=...
 * R5: Check if store catalog has been updated since the given timestamp.
 * Returns { stale: true/false, latestUpdatedAt: ISO string }
 * POS uses this to decide whether to re-sync catalog after dashboard edits.
 */
posStoreProductsRouter.get("/store-products/freshness", requireDeviceToken, async (req, res) => {
  const storeId = getStoreIdFromPosDevice(req, "pos/store-products");
  const since = String(req.query.since || "").trim();

  const pool = getPool();
  if (!pool) {
    return res.status(503).json({ error: "SERVICE_UNAVAILABLE", message: "Database unavailable" });
  }

  try {
    // Get the latest updated_at across store_products, stock_balances, and metadata for this store
    // SYNC-PRD-001: Include metadata_updated_at to detect name changes from Dashboard
    const result = await pool.query(
      `SELECT GREATEST(
        (SELECT MAX(updated_at) FROM catalog.store_products WHERE store_id = $1 AND is_active = true),
        (SELECT MAX(metadata_updated_at) FROM catalog.store_products WHERE store_id = $1 AND is_active = true),
        (SELECT MAX(updated_at) FROM inventory.stock_balances WHERE store_id = $1)
      ) as latest_updated_at`,
      [storeId]
    );

    const latestUpdatedAt = result.rows[0]?.latest_updated_at
      ? new Date(result.rows[0].latest_updated_at).toISOString()
      : null;

    let stale = false;
    if (since && latestUpdatedAt) {
      const sinceDate = new Date(since);
      const latestDate = new Date(latestUpdatedAt);
      stale = latestDate > sinceDate;
    }

    return res.json({
      success: true,
      stale,
      latestUpdatedAt,
      storeId,
    });
  } catch (error) {
    log.error("[storeProducts] Freshness check error:", error);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Freshness check failed" });
  }
});

/**
 * PATCH /api/v1/pos/store-products/price
 * Update sell price for a store product (by barcode or productId)
 * Used when POS user edits price inline
 */
posStoreProductsRouter.patch("/store-products/price", requireDeviceToken, requireActiveStore, async (req, res) => {
  const storeId = getStoreIdFromPosDevice(req, "pos/store-products");
  // ITER3-001: Accept storeProductId in addition to barcode/productId
  const { barcode, productId, storeProductId, sellPrice } = req.body as {
    barcode?: string;
    productId?: string;
    storeProductId?: string;
    sellPrice: number;
  };

  // AUD-059-A FIX: Price bounds validation
  const MAX_PRICE_MINOR = 1000000000; // 10M INR = 1B paise
  if (typeof sellPrice !== "number" || !Number.isFinite(sellPrice) || sellPrice <= 0) {
    return res.status(422).json({ error: "VALIDATION_ERROR", message: "sellPrice must be a positive number" });
  }
  if (sellPrice > MAX_PRICE_MINOR) {
    return res.status(422).json({ error: "VALIDATION_ERROR", message: "sellPrice exceeds maximum allowed value" });
  }
  // SA-P0-003: Global price bounds enforcement
  const priceBoundsCheck = await validatePriceBounds(sellPrice);
  if (!priceBoundsCheck.valid) {
    return res.status(422).json({
      error: "PRICE_OUT_OF_BOUNDS",
      message: priceBoundsCheck.error,
      min: priceBoundsCheck.min,
      max: priceBoundsCheck.max,
    });
  }

  // ITER3-001: Accept any of the three identifiers
  if (!barcode && !productId && !storeProductId) {
    return res.status(422).json({ error: "VALIDATION_ERROR", message: "barcode, productId, or storeProductId is required" });
  }

  const pool = getPool();
  if (!pool) {
    return res.status(503).json({ error: "SERVICE_UNAVAILABLE", message: "Database unavailable" });
  }

  try {
    let updateResult;

    // ITER3-001: Priority order: storeProductId > productId > barcode
    if (storeProductId) {
      // Update by storeProductId directly (most precise)
      updateResult = await pool.query(
        `UPDATE catalog.store_products
         SET sell_price = $1, updated_at = NOW()
         WHERE id = $2 AND store_id = $3 AND is_active = true
         RETURNING id, product_id, sell_price, display_name, updated_at`,
        [Math.round(sellPrice), storeProductId, storeId]
      );
    } else if (productId) {
      // Update by productId directly
      updateResult = await pool.query(
        `UPDATE catalog.store_products
         SET sell_price = $1, updated_at = NOW()
         WHERE store_id = $2 AND product_id = $3 AND is_active = true
         RETURNING id, product_id, sell_price, display_name, updated_at`,
        [Math.round(sellPrice), storeId, productId]
      );
    } else {
      // Find store_product by barcode, then update
      updateResult = await pool.query(
        `UPDATE catalog.store_products sp
         SET sell_price = $1, updated_at = NOW()
         FROM catalog.store_product_barcodes spb
         WHERE spb.store_id = $2 AND spb.barcode = $3
           AND sp.id = spb.store_product_id AND sp.store_id = spb.store_id
           AND sp.is_active = true
         RETURNING sp.id, sp.product_id, sp.sell_price, sp.display_name, sp.updated_at`,
        [Math.round(sellPrice), storeId, barcode]
      );

      // Fallback: try primary_barcode
      if ((updateResult.rowCount ?? 0) === 0) {
        updateResult = await pool.query(
          `UPDATE catalog.store_products sp
           SET sell_price = $1, updated_at = NOW()
           FROM catalog.products p
           WHERE p.primary_barcode = $3 AND sp.product_id = p.id
             AND sp.store_id = $2 AND sp.is_active = true
           RETURNING sp.id, sp.product_id, sp.sell_price, sp.display_name, sp.updated_at`,
          [Math.round(sellPrice), storeId, barcode]
        );
      }
    }

    if ((updateResult.rowCount ?? 0) === 0) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Product not found in store" });
    }

    // RCAT-SYNC-001: Return canonical product data so POS can update local cache
    const updatedRow = updateResult.rows[0];
    const stockResult = await pool.query(
      `SELECT current_qty FROM inventory.stock_balances WHERE store_id = $1 AND product_id = $2`,
      [storeId, updatedRow.product_id]
    );
    const currentStock = Number(stockResult.rows[0]?.current_qty ?? 0);

    return res.json({
      success: true,
      data: {
        storeProductId: updatedRow.id,
        productId: updatedRow.product_id,
        sellPrice: updatedRow.sell_price,
        name: updatedRow.display_name || undefined,
        currentStock,
        updatedAt: updatedRow.updated_at,
      },
    });
  } catch (error) {
    log.error("[storeProducts] Price update error:", error);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Price update failed" });
  }
});

/**
 * PATCH /api/v1/pos/store-products/stock
 * Update stock for a store product (by productId or barcode)
 * Sets absolute stock level with ledger audit trail
 * Used when POS user updates stock from product detail view
 */
posStoreProductsRouter.patch("/store-products/stock", requireDeviceToken, requireActiveStore, async (req, res) => {
  const storeId = getStoreIdFromPosDevice(req, "pos/store-products");
  // ITER3-001: Accept storeProductId in addition to productId/barcode
  // RET-POS-SYNC-012: Accept stockUpdatedAt for LWW conflict detection
  const { productId, barcode, storeProductId, stock, stockUpdatedAt } = req.body as {
    productId?: string;
    barcode?: string;
    storeProductId?: string;
    stock: number;
    stockUpdatedAt?: string;
  };

  if (typeof stock !== "number" || !Number.isFinite(stock) || stock < 0) {
    return res.status(422).json({ error: "VALIDATION_ERROR", message: "stock must be a non-negative number" });
  }

  // ITER3-001: Accept any of the three identifiers
  if (!productId && !barcode && !storeProductId) {
    return res.status(422).json({ error: "VALIDATION_ERROR", message: "productId, barcode, or storeProductId is required" });
  }

  const pool = getPool();
  if (!pool) {
    return res.status(503).json({ error: "SERVICE_UNAVAILABLE", message: "Database unavailable" });
  }

  const client = await pool.connect();
  try {
    // ITER3-001: Resolve product_id from storeProductId, productId, or barcode
    let resolvedProductId = productId;

    if (!resolvedProductId && storeProductId) {
      // Lookup by storeProductId (most precise)
      const lookup = await client.query(
        `SELECT product_id FROM catalog.store_products
         WHERE id = $1 AND store_id = $2 AND is_active = true`,
        [storeProductId, storeId]
      );
      resolvedProductId = lookup.rows[0]?.product_id;
    }

    if (!resolvedProductId && barcode) {
      const lookup = await client.query(
        `SELECT sp.product_id FROM catalog.store_products sp
         LEFT JOIN catalog.store_product_barcodes spb ON spb.store_product_id = sp.id AND spb.store_id = sp.store_id
         LEFT JOIN catalog.products p ON p.id = sp.product_id
         WHERE sp.store_id = $1 AND sp.is_active = true
           AND (spb.barcode = $2 OR p.primary_barcode = $2)
         LIMIT 1`,
        [storeId, barcode]
      );
      resolvedProductId = lookup.rows[0]?.product_id;
    }

    if (!resolvedProductId) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Product not found in store" });
    }

    const newStock = Math.round(stock);

    await client.query("BEGIN");

    // PRA-080: Get current stock with FOR UPDATE to prevent concurrent stock overwrites
    const stockResult = await client.query(
      `SELECT current_qty, updated_at FROM inventory.stock_balances WHERE store_id = $1 AND product_id = $2 FOR UPDATE`,
      [storeId, resolvedProductId]
    );
    const stockBefore = Number(stockResult.rows[0]?.current_qty ?? 0);
    const serverStockUpdatedAt = stockResult.rows[0]?.updated_at;

    // RET-POS-SYNC-012: LWW guard — reject stale writes if client provides timestamp
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

    const delta = newStock - stockBefore;

    if (delta !== 0) {
      // Ledger entry for audit trail
      await client.query(
        `INSERT INTO inventory.inventory_ledger
         (store_id, product_id, delta_qty, transaction_type, stock_before, stock_after, unit_cost, source, notes)
         VALUES ($1, $2, $3, 'adjustment', $4, $5, 0, 'POS_APP', 'Stock updated from POS')`,
        [storeId, resolvedProductId, delta, stockBefore, newStock]
      );
    }

    // Upsert stock_balances
    await client.query(
      `INSERT INTO inventory.stock_balances (store_id, product_id, current_qty)
       VALUES ($1, $2, $3)
       ON CONFLICT (store_id, product_id) DO UPDATE SET current_qty = $3, updated_at = NOW()`,
      [storeId, resolvedProductId, newStock]
    );

    // Update denormalized stock
    await client.query(
      `UPDATE catalog.store_products SET current_stock = $2, updated_at = NOW()
       WHERE store_id = $1 AND product_id = $3 AND is_active = true`,
      [storeId, newStock, resolvedProductId]
    );

    await client.query("COMMIT");

    // RET-POS-SYNC-012: Return stockUpdatedAt so clients can use it for future LWW
    return res.json({ success: true, data: { productId: resolvedProductId, stock: newStock, stockUpdatedAt: new Date().toISOString() } });
  } catch (error) {
    await client.query("ROLLBACK");
    log.error("[storeProducts] Stock update error:", error);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Stock update failed" });
  } finally {
    client.release();
  }
});

/**
 * PATCH /api/v1/pos/store-products/metadata
 * Update product metadata (display name, purchase price, sell price) by barcode, productId, or storeProductId.
 * Uses barcode/productId fallback when storeProductId is unavailable (offline-first, last-write-wins).
 * IMPORTANT: This literal route MUST be defined BEFORE the parametric /:storeProductId/metadata route.
 */
posStoreProductsRouter.patch("/store-products/metadata", requireDeviceToken, requireActiveStore, async (req, res) => {
  const storeId = getStoreIdFromPosDevice(req, "pos/store-products");
  const { barcode, productId, storeProductId, displayName, purchasePrice, sellPrice, brand, mode, metadataUpdatedAt } = req.body as {
    barcode?: string;
    productId?: string;
    storeProductId?: string;
    displayName?: string;
    purchasePrice?: number;
    sellPrice?: number;
    brand?: string; // MT-8: Store-level brand override
    mode?: string; // AUD-022-A: Product mode (PACKAGED or LOOSE_BULK)
    metadataUpdatedAt?: string; // ISO timestamp for last-write-wins comparison
  };

  // Parse incoming timestamp for LWW comparison (AUD-025-B fix)
  const incomingTimestamp = metadataUpdatedAt ? new Date(metadataUpdatedAt) : null;
  const validIncomingTimestamp = incomingTimestamp && !isNaN(incomingTimestamp.getTime()) ? incomingTimestamp : null;

  if (!barcode && !productId && !storeProductId) {
    return res.status(422).json({ error: "VALIDATION_ERROR", message: "barcode, productId, or storeProductId is required" });
  }

  const trimmedName = typeof displayName === "string" ? displayName.trim() : null;
  const trimmedBrand = typeof brand === "string" ? brand.trim() : null; // MT-8: Brand support
  // AUD-022-A: Validate mode (PACKAGED or LOOSE_BULK only)
  const validMode = typeof mode === "string" && ["PACKAGED", "LOOSE_BULK"].includes(mode.toUpperCase())
    ? mode.toUpperCase()
    : null;
  const validPurchasePrice = typeof purchasePrice === "number" && Number.isFinite(purchasePrice) && purchasePrice >= 0
    ? Math.round(purchasePrice)
    : null;
  const validSellPrice = typeof sellPrice === "number" && Number.isFinite(sellPrice) && sellPrice > 0
    ? Math.round(sellPrice)
    : null;

  if (!trimmedName && !trimmedBrand && !validMode && validPurchasePrice === null && validSellPrice === null) {
    return res.status(422).json({
      error: "VALIDATION_ERROR",
      message: "At least one of displayName, brand, mode, purchasePrice, or sellPrice is required"
    });
  }

  // PRA-080/CONC-001: Warn when LWW timestamp missing (helps identify clients needing update)
  if (!validIncomingTimestamp) {
    log.warn(`[METADATA] LWW timestamp missing for product update (store=${storeId}, barcode=${barcode || 'N/A'}, productId=${productId || 'N/A'})`);
  }

  const pool = getPool();
  if (!pool) {
    return res.status(503).json({ error: "SERVICE_UNAVAILABLE", message: "Database unavailable" });
  }

  try {
    // Build dynamic SET clause
    const setClauses: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (trimmedName) {
      setClauses.push(`display_name = $${paramIdx++}`);
      params.push(trimmedName);
    }
    if (trimmedBrand !== null) {
      // MT-8: Brand can be set to empty string to clear it
      setClauses.push(`brand = $${paramIdx++}`);
      params.push(trimmedBrand || null);
    }
    if (validMode) {
      // AUD-022-A: Product mode (PACKAGED or LOOSE_BULK)
      setClauses.push(`product_mode = $${paramIdx++}`);
      params.push(validMode);
    }
    if (validPurchasePrice !== null) {
      setClauses.push(`purchase_price = $${paramIdx++}`);
      params.push(validPurchasePrice);
    }
    if (validSellPrice !== null) {
      setClauses.push(`sell_price = $${paramIdx++}`);
      params.push(validSellPrice);
    }
    setClauses.push(`metadata_updated_at = NOW()`);
    setClauses.push(`metadata_updated_by = 'POS_APP'`);
    setClauses.push(`updated_at = NOW()`);

    const setClause = setClauses.join(", ");
    let result;

    // AUD-025-B: Build LWW guard clause if timestamp provided
    const buildLwwGuard = (tsParamIdx: number) => validIncomingTimestamp
      ? `AND (metadata_updated_at IS NULL OR metadata_updated_at < $${tsParamIdx})`
      : "";

    if (storeProductId) {
      params.push(storeProductId);
      params.push(storeId);
      if (validIncomingTimestamp) params.push(validIncomingTimestamp.toISOString());
      const lwwGuard = buildLwwGuard(paramIdx + 2);
      result = await pool.query(
        `UPDATE catalog.store_products
         SET ${setClause}
         WHERE id = $${paramIdx++} AND store_id = $${paramIdx++} AND is_active = true ${lwwGuard}
         RETURNING id, product_id, display_name, brand, product_mode, purchase_price, sell_price, metadata_updated_at, updated_at`,
        params
      );
    } else if (productId) {
      params.push(productId);
      params.push(storeId);
      if (validIncomingTimestamp) params.push(validIncomingTimestamp.toISOString());
      const lwwGuard = buildLwwGuard(paramIdx + 2);
      result = await pool.query(
        `UPDATE catalog.store_products
         SET ${setClause}
         WHERE product_id = $${paramIdx++} AND store_id = $${paramIdx++} AND is_active = true ${lwwGuard}
         RETURNING id, product_id, display_name, brand, product_mode, purchase_price, sell_price, metadata_updated_at, updated_at`,
        params
      );
    } else {
      // PRA-080/CONC-001: Barcode path uses fallback query — wrap in transaction for atomicity
      // Lookup by barcode via store_product_barcodes
      params.push(storeId);
      params.push(barcode);
      if (validIncomingTimestamp) params.push(validIncomingTimestamp.toISOString());
      const lwwGuard = buildLwwGuard(paramIdx + 2);
      result = await pool.query(
        `UPDATE catalog.store_products sp
         SET ${setClause}
         FROM catalog.store_product_barcodes spb
         WHERE spb.store_id = $${paramIdx++} AND spb.barcode = $${paramIdx++}
           AND sp.id = spb.store_product_id AND sp.store_id = spb.store_id
           AND sp.is_active = true ${lwwGuard}
         RETURNING sp.id, sp.product_id, sp.display_name, sp.brand, sp.product_mode, sp.purchase_price, sp.sell_price, sp.metadata_updated_at, sp.updated_at`,
        params
      );

      // Fallback: try primary_barcode on catalog.products
      if ((result.rowCount ?? 0) === 0) {
        const fbParams: any[] = [];
        const fbSetClauses: string[] = [];
        let fbIdx = 1;
        if (trimmedName) { fbSetClauses.push(`display_name = $${fbIdx++}`); fbParams.push(trimmedName); }
        if (trimmedBrand !== null) { fbSetClauses.push(`brand = $${fbIdx++}`); fbParams.push(trimmedBrand || null); }
        if (validMode) { fbSetClauses.push(`product_mode = $${fbIdx++}`); fbParams.push(validMode); }
        if (validPurchasePrice !== null) { fbSetClauses.push(`purchase_price = $${fbIdx++}`); fbParams.push(validPurchasePrice); }
        if (validSellPrice !== null) { fbSetClauses.push(`sell_price = $${fbIdx++}`); fbParams.push(validSellPrice); }
        fbSetClauses.push(`metadata_updated_at = NOW()`);
        fbSetClauses.push(`metadata_updated_by = 'POS_APP'`);
        fbSetClauses.push(`updated_at = NOW()`);

        fbParams.push(barcode);
        fbParams.push(storeId);
        if (validIncomingTimestamp) fbParams.push(validIncomingTimestamp.toISOString());
        const fbLwwGuard = validIncomingTimestamp
          ? `AND (sp.metadata_updated_at IS NULL OR sp.metadata_updated_at < $${fbIdx + 2})`
          : "";
        result = await pool.query(
          `UPDATE catalog.store_products sp
           SET ${fbSetClauses.join(", ")}
           FROM catalog.products p
           WHERE p.primary_barcode = $${fbIdx++} AND sp.product_id = p.id
             AND sp.store_id = $${fbIdx++} AND sp.is_active = true ${fbLwwGuard}
           RETURNING sp.id, sp.product_id, sp.display_name, sp.brand, sp.product_mode, sp.purchase_price, sp.sell_price, sp.metadata_updated_at, sp.updated_at`,
          fbParams
        );
      }
    }

    // AUD-025-B: Distinguish between NOT_FOUND vs CONFLICT (stale timestamp)
    if ((result.rowCount ?? 0) === 0) {
      // Check if product exists to determine if it's a conflict or not found
      if (validIncomingTimestamp) {
        let existsCheck;
        if (storeProductId) {
          existsCheck = await pool.query(
            `SELECT id, metadata_updated_at FROM catalog.store_products WHERE id = $1 AND store_id = $2 AND is_active = true`,
            [storeProductId, storeId]
          );
        } else if (productId) {
          existsCheck = await pool.query(
            `SELECT id, metadata_updated_at FROM catalog.store_products WHERE product_id = $1 AND store_id = $2 AND is_active = true`,
            [productId, storeId]
          );
        } else {
          existsCheck = await pool.query(
            `SELECT sp.id, sp.metadata_updated_at FROM catalog.store_products sp
             JOIN catalog.store_product_barcodes spb ON sp.id = spb.store_product_id AND sp.store_id = spb.store_id
             WHERE spb.barcode = $1 AND sp.store_id = $2 AND sp.is_active = true
             UNION
             SELECT sp.id, sp.metadata_updated_at FROM catalog.store_products sp
             JOIN catalog.products p ON sp.product_id = p.id
             WHERE p.primary_barcode = $1 AND sp.store_id = $2 AND sp.is_active = true`,
            [barcode, storeId]
          );
        }
        if (existsCheck.rowCount && existsCheck.rowCount > 0) {
          // AUD-025-B: Product exists but timestamp check failed - stale update rejected
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
      return res.status(404).json({ error: "NOT_FOUND", message: "Product not found in store" });
    }

    // RCAT-SYNC-001: Return canonical data so POS can update local caches
    return res.json({
      success: true,
      data: {
        storeProductId: result.rows[0].id,
        productId: result.rows[0].product_id,
        displayName: result.rows[0].display_name,
        brand: result.rows[0].brand || null, // MT-8: Include brand in response
        mode: result.rows[0].product_mode || null, // AUD-022-A: Include mode in response
        purchasePrice: result.rows[0].purchase_price,
        sellPrice: result.rows[0].sell_price,
        metadataUpdatedAt: result.rows[0].metadata_updated_at,
        updatedAt: result.rows[0].updated_at,
      }
    });
  } catch (error) {
    log.error("[storeProducts] Metadata update (body-based) error:", error);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Metadata update failed" });
  }
});

/**
 * PATCH /api/v1/pos/store-products/:storeProductId/metadata
 * SYNC-PRD-001: Update product metadata (display name) from POS (legacy path-param endpoint)
 * Last-write-wins: server sets metadata_updated_at = NOW() on every write
 */
posStoreProductsRouter.patch("/store-products/:storeProductId/metadata", requireDeviceToken, requireActiveStore, async (req, res) => {
  const storeId = getStoreIdFromPosDevice(req, "pos/store-products");
  const { storeProductId } = req.params;
  const { displayName, purchasePrice, brand, metadataUpdatedAt } = req.body as {
    displayName?: string;
    purchasePrice?: number;
    brand?: string; // MT-8: Store-level brand override
    metadataUpdatedAt?: string; // ISO timestamp for last-write-wins comparison (AUD-025-B)
  };

  // Parse incoming timestamp for LWW comparison (AUD-025-B fix)
  const incomingTimestamp = metadataUpdatedAt ? new Date(metadataUpdatedAt) : null;
  const validIncomingTimestamp = incomingTimestamp && !isNaN(incomingTimestamp.getTime()) ? incomingTimestamp : null;

  const trimmedName = typeof displayName === "string" ? displayName.trim() : null;
  const trimmedBrand = typeof brand === "string" ? brand.trim() : null; // MT-8
  const validPurchasePrice = typeof purchasePrice === "number" && Number.isFinite(purchasePrice) && purchasePrice >= 0
    ? Math.round(purchasePrice)
    : null;

  if (!trimmedName && !trimmedBrand && validPurchasePrice === null) {
    return res.status(422).json({
      error: "VALIDATION_ERROR",
      message: "At least one of displayName, brand, or purchasePrice is required"
    });
  }

  const pool = getPool();
  if (!pool) {
    return res.status(503).json({ error: "SERVICE_UNAVAILABLE", message: "Database unavailable" });
  }

  try {
    // Build dynamic SET clause based on provided fields
    const setClauses: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (trimmedName) {
      setClauses.push(`display_name = $${paramIdx++}`);
      params.push(trimmedName);
    }
    if (trimmedBrand !== null) {
      // MT-8: Brand can be set to empty string to clear it
      setClauses.push(`brand = $${paramIdx++}`);
      params.push(trimmedBrand || null);
    }
    if (validPurchasePrice !== null) {
      setClauses.push(`purchase_price = $${paramIdx++}`);
      params.push(validPurchasePrice);
    }
    setClauses.push(`metadata_updated_at = NOW()`);
    setClauses.push(`metadata_updated_by = 'POS_APP'`);
    setClauses.push(`updated_at = NOW()`);

    params.push(storeProductId); // $N for WHERE id
    params.push(storeId);        // $N+1 for WHERE store_id

    // AUD-025-B: Add LWW guard if timestamp provided
    let lwwGuard = "";
    if (validIncomingTimestamp) {
      params.push(validIncomingTimestamp.toISOString());
      lwwGuard = `AND (metadata_updated_at IS NULL OR metadata_updated_at < $${paramIdx + 2})`;
    }

    const result = await pool.query(
      `UPDATE catalog.store_products
       SET ${setClauses.join(", ")}
       WHERE id = $${paramIdx++} AND store_id = $${paramIdx++} AND is_active = true ${lwwGuard}
       RETURNING id, display_name, brand, purchase_price, metadata_updated_at`,
      params
    );

    // AUD-025-B: Distinguish between NOT_FOUND vs CONFLICT (stale timestamp)
    if ((result.rowCount ?? 0) === 0) {
      if (validIncomingTimestamp) {
        const existsCheck = await pool.query(
          `SELECT id, metadata_updated_at FROM catalog.store_products WHERE id = $1 AND store_id = $2 AND is_active = true`,
          [storeProductId, storeId]
        );
        if (existsCheck.rowCount && existsCheck.rowCount > 0) {
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
      return res.status(404).json({
        error: "NOT_FOUND",
        message: "Store product not found"
      });
    }

    return res.json({
      success: true,
      data: {
        storeProductId: result.rows[0].id,
        displayName: result.rows[0].display_name,
        brand: result.rows[0].brand || null,
        purchasePrice: result.rows[0].purchase_price,
        metadataUpdatedAt: result.rows[0].metadata_updated_at,
      }
    });
  } catch (error) {
    log.error("[storeProducts] Metadata update error:", error);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Metadata update failed" });
  }
});

// =============================================================================
// T-057: GET /api/v1/pos/store-products/:storeProductId/variants
// Returns retail selling variants for a LOOSE_BULK product (used by POS variant picker)
// =============================================================================
posStoreProductsRouter.get("/store-products/:storeProductId/variants", requireDeviceToken, async (req, res) => {
  const storeId = getStoreIdFromPosDevice(req, "pos/store-products");
  const { storeProductId } = req.params;

  const pool = getPool();
  if (!pool) {
    return res.status(503).json({ error: "SERVICE_UNAVAILABLE", message: "Database unavailable" });
  }

  try {
    // Verify store product exists and belongs to this store
    const spCheck = await pool.query(
      `SELECT id, product_mode FROM catalog.store_products
       WHERE id = $1 AND store_id = $2 AND is_active = true`,
      [storeProductId, storeId]
    );

    if (spCheck.rows.length === 0) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Store product not found" });
    }

    if (spCheck.rows[0].product_mode !== 'LOOSE_BULK') {
      return res.json({ success: true, data: [] });
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
        sort_order AS "sortOrder"
      FROM catalog.product_retail_variants
      WHERE store_product_id = $1 AND is_active = true
      ORDER BY sort_order ASC, created_at ASC`,
      [storeProductId]
    );

    return res.json({ success: true, data: result.rows });
  } catch (error) {
    log.error("[storeProducts] Variants fetch error:", error);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch variants" });
  }
});

// =============================================================================
// T-131: GET /api/v1/pos/products/frequent
// Frequently sold products — top 12 by sale count for this store
// Simple in-memory cache (5 min TTL per store)
// =============================================================================

const frequentProductsCache = new Map<string, { data: any[]; expiresAt: number }>();
const FREQUENT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

posStoreProductsRouter.get("/products/frequent", requireDeviceToken, async (req, res) => {
  const storeId = getStoreIdFromPosDevice(req, "pos/store-products");

  // Check cache first
  const cached = frequentProductsCache.get(storeId);
  if (cached && cached.expiresAt > Date.now()) {
    return res.json({ success: true, data: cached.data, cached: true });
  }

  const pool = getPool();
  if (!pool) {
    return res.status(503).json({ error: "SERVICE_UNAVAILABLE", message: "Database unavailable" });
  }

  try {
    // T-131: Query sale_items joined through sales (store isolation via sales.store_id)
    // Group by product_id, count sales, return top 12
    const result = await pool.query(
      `SELECT
        si.product_id,
        COUNT(*)::int AS sale_count,
        COALESCE(sp.display_name, p.name) AS name,
        p.primary_barcode AS barcode,
        COALESCE(sp.image_url, p.image_url) AS "imageUrl",
        sp.sell_price AS "sellPrice",
        p.category,
        p.unit,
        COALESCE(sp.brand, p.brand) AS brand,
        sp.id AS "storeProductId"
      FROM public.sale_items si
      JOIN public.sales s ON s.id = si.sale_id
      JOIN catalog.store_products sp ON sp.product_id = si.product_id AND sp.store_id = s.store_id
      JOIN catalog.products p ON p.id = si.product_id
      WHERE s.store_id = $1
        AND s.status IN ('completed', 'pending')
        AND sp.is_active = true
        AND p.is_active = true
      GROUP BY si.product_id, sp.display_name, p.name, p.primary_barcode,
               sp.image_url, p.image_url, sp.sell_price, p.category, p.unit,
               sp.brand, p.brand, sp.id
      ORDER BY sale_count DESC
      LIMIT 12`,
      [storeId]
    );

    const data = result.rows.map((row: any) => ({
      productId: row.product_id,
      storeProductId: row.storeProductId,
      name: row.name,
      barcode: row.barcode || null,
      imageUrl: row.imageUrl || null,
      sellPrice: row.sellPrice,
      category: row.category || null,
      unit: row.unit || "pcs",
      brand: row.brand || null,
      saleCount: row.sale_count,
    }));

    // Cache the result
    frequentProductsCache.set(storeId, {
      data,
      expiresAt: Date.now() + FREQUENT_CACHE_TTL_MS,
    });

    // ISSUE-MICRO-041: Bound cache size to prevent memory growth
    if (frequentProductsCache.size > 1000) {
      const firstKey = frequentProductsCache.keys().next().value;
      if (firstKey) frequentProductsCache.delete(firstKey);
    }

    return res.json({ success: true, data, cached: false });
  } catch (error) {
    log.error("[storeProducts] Frequent products error:", error);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch frequent products" });
  }
});

// =============================================================================
// T-143: GET /api/v1/pos/purchases/recent
// Recently purchased products — last 10 distinct products from purchase orders
// Store isolation via JWT store_id
// =============================================================================

posStoreProductsRouter.get("/purchases/recent", requireDeviceToken, async (req, res) => {
  const storeId = getStoreIdFromPosDevice(req, "pos/store-products");

  const pool = getPool();
  if (!pool) {
    return res.status(503).json({ error: "SERVICE_UNAVAILABLE", message: "Database unavailable" });
  }

  try {
    // T-143: Get the most recent purchase order items for this store
    // DISTINCT ON product_id to get one row per product, most recent first
    const result = await pool.query(
      `SELECT DISTINCT ON (poi.product_id)
        poi.product_id,
        poi.product_name AS name,
        poi.barcode,
        poi.unit_price AS "lastPurchasePrice",
        COALESCE(sp.image_url, p.image_url) AS "imageUrl",
        COALESCE(sp.display_name, p.name) AS "displayName",
        COALESCE(sp.brand, p.brand) AS brand,
        p.unit,
        sup.business_name AS "supplierName",
        po.created_at AS "lastPurchaseDate",
        sp.id AS "storeProductId"
      FROM orders.purchase_order_items poi
      JOIN orders.purchase_orders po ON po.id = poi.order_id
      LEFT JOIN catalog.products p ON p.id = poi.product_id
      LEFT JOIN catalog.store_products sp ON sp.product_id = poi.product_id AND sp.store_id = po.store_id AND sp.is_active = true
      LEFT JOIN supplier.suppliers sup ON sup.id = po.supplier_id
      WHERE po.store_id = $1
        AND po.status NOT IN ('cancelled')
      ORDER BY poi.product_id, po.created_at DESC
      LIMIT 10`,
      [storeId]
    );

    const data = result.rows.map((row: any) => ({
      productId: row.product_id,
      storeProductId: row.storeProductId || null,
      name: row.displayName || row.name,
      barcode: row.barcode || null,
      lastPurchasePrice: row.lastPurchasePrice,
      imageUrl: row.imageUrl || null,
      supplierName: row.supplierName || null,
      brand: row.brand || null,
      unit: row.unit || "pcs",
      lastPurchaseDate: row.lastPurchaseDate,
    }));

    return res.json({ success: true, data });
  } catch (error) {
    log.error("[storeProducts] Recent purchases error:", error);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch recent purchases" });
  }
});

/**
 * T-136: GET /api/v1/pos/products/:productId/substitutes
 * Returns up to 4 substitute products from the same category that are in stock.
 */
posStoreProductsRouter.get("/products/:productId/substitutes", requireDeviceToken, async (req, res) => {
  const storeId = getStoreIdFromPosDevice(req, "pos/store-products");
  const { productId } = req.params;

  if (!productId) {
    return res.status(400).json({ error: "VALIDATION_ERROR", message: "productId is required" });
  }

  try {
    const pool = getPool();

    // Get the category of the requested product
    const productResult = await pool.query(
      `SELECT p.category FROM catalog.products p WHERE p.id = $1`,
      [productId]
    );

    if (productResult.rowCount === 0) {
      return res.json({ success: true, data: [] });
    }

    const category = productResult.rows[0].category;
    if (!category) {
      return res.json({ success: true, data: [] });
    }

    // Find substitutes: same category, active, in stock, excluding the original product
    const substitutesResult = await pool.query(
      `SELECT
        sp.product_id AS "productId",
        COALESCE(sp.store_display_name, p.name) AS name,
        sp.barcode,
        COALESCE(sp.sell_price, 0) AS "sellPrice",
        COALESCE(sb.current_qty, sp.current_stock, 0) AS "currentStock"
      FROM catalog.store_products sp
      JOIN catalog.products p ON p.id = sp.product_id
      LEFT JOIN inventory.stock_balances sb ON sb.store_id = sp.store_id AND sb.product_id = sp.product_id
      WHERE sp.store_id = $1
        AND p.category = $2
        AND sp.product_id != $3
        AND sp.is_active = true
        AND COALESCE(sb.current_qty, sp.current_stock, 0) > 0
      ORDER BY similarity(p.name, (SELECT name FROM catalog.products WHERE id = $3)) DESC NULLS LAST,
               p.name ASC
      LIMIT 4`,
      [storeId, category, productId]
    );

    return res.json({
      success: true,
      data: substitutesResult.rows.map((r: any) => ({ ...r, currentStock: parseStock(r.currentStock) })),
    });
  } catch (error) {
    log.error("[storeProducts] Substitutes error:", error);
    // Fallback: try without similarity (pg_trgm might not be installed)
    try {
      const pool = getPool();
      const productResult = await pool.query(
        `SELECT p.category FROM catalog.products p WHERE p.id = $1`,
        [productId]
      );
      if (productResult.rowCount === 0) {
        return res.json({ success: true, data: [] });
      }
      const category = productResult.rows[0].category;
      if (!category) {
        return res.json({ success: true, data: [] });
      }
      const fallbackResult = await pool.query(
        `SELECT
          sp.product_id AS "productId",
          COALESCE(sp.store_display_name, p.name) AS name,
          sp.barcode,
          COALESCE(sp.sell_price, 0) AS "sellPrice",
          COALESCE(sb.current_qty, sp.current_stock, 0) AS "currentStock"
        FROM catalog.store_products sp
        JOIN catalog.products p ON p.id = sp.product_id
        LEFT JOIN inventory.stock_balances sb ON sb.store_id = sp.store_id AND sb.product_id = sp.product_id
        WHERE sp.store_id = $1
          AND p.category = $2
          AND sp.product_id != $3
          AND sp.is_active = true
          AND COALESCE(sb.current_qty, sp.current_stock, 0) > 0
        ORDER BY p.name ASC
        LIMIT 4`,
        [storeId, category, productId]
      );
      return res.json({ success: true, data: fallbackResult.rows.map((r: any) => ({ ...r, currentStock: parseStock(r.currentStock) })) });
    } catch (fallbackError) {
      log.error("[storeProducts] Substitutes fallback error:", fallbackError);
      return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch substitutes" });
    }
  }
});

