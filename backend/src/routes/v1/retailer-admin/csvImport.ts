// Retailer Admin CSV Import Routes
// RCAT-CSV-001: CSV template download
// RCAT-CSV-002: Upload → validate → review → commit flow
// Store-scoped via JWT (x-actor-id header from gateway)
// GO-LIVE-049: Added file size limits for security
// GO-LIVE-178: Enhanced error reporting for partial failures

import { Router, Request, Response } from "express";
import { redisRateLimit } from "../../../middleware/rateLimit";
import { getPool } from "../../../db/client";
import { sanitizeHtml } from "@supermandi/common";
import {
  validateProductName as validateProductNameUnified,
  validateBarcode as validateBarcodeUnified,
  validatePrice as validatePriceUnified,
  validateStock as validateStockUnified,
} from "../../../utils/productValidation";
// T-197: Keyword-based auto-categorization fallback
import { suggestCategory } from "../../../utils/autoCategorization";
import { log } from "../../../lib/logger";
import { asError } from "../../../lib/errorUtils";

export const retailerAdminCsvImportRouter = Router();

// RET-POS-SYNC-004: Per-store CSV upload rate limit (10 imports per hour per store)
// SA-P2-011: Redis-backed rate limiting
const csvUploadRateLimiter = redisRateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  keyGenerator: (req: Request) => getStoreId(req) || req.ip || 'unknown',
});

// GO-LIVE-178: Error categories for better failure diagnosis
type ImportErrorCategory = 'duplicate_barcode' | 'validation_error' | 'db_constraint' | 'db_error' | 'unknown';

interface CategorizedWarning {
  row: number;
  message: string;
  category: ImportErrorCategory;
  field?: string;
  originalValue?: string;
}

function categorizeDbError(err: any, row: any): CategorizedWarning {
  const rowNum = row.row ?? 0;

  // PostgreSQL error code 23505 = unique_violation
  if (err.code === '23505') {
    // Check constraint name or detail for more specific info
    const detail = err.detail || '';
    if (detail.includes('barcode') || err.constraint?.includes('barcode')) {
      return {
        row: rowNum,
        message: `Duplicate barcode "${row.barcode}" already exists in store`,
        category: 'duplicate_barcode',
        field: 'barcode',
        originalValue: row.barcode,
      };
    }
    return {
      row: rowNum,
      message: `Duplicate value: ${err.detail || err.message}`,
      category: 'db_constraint',
    };
  }

  // PostgreSQL error code 23503 = foreign_key_violation
  if (err.code === '23503') {
    return {
      row: rowNum,
      message: `Referenced data not found: ${err.detail || err.message}`,
      category: 'db_constraint',
    };
  }

  // PostgreSQL error code 23502 = not_null_violation
  if (err.code === '23502') {
    return {
      row: rowNum,
      message: `Required field missing: ${err.column || 'unknown'}`,
      category: 'db_constraint',
      field: err.column,
    };
  }

  // Other database errors
  if (err.code && /^[0-9A-Z]{5}$/.test(err.code)) {
    return {
      row: rowNum,
      message: `Database error (${err.code}): ${(err.message || '').substring(0, 80)}`,
      category: 'db_error',
    };
  }

  return {
    row: rowNum,
    message: `Error: ${(err.message || 'Unknown error').substring(0, 80)}`,
    category: 'unknown',
  };
}

function summarizeWarnings(warnings: CategorizedWarning[]): Record<ImportErrorCategory, number> {
  const summary: Record<ImportErrorCategory, number> = {
    duplicate_barcode: 0,
    validation_error: 0,
    db_constraint: 0,
    db_error: 0,
    unknown: 0,
  };

  for (const w of warnings) {
    summary[w.category]++;
  }

  return summary;
}

// GO-LIVE-049: File size limits
const MAX_CSV_SIZE_BYTES = 5 * 1024 * 1024; // 5MB max CSV file size
const MAX_CSV_ROWS = 10000; // 10,000 rows max

/**
 * Get store ID from gateway-provided headers
 */
function getStoreId(req: Request): string | null {
  const actorId = req.headers['x-actor-id'];
  return typeof actorId === 'string' ? actorId : null;
}

/**
 * Generate a store-scoped barcode for LOOSE_BULK products
 */
function generateStoreBarcode(storeId: string): string {
  const storePrefix = storeId.replace(/-/g, '').substring(0, 6);
  const timestamp = Date.now().toString().slice(-7);
  const random = Math.floor(Math.random() * 100).toString().padStart(2, '0');
  return `2${storePrefix}${timestamp}${random}`;
}

function safeNumber(val: unknown, defaultVal = 0): number {
  if (val === null || val === undefined) return defaultVal;
  const num = Number(val);
  return isNaN(num) ? defaultVal : num;
}

// CSV Template headers and examples
// T-061: Added variant_of, variant_label, variant_qty, variant_unit columns for retail variants
// T-165: Added image_url column for product image links
const CSV_TEMPLATE = `name,barcode,brand,unit,sell_price,purchase_price,mrp,stock,mode,sold_by,rate_unit,pack_size,pack_unit,low_stock_alert,gst_percent,hsn,notes,image_url,variant_of,variant_label,variant_qty,variant_unit,procurement_unit,procurement_pack_qty,base_stock_unit
"Parle-G Glucose Biscuits 100g","8901234567890","Parle","PCS","10.00","8.50","10.00","50","PACKAGED","","","100","g","10","18","1905","Popular biscuit","","","","","","PCS","1","PCS"
"Tata Salt 1kg","8901234567891","Tata","PCS","28.00","25.00","28.00","100","PACKAGED","","","1000","g","20","0","2501","","","","","","","PCS","1","PCS"
"Loose Rice Basmati","","Local","KG","85.00","75.00","","25","LOOSE_BULK","WEIGHT","KG","","","5","5","1006","Premium basmati","","","","","","BAG","50","KG"
"Fresh Eggs","","Farm Fresh","PCS","7.00","5.50","","100","LOOSE_BULK","COUNT","PCS","","","20","0","0407","Per piece rate","","","","","","TRAY","30","PCS"
"Oil 15L Tin","","Brand","LTR","180.00","150.00","","10","LOOSE_BULK","WEIGHT","LTR","","","5","5","1507","Loose oil","","","","","","TIN","15","LTR"
"","","","","27.00","","","","","","","","","","","","500gm variant","","Loose Rice Basmati","500 gm","500","GM"
"","","","","240.00","","","","","","","","","","","","5kg variant","","Loose Rice Basmati","5 kg","5","KG"
`;

// T-061: Valid variant base units
const VALID_VARIANT_UNITS = new Set(['KG', 'GM', 'LTR', 'ML', 'PCS', 'DOZEN']);

// =============================================================================
// GET /api/v1/retailer-admin/products/import/template
// RCAT-CSV-001: Download CSV template
// =============================================================================

retailerAdminCsvImportRouter.get("/products/import/template", async (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="supermandi_products_import_template.csv"');
  return res.send(CSV_TEMPLATE);
});

// =============================================================================
// POST /api/v1/retailer-admin/products/import/upload
// RCAT-CSV-002: Upload CSV file and store temporarily
// Accepts raw CSV text in body (for simplicity; multipart can be added later)
// =============================================================================

retailerAdminCsvImportRouter.post("/products/import/upload", csvUploadRateLimiter, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: { code: "INTERNAL_ERROR", message: "Database unavailable" } });

  const storeId = getStoreId(req);
  if (!storeId) {
    return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Store not identified" } });
  }

  const { csvContent, fileName } = req.body;
  if (!csvContent || typeof csvContent !== 'string') {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "CSV content is required" },
    });
  }

  // GO-LIVE-049: File size validation
  const contentSizeBytes = Buffer.byteLength(csvContent, 'utf8');
  if (contentSizeBytes > MAX_CSV_SIZE_BYTES) {
    return res.status(413).json({
      error: {
        code: "FILE_TOO_LARGE",
        message: `CSV file too large. Maximum size is ${MAX_CSV_SIZE_BYTES / (1024 * 1024)}MB.`,
        details: { maxBytes: MAX_CSV_SIZE_BYTES, actualBytes: contentSizeBytes }
      },
    });
  }

  try {
    // Parse CSV rows
    const lines = csvContent.trim().split('\n');

    // GO-LIVE-049: Row count validation
    if (lines.length - 1 > MAX_CSV_ROWS) {
      return res.status(400).json({
        error: {
          code: "TOO_MANY_ROWS",
          message: `CSV has too many rows. Maximum is ${MAX_CSV_ROWS} data rows.`,
          details: { maxRows: MAX_CSV_ROWS, actualRows: lines.length - 1 }
        },
      });
    }

    if (lines.length < 2) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "CSV must have at least a header row and one data row" },
      });
    }

    // Store the job in the database
    const userId = req.headers['x-user-id'] as string || storeId;
    const jobResult = await pool.query(
      `INSERT INTO platform.csv_imports (
        store_id, file_name, file_sha256, total_rows, status, uploaded_by_user_id
      ) VALUES ($1, $2, $3, $4, 'pending', $5)
      RETURNING id`,
      [
        storeId,
        fileName || 'upload.csv',
        require('crypto').createHash('sha256').update(csvContent).digest('hex'),
        lines.length - 1, // Exclude header
        userId,
      ]
    );

    const jobId = jobResult.rows[0].id;

    // Store CSV content in a temp table or job metadata (using validation_errors field for now)
    await pool.query(
      `UPDATE platform.csv_imports SET validation_errors = $2 WHERE id = $1`,
      [jobId, JSON.stringify({ rawCsv: csvContent })]
    );

    return res.json({
      success: true,
      data: {
        jobId,
        totalRows: lines.length - 1,
        fileName: fileName || 'upload.csv',
      },
    });
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[CsvImport] Upload error:", error.message);
    return res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Failed to upload CSV" },
    });
  }
});

// =============================================================================
// POST /api/v1/retailer-admin/products/import/validate
// RCAT-CSV-002: Validate CSV rows
// =============================================================================

retailerAdminCsvImportRouter.post("/products/import/validate", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: { code: "INTERNAL_ERROR", message: "Database unavailable" } });

  const storeId = getStoreId(req);
  if (!storeId) {
    return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Store not identified" } });
  }

  const { jobId } = req.query;
  if (!jobId) {
    return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "jobId is required" } });
  }

  try {
    // Get the job
    const jobResult = await pool.query(
      `SELECT id, validation_errors, store_id FROM platform.csv_imports WHERE id = $1 AND store_id = $2`,
      [jobId, storeId]
    );

    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Import job not found" } });
    }

    const rawCsv = jobResult.rows[0].validation_errors?.rawCsv;
    if (!rawCsv) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "No CSV data found for this job" } });
    }

    // Parse and validate
    const lines = rawCsv.trim().split('\n');
    const headers = parseCSVLine(lines[0]);

    const errors: { row: number; field: string; error: string }[] = [];
    const previewRows: any[] = [];
    let validCount = 0;

    for (let i = 1; i < lines.length; i++) {
      const fields = parseCSVLine(lines[i]);
      if (fields.length === 0 || fields.every((f: string) => !f.trim())) continue;

      const row = mapHeadersToRow(headers, fields);
      const rowErrors: string[] = [];

      // T-061: Detect variant rows (variant_of is set)
      const isVariantRow = !!(row.variant_of && row.variant_of.trim());

      if (isVariantRow) {
        // Variant row validation
        if (!row.sell_price || parseFloat(row.sell_price.replace(/[₹,]/g, '')) <= 0) {
          rowErrors.push('variant sell_price must be > 0');
        }
        if (!row.variant_label || !row.variant_label.trim()) {
          rowErrors.push('variant_label is required for variant rows');
        }
        const vQty = parseFloat(row.variant_qty || '');
        if (!Number.isFinite(vQty) || vQty <= 0) {
          rowErrors.push('variant_qty must be > 0');
        }
        const vUnit = (row.variant_unit || '').toUpperCase();
        if (!VALID_VARIANT_UNITS.has(vUnit)) {
          rowErrors.push(`variant_unit must be one of: ${[...VALID_VARIANT_UNITS].join(', ')}`);
        }
      } else {
        // T-186: Standard product row validation using unified validators
        const nameResult = validateProductNameUnified(row.name || '');
        if (!nameResult.valid) {
          rowErrors.push(nameResult.error || 'name is required');
        }

        // Validate sell price
        const sellPriceNum = parseFloat((row.sell_price || '').replace(/[₹,]/g, ''));
        if (!Number.isFinite(sellPriceNum) || sellPriceNum <= 0) {
          rowErrors.push('sell_price must be > 0');
        } else {
          const sellPriceResult = validatePriceUnified(Math.round(sellPriceNum * 100));
          if (!sellPriceResult.valid) {
            rowErrors.push(sellPriceResult.error || 'sell_price invalid');
          }
        }

        // Validate purchase price
        const purchasePriceNum = parseFloat((row.purchase_price || '').replace(/[₹,]/g, ''));
        if (!Number.isFinite(purchasePriceNum) || purchasePriceNum <= 0) {
          rowErrors.push('purchase_price must be > 0');
        } else {
          const purchasePriceResult = validatePriceUnified(Math.round(purchasePriceNum * 100));
          if (!purchasePriceResult.valid) {
            rowErrors.push(purchasePriceResult.error || 'purchase_price invalid');
          }
        }

        // T-186: Validate stock if provided
        if (row.stock && row.stock.trim()) {
          const stockNum = parseInt(row.stock, 10);
          if (Number.isFinite(stockNum)) {
            const stockResult = validateStockUnified(stockNum);
            if (!stockResult.valid) {
              rowErrors.push(stockResult.error || 'stock invalid');
            }
          }
        }
      }

      // T-186: Validate barcode using unified validator
      const mode = isVariantRow ? 'VARIANT' :
                   (row.mode || '').toUpperCase() === 'LOOSE_BULK' ? 'LOOSE_BULK' :
                   (!row.barcode || !row.barcode.trim()) ? 'LOOSE_BULK' : 'PACKAGED';

      if (!isVariantRow && row.barcode && row.barcode.trim()) {
        const barcodeResult = validateBarcodeUnified(row.barcode.trim());
        if (!barcodeResult.valid) {
          rowErrors.push(barcodeResult.error || 'invalid barcode format');
        }
      }

      if (rowErrors.length > 0) {
        errors.push(...rowErrors.map(e => ({ row: i, field: '', error: e })));
      } else {
        validCount++;
      }

      // T-165: Validate image_url if provided
      const imageUrl = (row.image_url || '').trim();
      if (imageUrl && !/^https?:\/\/.+/i.test(imageUrl)) {
        rowErrors.push('image_url must be a valid HTTP/HTTPS URL');
      }

      previewRows.push({
        row: i,
        name: isVariantRow ? `↳ ${row.variant_label?.trim() || ''} (variant of ${row.variant_of?.trim()})` : (row.name?.trim() || ''),
        barcode: row.barcode?.trim() || '',
        brand: row.brand?.trim() || '',
        unit: isVariantRow ? (row.variant_unit?.trim()?.toUpperCase() || '') : (row.unit?.trim() || 'PCS'),
        sellPrice: parsePrice(row.sell_price),
        purchasePrice: isVariantRow ? 0 : parsePrice(row.purchase_price),
        mrp: parsePrice(row.mrp),
        stock: isVariantRow ? 0 : (parseInt(row.stock) || 0),
        mode,
        // T-165: Image URL from CSV
        imageUrl: imageUrl || null,
        // T-061: Variant-specific fields
        isVariant: isVariantRow,
        variantOf: row.variant_of?.trim() || null,
        variantLabel: row.variant_label?.trim() || null,
        variantQty: isVariantRow ? parseFloat(row.variant_qty || '0') : null,
        variantUnit: isVariantRow ? (row.variant_unit?.trim()?.toUpperCase() || null) : null,
        valid: rowErrors.length === 0,
        errors: rowErrors,
      });
    }

    // Update job status
    await pool.query(
      `UPDATE platform.csv_imports SET
        status = 'validated',
        valid_rows = $2,
        error_rows = $3,
        validation_errors = $4,
        validated_at = NOW()
      WHERE id = $1`,
      [
        jobId,
        validCount,
        previewRows.length - validCount,
        JSON.stringify({ rawCsv, errors, previewRows }),
      ]
    );

    // GO-LIVE-178: Include total counts even when list is truncated
    const totalErrors = errors.length;
    const displayedErrors = errors.slice(0, 50);
    const truncated = totalErrors > displayedErrors.length;

    return res.json({
      success: true,
      data: {
        validCount,
        invalidCount: previewRows.length - validCount,
        totalRows: previewRows.length,
        errors: displayedErrors,
        // GO-LIVE-178: Provide context about truncation
        errorSummary: {
          total: totalErrors,
          displayed: displayedErrors.length,
          truncated,
          message: truncated
            ? `Showing ${displayedErrors.length} of ${totalErrors} validation errors. Fix these issues and re-upload.`
            : undefined,
        },
        previewRows: previewRows.slice(0, 20), // First 20 for preview
      },
    });
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[CsvImport] Validate error:", error.message);
    return res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Validation failed" },
    });
  }
});

// =============================================================================
// POST /api/v1/retailer-admin/products/import/commit
// RCAT-CSV-002: Commit validated rows (idempotent)
// RET-POS-SYNC-003: Async chunked commit for scale (returns 202, processes in background)
// =============================================================================

// RET-POS-SYNC-003: Process a single row (shared by async chunk processor)
async function commitSingleRow(
  client: any, storeId: string, row: any, jobId: string
): Promise<{ action: 'created' | 'updated' | 'skipped'; warning?: CategorizedWarning }> {
  try {
    const mode = row.mode || 'PACKAGED';
    const sellPricePaise = row.sellPrice || 0;
    const purchasePricePaise = row.purchasePrice || 0;
    const stock = row.stock || 0;

    // RET-POS-SYNC-001: Dedup — check if product already exists in store
    let existingProductId: string | null = null;
    let existingStoreProductId: string | null = null;

    if (mode === 'PACKAGED' && row.barcode) {
      const existing = await client.query(
        `SELECT sp.id AS store_product_id, sp.product_id
         FROM catalog.store_product_barcodes spb
         JOIN catalog.store_products sp ON sp.id = spb.store_product_id
         WHERE spb.store_id = $1 AND spb.barcode = $2 AND sp.is_active = true`,
        [storeId, row.barcode]
      );
      if (existing.rows.length > 0) {
        existingProductId = existing.rows[0].product_id;
        existingStoreProductId = existing.rows[0].store_product_id;
      }
    } else if (mode === 'LOOSE_BULK') {
      const existing = await client.query(
        `SELECT sp.id AS store_product_id, sp.product_id
         FROM catalog.store_products sp
         JOIN catalog.products p ON p.id = sp.product_id
         WHERE sp.store_id = $1 AND sp.is_active = true
           AND LOWER(TRIM(p.name)) = LOWER(TRIM($2))
           AND sp.product_mode = 'LOOSE_BULK'`,
        [storeId, row.name]
      );
      if (existing.rows.length > 0) {
        existingProductId = existing.rows[0].product_id;
        existingStoreProductId = existing.rows[0].store_product_id;
      }
    }

    if (existingStoreProductId && existingProductId) {
      // RET-POS-SYNC-001: UPDATE existing product instead of creating duplicate
      // V3-FIX-168: Also update conversion columns on existing products
      const { inferBaseStockUnit: inferBSU } = require("../../../services/conversionEngine");
      const updProcUnit = row.procurement_unit?.trim()?.toUpperCase() || null;
      const updPackQty = row.procurement_pack_qty ? parseFloat(row.procurement_pack_qty) : null;
      const updBaseUnit = row.base_stock_unit?.trim()?.toUpperCase() || null;

      // V3-FIX-168: Infer conversion defaults for update path (same logic as create)
      const updResolvedBase = updBaseUnit || inferBSU(mode, row.sold_by, row.rate_unit, row.unit);
      const updResolvedProc = updProcUnit || updResolvedBase;
      const updResolvedPackQty = updPackQty || 1;

      await client.query(
        `UPDATE catalog.store_products SET
          sell_price = $2, mrp = $3, purchase_price = $4,
          current_stock = $5,
          product_mode = COALESCE($6, product_mode),
          procurement_unit = COALESCE($7, procurement_unit),
          procurement_pack_qty = COALESCE($8, procurement_pack_qty),
          base_stock_unit = COALESCE($9, base_stock_unit),
          conversion_confirmed = COALESCE($10, conversion_confirmed),
          updated_at = NOW()
         WHERE id = $1`,
        [existingStoreProductId, sellPricePaise, row.mrp || null, purchasePricePaise, stock,
         mode || null, updResolvedProc, updResolvedPackQty, updResolvedBase, true]
      );

      await client.query(
        `UPDATE catalog.products SET
          name = $2, brand = $3, unit = $4, updated_at = NOW()
         WHERE id = $1`,
        [existingProductId, row.name, row.brand || null, row.unit || 'PCS']
      );

      await client.query(
        `INSERT INTO inventory.stock_balances (store_id, product_id, current_qty)
         VALUES ($1, $2, $3)
         ON CONFLICT (store_id, product_id) DO UPDATE SET
           current_qty = EXCLUDED.current_qty,
           updated_at = NOW()`,
        [storeId, existingProductId, stock]
      );

      return { action: 'updated' };
    } else {
      // Create new product
      // T-165: Include image_url if provided in CSV
      const prodResult = await client.query(
        `INSERT INTO catalog.products (name, brand, unit, primary_barcode, image_url, is_active)
         VALUES ($1, $2, $3, $4, $5, true) RETURNING id`,
        [
          row.name,
          row.brand || null,
          row.unit || 'PCS',
          mode === 'PACKAGED' && row.barcode ? row.barcode : null,
          row.imageUrl || null,
        ]
      );
      const productId = prodResult.rows[0].id;

      // T-055: Auto-assign taxonomy for CSV-imported products
      let taxonomyId: string | null = null;
      try {
        const taxRes = await client.query(
          `SELECT catalog.assign_taxonomy_by_name($1) AS taxonomy_id`,
          [row.name]
        );
        taxonomyId = taxRes.rows[0]?.taxonomy_id || null;
      } catch { /* taxonomy function may not exist */ }

      // V3-FIX-168: Include canonical conversion columns from CSV
      const csvProcurementUnit = row.procurement_unit?.trim()?.toUpperCase() || null;
      const csvProcurementPackQty = row.procurement_pack_qty ? parseFloat(row.procurement_pack_qty) : null;
      const csvBaseStockUnit = row.base_stock_unit?.trim()?.toUpperCase() || null;
      // Infer defaults when CSV columns are empty
      const { inferBaseStockUnit: inferBSU } = require("../../../services/conversionEngine");
      const resolvedBaseUnit = csvBaseStockUnit || inferBSU(mode, row.sold_by, row.rate_unit, row.unit);
      const resolvedProcUnit = csvProcurementUnit || resolvedBaseUnit;
      const resolvedPackQty = csvProcurementPackQty || 1;

      const spResult = await client.query(
        `INSERT INTO catalog.store_products (
          store_id, product_id, sell_price, mrp, purchase_price,
          product_mode, current_stock, is_active, display_name, taxonomy_id,
          metadata_updated_at, metadata_updated_by,
          procurement_unit, procurement_pack_qty, base_stock_unit, conversion_confirmed
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, $9, NOW(), 'CSV_IMPORT',
          $10, $11, $12, true) RETURNING id`,
        [storeId, productId, sellPricePaise, row.mrp || null, purchasePricePaise, mode, stock, row.name, taxonomyId,
         resolvedProcUnit, resolvedPackQty, resolvedBaseUnit]
      );
      const storeProductId = spResult.rows[0].id;

      if (mode === 'PACKAGED' && row.barcode) {
        await client.query(
          `INSERT INTO catalog.store_product_barcodes (store_id, store_product_id, barcode, source)
           VALUES ($1, $2, $3, 'retailer_digitisation')
           ON CONFLICT (store_id, barcode) DO NOTHING`,
          [storeId, storeProductId, row.barcode]
        );
      } else if (mode === 'LOOSE_BULK') {
        const genBarcode = generateStoreBarcode(storeId);
        await client.query(
          `INSERT INTO catalog.store_product_barcodes (store_id, store_product_id, barcode, source)
           VALUES ($1, $2, $3, 'supermandi_generated')`,
          [storeId, storeProductId, genBarcode]
        );
      }

      let ledgerId: string | null = null;
      if (stock > 0) {
        const ledgerResult = await client.query(
          `INSERT INTO inventory.inventory_ledger (
            store_id, product_id, delta_qty, transaction_type,
            reference_type, stock_before, stock_after, unit_cost,
            source, source_id
          ) VALUES ($1, $2, $3, 'opening_stock', 'manual', 0, $3, $4, 'CSV_IMPORT', $5)
          ON CONFLICT (store_id, product_id, source, source_id) WHERE source IS NOT NULL AND source_id IS NOT NULL DO NOTHING
          RETURNING id`,
          [storeId, productId, stock, purchasePricePaise, jobId]
        );
        ledgerId = ledgerResult.rows[0]?.id ?? null;
      }

      await client.query(
        `INSERT INTO inventory.stock_balances (store_id, product_id, current_qty, last_ledger_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (store_id, product_id) DO UPDATE SET
           current_qty = EXCLUDED.current_qty,
           last_ledger_id = COALESCE(EXCLUDED.last_ledger_id, inventory.stock_balances.last_ledger_id),
           updated_at = NOW()`,
        [storeId, productId, stock, ledgerId]
      );

      return { action: 'created' };
    }
  } catch (err: any) {
    return { action: 'skipped', warning: categorizeDbError(err, row) };
  }
}

// T-061: Process a variant row — creates a retail variant for an existing LOOSE_BULK store product
async function commitVariantRow(
  client: any, storeId: string, row: any
): Promise<{ action: 'created' | 'updated' | 'skipped'; warning?: CategorizedWarning }> {
  try {
    const parentName = (row.variantOf || '').trim();
    if (!parentName) {
      return { action: 'skipped', warning: { row: row.row, message: 'variant_of is empty', category: 'validation_error' } };
    }

    // Find parent store product by name (must be LOOSE_BULK)
    const parentRes = await client.query(
      `SELECT sp.id AS store_product_id, sp.store_id
       FROM catalog.store_products sp
       JOIN catalog.products p ON p.id = sp.product_id
       WHERE sp.store_id = $1 AND sp.is_active = true
         AND LOWER(TRIM(p.name)) = LOWER(TRIM($2))
         AND sp.product_mode = 'LOOSE_BULK'
       LIMIT 1`,
      [storeId, parentName]
    );

    if (parentRes.rows.length === 0) {
      return {
        action: 'skipped',
        warning: {
          row: row.row,
          message: `Parent product "${parentName}" not found or not LOOSE_BULK`,
          category: 'validation_error'
        }
      };
    }

    const storeProductId = parentRes.rows[0].store_product_id;
    const variantLabel = (row.variantLabel || '').trim();
    const variantQty = parseFloat(row.variantQty) || 0;
    const variantUnit = (row.variantUnit || '').toUpperCase();
    const sellPricePaise = row.sellPrice || 0;

    if (!variantLabel || variantQty <= 0 || !VALID_VARIANT_UNITS.has(variantUnit) || sellPricePaise <= 0) {
      return {
        action: 'skipped',
        warning: { row: row.row, message: 'Invalid variant data (label/qty/unit/price)', category: 'validation_error' }
      };
    }

    // Check for duplicate variant (same label for same parent)
    const dupRes = await client.query(
      `SELECT id FROM catalog.product_retail_variants
       WHERE store_product_id = $1 AND LOWER(TRIM(variant_label)) = LOWER(TRIM($2)) AND is_active = true
       LIMIT 1`,
      [storeProductId, variantLabel]
    );

    if (dupRes.rows.length > 0) {
      // Update existing variant
      await client.query(
        `UPDATE catalog.product_retail_variants SET
          variant_qty = $2, base_unit = $3, sell_price_minor = $4, updated_at = NOW()
         WHERE id = $1`,
        [dupRes.rows[0].id, variantQty, variantUnit, sellPricePaise]
      );
      return { action: 'updated' };
    }

    // Generate barcode for new variant
    const barcodeRes = await client.query(
      `SELECT catalog.generate_variant_barcode($1::uuid) AS barcode`,
      [storeId]
    );
    const barcode = barcodeRes.rows[0]?.barcode;
    if (!barcode) {
      return { action: 'skipped', warning: { row: row.row, message: 'Failed to generate variant barcode', category: 'db_error' } };
    }

    // Get max sort order
    const sortRes = await client.query(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort
       FROM catalog.product_retail_variants
       WHERE store_product_id = $1 AND is_active = true`,
      [storeProductId]
    );
    const sortOrder = sortRes.rows[0]?.next_sort ?? 0;

    // Insert variant
    await client.query(
      `INSERT INTO catalog.product_retail_variants
        (store_product_id, variant_label, variant_qty, base_unit, sell_price_minor, barcode, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      // LIVE.R4.B32.001: Sanitize variant_label to prevent stored XSS
      [storeProductId, variantLabel ? sanitizeHtml(variantLabel) : variantLabel, variantQty, variantUnit, sellPricePaise, barcode, sortOrder]
    );

    return { action: 'created' };
  } catch (err: any) {
    return { action: 'skipped', warning: categorizeDbError(err, row) };
  }
}

// RET-POS-SYNC-003: Process rows in chunks of CHUNK_SIZE, each chunk in its own transaction
const COMMIT_CHUNK_SIZE = 100;

async function processCommitInBackground(jobId: string, storeId: string, validRows: any[]) {
  const pool = getPool();
  if (!pool) return;

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const allWarnings: CategorizedWarning[] = [];

  // T-061: Two-pass commit — products first (pass 1), then variants (pass 2)
  // This ensures parent products exist before variant rows reference them
  const productRows = validRows.filter((r: any) => !r.isVariant);
  const variantRows = validRows.filter((r: any) => r.isVariant);

  // Pass 1: Process product rows in chunks
  for (let i = 0; i < productRows.length; i += COMMIT_CHUNK_SIZE) {
    const chunk = productRows.slice(i, i + COMMIT_CHUNK_SIZE);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      for (const row of chunk) {
        const result = await commitSingleRow(client, storeId, row, jobId);
        if (result.action === 'created') created++;
        else if (result.action === 'updated') updated++;
        else { skipped++; if (result.warning) allWarnings.push(result.warning); }
      }

      await client.query("COMMIT");
    } catch (chunkErr: any) {
      await client.query("ROLLBACK").catch(() => {});
      log.error(`[CsvImport] Chunk ${i}-${i + chunk.length} failed:`, chunkErr.message);
      for (const row of chunk) {
        skipped++;
        allWarnings.push(categorizeDbError(chunkErr, row));
      }
    } finally {
      client.release();
    }

    try {
      await pool.query(
        `UPDATE platform.csv_imports SET
          products_created = $2, updated_at = NOW()
        WHERE id = $1`,
        [jobId, created]
      );
    } catch { /* progress update is non-critical */ }
  }

  // Pass 2: Process variant rows in chunks (parents must exist from pass 1)
  for (let i = 0; i < variantRows.length; i += COMMIT_CHUNK_SIZE) {
    const chunk = variantRows.slice(i, i + COMMIT_CHUNK_SIZE);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      for (const row of chunk) {
        const result = await commitVariantRow(client, storeId, row);
        if (result.action === 'created') created++;
        else if (result.action === 'updated') updated++;
        else { skipped++; if (result.warning) allWarnings.push(result.warning); }
      }

      await client.query("COMMIT");
    } catch (chunkErr: any) {
      await client.query("ROLLBACK").catch(() => {});
      log.error(`[CsvImport] Variant chunk ${i}-${i + chunk.length} failed:`, chunkErr.message);
      for (const row of chunk) {
        skipped++;
        allWarnings.push(categorizeDbError(chunkErr, row));
      }
    } finally {
      client.release();
    }

    try {
      await pool.query(
        `UPDATE platform.csv_imports SET
          products_created = $2, updated_at = NOW()
        WHERE id = $1`,
        [jobId, created]
      );
    } catch { /* progress update is non-critical */ }
  }

  // Final status update
  const finalClient = await pool.connect();
  try {
    // Store warnings in validation_errors for error CSV download (RET-POS-SYNC-002 compat)
    const warningSummary = summarizeWarnings(allWarnings);
    const displayedWarnings = allWarnings.slice(0, 20);
    const warningStrings = displayedWarnings.map(w => `Row ${w.row}: ${w.message}`);
    const summaryParts: string[] = [];
    if (warningSummary.duplicate_barcode > 0) summaryParts.push(`${warningSummary.duplicate_barcode} duplicate barcode(s)`);
    if (warningSummary.db_constraint > 0) summaryParts.push(`${warningSummary.db_constraint} constraint error(s)`);
    if (warningSummary.db_error > 0) summaryParts.push(`${warningSummary.db_error} database error(s)`);
    if (warningSummary.unknown > 0) summaryParts.push(`${warningSummary.unknown} other error(s)`);

    await finalClient.query(
      `UPDATE platform.csv_imports SET
        status = 'committed', products_created = $2, committed_at = NOW(),
        validation_errors = validation_errors || $3::jsonb
      WHERE id = $1`,
      [jobId, created, JSON.stringify({
        commitResult: {
          created, updated, skipped,
          warnings: warningStrings,
          failureSummary: allWarnings.length > 0 ? {
            total: allWarnings.length,
            displayed: displayedWarnings.length,
            truncated: allWarnings.length > displayedWarnings.length,
            byCategory: warningSummary,
            message: summaryParts.length > 0 ? `${skipped} row(s) failed: ${summaryParts.join(', ')}` : undefined,
            details: displayedWarnings,
          } : undefined,
        },
      })]
    );
  } catch (err: any) {
    log.error("[CsvImport] Final status update failed:", err.message);
    // Mark as failed if we can't update status
    try {
      await finalClient.query(
        `UPDATE platform.csv_imports SET status = 'failed' WHERE id = $1`,
        [jobId]
      );
    } catch { /* best effort */ }
  } finally {
    finalClient.release();
  }
}

retailerAdminCsvImportRouter.post("/products/import/commit", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: { code: "INTERNAL_ERROR", message: "Database unavailable" } });

  const storeId = getStoreId(req);
  if (!storeId) {
    return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Store not identified" } });
  }

  const { jobId } = req.query;
  if (!jobId) {
    return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "jobId is required" } });
  }

  try {
    const jobResult = await pool.query(
      `SELECT id, status, validation_errors, store_id, valid_rows FROM platform.csv_imports
       WHERE id = $1 AND store_id = $2`,
      [jobId, storeId]
    );

    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Import job not found" } });
    }

    const job = jobResult.rows[0];

    // Idempotent: already committed — return final result
    if (job.status === 'committed') {
      const commitResult = job.validation_errors?.commitResult;
      return res.json({
        success: true,
        data: commitResult || { created: job.products_created || 0, updated: 0, skipped: 0, warnings: [] },
        message: "Already committed",
      });
    }

    // Idempotent: already committing — return 202 with current progress
    if (job.status === 'committing') {
      return res.status(202).json({
        success: true,
        data: { jobId, status: 'committing', progress: { created: job.products_created || 0, total: job.valid_rows || 0 } },
        message: "Commit already in progress",
      });
    }

    const previewRows = job.validation_errors?.previewRows || [];
    const validRows = previewRows.filter((r: any) => r.valid);

    if (validRows.length === 0) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "No valid rows to commit" },
      });
    }

    // RET-POS-SYNC-003: Set status to 'committing' and return 202 immediately
    await pool.query(
      `UPDATE platform.csv_imports SET status = 'committing', products_created = 0 WHERE id = $1`,
      [jobId]
    );

    // Start background processing
    setImmediate(() => {
      processCommitInBackground(jobId as string, storeId, validRows).catch((err) => {
        log.error("[CsvImport] Background commit failed:", err);
      });
    });

    return res.status(202).json({
      success: true,
      data: { jobId, status: 'committing', progress: { created: 0, total: validRows.length } },
      message: "Commit started. Poll GET /products/import/status for progress.",
    });
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[CsvImport] Commit error:", error.message);
    return res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Commit failed" },
    });
  }
});

// =============================================================================
// GET /api/v1/retailer-admin/products/import/status
// RET-POS-SYNC-003: Poll commit progress
// =============================================================================

retailerAdminCsvImportRouter.get("/products/import/status", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: { code: "INTERNAL_ERROR", message: "Database unavailable" } });

  const storeId = getStoreId(req);
  if (!storeId) {
    return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Store not identified" } });
  }

  const { jobId } = req.query;
  if (!jobId) {
    return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "jobId is required" } });
  }

  try {
    const result = await pool.query(
      `SELECT status, products_created, valid_rows, validation_errors FROM platform.csv_imports
       WHERE id = $1 AND store_id = $2`,
      [jobId, storeId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Import job not found" } });
    }

    const job = result.rows[0];
    const response: any = {
      success: true,
      data: {
        status: job.status,
        progress: {
          created: job.products_created || 0,
          total: job.valid_rows || 0,
        },
      },
    };

    // If committed, include the final commit result
    if (job.status === 'committed' && job.validation_errors?.commitResult) {
      response.data.commitResult = job.validation_errors.commitResult;
    }

    return res.json(response);
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[CsvImport] Status check error:", error.message);
    return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Status check failed" } });
  }
});

// =============================================================================
// GET /api/v1/retailer-admin/products/import/errors
// RET-POS-SYNC-002: Download error report as CSV for offline correction
// =============================================================================

retailerAdminCsvImportRouter.get("/products/import/errors", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: { code: "INTERNAL_ERROR", message: "Database unavailable" } });

  const storeId = getStoreId(req);
  if (!storeId) {
    return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Store not identified" } });
  }

  const { jobId } = req.query;
  if (!jobId) {
    return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "jobId is required" } });
  }

  try {
    const jobResult = await pool.query(
      `SELECT id, validation_errors, status FROM platform.csv_imports WHERE id = $1 AND store_id = $2`,
      [jobId, storeId]
    );

    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Import job not found" } });
    }

    const job = jobResult.rows[0];
    const validationErrors = job.validation_errors || {};

    // Collect errors from validation phase
    const validationPhaseErrors: Array<{ row: number; field: string; error: string }> =
      validationErrors.errors || [];

    // Collect errors from commit phase (categorized warnings)
    const commitPhaseErrors: CategorizedWarning[] = [];
    const previewRows = validationErrors.previewRows || [];
    for (const row of previewRows) {
      if (!row.valid && row.errors?.length > 0) {
        for (const errMsg of row.errors) {
          commitPhaseErrors.push({
            row: row.row,
            message: errMsg,
            category: 'validation_error',
            field: '',
            originalValue: row.name || '',
          });
        }
      }
    }

    const allErrors = [
      ...validationPhaseErrors.map(e => ({
        row_number: e.row,
        name: '',
        barcode: '',
        error_phase: 'validation',
        error_category: 'validation_error',
        error_message: e.error || e.field,
      })),
      ...commitPhaseErrors.map(e => ({
        row_number: e.row,
        name: e.originalValue || '',
        barcode: '',
        error_phase: 'validation',
        error_category: e.category,
        error_message: e.message,
      })),
    ];

    if (allErrors.length === 0) {
      return res.status(404).json({ error: { code: "NO_ERRORS", message: "No errors found for this import job" } });
    }

    // Build CSV
    const csvHeader = "row_number,name,barcode,error_phase,error_category,error_message";
    const csvRows = allErrors.map(e => {
      const escapeCsv = (val: string | number) => {
        const s = String(val);
        return s.includes(',') || s.includes('"') || s.includes('\n')
          ? `"${s.replace(/"/g, '""')}"` : s;
      };
      return [
        e.row_number,
        escapeCsv(e.name),
        escapeCsv(e.barcode),
        e.error_phase,
        e.error_category,
        escapeCsv(e.error_message),
      ].join(',');
    });

    const csvContent = [csvHeader, ...csvRows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    // LIVE.BE.DOCUMENTS.CONTENT_DISPOSITION_SANITIZATION.001: Sanitize jobId in filename
    res.setHeader('Content-Disposition', `attachment; filename="import_errors_${String(jobId).replace(/[/\\<>"'\r\n\t]/g, '_')}.csv"`);
    return res.send(csvContent);
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[CsvImport] Error export error:", error.message);
    return res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Failed to export errors" },
    });
  }
});

// =============================================================================
// POST /api/v1/retailer-admin/products/bulk-paste/preview
// RCAT-BULK-002: Parse pasted lines and return preview
// =============================================================================

// STG-215: Apply same rate limiter as CSV upload
retailerAdminCsvImportRouter.post("/products/bulk-paste/preview", csvUploadRateLimiter, async (req: Request, res: Response) => {
  const storeId = getStoreId(req);
  if (!storeId) {
    return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Store not identified" } });
  }

  const { text } = req.body;
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Text data is required" } });
  }

  const lines = text.trim().split('\n').filter((l: string) => l.trim());
  const preview: any[] = [];
  const errors: { row: number; error: string }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const parts = lines[i].includes('\t') ? lines[i].split('\t') : lines[i].split(',');
    const [name, barcode, brand, sellPrice, purchasePrice, mrp, unit, stock] = parts.map((p: string) => p?.trim());

    const rowErrors: string[] = [];
    if (!name) rowErrors.push('name is required');

    const parsedSellPrice = parsePrice(sellPrice);
    const parsedPurchasePrice = parsePrice(purchasePrice);

    if (!parsedSellPrice || parsedSellPrice <= 0) rowErrors.push('sell_price must be > 0');

    const mode = barcode ? 'PACKAGED' : 'LOOSE_BULK';

    if (rowErrors.length > 0) {
      errors.push(...rowErrors.map(e => ({ row: i + 1, error: e })));
    }

    preview.push({
      row: i + 1,
      name: name || '',
      barcode: barcode || '',
      brand: brand || '',
      sellPrice: parsedSellPrice,
      purchasePrice: parsedPurchasePrice,
      mrp: parsePrice(mrp),
      unit: unit || 'PCS',
      stock: parseInt(stock) || 0,
      mode,
      valid: rowErrors.length === 0,
      errors: rowErrors,
    });
  }

  // GO-LIVE-178: Include total counts even when list is truncated
  const totalErrors = errors.length;
  const displayedErrors = errors.slice(0, 50);
  const truncated = totalErrors > displayedErrors.length;

  return res.json({
    success: true,
    data: {
      validCount: preview.filter(p => p.valid).length,
      invalidCount: preview.filter(p => !p.valid).length,
      totalRows: preview.length,
      errors: displayedErrors,
      // GO-LIVE-178: Provide context about truncation
      errorSummary: {
        total: totalErrors,
        displayed: displayedErrors.length,
        truncated,
        message: truncated
          ? `Showing ${displayedErrors.length} of ${totalErrors} validation errors. Fix these issues and try again.`
          : undefined,
      },
      previewRows: preview,
    },
  });
});

// =============================================================================
// POST /api/v1/retailer-admin/products/bulk-paste/commit
// RCAT-BULK-002: Commit pasted products
// =============================================================================

// STG-215: Apply same rate limiter as CSV upload
retailerAdminCsvImportRouter.post("/products/bulk-paste/commit", csvUploadRateLimiter, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: { code: "INTERNAL_ERROR", message: "Database unavailable" } });

  const storeId = getStoreId(req);
  if (!storeId) {
    return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Store not identified" } });
  }

  const { rows } = req.body;
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "No rows to commit" } });
  }

  const validRows = rows.filter((r: any) => r.valid !== false && r.name);
  if (validRows.length === 0) {
    return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "No valid rows to commit" } });
  }

  const client = await pool.connect();
  let created = 0;
  let updated = 0;
  // GO-LIVE-178: Use categorized warnings for better error reporting
  const categorizedWarnings: CategorizedWarning[] = [];

  try {
    await client.query("BEGIN");

    for (const row of validRows) {
      try {
        const mode = row.mode || (row.barcode ? 'PACKAGED' : 'LOOSE_BULK');
        const sellPrice = safeNumber(row.sellPrice);
        const purchasePrice = safeNumber(row.purchasePrice);
        const stock = safeNumber(row.stock);

        // RET-POS-SYNC-011: Dedup — check if product already exists in store
        let existingProductId: string | null = null;
        let existingStoreProductId: string | null = null;

        if (mode === 'PACKAGED' && row.barcode) {
          const existing = await client.query(
            `SELECT sp.id AS store_product_id, sp.product_id
             FROM catalog.store_product_barcodes spb
             JOIN catalog.store_products sp ON sp.id = spb.store_product_id
             WHERE spb.store_id = $1 AND spb.barcode = $2 AND sp.is_active = true`,
            [storeId, row.barcode]
          );
          if (existing.rows.length > 0) {
            existingProductId = existing.rows[0].product_id;
            existingStoreProductId = existing.rows[0].store_product_id;
          }
        } else if (mode === 'LOOSE_BULK') {
          const existing = await client.query(
            `SELECT sp.id AS store_product_id, sp.product_id
             FROM catalog.store_products sp
             JOIN catalog.products p ON p.id = sp.product_id
             WHERE sp.store_id = $1 AND sp.is_active = true
               AND LOWER(TRIM(p.name)) = LOWER(TRIM($2))
               AND sp.product_mode = 'LOOSE_BULK'`,
            [storeId, row.name]
          );
          if (existing.rows.length > 0) {
            existingProductId = existing.rows[0].product_id;
            existingStoreProductId = existing.rows[0].store_product_id;
          }
        }

        if (existingStoreProductId && existingProductId) {
          // RET-POS-SYNC-011: UPDATE existing product instead of creating duplicate
          await client.query(
            `UPDATE catalog.store_products SET
              sell_price = $2, purchase_price = $3,
              current_stock = $4, updated_at = NOW()
             WHERE id = $1`,
            [existingStoreProductId, sellPrice, purchasePrice, stock]
          );
          await client.query(
            `UPDATE catalog.products SET
              name = $2, brand = $3, unit = $4, updated_at = NOW()
             WHERE id = $1`,
            [existingProductId, row.name, row.brand || null, row.unit || 'PCS']
          );
          await client.query(
            `INSERT INTO inventory.stock_balances (store_id, product_id, current_qty)
             VALUES ($1, $2, $3)
             ON CONFLICT (store_id, product_id) DO UPDATE SET
               current_qty = EXCLUDED.current_qty, updated_at = NOW()`,
            [storeId, existingProductId, stock]
          );
          updated++;
        } else {
          // Create new product
          const prodResult = await client.query(
            `INSERT INTO catalog.products (name, brand, unit, primary_barcode, is_active)
             VALUES ($1, $2, $3, $4, true) RETURNING id`,
            [row.name, row.brand || null, row.unit || 'PCS', mode === 'PACKAGED' && row.barcode ? row.barcode : null]
          );
          const productId = prodResult.rows[0].id;

          // T-055: Auto-assign taxonomy for bulk paste imports
          let bulkTaxonomyId: string | null = null;
          try {
            const taxRes = await client.query(
              `SELECT catalog.assign_taxonomy_by_name($1) AS taxonomy_id`,
              [row.name]
            );
            bulkTaxonomyId = taxRes.rows[0]?.taxonomy_id || null;
          } catch { /* taxonomy function may not exist */ }

          const spResult = await client.query(
            `INSERT INTO catalog.store_products (
              store_id, product_id, sell_price, purchase_price, product_mode, current_stock, is_active,
              display_name, taxonomy_id, metadata_updated_at, metadata_updated_by
            ) VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8, NOW(), 'BULK_PASTE') RETURNING id`,
            [storeId, productId, sellPrice, purchasePrice, mode, stock, row.name, bulkTaxonomyId]
          );
          const storeProductId = spResult.rows[0].id;

          if (mode === 'PACKAGED' && row.barcode) {
            await client.query(
              `INSERT INTO catalog.store_product_barcodes (store_id, store_product_id, barcode, source)
               VALUES ($1, $2, $3, 'retailer_digitisation')
               ON CONFLICT (store_id, barcode) DO NOTHING`,
              [storeId, storeProductId, row.barcode]
            );
          } else {
            const genBarcode = generateStoreBarcode(storeId);
            await client.query(
              `INSERT INTO catalog.store_product_barcodes (store_id, store_product_id, barcode, source)
               VALUES ($1, $2, $3, 'supermandi_generated')`,
              [storeId, storeProductId, genBarcode]
            );
          }

          // MT-7: Opening stock ledger entry + stock_balances
          let ledgerId: string | null = null;
          if (stock > 0) {
            const ledgerResult = await client.query(
              `INSERT INTO inventory.inventory_ledger (
                store_id, product_id, delta_qty, transaction_type,
                reference_type, stock_before, stock_after, unit_cost, source
              ) VALUES ($1, $2, $3, 'opening_stock', 'manual', 0, $3, $4, 'BULK_PASTE')
              RETURNING id`,
              [storeId, productId, stock, purchasePrice]
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
            [storeId, productId, stock, ledgerId]
          );

          created++;
        }
      } catch (err: any) {
        // GO-LIVE-178: Categorize errors for better diagnosis
        categorizedWarnings.push(categorizeDbError(err, row));
      }
    }

    await client.query("COMMIT");

    // GO-LIVE-178: Enhanced response with categorized warnings
    const skipped = validRows.length - created - updated;
    const totalWarnings = categorizedWarnings.length;
    const displayedWarnings = categorizedWarnings.slice(0, 20);
    const warningSummary = summarizeWarnings(categorizedWarnings);

    // Convert to simple string format for backwards compatibility
    const warningStrings = displayedWarnings.map(w => `Row ${w.row}: ${w.message}`);

    // Build user-friendly summary message
    const summaryParts: string[] = [];
    if (warningSummary.duplicate_barcode > 0) {
      summaryParts.push(`${warningSummary.duplicate_barcode} duplicate barcode(s)`);
    }
    if (warningSummary.db_constraint > 0) {
      summaryParts.push(`${warningSummary.db_constraint} constraint error(s)`);
    }
    if (warningSummary.db_error > 0) {
      summaryParts.push(`${warningSummary.db_error} database error(s)`);
    }
    if (warningSummary.unknown > 0) {
      summaryParts.push(`${warningSummary.unknown} other error(s)`);
    }

    return res.json({
      success: true,
      data: {
        created,
        updated,
        skipped,
        warnings: warningStrings,
        // GO-LIVE-178: Detailed failure information
        failureSummary: totalWarnings > 0 ? {
          total: totalWarnings,
          displayed: displayedWarnings.length,
          truncated: totalWarnings > displayedWarnings.length,
          byCategory: warningSummary,
          message: summaryParts.length > 0
            ? `${skipped} row(s) failed: ${summaryParts.join(', ')}`
            : undefined,
          details: displayedWarnings,
        } : undefined,
      },
      message: updated > 0
        ? `Imported ${created} products, updated ${updated} existing. ${skipped > 0 ? `${skipped} row(s) failed.` : ''}`
        : skipped > 0
          ? `Imported ${created} products. ${skipped} row(s) failed (see failureSummary for details).`
          : `Imported ${created} products`,
    });
  } catch (_error: unknown) {
    const error = asError(_error);
    await client.query("ROLLBACK");
    log.error("[BulkPaste] Commit error:", error.message);
    return res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Commit failed" },
    });
  } finally {
    client.release();
  }
});

// =============================================================================
// SCALE-D3: BullMQ async queue endpoints
// These sit alongside the existing setImmediate-based commit flow.
// New flow: validate → POST /queue → get bullJobId → GET /queue/:bullJobId (polls every 2s)
// Existing flow: validate → POST /commit → GET /status (unchanged — used as fallback)
// =============================================================================

import {
  getCsvImportQueue,
  getJobStatus,
  startCsvImportWorker,
} from '../../../queues/csvImportQueue';

// =============================================================================
// EXPORTED: processBatchForWorker
// Called by the BullMQ worker to process a single batch of rows.
// Returns created/updated/skipped counts for the batch only.
// Two-pass: products first, then variants (mirrors processCommitInBackground).
// =============================================================================

export async function processBatchForWorker(
  jobId: string,
  storeId: string,
  batchRows: any[]
): Promise<{ created: number; updated: number; skipped: number }> {
  const pool = getPool();
  if (!pool) {
    return { created: 0, updated: 0, skipped: batchRows.length };
  }

  const productRows = batchRows.filter((r: any) => !r.isVariant);
  const variantRows = batchRows.filter((r: any) => r.isVariant);

  let created = 0;
  let updated = 0;
  let skipped = 0;

  // Pass 1: product rows
  if (productRows.length > 0) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const row of productRows) {
        const result = await commitSingleRow(client, storeId, row, jobId);
        if (result.action === 'created') created++;
        else if (result.action === 'updated') updated++;
        else skipped++;
      }
      await client.query('COMMIT');
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => {});
      log.error(`[SCALE-D3] processBatchForWorker pass1 error:`, err.message);
      skipped += productRows.length;
    } finally {
      client.release();
    }
  }

  // Pass 2: variant rows (parents from pass 1 now exist)
  if (variantRows.length > 0) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const row of variantRows) {
        const result = await commitVariantRow(client, storeId, row);
        if (result.action === 'created') created++;
        else if (result.action === 'updated') updated++;
        else skipped++;
      }
      await client.query('COMMIT');
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => {});
      log.error(`[SCALE-D3] processBatchForWorker pass2 error:`, err.message);
      skipped += variantRows.length;
    } finally {
      client.release();
    }
  }

  // Update DB progress counter (best-effort)
  try {
    await pool.query(
      `UPDATE platform.csv_imports SET products_created = products_created + $2, updated_at = NOW() WHERE id = $1`,
      [jobId, created]
    );
  } catch { /* non-critical */ }

  return { created, updated, skipped };
}

// =============================================================================
// POST /api/v1/retailer-admin/products/import/queue
// SCALE-D3: Enqueue a validated import job via BullMQ.
// Client calls this after /validate succeeds.  Returns bullJobId for polling.
// Returns 503 if Redis is unavailable — client should fall back to /commit.
// =============================================================================

retailerAdminCsvImportRouter.post('/products/import/queue', async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) {
    return res.status(503).json({ error: { code: 'DB_UNAVAILABLE', message: 'Database unavailable' } });
  }

  const storeId = getStoreId(req);
  if (!storeId) {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Store not identified' } });
  }

  const { jobId } = req.body as { jobId?: string };
  if (!jobId || typeof jobId !== 'string') {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'jobId is required' } });
  }

  // Verify job belongs to this store and is in a queueable state
  let validRows: any[];
  try {
    const jobResult = await pool.query(
      `SELECT id, status, validation_errors, store_id, valid_rows
       FROM platform.csv_imports
       WHERE id = $1 AND store_id = $2`,
      [jobId, storeId]
    );

    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Import job not found' } });
    }

    const dbJob = jobResult.rows[0];

    if (!['validated', 'pending'].includes(dbJob.status)) {
      return res.status(409).json({
        error: {
          code: 'ALREADY_PROCESSED',
          message: `Import job is already in status: ${dbJob.status}`,
        },
      });
    }

    const previewRows = dbJob.validation_errors?.previewRows || [];
    validRows = previewRows.filter((r: any) => r.valid);

    if (validRows.length === 0) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'No valid rows to import' } });
    }
  } catch (err: any) {
    log.error('[SCALE-D3] /queue DB fetch error:', err.message);
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch import job' } });
  }

  // Enqueue via BullMQ (fail with 503 if Redis not available)
  const queue = getCsvImportQueue();
  if (!queue) {
    return res.status(503).json({
      error: {
        code: 'QUEUE_UNAVAILABLE',
        message: 'Async import queue is unavailable (Redis not connected). Use /commit endpoint as fallback.',
      },
    });
  }

  try {
    // Mark DB job as committing immediately so the legacy status endpoint reflects it
    await pool.query(
      `UPDATE platform.csv_imports SET status = 'committing', products_created = 0 WHERE id = $1`,
      [jobId]
    );

    // BullMQ jobId = platform jobId for deterministic lookup
    const bullJob = await queue.add(
      'import',
      { jobId, storeId, validRows },
      { jobId, attempts: 1 }
    );

    return res.status(202).json({
      success: true,
      data: {
        jobId,
        bullJobId: bullJob.id,
        total: validRows.length,
        status: 'queued',
      },
      message: 'Import queued. Poll GET /products/import/queue/:bullJobId every 2 seconds for progress.',
    });
  } catch (err: any) {
    log.error('[SCALE-D3] Failed to enqueue job:', err.message);
    // Revert DB status if enqueue failed
    await pool.query(
      `UPDATE platform.csv_imports SET status = 'validated' WHERE id = $1`,
      [jobId]
    ).catch(() => {});
    return res.status(500).json({ error: { code: 'QUEUE_ERROR', message: 'Failed to enqueue import job' } });
  }
});

// =============================================================================
// GET /api/v1/retailer-admin/products/import/queue/:bullJobId
// SCALE-D3: Poll BullMQ job status every 2s.
// Returns status: queued | active | completed | failed
// Returns progress: 0–100 (percentage of rows processed)
// =============================================================================

retailerAdminCsvImportRouter.get('/products/import/queue/:bullJobId', async (req: Request, res: Response) => {
  const storeId = getStoreId(req);
  if (!storeId) {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Store not identified' } });
  }

  const { bullJobId } = req.params;
  if (!bullJobId) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'bullJobId is required' } });
  }

  const queue = getCsvImportQueue();
  if (!queue) {
    return res.status(503).json({
      error: { code: 'QUEUE_UNAVAILABLE', message: 'Async import queue is unavailable.' },
    });
  }

  const statusInfo = await getJobStatus(bullJobId);

  if (statusInfo.status === 'unknown' && statusInfo.error === 'Job not found in queue') {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Job not found' } });
  }

  return res.json({
    success: true,
    data: {
      bullJobId,
      status: statusInfo.status,      // queued | active | completed | failed
      progress: statusInfo.progress,  // 0–100 percentage
      result: statusInfo.result,      // { processed, created, updated, skipped } on completion
      error: statusInfo.error,
    },
  });
});

// =============================================================================
// SCALE-D3: Worker init — called by app.ts at process startup
// =============================================================================

export function initCsvImportWorker(): void {
  startCsvImportWorker(processBatchForWorker);
}

// =============================================================================
// Helper functions
// =============================================================================

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function mapHeadersToRow(headers: string[], fields: string[]): Record<string, string> {
  const row: Record<string, string> = {};
  for (let i = 0; i < headers.length; i++) {
    const key = headers[i].trim().toLowerCase().replace(/\s+/g, '_');
    row[key] = fields[i]?.trim() || '';
  }
  return row;
}

function parsePrice(val: string | undefined): number {
  if (!val) return 0;
  // Remove currency symbols, commas
  const cleaned = val.replace(/[₹$,\s]/g, '');
  const num = parseFloat(cleaned);
  if (isNaN(num)) return 0;
  // Convert rupees to paise
  return Math.round(num * 100);
}
