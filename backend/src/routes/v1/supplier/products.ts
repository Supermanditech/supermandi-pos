// SM-006: Supplier Product CRUD Routes
// SM-007: CSV Upload included
// SEC-001: Status gating for write operations
// Manages supplier product catalog

import { Router, Response, NextFunction } from "express";
import { redisRateLimit } from "../../../middleware/rateLimit";
import { getPool } from "../../../db/client";
import { requireSupplierAuth, SupplierAuthRequest } from "./auth";
import { requireActiveSupplier, requireRegisteredSupplier } from "../../../middleware/supplierStatusGate";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { validateMoq, validatePrice } from "@supermandi/common";
import type { Pool } from "pg";
import { log } from "../../../lib/logger";
// V3-FIX-139: Supplier readiness gate for catalogue participation
import { checkSupplierReadiness } from "../../../services/supplierReadiness";

// SUPPLIER-IMPORT-NO-RATE-LIMIT: Limit CSV imports to 5 per supplier per hour.
// CSV parsing is CPU-intensive; unbounded rate allows a single supplier to spike CPU.
// SA-P2-011: Redis-backed rate limiting
const csvImportRateLimit = redisRateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  keyGenerator: (req) => (req as SupplierAuthRequest).supplierId || req.ip || 'unknown',
});

const router = Router();

// =============================================================================
// T-066: Auto-approval helper
// When a supplier has auto_approve_products = true, newly created products
// are automatically approved and mapped to the master catalog
// =============================================================================

async function checkAndAutoApprove(pool: Pool, supplierId: string, productId: string): Promise<boolean> {
  try {
    // Check if supplier has auto-approval enabled
    const supplierResult = await pool.query(
      `SELECT auto_approve_products, verification_status FROM supplier.suppliers WHERE id = $1`,
      [supplierId]
    );
    if (supplierResult.rows.length === 0) return false;
    if (!supplierResult.rows[0].auto_approve_products) return false;
    if (supplierResult.rows[0].verification_status !== 'verified') return false;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Auto-approve the product
      await client.query(
        `UPDATE catalog.supplier_products
         SET approval_status = 'approved', approved_at = NOW(), auto_approved = true
         WHERE id = $1::uuid AND approval_status = 'pending'`,
        [productId]
      );

      // Auto-map to master catalog (same logic as admin approve)
      const spDetails = await client.query(
        `SELECT name, category, brand, unit, barcode
         FROM catalog.supplier_products WHERE id = $1`,
        [productId]
      );

      if (spDetails.rows.length > 0) {
        const sp = spDetails.rows[0];
        let mappedProductId: string | null = null;
        let mappingConfidence = 0;

        // Try barcode match
        if (sp.barcode) {
          const barcodeMatch = await client.query(
            `SELECT id FROM catalog.products WHERE primary_barcode = $1 LIMIT 1`,
            [sp.barcode]
          );
          if (barcodeMatch.rows.length > 0) {
            mappedProductId = barcodeMatch.rows[0].id;
            mappingConfidence = 1.0;
          }
        }

        // Try name similarity
        if (!mappedProductId) {
          try {
            const nameMatch = await client.query(
              `SELECT id, similarity(name, $1) as sim FROM catalog.products
               WHERE similarity(name, $1) > 0.6 ORDER BY sim DESC LIMIT 1`,
              [sp.name]
            );
            if (nameMatch.rows.length > 0) {
              mappedProductId = nameMatch.rows[0].id;
              mappingConfidence = parseFloat(nameMatch.rows[0].sim);
            }
          } catch { /* pg_trgm not available */ }
        }

        // Create new master product if no match
        if (!mappedProductId) {
          const newProduct = await client.query(
            `INSERT INTO catalog.products (name, category, brand, unit, primary_barcode)
             VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [sp.name, sp.category, sp.brand, sp.unit, sp.barcode]
          );
          mappedProductId = newProduct.rows[0].id;
          mappingConfidence = 1.0;
        }

        // Insert mapping
        if (mappedProductId) {
          await client.query(
            `INSERT INTO catalog.supplier_product_map (supplier_product_id, product_id, mapping_type, confidence, is_verified)
             VALUES ($1::uuid, $2::uuid, 'auto', $3, false)
             ON CONFLICT (supplier_product_id, product_id) DO NOTHING`,
            [productId, mappedProductId, mappingConfidence]
          );
        }
      }

      // Audit log
      await client.query(
        `INSERT INTO supplier.approval_logs (entity_type, entity_id, action, from_status, to_status, actor_id)
         VALUES ('product', $1::uuid, 'auto_approve', 'pending', 'approved', NULL)`,
        [productId]
      );

      await client.query("COMMIT");
      log.info(`[T-066] Auto-approved product ${productId} for supplier ${supplierId}`);
      return true;
    } catch (err) {
      await client.query("ROLLBACK");
      log.warn("[T-066] Auto-approval failed (non-blocking):", err);
      return false;
    } finally {
      client.release();
    }
  } catch {
    return false;
  }
}

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
 * SEC-001: Allow registered suppliers (can view products during onboarding)
 */
router.get("/products", requireSupplierAuth, requireRegisteredSupplier, async (req: SupplierAuthRequest, res: Response, next: NextFunction) => {
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

    // STG-082: Server-side search and status filter
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const statusParam = typeof req.query.status === 'string' ? req.query.status : '';
    const validStatuses = ['pending', 'approved', 'rejected'];
    const statusFilter = validStatuses.includes(statusParam) ? statusParam : '';

    // Build WHERE clause
    const conditions: string[] = ['supplier_id = $1'];
    const queryParams: (string | number)[] = [req.supplierId!];
    let paramIdx = 2;

    if (search) {
      conditions.push(`(name ILIKE $${paramIdx} OR barcode ILIKE $${paramIdx} OR supplier_sku ILIKE $${paramIdx})`);
      queryParams.push(`%${search}%`);
      paramIdx++;
    }
    if (statusFilter) {
      conditions.push(`approval_status = $${paramIdx}`);
      queryParams.push(statusFilter);
      paramIdx++;
    }

    const whereClause = conditions.join(' AND ');

    // GL-WF-063: Get total count for pagination
    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM catalog.supplier_products WHERE ${whereClause}`,
      queryParams
    );
    const total = parseInt(countResult.rows[0]?.total || '0');

    // GL-WF-036: Include rejection_reason in product list
    // GL-WF-063: Add LIMIT and OFFSET for pagination
    // STBT-190.6: Include admin-edited fields so supplier sees platform overrides
    const paginationParams = [...queryParams, limit, offset];
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
        edited_name,
        edited_category,
        supermandi_margin_minor,
        bnpl_eligible,
        price_change_pending,
        pending_purchase_price,
        pending_mrp,
        image_url,
        thumbnail_url,
        net_content_value,
        net_content_unit,
        manufacturer_name,
        country_of_origin,
        shelf_life_days,
        created_at,
        updated_at,
        ptr_minor,
        pts_minor,
        trade_discount_pct,
        scheme,
        delivery_sla_days,
        delivery_terms,
        credit_days,
        finance_eligible,
        delivery_days,
        bnpl_max_days,
        published_terms_version,
        published_at,
        moq_tiers,
        procurement_unit,
        procurement_pack_qty,
        base_stock_unit,
        hsn_code,
        split_sell_eligible
      FROM catalog.supplier_products
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      paginationParams
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
        // STBT-190.6: Admin overrides visible to supplier
        editedName: p.edited_name || null,
        editedCategory: p.edited_category || null,
        superMandiMarginMinor: p.supermandi_margin_minor || 0,
        bnplEligible: p.bnpl_eligible || false,
        // T-147: Pending price change fields
        priceChangePending: p.price_change_pending || false,
        pendingPurchasePrice: p.pending_purchase_price || null,
        pendingMrp: p.pending_mrp || null,
        // STG-080: Include image URLs in response
        imageUrl: p.image_url || null,
        thumbnailUrl: p.thumbnail_url || null,
        // SCALE-A2: Net content fields
        netContentValue: p.net_content_value || null,
        netContentUnit: p.net_content_unit || null,
        // SCALE-A1: Compliance fields
        manufacturerName: p.manufacturer_name || null,
        countryOfOrigin: p.country_of_origin || null,
        shelfLifeDays: p.shelf_life_days || null,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
        // V3-FIX-174: Commercial terms
        ptrMinor: p.ptr_minor || null,
        ptsMinor: p.pts_minor || null,
        tradeDiscountPct: p.trade_discount_pct != null ? Number(p.trade_discount_pct) : null,
        scheme: p.scheme || null,
        deliverySlaDays: p.delivery_sla_days || null,
        deliveryTerms: p.delivery_terms || null,
        creditDays: p.credit_days || null,
        financeEligible: p.finance_eligible || false,
        deliveryDays: p.delivery_days || null,
        bnplMaxDays: p.bnpl_max_days || null,
        publishedTermsVersion: p.published_terms_version || null,
        publishedAt: p.published_at || null,
        moqTiers: p.moq_tiers || null,
        procurementUnit: p.procurement_unit || null,
        procurementPackQty: p.procurement_pack_qty != null ? Number(p.procurement_pack_qty) : null,
        baseStockUnit: p.base_stock_unit || null,
        hsnCode: p.hsn_code || null,
        splitSellEligible: p.split_sell_eligible || false,
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
 * GET /api/v1/supplier/products/:productId
 * ISSUE-026: Get a single product by ID (scoped to supplier)
 */
router.get("/products/:productId", requireSupplierAuth, requireRegisteredSupplier, async (req: SupplierAuthRequest, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: 'DB_UNAVAILABLE', message: 'Database unavailable' } });
      return;
    }

    const result = await pool.query(
      `SELECT id, name, category, brand, supplier_sku, barcode,
              purchase_price, mrp, moq, unit, stock_quantity, stock_status,
              is_active, approval_status, rejection_reason,
              edited_name, edited_category, supermandi_margin_minor, bnpl_eligible,
              price_change_pending, pending_purchase_price, pending_mrp,
              image_url, thumbnail_url, net_content_value, net_content_unit,
              manufacturer_name, country_of_origin, shelf_life_days,
              created_at, updated_at,
              ptr_minor, pts_minor, trade_discount_pct, scheme,
              delivery_sla_days, delivery_terms, credit_days, finance_eligible,
              delivery_days, bnpl_max_days, published_terms_version, published_at,
              moq_tiers, procurement_unit, procurement_pack_qty, base_stock_unit, hsn_code,
              split_sell_eligible
       FROM catalog.supplier_products
       WHERE id = $1::uuid AND supplier_id = $2`,
      [req.params.productId, req.supplierId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Product not found' } });
      return;
    }

    const p = result.rows[0];
    res.json({
      data: {
        id: p.id, name: p.name, category: p.category, brand: p.brand,
        supplierSku: p.supplier_sku, barcode: p.barcode,
        purchasePrice: p.purchase_price, mrp: p.mrp, moq: p.moq, unit: p.unit,
        stockQuantity: p.stock_quantity, stockStatus: p.stock_status,
        isActive: p.is_active, approvalStatus: p.approval_status || 'pending',
        rejectionReason: p.rejection_reason,
        editedName: p.edited_name || null, editedCategory: p.edited_category || null,
        superMandiMarginMinor: p.supermandi_margin_minor || 0,
        bnplEligible: p.bnpl_eligible || false,
        priceChangePending: p.price_change_pending || false,
        pendingPurchasePrice: p.pending_purchase_price || null,
        pendingMrp: p.pending_mrp || null,
        imageUrl: p.image_url || null, thumbnailUrl: p.thumbnail_url || null,
        netContentValue: p.net_content_value || null, netContentUnit: p.net_content_unit || null,
        manufacturerName: p.manufacturer_name || null, countryOfOrigin: p.country_of_origin || null,
        shelfLifeDays: p.shelf_life_days || null,
        createdAt: p.created_at, updatedAt: p.updated_at,
        // V3-FIX-174: Commercial terms
        ptrMinor: p.ptr_minor || null, ptsMinor: p.pts_minor || null,
        tradeDiscountPct: p.trade_discount_pct != null ? Number(p.trade_discount_pct) : null,
        scheme: p.scheme || null, deliverySlaDays: p.delivery_sla_days || null,
        deliveryTerms: p.delivery_terms || null, creditDays: p.credit_days || null,
        financeEligible: p.finance_eligible || false, deliveryDays: p.delivery_days || null,
        bnplMaxDays: p.bnpl_max_days || null, publishedTermsVersion: p.published_terms_version || null,
        publishedAt: p.published_at || null,
        moqTiers: p.moq_tiers || null,
        procurementUnit: p.procurement_unit || null,
        procurementPackQty: p.procurement_pack_qty != null ? Number(p.procurement_pack_qty) : null,
        baseStockUnit: p.base_stock_unit || null,
        hsnCode: p.hsn_code || null,
        splitSellEligible: p.split_sell_eligible || false,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/supplier/products
 * Create a new product
 * SEC-001: Requires ACTIVE supplier status
 */
router.post("/products", requireSupplierAuth, requireActiveSupplier, async (req: SupplierAuthRequest, res: Response, next: NextFunction) => {
  try {
    // V3-FIX-139: Supplier readiness gate — block SKU submission until all requirements met
    const readinessPool = getPool();
    if (readinessPool && req.supplierId) {
      const readiness = await checkSupplierReadiness(readinessPool, req.supplierId);
      if (!readiness.ready) {
        return res.status(403).json({
          error: "SUPPLIER_NOT_READY",
          message: "Complete KYC, bank verification, and profile before submitting products",
          blockers: readiness.blockers,
          checks: readiness.checks,
        });
      }
    }

    // STG-080: Added imageUrl to destructuring for product image persistence
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
      imageUrl,
      manufacturerName, countryOfOrigin, shelfLifeDays, // SCALE-A1: Compliance fields
      netContentValue, // SCALE-A2
      netContentUnit,  // SCALE-A2
      // V3-FIX-169: Procurement packaging metadata
      procurementUnit, procurementPackQty, baseStockUnit, splitSellEligible,
      // V3-FIX-174: Commercial terms
      ptrMinor, ptsMinor, tradeDiscountPct, scheme,
      deliverySlaDays, deliveryTerms, creditDays: supplierCreditDays, financeEligible,
      moqTiers, packageType,
      hsnCode, // GCP-STG-0291: HSN code for GST compliance
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

    // SCALE-A2: Validate net content unit if provided
    const VALID_NET_CONTENT_UNITS = ['g', 'kg', 'ml', 'l', 'pcs'];
    if (netContentUnit !== undefined && netContentUnit !== null && netContentUnit !== '') {
      if (!VALID_NET_CONTENT_UNITS.includes(netContentUnit)) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: `Invalid net content unit. Must be one of: ${VALID_NET_CONTENT_UNITS.join(', ')}` }
        });
        return;
      }
    }

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: 'DB_UNAVAILABLE', message: 'Database unavailable' } });
      return;
    }

    // SYS-001: Check SKU capacity before INSERT
    const capCheck = await pool.query(
      `SELECT s.max_sku_capacity, COUNT(sp.id)::int AS current_count
       FROM supplier.suppliers s
       LEFT JOIN catalog.supplier_products sp ON sp.supplier_id = s.id
       WHERE s.id = $1
       GROUP BY s.max_sku_capacity`,
      [req.supplierId]
    );
    if (capCheck.rows.length > 0 && capCheck.rows[0].current_count >= capCheck.rows[0].max_sku_capacity) {
      res.status(400).json({ error: { code: "SKU_LIMIT_REACHED", message: `SKU limit reached (${capCheck.rows[0].max_sku_capacity}). Contact SuperMandi to increase capacity.` } });
      return;
    }

    // STG-080: Include image_url in INSERT
    // SCALE-A1: Include compliance fields
    // SCALE-A2: Include net_content_value and net_content_unit
    // V3-FIX-169: Include procurement packaging metadata
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
        image_url,
        net_content_value,
        net_content_unit,
        manufacturer_name,
        country_of_origin,
        shelf_life_days,
        procurement_unit,
        procurement_pack_qty,
        base_stock_unit,
        split_sell_eligible,
        ptr_minor,
        pts_minor,
        trade_discount_pct,
        scheme,
        delivery_sla_days,
        delivery_terms,
        credit_days,
        finance_eligible,
        moq_tiers,
        hsn_code,
        approval_status,
        is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, 'pending', true)
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
        image_url,
        net_content_value,
        net_content_unit,
        manufacturer_name,
        country_of_origin,
        shelf_life_days,
        approval_status,
        is_active,
        created_at,
        ptr_minor,
        pts_minor,
        trade_discount_pct,
        scheme,
        delivery_sla_days,
        delivery_terms,
        credit_days,
        finance_eligible,
        moq_tiers,
        procurement_unit,
        procurement_pack_qty,
        base_stock_unit,
        hsn_code,
        split_sell_eligible`,
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
        imageUrl || null,
        netContentValue !== undefined && netContentValue !== null ? parseFloat(netContentValue) : null,
        netContentUnit || null,
        manufacturerName?.trim() || null,
        countryOfOrigin?.trim() || null,
        shelfLifeDays !== undefined && shelfLifeDays !== null ? parseInt(shelfLifeDays) : null,
        procurementUnit?.trim() || null,
        procurementPackQty !== undefined && procurementPackQty !== null ? parseFloat(procurementPackQty) : null,
        baseStockUnit?.trim() || null,
        splitSellEligible === true || splitSellEligible === 'true',
        ptrMinor != null ? parseInt(String(ptrMinor)) : null,
        ptsMinor != null ? parseInt(String(ptsMinor)) : null,
        tradeDiscountPct != null ? parseFloat(String(tradeDiscountPct)) : null,
        scheme?.trim() || null,
        deliverySlaDays != null ? parseInt(String(deliverySlaDays)) : null,
        deliveryTerms?.trim() || null,
        supplierCreditDays != null ? parseInt(String(supplierCreditDays)) : null,
        financeEligible === true || financeEligible === 'true',
        moqTiers ? (typeof moqTiers === 'string' ? moqTiers : JSON.stringify(moqTiers)) : null,
        hsnCode?.trim() || null, // GCP-STG-0291
      ]
    );

    const product = result.rows[0];

    // T-066: Check for auto-approval (non-blocking — if it fails, product stays pending)
    let approvalStatus = product.approval_status;
    const autoApproved = await checkAndAutoApprove(pool, req.supplierId!, product.id);
    if (autoApproved) {
      approvalStatus = 'approved';
    }

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
        netContentValue: product.net_content_value || null,
        netContentUnit: product.net_content_unit || null,
        manufacturerName: product.manufacturer_name || null,
        countryOfOrigin: product.country_of_origin || null,
        shelfLifeDays: product.shelf_life_days || null,
        approvalStatus,
        isActive: product.is_active,
        createdAt: product.created_at,
        autoApproved,
        // V3-FIX-174: Commercial terms in CREATE response (full draft contract)
        ptrMinor: product.ptr_minor || null,
        ptsMinor: product.pts_minor || null,
        tradeDiscountPct: product.trade_discount_pct != null ? Number(product.trade_discount_pct) : null,
        scheme: product.scheme || null,
        deliverySlaDays: product.delivery_sla_days || null,
        deliveryTerms: product.delivery_terms || null,
        creditDays: product.credit_days || null,
        financeEligible: product.finance_eligible || false,
        deliveryDays: product.delivery_days || null,
        bnplMaxDays: product.bnpl_max_days || null,
        publishedTermsVersion: product.published_terms_version || null,
        publishedAt: product.published_at || null,
        moqTiers: product.moq_tiers || null,
        procurementUnit: product.procurement_unit || null,
        procurementPackQty: product.procurement_pack_qty != null ? Number(product.procurement_pack_qty) : null,
        baseStockUnit: product.base_stock_unit || null,
        hsnCode: product.hsn_code || null,
        splitSellEligible: product.split_sell_eligible || false,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/v1/supplier/products/:id
 * Update a product
 * SEC-001: Requires ACTIVE supplier status
 */
router.patch("/products/:id", requireSupplierAuth, requireActiveSupplier, async (req: SupplierAuthRequest, res: Response, next: NextFunction) => {
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
      imageUrl,  // STG-080: Accept imageUrl in update
      manufacturerName, countryOfOrigin, shelfLifeDays, // SCALE-A1: Compliance fields
      netContentValue, // SCALE-A2
      netContentUnit,  // SCALE-A2
      // V3-FIX-174: Commercial terms
      ptrMinor, ptsMinor, tradeDiscountPct, scheme,
      deliverySlaDays, deliveryTerms, creditDays: patchCreditDays, financeEligible,
      moqTiers: patchMoqTiers, packageType: patchPackageType,
      // V3-FIX-174: Package/procurement semantics
      procurementUnit: patchProcurementUnit,
      procurementPackQty: patchProcurementPackQty,
      baseStockUnit: patchBaseStockUnit,
      splitSellEligible: patchSplitSellEligible,
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

    // SCALE-A2: Validate net content unit if being updated
    const VALID_NET_CONTENT_UNITS_PATCH = ['g', 'kg', 'ml', 'l', 'pcs'];
    if (netContentUnit !== undefined && netContentUnit !== null && netContentUnit !== '') {
      if (!VALID_NET_CONTENT_UNITS_PATCH.includes(netContentUnit)) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: `Invalid net content unit. Must be one of: ${VALID_NET_CONTENT_UNITS_PATCH.join(', ')}` }
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
    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(description || null);
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
    // STG-080: Include image_url in UPDATE
    if (imageUrl !== undefined) {
      updates.push(`image_url = $${paramIndex++}`);
      values.push(imageUrl || null);
    }
    // SCALE-A1: Compliance fields in UPDATE
    if (manufacturerName !== undefined) {
      updates.push(`manufacturer_name = $${paramIndex++}`);
      values.push(manufacturerName?.trim() || null);
    }
    if (countryOfOrigin !== undefined) {
      updates.push(`country_of_origin = $${paramIndex++}`);
      values.push(countryOfOrigin?.trim() || null);
    }
    if (shelfLifeDays !== undefined) {
      updates.push(`shelf_life_days = $${paramIndex++}`);
      values.push(shelfLifeDays !== null ? parseInt(shelfLifeDays) : null);
    }
    // SCALE-A2: Include net_content fields in UPDATE
    if (netContentValue !== undefined) {
      updates.push(`net_content_value = $${paramIndex++}`);
      values.push(netContentValue !== null ? parseFloat(netContentValue) : null);
    }
    if (netContentUnit !== undefined) {
      updates.push(`net_content_unit = $${paramIndex++}`);
      values.push(netContentUnit || null);
    }

    // V3-FIX-174: Commercial term fields in UPDATE
    if (ptrMinor !== undefined) { updates.push(`ptr_minor = $${paramIndex++}`); values.push(ptrMinor != null ? parseInt(String(ptrMinor)) : null); }
    if (ptsMinor !== undefined) { updates.push(`pts_minor = $${paramIndex++}`); values.push(ptsMinor != null ? parseInt(String(ptsMinor)) : null); }
    if (tradeDiscountPct !== undefined) { updates.push(`trade_discount_pct = $${paramIndex++}`); values.push(tradeDiscountPct != null ? parseFloat(String(tradeDiscountPct)) : null); }
    if (scheme !== undefined) { updates.push(`scheme = $${paramIndex++}`); values.push(scheme?.trim() || null); }
    if (deliverySlaDays !== undefined) { updates.push(`delivery_sla_days = $${paramIndex++}`); values.push(deliverySlaDays != null ? parseInt(String(deliverySlaDays)) : null); }
    if (deliveryTerms !== undefined) { updates.push(`delivery_terms = $${paramIndex++}`); values.push(deliveryTerms?.trim() || null); }
    if (patchCreditDays !== undefined) { updates.push(`credit_days = $${paramIndex++}`); values.push(patchCreditDays != null ? parseInt(String(patchCreditDays)) : null); }
    if (financeEligible !== undefined) { updates.push(`finance_eligible = $${paramIndex++}`); values.push(String(financeEligible === true || financeEligible === 'true')); }
    if (patchMoqTiers !== undefined) { updates.push(`moq_tiers = $${paramIndex++}`); values.push(typeof patchMoqTiers === 'string' ? patchMoqTiers : JSON.stringify(patchMoqTiers)); }
    // V3-FIX-174: Package/procurement semantics in supplier PATCH
    if (patchProcurementUnit !== undefined) { updates.push(`procurement_unit = $${paramIndex++}`); values.push(patchProcurementUnit?.trim() || null); }
    if (patchProcurementPackQty !== undefined) { updates.push(`procurement_pack_qty = $${paramIndex++}`); values.push(patchProcurementPackQty != null ? parseFloat(String(patchProcurementPackQty)) : null); }
    if (patchBaseStockUnit !== undefined) { updates.push(`base_stock_unit = $${paramIndex++}`); values.push(patchBaseStockUnit?.trim() || null); }
    if (patchSplitSellEligible !== undefined) { updates.push(`split_sell_eligible = $${paramIndex++}`); values.push(String(patchSplitSellEligible === true || patchSplitSellEligible === 'true')); }

    if (updates.length === 0) {
      res.status(400).json({
        error: { code: 'NO_UPDATES', message: 'No fields to update' }
      });
      return;
    }

    // T-147: Determine if this is a price-only edit on an approved product
    // Price-only fields: purchasePrice, mrp (no name/barcode/description/category/brand/unit change)
    const NON_PRICE_FIELDS_CHANGED = (
      name !== undefined ||
      category !== undefined ||
      brand !== undefined ||
      barcode !== undefined ||
      supplierSku !== undefined ||
      moq !== undefined ||
      unit !== undefined
    );
    const PRICE_FIELDS_CHANGED = (purchasePrice !== undefined || mrp !== undefined);
    const isPriceOnlyEdit = PRICE_FIELDS_CHANGED && !NON_PRICE_FIELDS_CHANGED;

    // Get the current approval_status to decide behavior
    const currentStatusResult = await pool.query(
      `SELECT approval_status FROM catalog.supplier_products WHERE id = $1`,
      [id]
    );
    const currentApprovalStatus = currentStatusResult.rows[0]?.approval_status;

    if (isPriceOnlyEdit && currentApprovalStatus === 'approved') {
      // T-147: Price-only edit on approved product — keep approved, store pending price
      // Product stays visible on POS at the OLD price until admin approves the new price
      if (purchasePrice !== undefined) {
        updates.push(`pending_purchase_price = $${paramIndex++}`);
        values.push(purchasePrice);
      }
      if (mrp !== undefined) {
        updates.push(`pending_mrp = $${paramIndex++}`);
        values.push(mrp);
      }
      updates.push(`price_change_pending = true`);
      // Do NOT change approval_status — product stays approved and visible

      // Remove the direct price updates from the SET clause since we store them as pending
      // We need to rebuild updates without the direct price fields
      const filteredUpdates = updates.filter(u =>
        !u.startsWith('purchase_price =') && !u.startsWith('mrp =')
      );
      // Replace updates array
      updates.length = 0;
      updates.push(...filteredUpdates);

      // Also remove the corresponding values — we need to rebuild paramIndex
      // Since we added pending fields at the end, and removed direct price fields,
      // the values array is already correct (pending values replaced direct price values)
    } else {
      // T-064/GL-WF-037: Non-price edit or product not approved — reset to pending for re-review
      // Rejected products should go back to pending for re-review (resubmit flow)
      updates.push(`approval_status = CASE WHEN approval_status IN ('approved', 'rejected') THEN 'pending' ELSE approval_status END`);
      // Clear rejection reason when resubmitting
      updates.push(`rejection_reason = CASE WHEN approval_status = 'rejected' THEN NULL ELSE rejection_reason END`);
      // T-147: Clear any pending price fields since we're going back to pending review anyway
      updates.push(`price_change_pending = false`);
      updates.push(`pending_purchase_price = NULL`);
      updates.push(`pending_mrp = NULL`);
    }

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
         manufacturer_name,
         country_of_origin,
         shelf_life_days,
         net_content_value,
         net_content_unit,
         approval_status,
         is_active,
         price_change_pending,
         pending_purchase_price,
         pending_mrp,
         updated_at,
         ptr_minor,
         pts_minor,
         trade_discount_pct,
         scheme,
         delivery_sla_days,
         delivery_terms,
         credit_days,
         finance_eligible,
         moq_tiers,
         procurement_unit,
         procurement_pack_qty,
         base_stock_unit,
         hsn_code,
         split_sell_eligible,
         image_url,
         description`,
      values
    );

    const product = result.rows[0];

    // CL-014: Cascade purchase price to linked store_products when supplier changes price
    // T-147: Only cascade immediately if product is NOT approved (going to pending review)
    // For approved products with price-only edits, the price cascades only after admin approval
    if (purchasePrice !== undefined && !(isPriceOnlyEdit && currentApprovalStatus === 'approved')) {
      await pool.query(
        `UPDATE catalog.store_products sp
         SET purchase_price = $1, updated_at = NOW()
         FROM catalog.supplier_product_map spm
         WHERE spm.product_id = sp.product_id
           AND spm.supplier_product_id = $2
           AND sp.is_active = true`,
        [purchasePrice, id]
      );
    }

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
        netContentValue: product.net_content_value || null,
        netContentUnit: product.net_content_unit || null,
        manufacturerName: product.manufacturer_name || null,
        countryOfOrigin: product.country_of_origin || null,
        shelfLifeDays: product.shelf_life_days || null,
        approvalStatus: product.approval_status,
        isActive: product.is_active,
        // T-147: Include pending price info in response
        priceChangePending: product.price_change_pending || false,
        pendingPurchasePrice: product.pending_purchase_price || null,
        pendingMrp: product.pending_mrp || null,
        updatedAt: product.updated_at,
        // V3-FIX-174: Commercial terms in PATCH response (full draft contract)
        ptrMinor: product.ptr_minor || null,
        ptsMinor: product.pts_minor || null,
        tradeDiscountPct: product.trade_discount_pct != null ? Number(product.trade_discount_pct) : null,
        scheme: product.scheme || null,
        deliverySlaDays: product.delivery_sla_days || null,
        deliveryTerms: product.delivery_terms || null,
        creditDays: product.credit_days || null,
        financeEligible: product.finance_eligible || false,
        deliveryDays: product.delivery_days || null,
        bnplMaxDays: product.bnpl_max_days || null,
        publishedTermsVersion: product.published_terms_version || null,
        publishedAt: product.published_at || null,
        moqTiers: product.moq_tiers || null,
        procurementUnit: product.procurement_unit || null,
        procurementPackQty: product.procurement_pack_qty != null ? Number(product.procurement_pack_qty) : null,
        baseStockUnit: product.base_stock_unit || null,
        hsnCode: product.hsn_code || null,
        splitSellEligible: product.split_sell_eligible || false,
        imageUrl: product.image_url || null,
        description: product.description || null,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/supplier/products/:id
 * Delete a product
 * SEC-001: Requires ACTIVE supplier status
 */
router.delete("/products/:id", requireSupplierAuth, requireActiveSupplier, async (req: SupplierAuthRequest, res: Response, next: NextFunction) => {
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
 * SEC-001: Requires ACTIVE supplier status
 */
router.post(
  "/products/csv-upload",
  requireSupplierAuth,
  requireActiveSupplier,
  csvImportRateLimit,
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

      // SYS-001: Check SKU capacity before CSV import
      const csvCapCheck = await pool.query(
        `SELECT s.max_sku_capacity, COUNT(sp.id)::int AS current_count
         FROM supplier.suppliers s
         LEFT JOIN catalog.supplier_products sp ON sp.supplier_id = s.id
         WHERE s.id = $1
         GROUP BY s.max_sku_capacity`,
        [req.supplierId]
      );
      const skuCap = csvCapCheck.rows[0]?.max_sku_capacity ?? 3000;
      const skuCount = csvCapCheck.rows[0]?.current_count ?? 0;

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

      // T-063: Track barcodes within this CSV to detect intra-file duplicates
      const seenBarcodes = new Set<string>();

      // SYS-001: Reject entire CSV if it would exceed capacity
      if (skuCount + records.length > skuCap) {
        res.status(400).json({ error: { code: "SKU_LIMIT_EXCEEDED", message: `CSV has ${records.length} rows but only ${skuCap - skuCount} SKU slots remaining (capacity: ${skuCap})` } });
        return;
      }

      // GCP-STG-0296: Process rows in batched transactions (chunks of 200)
      const SUPPLIER_CSV_CHUNK = 200;
      for (let chunkStart = 0; chunkStart < records.length; chunkStart += SUPPLIER_CSV_CHUNK) {
        const chunkEnd = Math.min(chunkStart + SUPPLIER_CSV_CHUNK, records.length);
        const client = await pool.connect();
        try {
          await client.query("BEGIN");

      for (let i = chunkStart; i < chunkEnd; i++) {
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

          // T-063: Validate barcode format (GTIN: 8, 12, 13, or 14 digits) — GL-WF-056
          if (barcode && !/^\d{8}$|^\d{12,14}$/.test(barcode)) {
            results.errors.push({ row: rowNum, error: 'Invalid barcode format (must be 8, 12, 13, or 14 digits)' });
            results.skipped++;
            continue;
          }

          // T-063: Validate category against FMCG taxonomy — GL-WF-057
          if (category && !VALID_CATEGORIES.includes(category)) {
            results.errors.push({ row: rowNum, error: `Invalid category "${category}". Must be one of: ${VALID_CATEGORIES.join(', ')}` });
            results.skipped++;
            continue;
          }

          // T-063: Validate MRP >= purchase price — GL-WF-017
          if (mrp !== null && mrp < purchasePrice) {
            results.errors.push({ row: rowNum, error: 'MRP must be >= purchase price' });
            results.skipped++;
            continue;
          }

          // T-063: Validate MOQ bounds — GO-LIVE-163
          if (moq < 1 || moq > 10000) {
            results.errors.push({ row: rowNum, error: 'MOQ must be between 1 and 10000' });
            results.skipped++;
            continue;
          }

          // T-063: Dedup — skip if barcode already seen in this CSV
          if (barcode) {
            if (seenBarcodes.has(barcode)) {
              results.errors.push({ row: rowNum, error: `Duplicate barcode "${barcode}" in CSV` });
              results.skipped++;
              continue;
            }
            seenBarcodes.add(barcode);
          }

          // T-063: Dedup — check if barcode already exists for this supplier, update if so
          // GCP-STG-0296: Use client (transaction) instead of pool for batch efficiency
          if (barcode) {
            const existing = await client.query(
              `SELECT id, approval_status FROM catalog.supplier_products
               WHERE supplier_id = $1 AND barcode = $2`,
              [req.supplierId, barcode]
            );
            if (existing.rows.length > 0) {
              // Update existing product (only if still pending — don't overwrite approved products)
              if (existing.rows[0].approval_status === 'pending') {
                await client.query(
                  `UPDATE catalog.supplier_products SET
                    name = $2, category = $3, brand = $4, supplier_sku = $5,
                    purchase_price = $6, mrp = $7, moq = $8, unit = $9, updated_at = NOW()
                   WHERE id = $1`,
                  [existing.rows[0].id, name, category, brand, supplierSku,
                   purchasePrice, mrp, moq, unit]
                );
              }
              // else: approved/rejected — skip silently (don't reset approval)
            } else {
              await client.query(
                `INSERT INTO catalog.supplier_products (
                  supplier_id, name, category, brand, barcode, supplier_sku,
                  purchase_price, mrp, moq, unit, approval_status, is_active
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', true)`,
                [req.supplierId, name, category, brand, barcode, supplierSku,
                 purchasePrice, mrp, moq, unit]
              );
            }
          } else {
            await client.query(
              `INSERT INTO catalog.supplier_products (
                supplier_id, name, category, brand, barcode, supplier_sku,
                purchase_price, mrp, moq, unit, approval_status, is_active
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', true)`,
              [req.supplierId, name, category, brand, barcode, supplierSku,
               purchasePrice, mrp, moq, unit]
            );
          }

          results.imported++;
        } catch (rowError) {
          results.errors.push({
            row: rowNum,
            error: rowError instanceof Error ? rowError.message : 'Unknown error',
          });
          results.skipped++;
        }
      } // end row loop

          await client.query("COMMIT");
        } catch (chunkErr: any) {
          await client.query("ROLLBACK").catch(() => {});
          log.error(`[SupplierCSV] Chunk ${chunkStart}-${chunkEnd} failed:`, chunkErr.message);
          // Mark all rows in this chunk as skipped
          for (let j = chunkStart; j < chunkEnd; j++) {
            results.skipped++;
            results.errors.push({ row: j + 2, error: `Chunk transaction failed: ${chunkErr.message}` });
          }
        } finally {
          client.release();
        }
      } // end chunk loop

      // T-066: Batch auto-approve if supplier has auto_approve_products enabled
      let autoApprovedCount = 0;
      if (results.imported > 0 && req.supplierId) {
        try {
          const supplierCheck = await pool.query(
            `SELECT auto_approve_products, verification_status FROM supplier.suppliers WHERE id = $1`,
            [req.supplierId]
          );
          if (supplierCheck.rows[0]?.auto_approve_products && supplierCheck.rows[0]?.verification_status === 'verified') {
            // Get all pending products from this supplier for auto-approval
            const pendingProducts = await pool.query(
              `SELECT id FROM catalog.supplier_products
               WHERE supplier_id = $1 AND approval_status = 'pending'`,
              [req.supplierId]
            );

            // Auto-approve each one (includes mapping logic)
            for (const row of pendingProducts.rows) {
              const approved = await checkAndAutoApprove(pool, req.supplierId, row.id);
              if (approved) autoApprovedCount++;
            }
          }
        } catch (aaErr) {
          log.warn("[T-066] CSV batch auto-approval failed (non-blocking):", aaErr);
        }
      }

      res.json({ data: { ...results, autoApprovedCount } });
    } catch (error) {
      next(error);
    }
  }
);

export const supplierProductsRouter = router;
