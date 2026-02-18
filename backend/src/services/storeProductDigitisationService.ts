/**
 * Store Product Digitisation Service
 * SD-ONBOARD-001B: Handles brand barcode digitisation during onboarding
 *
 * Provides:
 * - scan/resolve with FOUND/NEEDS_CREATE/NOT_FOUND contract
 * - create store product with initial stock (INWARD ledger)
 * - store-scoped barcode mapping
 */

import { randomUUID } from "crypto";
import { getPool } from "../db/client";
import { lookupBarcodeExternal, type BarcodeProductPrefill } from "./barcodeLookupProvider";
import { log } from "../lib/logger";

// =============================================================================
// Types (matching API contract)
// =============================================================================

export type ScanResolveStatus = "FOUND" | "NEEDS_CREATE" | "NOT_FOUND";

export interface StoreProductStock {
  isKnown: boolean;
  qty: number;
}

export interface StoreProductResponse {
  storeProductId: string;
  name: string;
  barcode: string;
  sellPrice: number | null;
  purchasePrice: number | null;
  mrp: number | null;
  stock: StoreProductStock;
  unit: string;
  brand: string;
  description: string;
  imageUrl: string;
  variant: string; // AUD-073-A FIX: Product variant
  packSize: number | null; // AUD-073-A FIX: Pack size
  productMode?: string; // T-054: PACKAGED or LOOSE_BULK
  soldBy?: string; // T-054: WEIGHT or COUNT (LOOSE_BULK only)
  rateUnit?: string; // T-054: KG, GM, LTR, ML, PCS (LOOSE_BULK only)
}

export interface ScanResolvePrefill {
  barcode: string;
  name: string;
  description: string;
  unit: string;
  imageUrl: string;
  brand: string;
}

// CONTRACT-LOCK-SCAN-001: barcode at root level for all non-FOUND statuses
export type ScanResolveResult =
  | { status: "FOUND"; storeProduct: StoreProductResponse }
  | { status: "NEEDS_CREATE"; barcode: string; prefill: ScanResolvePrefill }
  | { status: "NOT_FOUND"; barcode: string };

export interface CreateStoreProductInput {
  barcode: string;
  name: string;
  sellPrice?: number | null; // Minor units (paise) - optional for partial creation
  purchasePrice?: number; // Minor units (paise) - optional
  mrp?: number; // Minor units (paise)
  initialStockQty: number;
  unit?: string;
  description?: string;
  brand?: string;
  variant?: string; // AUD-073-A FIX: Product variant (e.g., "Red", "500ml")
  packSize?: number; // AUD-073-A FIX: Pack size (e.g., 6 for 6-pack)
}

export type CreateStoreProductResult =
  | { success: true; storeProduct: StoreProductResponse }
  | { success: false; error: "CONFLICT"; existingProduct: StoreProductResponse }
  | { success: false; error: "VALIDATION"; message: string };

// =============================================================================
// Internal Helpers
// =============================================================================

/**
 * Lookup store product by barcode using store-scoped barcode mapping
 */
async function lookupStoreProductByBarcode(
  storeId: string,
  barcode: string
): Promise<StoreProductResponse | null> {
  const pool = getPool();
  if (!pool) return null;

  const normalizedBarcode = barcode.trim();

  // Query: Check store_product_barcodes first (store-scoped mapping)
  // Then fallback to catalog.products.primary_barcode if store_product exists
  // Stock is authoritative from inventory.stock_balances (R6)
  // AUD-073-A FIX: Include variant and pack_size in SELECT
  const result = await pool.query(
    `
    SELECT
      sp.id AS store_product_id,
      COALESCE(sp.display_name, p.name) AS name,
      spb.barcode AS barcode,
      sp.sell_price,
      sp.purchase_price,
      sp.mrp,
      COALESCE(sb.current_qty, sp.current_stock, 0) AS current_stock,
      p.unit,
      p.brand,
      p.description,
      p.variant,
      p.pack_size,
      sp.product_mode,
      sp.sold_by,
      sp.rate_unit
    FROM catalog.store_product_barcodes spb
    JOIN catalog.store_products sp ON sp.id = spb.store_product_id AND sp.store_id = spb.store_id
    JOIN catalog.products p ON p.id = sp.product_id
    LEFT JOIN inventory.stock_balances sb ON sb.store_id = sp.store_id AND sb.product_id = sp.product_id
    WHERE spb.store_id = $1 AND spb.barcode = $2 AND sp.is_active = true
    ORDER BY sp.updated_at DESC
    LIMIT 1
    `,
    [storeId, normalizedBarcode]
  );

  if (result.rows[0]) {
    const row = result.rows[0];
    return {
      storeProductId: row.store_product_id,
      name: row.name || "",
      barcode: row.barcode,
      sellPrice: row.sell_price,
      purchasePrice: row.purchase_price ?? null,
      mrp: row.mrp,
      stock: {
        isKnown: true,
        qty: row.current_stock
      },
      unit: row.unit || "pcs",
      brand: row.brand || "",
      description: row.description || "",
      imageUrl: "",
      variant: row.variant || "",
      packSize: row.pack_size ?? null,
      productMode: row.product_mode || 'PACKAGED',
      soldBy: row.sold_by || undefined,
      rateUnit: row.rate_unit || undefined,
    };
  }

  // Fallback: Check if product exists in catalog with this primary_barcode
  // AND store has it in store_products (but no store-scoped barcode binding yet)
  // AUD-073-A FIX: Include variant and pack_size in SELECT
  const fallbackResult = await pool.query(
    `
    SELECT
      sp.id AS store_product_id,
      COALESCE(sp.display_name, p.name) AS name,
      p.primary_barcode AS barcode,
      sp.sell_price,
      sp.purchase_price,
      sp.mrp,
      COALESCE(sb.current_qty, sp.current_stock, 0) AS current_stock,
      p.unit,
      p.brand,
      p.description,
      p.variant,
      p.pack_size,
      sp.product_mode,
      sp.sold_by,
      sp.rate_unit
    FROM catalog.products p
    JOIN catalog.store_products sp ON sp.product_id = p.id AND sp.store_id = $1
    LEFT JOIN inventory.stock_balances sb ON sb.store_id = sp.store_id AND sb.product_id = sp.product_id
    WHERE p.primary_barcode = $2 AND sp.is_active = true
    ORDER BY sp.updated_at DESC
    LIMIT 1
    `,
    [storeId, normalizedBarcode]
  );

  if (fallbackResult.rows[0]) {
    const row = fallbackResult.rows[0];
    return {
      storeProductId: row.store_product_id,
      name: row.name || "",
      barcode: row.barcode,
      sellPrice: row.sell_price,
      purchasePrice: row.purchase_price ?? null,
      mrp: row.mrp,
      stock: {
        isKnown: true,
        qty: row.current_stock
      },
      unit: row.unit || "pcs",
      brand: row.brand || "",
      description: row.description || "",
      imageUrl: "",
      variant: row.variant || "",
      packSize: row.pack_size ?? null,
      productMode: row.product_mode || 'PACKAGED',
      soldBy: row.sold_by || undefined,
      rateUnit: row.rate_unit || undefined,
    };
  }

  return null;
}

/**
 * Get current stock for a store product from inventory ledger
 */
async function getCurrentStock(storeId: string, productId: string): Promise<{ isKnown: boolean; qty: number }> {
  const pool = getPool();
  if (!pool) return { isKnown: false, qty: 0 };

  // Check stock_balances first (faster)
  const balanceResult = await pool.query(
    `
    SELECT current_qty FROM inventory.stock_balances
    WHERE store_id = $1 AND product_id = $2
    `,
    [storeId, productId]
  );

  if (balanceResult.rows[0]) {
    return {
      isKnown: true,
      qty: balanceResult.rows[0].current_qty
    };
  }

  // Check if there are any ledger entries (means stock was recorded at some point)
  const ledgerResult = await pool.query(
    `
    SELECT 1 FROM inventory.inventory_ledger
    WHERE store_id = $1 AND product_id = $2
    LIMIT 1
    `,
    [storeId, productId]
  );

  if (ledgerResult.rows[0]) {
    // Has ledger entries but no balance record - compute from ledger
    const sumResult = await pool.query(
      `
      SELECT COALESCE(SUM(delta_qty), 0)::INTEGER AS total
      FROM inventory.inventory_ledger
      WHERE store_id = $1 AND product_id = $2
      `,
      [storeId, productId]
    );
    return {
      isKnown: true,
      qty: sumResult.rows[0]?.total ?? 0
    };
  }

  // No ledger entries = stock unknown
  return { isKnown: false, qty: 0 };
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Resolve barcode scan for digitisation flow
 *
 * Resolution order:
 * 1. Store-scoped barcode mapping (catalog.store_product_barcodes)
 * 2. Catalog primary barcode with store_product link
 * 3. External provider lookup (returns NEEDS_CREATE with prefill)
 * 4. NOT_FOUND
 */
export async function resolveScanForDigitisation(
  storeId: string,
  barcode: string
): Promise<ScanResolveResult> {
  const normalizedBarcode = barcode.trim();

  if (!normalizedBarcode) {
    return { status: "NOT_FOUND", barcode: "" };
  }

  // Step 1: Check store-scoped barcode mapping
  const storeProduct = await lookupStoreProductByBarcode(storeId, normalizedBarcode);

  if (storeProduct) {
    // Found in store catalog - ready to sell
    return { status: "FOUND", storeProduct };
  }

  // Step 2: Not in store - try external lookup for prefill
  log.info("[digitisation] Barcode not in store catalog, trying external lookup:", normalizedBarcode);

  const externalData = await lookupBarcodeExternal(normalizedBarcode);

  if (externalData) {
    // External lookup found data - return NEEDS_CREATE with prefill
    // CONTRACT-LOCK-SCAN-001: Include barcode at root level
    return {
      status: "NEEDS_CREATE",
      barcode: normalizedBarcode,
      prefill: {
        barcode: normalizedBarcode,
        name: externalData.name,
        description: externalData.description,
        unit: externalData.unit || "pcs",
        imageUrl: externalData.imageUrl,
        brand: externalData.brand
      }
    };
  }

  // Step 3: Nothing found - return NOT_FOUND (user enters manually)
  return { status: "NOT_FOUND", barcode: normalizedBarcode };
}

/**
 * Create store product from digitisation flow
 *
 * Creates:
 * - catalog.products (if barcode not in global catalog)
 * - catalog.store_products (store-specific pricing/stock)
 * - catalog.store_product_barcodes (store-scoped barcode binding)
 * - inventory.inventory_ledger (opening_stock entry when qty > 0)
 * - inventory.stock_balances (stock balance record)
 *
 * Idempotent: Returns 409 CONFLICT if (store_id, barcode) already exists
 */
export async function createStoreProductFromDigitisation(
  storeId: string,
  input: CreateStoreProductInput
): Promise<CreateStoreProductResult> {
  const pool = getPool();
  if (!pool) {
    return { success: false, error: "VALIDATION", message: "Database unavailable" };
  }

  // Validate input
  const normalizedBarcode = input.barcode.trim();
  if (!normalizedBarcode) {
    return { success: false, error: "VALIDATION", message: "Barcode is required" };
  }

  // sellPrice is optional for partial creation (P3: partial allowed, completed on dashboard later)
  if (input.sellPrice !== undefined && input.sellPrice !== null && input.sellPrice !== 0) {
    if (typeof input.sellPrice !== "number" || input.sellPrice < 0) {
      return { success: false, error: "VALIDATION", message: "Sell price must be non-negative" };
    }
  }

  if (typeof input.initialStockQty !== "number" || input.initialStockQty < 0) {
    return { success: false, error: "VALIDATION", message: "Initial stock quantity must be >= 0" };
  }

  const productName = input.name?.trim() || normalizedBarcode;

  // Check idempotency: does this store already have this barcode mapped?
  const existingMapping = await lookupStoreProductByBarcode(storeId, normalizedBarcode);
  if (existingMapping) {
    return {
      success: false,
      error: "CONFLICT",
      existingProduct: existingMapping
    };
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Step 1: Find or create catalog.products entry
    let productId: string;

    // Check if barcode exists in global catalog
    const existingProductResult = await client.query(
      `
      SELECT id FROM catalog.products
      WHERE primary_barcode = $1
      LIMIT 1
      `,
      [normalizedBarcode]
    );

    if (existingProductResult.rows[0]) {
      productId = existingProductResult.rows[0].id;
      log.info("[digitisation] Using existing catalog product:", productId);

      // AUD-073-A FIX: Update variant and pack_size if provided (may have been missing before)
      if (input.variant || input.packSize) {
        await client.query(
          `UPDATE catalog.products SET
            variant = COALESCE($2, variant),
            pack_size = COALESCE($3, pack_size),
            updated_at = NOW()
          WHERE id = $1`,
          [productId, input.variant?.trim() || null, input.packSize || null]
        );
      }
    } else {
      // Create new catalog product
      // AUD-073-A FIX: Include variant and pack_size in INSERT
      productId = randomUUID();
      await client.query(
        `
        INSERT INTO catalog.products (id, name, brand, description, unit, primary_barcode, variant, pack_size, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
        `,
        [
          productId,
          productName,
          input.brand || null,
          input.description || null,
          input.unit || "pcs",
          normalizedBarcode,
          input.variant?.trim() || null,
          input.packSize || null
        ]
      );
      log.info("[digitisation] Created new catalog product:", productId);
    }

    // Step 2: Auto-assign taxonomy based on product name (CAT-002)
    const taxonomyResult = await client.query(
      `SELECT catalog.assign_taxonomy_by_name($1) AS taxonomy_id`,
      [productName]
    );
    const taxonomyId = taxonomyResult.rows[0]?.taxonomy_id || null;

    // Step 3: Create or update catalog.store_products
    const storeProductId = randomUUID();
    const sellPriceMinor = input.sellPrice ? Math.round(input.sellPrice) : null;
    const mrpMinor = input.mrp ? Math.round(input.mrp) : sellPriceMinor;
    const purchasePriceMinor = input.purchasePrice ? Math.round(input.purchasePrice) : null;

    // SYNC-PRD-001: Set metadata_updated_at/metadata_updated_by on both INSERT and ON CONFLICT
    // AUD-025-B: On conflict, preserve user-customized display_name if metadata_updated_at is set
    // (indicates explicit user edit from Dashboard or POS metadata PATCH)
    await client.query(
      `
      INSERT INTO catalog.store_products (id, store_id, product_id, sell_price, mrp, purchase_price, display_name, is_active, current_stock, taxonomy_id, metadata_updated_at, metadata_updated_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, $9, NOW(), 'POS_APP')
      ON CONFLICT (store_id, product_id) DO UPDATE SET
        -- AUD-025-B: Preserve user-edited metadata fields if metadata_updated_at is set
        sell_price = CASE
          WHEN catalog.store_products.metadata_updated_at IS NOT NULL
          THEN catalog.store_products.sell_price
          ELSE COALESCE(EXCLUDED.sell_price, catalog.store_products.sell_price)
        END,
        mrp = CASE
          WHEN catalog.store_products.metadata_updated_at IS NOT NULL
          THEN catalog.store_products.mrp
          ELSE COALESCE(EXCLUDED.mrp, catalog.store_products.mrp)
        END,
        purchase_price = CASE
          WHEN catalog.store_products.metadata_updated_at IS NOT NULL
          THEN catalog.store_products.purchase_price
          ELSE COALESCE(EXCLUDED.purchase_price, catalog.store_products.purchase_price)
        END,
        display_name = CASE
          WHEN catalog.store_products.metadata_updated_at IS NOT NULL
          THEN catalog.store_products.display_name
          ELSE EXCLUDED.display_name
        END,
        current_stock = EXCLUDED.current_stock,
        taxonomy_id = COALESCE(catalog.store_products.taxonomy_id, EXCLUDED.taxonomy_id),
        metadata_updated_at = COALESCE(catalog.store_products.metadata_updated_at, NOW()),
        metadata_updated_by = COALESCE(catalog.store_products.metadata_updated_by, 'POS_APP'),
        is_active = true,
        updated_at = NOW()
      RETURNING id
      `,
      [storeProductId, storeId, productId, sellPriceMinor, mrpMinor, purchasePriceMinor, productName, input.initialStockQty, taxonomyId]
    );

    // Get the actual store_product_id (might be existing if ON CONFLICT triggered)
    const storeProductResult = await client.query(
      `SELECT id FROM catalog.store_products WHERE store_id = $1 AND product_id = $2`,
      [storeId, productId]
    );
    const actualStoreProductId = storeProductResult.rows[0]?.id || storeProductId;

    // Step 3: Create store-scoped barcode binding
    await client.query(
      `
      INSERT INTO catalog.store_product_barcodes (store_id, store_product_id, barcode, source)
      VALUES ($1, $2, $3, 'retailer_digitisation')
      ON CONFLICT (store_id, barcode) DO NOTHING
      `,
      [storeId, actualStoreProductId, normalizedBarcode]
    );

    // Step 4: Create opening_stock ledger entry (R6: only when qty > 0)
    let ledgerId: string | null = null;
    if (input.initialStockQty > 0) {
      ledgerId = randomUUID();
      const unitCost = purchasePriceMinor ?? sellPriceMinor ?? 0;
      await client.query(
        `
        INSERT INTO inventory.inventory_ledger (
          id, store_id, product_id, delta_qty, transaction_type,
          reference_type, reference_id, stock_before, stock_after, unit_cost, notes
        )
        VALUES ($1, $2, $3, $4, 'opening_stock', 'digitisation', $5, 0, $4, $6, 'Opening stock from POS digitisation')
        `,
        [ledgerId, storeId, productId, input.initialStockQty, `digitisation:${actualStoreProductId}`, unitCost]
      );
    }

    // Step 5: Always create stock_balances record (R6: consistent stock resolution for search JOIN)
    await client.query(
      `
      INSERT INTO inventory.stock_balances (store_id, product_id, current_qty, last_ledger_id)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (store_id, product_id) DO UPDATE SET
        current_qty = EXCLUDED.current_qty,
        last_ledger_id = COALESCE(EXCLUDED.last_ledger_id, inventory.stock_balances.last_ledger_id),
        updated_at = NOW()
      `,
      [storeId, productId, input.initialStockQty, ledgerId]
    );

    await client.query("COMMIT");

    log.info("[digitisation] Successfully created store product:", actualStoreProductId, "for store:", storeId);

    // Return the created store product
    // AUD-073-A FIX: Include variant and packSize in response
    return {
      success: true,
      storeProduct: {
        storeProductId: actualStoreProductId,
        name: productName,
        barcode: normalizedBarcode,
        sellPrice: sellPriceMinor ?? null,
        purchasePrice: purchasePriceMinor ?? null,
        mrp: mrpMinor ?? null,
        stock: {
          isKnown: true,
          qty: input.initialStockQty
        },
        unit: input.unit || "pcs",
        brand: input.brand || "",
        description: input.description || "",
        imageUrl: "",
        variant: input.variant?.trim() || "",
        packSize: input.packSize ?? null,
        productMode: 'PACKAGED',
        soldBy: undefined,
        rateUnit: undefined,
      }
    };
  } catch (error) {
    await client.query("ROLLBACK");
    log.error("[digitisation] Failed to create store product:", error);

    // Check if it's a unique constraint violation (race condition)
    if ((error as any).code === "23505") {
      const existing = await lookupStoreProductByBarcode(storeId, normalizedBarcode);
      if (existing) {
        return { success: false, error: "CONFLICT", existingProduct: existing };
      }
    }

    throw error;
  } finally {
    client.release();
  }
}
