// Retailer Admin CSV Import Routes
// RCAT-CSV-001: CSV template download
// RCAT-CSV-002: Upload → validate → review → commit flow
// Store-scoped via JWT (x-actor-id header from gateway)
// GO-LIVE-049: Added file size limits for security
// GO-LIVE-178: Enhanced error reporting for partial failures

import { Router, Request, Response } from "express";
import { getPool } from "../../../db/client";

export const retailerAdminCsvImportRouter = Router();

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
const CSV_TEMPLATE = `name,barcode,brand,unit,sell_price,purchase_price,mrp,stock,mode,sold_by,rate_unit,pack_size,pack_unit,low_stock_alert,gst_percent,hsn,notes
"Parle-G Glucose Biscuits 100g","8901234567890","Parle","PCS","10.00","8.50","10.00","50","PACKAGED","","","100","g","10","18","1905","Popular biscuit"
"Tata Salt 1kg","8901234567891","Tata","PCS","28.00","25.00","28.00","100","PACKAGED","","","1000","g","20","0","2501",""
"Loose Rice Basmati","","Local","KG","85.00","75.00","","25","LOOSE_BULK","WEIGHT","KG","","","5","5","1006","Premium basmati"
"Fresh Eggs","","Farm Fresh","PCS","7.00","5.50","","100","LOOSE_BULK","COUNT","PCS","","","20","0","0407","Per piece rate"
`;

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

retailerAdminCsvImportRouter.post("/products/import/upload", async (req: Request, res: Response) => {
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
  } catch (error: any) {
    console.error("[CsvImport] Upload error:", error.message);
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

      // Validate required fields
      if (!row.name || !row.name.trim()) {
        rowErrors.push('name is required');
      }
      if (!row.sell_price || parseFloat(row.sell_price) <= 0) {
        rowErrors.push('sell_price must be > 0');
      }
      if (!row.purchase_price || parseFloat(row.purchase_price) <= 0) {
        rowErrors.push('purchase_price must be > 0');
      }

      // Validate barcode rules
      const mode = (row.mode || '').toUpperCase() === 'LOOSE_BULK' ? 'LOOSE_BULK' :
                   (!row.barcode || !row.barcode.trim()) ? 'LOOSE_BULK' : 'PACKAGED';

      // Validate numeric fields
      if (row.sell_price && isNaN(parseFloat(row.sell_price.replace(/[₹,]/g, '')))) {
        rowErrors.push('sell_price must be numeric');
      }
      if (row.purchase_price && isNaN(parseFloat(row.purchase_price.replace(/[₹,]/g, '')))) {
        rowErrors.push('purchase_price must be numeric');
      }

      if (rowErrors.length > 0) {
        errors.push(...rowErrors.map(e => ({ row: i, field: '', error: e })));
      } else {
        validCount++;
      }

      previewRows.push({
        row: i,
        name: row.name?.trim() || '',
        barcode: row.barcode?.trim() || '',
        brand: row.brand?.trim() || '',
        unit: row.unit?.trim() || 'PCS',
        sellPrice: parsePrice(row.sell_price),
        purchasePrice: parsePrice(row.purchase_price),
        mrp: parsePrice(row.mrp),
        stock: parseInt(row.stock) || 0,
        mode,
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
  } catch (error: any) {
    console.error("[CsvImport] Validate error:", error.message);
    return res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Validation failed" },
    });
  }
});

// =============================================================================
// POST /api/v1/retailer-admin/products/import/commit
// RCAT-CSV-002: Commit validated rows (idempotent)
// =============================================================================

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

  const client = await pool.connect();
  try {
    // Get the job
    const jobResult = await client.query(
      `SELECT id, status, validation_errors, store_id FROM platform.csv_imports
       WHERE id = $1 AND store_id = $2`,
      [jobId, storeId]
    );

    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Import job not found" } });
    }

    const job = jobResult.rows[0];
    if (job.status === 'committed') {
      // Idempotent: already committed
      return res.json({
        success: true,
        data: { created: job.products_created || 0, updated: 0, skipped: 0, warnings: [] },
        message: "Already committed",
      });
    }

    const previewRows = job.validation_errors?.previewRows || [];
    const validRows = previewRows.filter((r: any) => r.valid);

    if (validRows.length === 0) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "No valid rows to commit" },
      });
    }

    await client.query("BEGIN");

    let created = 0;
    let skipped = 0;
    // GO-LIVE-178: Use categorized warnings for better error reporting
    const categorizedWarnings: CategorizedWarning[] = [];

    for (const row of validRows) {
      try {
        const mode = row.mode || 'PACKAGED';
        const sellPricePaise = row.sellPrice || 0;
        const purchasePricePaise = row.purchasePrice || 0;
        const stock = row.stock || 0;

        // Create product
        const prodResult = await client.query(
          `INSERT INTO catalog.products (name, brand, unit, primary_barcode, is_active)
           VALUES ($1, $2, $3, $4, true) RETURNING id`,
          [
            row.name,
            row.brand || null,
            row.unit || 'PCS',
            mode === 'PACKAGED' && row.barcode ? row.barcode : null,
          ]
        );
        const productId = prodResult.rows[0].id;

        // Create store_product
        const spResult = await client.query(
          `INSERT INTO catalog.store_products (
            store_id, product_id, sell_price, mrp, purchase_price,
            product_mode, current_stock, is_active
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, true) RETURNING id`,
          [storeId, productId, sellPricePaise, row.mrp || null, purchasePricePaise, mode, stock]
        );
        const storeProductId = spResult.rows[0].id;

        // Create barcode
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

        // Opening stock ledger entry + stock_balances (MT-7: consistency fix)
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
      } catch (err: any) {
        // GO-LIVE-178: Categorize errors for better diagnosis
        categorizedWarnings.push(categorizeDbError(err, row));
        skipped++;
      }
    }

    // Update job status
    await client.query(
      `UPDATE platform.csv_imports SET
        status = 'committed', products_created = $2, committed_at = NOW()
      WHERE id = $1`,
      [jobId, created]
    );

    await client.query("COMMIT");

    // GO-LIVE-178: Enhanced response with categorized warnings and summary
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
        updated: 0,
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
      message: skipped > 0
        ? `Imported ${created} products. ${skipped} row(s) failed (see failureSummary for details).`
        : `Imported ${created} products`,
    });
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("[CsvImport] Commit error:", error.message);
    return res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Commit failed" },
    });
  } finally {
    client.release();
  }
});

// =============================================================================
// POST /api/v1/retailer-admin/products/bulk-paste/preview
// RCAT-BULK-002: Parse pasted lines and return preview
// =============================================================================

retailerAdminCsvImportRouter.post("/products/bulk-paste/preview", async (req: Request, res: Response) => {
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

retailerAdminCsvImportRouter.post("/products/bulk-paste/commit", async (req: Request, res: Response) => {
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

        const prodResult = await client.query(
          `INSERT INTO catalog.products (name, brand, unit, primary_barcode, is_active)
           VALUES ($1, $2, $3, $4, true) RETURNING id`,
          [row.name, row.brand || null, row.unit || 'PCS', mode === 'PACKAGED' && row.barcode ? row.barcode : null]
        );
        const productId = prodResult.rows[0].id;

        const spResult = await client.query(
          `INSERT INTO catalog.store_products (
            store_id, product_id, sell_price, purchase_price, product_mode, current_stock, is_active
          ) VALUES ($1, $2, $3, $4, $5, $6, true) RETURNING id`,
          [storeId, productId, sellPrice, purchasePrice, mode, stock]
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
      } catch (err: any) {
        // GO-LIVE-178: Categorize errors for better diagnosis
        categorizedWarnings.push(categorizeDbError(err, row));
      }
    }

    await client.query("COMMIT");

    // GO-LIVE-178: Enhanced response with categorized warnings
    const skipped = validRows.length - created;
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
      message: skipped > 0
        ? `Imported ${created} products. ${skipped} row(s) failed (see failureSummary for details).`
        : `Imported ${created} products`,
    });
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("[BulkPaste] Commit error:", error.message);
    return res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Commit failed" },
    });
  } finally {
    client.release();
  }
});

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
