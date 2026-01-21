/**
 * Retailer Catalog Service
 *
 * EPIC: Retailer Dashboard → POS Retailer-Owned Catalog (API-RCAT-001)
 *
 * Shared service module for retailer-owned catalog operations.
 * This module provides reusable functions for:
 * - Creating products in catalog.products
 * - Creating/updating store products in catalog.store_products
 * - Managing store-scoped barcode mappings in catalog.store_product_barcodes
 * - Generating store-scoped barcodes for LOOSE_BULK products
 *
 * "No Double Coding" Rule Compliance:
 * - All catalog write operations go through this module
 * - Ledger operations call inventory-service via HTTP
 * - This module can be reused by any service needing catalog access
 */

import crypto from 'crypto';
import { query } from '@supermandi/common';

// =============================================================================
// Types
// =============================================================================

export type ProductMode = 'PACKAGED' | 'LOOSE_BULK';

export interface CreateProductInput {
  name: string;
  description?: string | null;
  unit: string;
  brand?: string | null;
  hsn?: string | null;
  gstPercent?: number | null;
  packSize?: number | null;
  packUnit?: string | null;
  primaryBarcode?: string | null;  // Only for PACKAGED
}

export interface CreateStoreProductInput {
  storeId: string;
  productId: string;
  mode: ProductMode;
  purchasePrice: number;
  sellPrice: number;
  mrp?: number | null;
  displayName?: string | null;  // alias
  lowStockAlertQty?: number | null;
  notes?: string | null;
  soldBy?: string | null;  // LOOSE_BULK only
  rateUnit?: string | null;  // LOOSE_BULK only
  supplierId?: string | null;
  supplierNameRaw?: string | null;
  pendingSupplierRequestId?: string | null;
  currentStock?: number;
}

export interface CreateStoreBarcodeInput {
  storeId: string;
  storeProductId: string;
  barcode: string;
  source: 'manual' | 'supermandi_generated' | 'manufacturer';
}

export interface CreateRetailerProductResult {
  productId: string;
  storeProductId: string;
  barcode: string | null;
  generatedBarcode: string | null;
  storeProduct: {
    productId: string;
    mode: ProductMode;
    name: string;
    unit: string;
    sellPrice: number;
    mrp: number | null;
    purchasePrice: number;
    currentStock: number;
  };
}

// =============================================================================
// Barcode Generation (LOOSE_BULK)
// =============================================================================

/**
 * Generate a store-scoped barcode for LOOSE_BULK products.
 * Format: SM + 12 hex characters (uppercase)
 *
 * This barcode is unique within a store via the (store_id, barcode) constraint
 * in catalog.store_product_barcodes table.
 */
export function generateSupermandiBarcode(): string {
  return `SM${crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
}

// =============================================================================
// Product Operations
// =============================================================================

/**
 * Create a new product in catalog.products.
 * Returns the product ID.
 *
 * Note: Category is NOT set here - it is auto-derived via taxonomy keywords.
 */
export async function createProduct(input: CreateProductInput): Promise<string> {
  const result = await query<{ id: string }>(
    `INSERT INTO catalog.products (
       primary_barcode, name, description, unit, brand,
       hsn_code, default_gst_rate, pack_size, pack_unit
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      input.primaryBarcode || null,
      input.name,
      input.description || null,
      input.unit,
      input.brand || null,
      input.hsn || null,
      input.gstPercent || null,
      input.packSize || null,
      input.packUnit || null,
    ]
  );

  return result[0]!.id;
}

/**
 * Create a store product entry in catalog.store_products.
 * Links a product to a specific store with store-specific pricing and settings.
 */
export async function createStoreProduct(input: CreateStoreProductInput): Promise<string> {
  const result = await query<{ id: string }>(
    `INSERT INTO catalog.store_products (
       store_id, product_id, purchase_price, sell_price, mrp,
       product_mode, display_name, low_stock_alert_qty, notes,
       sold_by, rate_unit, supplier_id, supplier_name_raw,
       pending_supplier_request_id, current_stock
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     RETURNING id`,
    [
      input.storeId,
      input.productId,
      input.purchasePrice,
      input.sellPrice,
      input.mrp || null,
      input.mode,
      input.displayName || null,
      input.lowStockAlertQty || null,
      input.notes || null,
      input.soldBy || null,
      input.rateUnit || null,
      input.supplierId || null,
      input.supplierNameRaw || null,
      input.pendingSupplierRequestId || null,
      input.currentStock || 0,
    ]
  );

  return result[0]!.id;
}

/**
 * Create product and store_product in a single transaction.
 * This is the primary entry point for retailer product creation.
 */
export async function createProductWithStoreProduct(
  productInput: CreateProductInput,
  storeProductInput: Omit<CreateStoreProductInput, 'productId'>
): Promise<{ productId: string; storeProductId: string }> {
  const result = await query<{ id: string; store_product_id: string }>(
    `WITH new_product AS (
       INSERT INTO catalog.products (
         primary_barcode, name, description, unit, brand,
         hsn_code, default_gst_rate, pack_size, pack_unit
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id
     )
     INSERT INTO catalog.store_products (
       store_id, product_id, purchase_price, sell_price, mrp,
       product_mode, display_name, low_stock_alert_qty, notes,
       sold_by, rate_unit, current_stock
     )
     SELECT $10, id, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
     FROM new_product
     RETURNING product_id as id, id as store_product_id`,
    [
      // catalog.products fields ($1-$9)
      productInput.primaryBarcode || null,
      productInput.name,
      productInput.description || null,
      productInput.unit,
      productInput.brand || null,
      productInput.hsn || null,
      productInput.gstPercent || null,
      productInput.packSize || null,
      productInput.packUnit || null,
      // catalog.store_products fields ($10-$20)
      storeProductInput.storeId,
      storeProductInput.purchasePrice,
      storeProductInput.sellPrice,
      storeProductInput.mrp || null,
      storeProductInput.mode,
      storeProductInput.displayName || null,
      storeProductInput.lowStockAlertQty || null,
      storeProductInput.notes || null,
      storeProductInput.mode === 'LOOSE_BULK' ? (storeProductInput.soldBy || 'WEIGHT') : null,
      storeProductInput.mode === 'LOOSE_BULK' ? (storeProductInput.rateUnit || 'KG') : null,
      storeProductInput.currentStock || 0,
    ]
  );

  return {
    productId: result[0]!.id,
    storeProductId: result[0]!.store_product_id,
  };
}

// =============================================================================
// Barcode Mapping Operations
// =============================================================================

/**
 * Attach a barcode to a store product in catalog.store_product_barcodes.
 * This creates the store-scoped barcode mapping for POS scan resolution.
 *
 * For LOOSE_BULK products, handles collision retry with regenerated barcodes.
 */
export async function attachStoreBarcodeMapping(
  input: CreateStoreBarcodeInput,
  maxRetries: number = 1
): Promise<string> {
  let barcode = input.barcode;
  let attempts = 0;

  while (attempts < maxRetries) {
    try {
      await query(
        `INSERT INTO catalog.store_product_barcodes (store_id, store_product_id, barcode, source)
         VALUES ($1, $2, $3, $4)`,
        [input.storeId, input.storeProductId, barcode, input.source]
      );
      return barcode;
    } catch (err: unknown) {
      attempts++;
      if (input.source === 'supermandi_generated' && attempts < maxRetries) {
        // Regenerate barcode and retry (collision handling for LOOSE_BULK)
        barcode = generateSupermandiBarcode();
      } else {
        throw err;
      }
    }
  }

  return barcode;
}

/**
 * Check if a barcode already exists for a store.
 * Returns true if duplicate found.
 */
export async function checkDuplicateBarcode(
  storeId: string,
  barcode: string
): Promise<boolean> {
  const existing = await query(
    `SELECT sp.id FROM catalog.store_products sp
     JOIN catalog.store_product_barcodes spb ON spb.store_product_id = sp.id
     WHERE spb.store_id = $1 AND spb.barcode = $2`,
    [storeId, barcode]
  );
  return existing.length > 0;
}

// =============================================================================
// Stock Operations
// =============================================================================

/**
 * Update the current_stock field on store_products.
 * This is a denormalized field for quick access.
 */
export async function updateStoreProductStock(
  storeId: string,
  productId: string,
  stock: number
): Promise<void> {
  await query(
    `UPDATE catalog.store_products SET current_stock = $3
     WHERE store_id = $1 AND product_id = $2`,
    [storeId, productId, stock]
  );
}

// =============================================================================
// Supplier Operations
// =============================================================================

/**
 * Link a verified supplier to a store product.
 */
export async function linkSupplierToStoreProduct(
  storeProductId: string,
  supplierId: string
): Promise<void> {
  await query(
    `UPDATE catalog.store_products SET supplier_id = $1 WHERE id = $2`,
    [supplierId, storeProductId]
  );
}

/**
 * Store raw supplier name and pending request ID for unverified suppliers.
 */
export async function storeUnverifiedSupplierInfo(
  storeProductId: string,
  supplierNameRaw: string,
  pendingSupplierRequestId: string | null
): Promise<void> {
  await query(
    `UPDATE catalog.store_products
     SET supplier_name_raw = $1, pending_supplier_request_id = $2
     WHERE id = $3`,
    [supplierNameRaw, pendingSupplierRequestId, storeProductId]
  );
}

/**
 * Create a pending supplier enrollment request.
 */
export async function createPendingSupplierRequest(
  storeId: string,
  requestedName: string
): Promise<string | null> {
  const result = await query<{ id: string }>(
    `INSERT INTO supplier.supplier_requests (store_id, requested_name, status)
     VALUES ($1, $2, 'pending')
     RETURNING id`,
    [storeId, requestedName]
  );
  return result[0]?.id || null;
}

/**
 * Find a verified supplier by name for a store.
 */
export async function findVerifiedSupplierByName(
  storeId: string,
  supplierName: string
): Promise<{ id: string; businessName: string } | null> {
  const result = await query<{
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
    [storeId, `%${supplierName}%`]
  );

  if (result.length > 0 && result[0]!.is_supermandi) {
    return {
      id: result[0]!.id,
      businessName: result[0]!.business_name,
    };
  }
  return null;
}

/**
 * Verify that a supplier is linked to a store and is verified.
 */
export async function verifySupplierLink(
  storeId: string,
  supplierId: string
): Promise<{
  exists: boolean;
  verified: boolean;
  businessName: string | null;
}> {
  const result = await query<{
    supplier_id: string;
    business_name: string;
    is_supermandi: boolean;
  }>(
    `SELECT ssl.supplier_id,
            s.business_name,
            (s.gstin IS NOT NULL AND s.gstin NOT LIKE 'XX%' AND s.verification_status = 'verified') as is_supermandi
     FROM supplier.supplier_store_links ssl
     JOIN supplier.suppliers s ON ssl.supplier_id = s.id
     WHERE ssl.supplier_id = $1 AND ssl.store_id = $2 AND ssl.status = 'active'`,
    [supplierId, storeId]
  );

  if (result.length === 0) {
    return { exists: false, verified: false, businessName: null };
  }

  return {
    exists: true,
    verified: result[0]!.is_supermandi,
    businessName: result[0]!.business_name,
  };
}

// =============================================================================
// Supplier Product Catalog Link
// =============================================================================

/**
 * Create a supplier-product link entry.
 */
export async function createSupplierProductLink(
  supplierId: string,
  name: string,
  brand: string | null,
  purchasePrice: number
): Promise<void> {
  await query(
    `INSERT INTO catalog.supplier_products (supplier_id, name, category, brand, purchase_price, is_active)
     VALUES ($1, $2, NULL, $3, $4, true)
     ON CONFLICT DO NOTHING`,
    [supplierId, name, brand, purchasePrice]
  ).catch(() => {
    // Table might not exist yet, silently ignore
  });
}
