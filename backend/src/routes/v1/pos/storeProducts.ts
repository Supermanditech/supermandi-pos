import { Router } from "express";
import { requireDeviceToken } from "../../../middleware/deviceToken";
import { getPool } from "../../../db/client";
import {
  createStoreProductFromDigitisation,
  type CreateStoreProductInput,
  type CreateStoreProductResult
} from "../../../services/storeProductDigitisationService";

export const posStoreProductsRouter = Router();

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
posStoreProductsRouter.post("/store-products", requireDeviceToken, async (req, res) => {
  const { storeId } = (req as any).posDevice as { storeId: string };

  const {
    barcode,
    name,
    sellPrice,
    purchasePrice,
    mrp,
    initialStockQty,
    unit,
    description,
    brand
  } = req.body as Partial<CreateStoreProductInput>;

  // Basic validation
  if (typeof barcode !== "string" || barcode.trim().length === 0) {
    return res.status(422).json({
      error: "VALIDATION_ERROR",
      message: "Barcode is required"
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
  }

  // Default to 0 if not provided (R3: Opening Stock default = 0)
  const resolvedStockQty = typeof initialStockQty === "number" && Number.isFinite(initialStockQty) && initialStockQty >= 0
    ? Math.round(initialStockQty)
    : 0;

  try {
    const result = await createStoreProductFromDigitisation(storeId, {
      barcode,
      name: name || "",
      sellPrice: sellPrice || undefined,
      purchasePrice: purchasePrice || undefined,
      mrp,
      initialStockQty: resolvedStockQty,
      unit,
      description,
      brand
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
    console.error("[storeProducts] Error creating store product:", error);
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
  const { storeId } = (req as any).posDevice as { storeId: string };
  const q = String(req.query.q || "").trim();
  const limit = Math.min(Math.max(parseInt(String(req.query.limit || "30"), 10) || 30, 1), 100);
  const includeZeroStock = req.query.includeZeroStock !== "false";

  if (q.length < 2) {
    return res.json({ success: true, data: [], total: 0, context: "SELL" });
  }

  const pool = getPool();
  if (!pool) {
    return res.status(503).json({ error: "SERVICE_UNAVAILABLE", message: "Database unavailable" });
  }

  try {
    const stockFilter = includeZeroStock ? "" : "AND COALESCE(sb.current_qty, sp.current_stock, 0) > 0";

    // Tokenize query: split by whitespace, keep tokens >= 2 chars, cap at 5
    const tokens = q.split(/\s+/).filter(t => t.length >= 2).slice(0, 5);
    if (tokens.length === 0) {
      return res.json({ success: true, data: [], total: 0, context: "SELL" });
    }

    // Build dynamic WHERE and scoring for token-based OR matching
    // Each token is checked against name, display_name, brand, primary_barcode, store barcodes
    // Any token matching is sufficient (OR across tokens)
    const params: Array<string | number> = [storeId];
    const tokenWhereClauses: string[] = [];
    const tokenScoreCases: string[] = [];

    for (const token of tokens) {
      params.push(token);
      const idx = params.length; // $idx references this token

      tokenWhereClauses.push(`(
        p.primary_barcode = $${idx}
        OR spb.barcode = $${idx}
        OR p.name ILIKE '%' || $${idx} || '%'
        OR COALESCE(sp.display_name, '') ILIKE '%' || $${idx} || '%'
        OR COALESCE(p.brand, '') ILIKE '%' || $${idx} || '%'
        OR similarity(p.name, $${idx}) > 0.3
        OR similarity(COALESCE(p.brand, ''), $${idx}) > 0.3
      )`);

      tokenScoreCases.push(`CASE
        WHEN p.primary_barcode = $${idx} OR spb.barcode = $${idx} THEN 1000
        WHEN LOWER(p.name) = LOWER($${idx}) THEN 800
        WHEN LOWER(p.name) LIKE LOWER($${idx}) || '%' THEN 700
        WHEN similarity(p.name, $${idx}) > 0.5 THEN 500 + similarity(p.name, $${idx}) * 100
        WHEN p.name ILIKE '%' || $${idx} || '%' THEN 300
        WHEN COALESCE(sp.display_name, '') ILIKE '%' || $${idx} || '%' THEN 300
        WHEN COALESCE(p.brand, '') ILIKE '%' || $${idx} || '%' THEN 250
        WHEN similarity(p.name, $${idx}) > 0.3 THEN 200 + similarity(p.name, $${idx}) * 100
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
          p.brand,
          p.category,
          p.unit,
          p.primary_barcode,
          spb.barcode as store_barcode,
          GREATEST(sp.updated_at, p.updated_at) as updated_at,
          LOWER(TRIM(COALESCE(sp.display_name, p.name, ''))) || '::' || LOWER(TRIM(COALESCE(p.brand, ''))) as group_key,
          (${scoreExpr}) as priority_score
        FROM catalog.store_products sp
        JOIN catalog.products p ON p.id = sp.product_id
        LEFT JOIN inventory.stock_balances sb ON sb.store_id = sp.store_id AND sb.product_id = sp.product_id
        LEFT JOIN catalog.store_product_barcodes spb ON spb.store_product_id = sp.id AND spb.store_id = sp.store_id
        WHERE sp.store_id = $1
          AND sp.is_active = true
          AND p.is_active = true
          ${stockFilter}
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
        currentStock: row.current_stock,
        unit: row.unit || "pcs",
        mode: row.product_mode || undefined,
        displayName: row.sp_display_name || undefined,
        updatedAt: row.updated_at || undefined,
        metadataUpdatedAt: row.metadata_updated_at || undefined,
      });
    }

    const groups = Array.from(groupsMap.values());
    return res.json({ success: true, data: groups, total: rows.length, context: "SELL" });
  } catch (error) {
    console.error("[storeProducts] Search error:", error);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Search failed" });
  }
});

/**
 * GET /api/v1/pos/store-products/lookup?barcode=...
 * Direct barcode lookup for SELL context (scanner use)
 * Returns authoritative stock from inventory.stock_balances
 */
posStoreProductsRouter.get("/store-products/lookup", requireDeviceToken, async (req, res) => {
  const { storeId } = (req as any).posDevice as { storeId: string };
  const barcode = String(req.query.barcode || "").trim();

  if (!barcode) {
    return res.status(400).json({ error: "VALIDATION_ERROR", message: "barcode is required" });
  }

  const pool = getPool();
  if (!pool) {
    return res.status(503).json({ error: "SERVICE_UNAVAILABLE", message: "Database unavailable" });
  }

  try {
    const result = await pool.query(
      `SELECT
        sp.id as store_product_id,
        sp.product_id,
        p.name,
        p.brand,
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
        spb_match.barcode as store_barcode
      FROM catalog.store_products sp
      JOIN catalog.products p ON p.id = sp.product_id
      LEFT JOIN inventory.stock_balances sb ON sb.store_id = sp.store_id AND sb.product_id = sp.product_id
      LEFT JOIN catalog.store_product_barcodes spb_match ON spb_match.store_product_id = sp.id AND spb_match.store_id = sp.store_id AND spb_match.barcode = $2
      WHERE sp.store_id = $1
        AND sp.is_active = true
        AND p.is_active = true
        AND (
          p.primary_barcode = $2
          OR spb_match.barcode IS NOT NULL
          OR EXISTS (
            SELECT 1 FROM catalog.product_barcodes pb
            WHERE pb.product_id = p.id AND pb.barcode = $2
          )
        )
      LIMIT 1`,
      [storeId, barcode]
    );

    const row = result.rows[0];
    if (!row) {
      return res.status(404).json({
        success: false,
        error: "PRODUCT_NOT_IN_STORE_CATALOG",
        message: "Product not found in store catalog",
        barcode,
      });
    }

    return res.json({
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
        currentStock: row.current_stock,
        displayName: row.display_name || undefined,
        mode: row.product_mode || undefined,
        metadataUpdatedAt: row.metadata_updated_at || undefined,
      },
      context: "SELL",
    });
  } catch (error) {
    console.error("[storeProducts] Lookup error:", error);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Lookup failed" });
  }
});

/**
 * GET /api/v1/pos/store-products/list?limit=...&offset=...
 * List store products for tap-and-add SELL grid
 * Returns authoritative stock from inventory.stock_balances
 */
posStoreProductsRouter.get("/store-products/list", requireDeviceToken, async (req, res) => {
  const { storeId } = (req as any).posDevice as { storeId: string };
  const limit = Math.min(Math.max(parseInt(String(req.query.limit || "50"), 10) || 50, 1), 200);
  const offset = Math.max(parseInt(String(req.query.offset || "0"), 10) || 0, 0);

  const pool = getPool();
  if (!pool) {
    return res.status(503).json({ error: "SERVICE_UNAVAILABLE", message: "Database unavailable" });
  }

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
          COALESCE(sb.current_qty, sp.current_stock, 0) as current_stock,
          p.brand,
          p.unit,
          p.category,
          GREATEST(sp.updated_at, p.updated_at) as updated_at
        FROM catalog.store_products sp
        JOIN catalog.products p ON p.id = sp.product_id
        LEFT JOIN inventory.stock_balances sb ON sb.store_id = sp.store_id AND sb.product_id = sp.product_id
        LEFT JOIN LATERAL (
          SELECT barcode FROM catalog.store_product_barcodes
          WHERE store_product_id = sp.id AND store_id = sp.store_id
          LIMIT 1
        ) spb ON true
        WHERE sp.store_id = $1
          AND sp.is_active = true
          AND p.is_active = true
        ORDER BY COALESCE(sp.display_name, p.name) ASC
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
      currentStock: row.current_stock,
      brand: row.brand || null,
      unit: row.unit || "pcs",
      category: row.category || null,
      displayName: row.display_name || null,
      mode: row.product_mode || null,
      updatedAt: row.updated_at || null,
      metadataUpdatedAt: row.metadata_updated_at || null,
    }));

    const total = countResult.rows[0]?.total || 0;

    return res.json({ success: true, data, total, limit, offset, context: "SELL" });
  } catch (error) {
    console.error("[storeProducts] List error:", error);
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
  const { storeId } = (req as any).posDevice as { storeId: string };
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
    console.error("[storeProducts] Freshness check error:", error);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Freshness check failed" });
  }
});

/**
 * PATCH /api/v1/pos/store-products/price
 * Update sell price for a store product (by barcode or productId)
 * Used when POS user edits price inline
 */
posStoreProductsRouter.patch("/store-products/price", requireDeviceToken, async (req, res) => {
  const { storeId } = (req as any).posDevice as { storeId: string };
  const { barcode, productId, sellPrice } = req.body as {
    barcode?: string;
    productId?: string;
    sellPrice: number;
  };

  if (typeof sellPrice !== "number" || !Number.isFinite(sellPrice) || sellPrice <= 0) {
    return res.status(422).json({ error: "VALIDATION_ERROR", message: "sellPrice must be a positive number" });
  }

  if (!barcode && !productId) {
    return res.status(422).json({ error: "VALIDATION_ERROR", message: "barcode or productId is required" });
  }

  const pool = getPool();
  if (!pool) {
    return res.status(503).json({ error: "SERVICE_UNAVAILABLE", message: "Database unavailable" });
  }

  try {
    let updateResult;

    if (productId) {
      // Update by productId directly
      updateResult = await pool.query(
        `UPDATE catalog.store_products
         SET sell_price = $1, updated_at = NOW()
         WHERE store_id = $2 AND product_id = $3 AND is_active = true
         RETURNING id`,
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
         RETURNING sp.id`,
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
           RETURNING sp.id`,
          [Math.round(sellPrice), storeId, barcode]
        );
      }
    }

    if ((updateResult.rowCount ?? 0) === 0) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Product not found in store" });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error("[storeProducts] Price update error:", error);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Price update failed" });
  }
});

/**
 * PATCH /api/v1/pos/store-products/stock
 * Update stock for a store product (by productId or barcode)
 * Sets absolute stock level with ledger audit trail
 * Used when POS user updates stock from product detail view
 */
posStoreProductsRouter.patch("/store-products/stock", requireDeviceToken, async (req, res) => {
  const { storeId } = (req as any).posDevice as { storeId: string };
  const { productId, barcode, stock } = req.body as {
    productId?: string;
    barcode?: string;
    stock: number;
  };

  if (typeof stock !== "number" || !Number.isFinite(stock) || stock < 0) {
    return res.status(422).json({ error: "VALIDATION_ERROR", message: "stock must be a non-negative number" });
  }

  if (!productId && !barcode) {
    return res.status(422).json({ error: "VALIDATION_ERROR", message: "productId or barcode is required" });
  }

  const pool = getPool();
  if (!pool) {
    return res.status(503).json({ error: "SERVICE_UNAVAILABLE", message: "Database unavailable" });
  }

  const client = await pool.connect();
  try {
    // Resolve product_id from barcode if needed
    let resolvedProductId = productId;

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

    // Get current stock
    const stockResult = await client.query(
      `SELECT current_qty FROM inventory.stock_balances WHERE store_id = $1 AND product_id = $2`,
      [storeId, resolvedProductId]
    );
    const stockBefore = stockResult.rows[0]?.current_qty ?? 0;
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

    return res.json({ success: true, data: { productId: resolvedProductId, stock: newStock } });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("[storeProducts] Stock update error:", error);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Stock update failed" });
  } finally {
    client.release();
  }
});

/**
 * PATCH /api/v1/pos/store-products/:storeProductId/metadata
 * SYNC-PRD-001: Update product metadata (display name) from POS
 * Last-write-wins: server sets metadata_updated_at = NOW() on every write
 */
posStoreProductsRouter.patch("/store-products/:storeProductId/metadata", requireDeviceToken, async (req, res) => {
  const { storeId } = (req as any).posDevice as { storeId: string };
  const { storeProductId } = req.params;
  const { displayName, purchasePrice } = req.body as {
    displayName?: string;
    purchasePrice?: number;
  };

  const trimmedName = typeof displayName === "string" ? displayName.trim() : null;
  const validPurchasePrice = typeof purchasePrice === "number" && Number.isFinite(purchasePrice) && purchasePrice >= 0
    ? Math.round(purchasePrice)
    : null;

  if (!trimmedName && validPurchasePrice === null) {
    return res.status(422).json({
      error: "VALIDATION_ERROR",
      message: "At least one of displayName or purchasePrice is required"
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
    if (validPurchasePrice !== null) {
      setClauses.push(`purchase_price = $${paramIdx++}`);
      params.push(validPurchasePrice);
    }
    setClauses.push(`metadata_updated_at = NOW()`);
    setClauses.push(`metadata_updated_by = 'POS_APP'`);
    setClauses.push(`updated_at = NOW()`);

    params.push(storeProductId); // $N for WHERE id
    params.push(storeId);        // $N+1 for WHERE store_id

    const result = await pool.query(
      `UPDATE catalog.store_products
       SET ${setClauses.join(", ")}
       WHERE id = $${paramIdx++} AND store_id = $${paramIdx} AND is_active = true
       RETURNING id, display_name, purchase_price, metadata_updated_at`,
      params
    );

    if ((result.rowCount ?? 0) === 0) {
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
        purchasePrice: result.rows[0].purchase_price,
        metadataUpdatedAt: result.rows[0].metadata_updated_at,
      }
    });
  } catch (error) {
    console.error("[storeProducts] Metadata update error:", error);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Metadata update failed" });
  }
});
