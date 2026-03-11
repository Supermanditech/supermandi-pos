// Catalog Service Database Queries - V3.0.9 compliant
// Queries for products, barcodes, supplier products, and mappings

import { query, queryOne, getClient } from '@supermandi/common';
import type { PoolClient } from 'pg';
import type {
  Product,
  ProductBarcode,
  StoreProduct,
  SupplierProduct,
  SupplierProductMap,
} from '@supermandi/common';

// =============================================================================
// TYPES
// =============================================================================

// Re-export types for convenience
export type {
  Product,
  ProductBarcode,
  StoreProduct,
  SupplierProduct,
  SupplierProductMap,
} from '@supermandi/common';

// Database row types (snake_case)
interface ProductRow {
  id: string;
  name: string;
  description: string | null;
  brand: string | null;
  category: string | null;
  unit: string | null;
  pack_size: number | null;
  primary_barcode: string | null;
  hsn_code: string | null;
  default_gst_rate: string | null;
  net_content_value: string | null;
  net_content_unit: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

interface StoreProductRow {
  id: string;
  store_id: string;
  product_id: string;
  sell_price: number | null;
  mrp: number | null;
  display_name: string | null;
  is_active: boolean;
  current_stock: number;
  stock_last_event_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface SupplierProductRow {
  id: string;
  supplier_id: string;
  supplier_sku: string | null;
  barcode: string | null;
  name: string;
  category: string | null;
  brand: string | null;
  unit: string | null;
  pack_size: number | null;
  mrp: number | null;
  purchase_price: number;
  stock_quantity: number;
  stock_status: string;
  moq: number;
  max_qty: number | null;
  net_content_value: string | null;
  net_content_unit: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

// =============================================================================
// ROW MAPPERS
// =============================================================================

function mapProductRow(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    brand: row.brand ?? undefined,
    category: row.category ?? undefined,
    unit: row.unit ?? undefined,
    packSize: row.pack_size ?? undefined,
    primaryBarcode: row.primary_barcode ?? undefined,
    hsnCode: row.hsn_code ?? undefined,
    defaultGstRate: row.default_gst_rate ? parseFloat(row.default_gst_rate) : undefined,
    netContentValue: row.net_content_value ? parseFloat(row.net_content_value) : undefined,
    netContentUnit: row.net_content_unit ?? undefined,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapStoreProductRow(row: StoreProductRow): StoreProduct {
  return {
    id: row.id,
    storeId: row.store_id,
    productId: row.product_id,
    sellPrice: row.sell_price ?? undefined,
    mrp: row.mrp ?? undefined,
    displayName: row.display_name ?? undefined,
    isActive: row.is_active,
    currentStock: row.current_stock,
    stockLastEventAt: row.stock_last_event_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSupplierProductRow(row: SupplierProductRow): SupplierProduct {
  return {
    id: row.id,
    supplierId: row.supplier_id,
    supplierSku: row.supplier_sku ?? undefined,
    barcode: row.barcode ?? undefined,
    name: row.name,
    category: row.category ?? undefined,
    brand: row.brand ?? undefined,
    unit: row.unit ?? undefined,
    packSize: row.pack_size ?? undefined,
    mrp: row.mrp ?? undefined,
    purchasePrice: row.purchase_price,
    stockQuantity: row.stock_quantity,
    stockStatus: row.stock_status as SupplierProduct['stockStatus'],
    moq: row.moq,
    maxQty: row.max_qty ?? undefined,
    netContentValue: row.net_content_value ? parseFloat(row.net_content_value) : undefined,
    netContentUnit: row.net_content_unit ?? undefined,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// =============================================================================
// PRODUCT QUERIES
// =============================================================================

/**
 * Get product by ID
 */
export async function getProductById(id: string): Promise<Product | null> {
  const row = await queryOne<ProductRow>(
    `SELECT * FROM catalog.products WHERE id = $1`,
    [id]
  );
  return row ? mapProductRow(row) : null;
}

/**
 * Get product by barcode
 */
export async function getProductByBarcode(barcode: string): Promise<Product | null> {
  const row = await queryOne<ProductRow>(
    `SELECT p.* FROM catalog.products p
     JOIN catalog.product_barcodes pb ON pb.product_id = p.id
     WHERE pb.barcode = $1`,
    [barcode]
  );
  return row ? mapProductRow(row) : null;
}

/**
 * Search products using trigram similarity
 * Returns products matching the search query
 */
export async function searchProducts(
  searchQuery: string,
  options: {
    limit?: number;
    offset?: number;
    category?: string;
    activeOnly?: boolean;
  } = {}
): Promise<{ products: Product[]; total: number }> {
  const { limit = 50, offset = 0, category, activeOnly = true } = options;

  // Build WHERE clauses
  const whereClauses: string[] = ['1=1'];
  const params: unknown[] = [];
  let paramIndex = 1;

  // Search by name or brand similarity
  whereClauses.push(`(
    similarity(p.name, $${paramIndex}) > 0.3
    OR similarity(COALESCE(p.brand, ''), $${paramIndex}) > 0.3
    OR p.name ILIKE $${paramIndex + 1}
    OR p.brand ILIKE $${paramIndex + 1}
    OR p.primary_barcode = $${paramIndex + 2}
  )`);
  params.push(searchQuery, `%${searchQuery}%`, searchQuery);
  paramIndex += 3;

  if (activeOnly) {
    whereClauses.push(`p.is_active = true`);
  }

  if (category) {
    whereClauses.push(`p.category = $${paramIndex++}`);
    params.push(category);
  }

  const whereClause = whereClauses.join(' AND ');

  // Count query
  const countSql = `
    SELECT COUNT(*) as count
    FROM catalog.products p
    WHERE ${whereClause}
  `;
  const countRow = await queryOne<{ count: string }>(countSql, params);
  const total = parseInt(countRow?.count ?? '0', 10);

  // Search query with similarity scoring
  const searchSql = `
    SELECT p.*,
      GREATEST(
        similarity(p.name, $1),
        similarity(COALESCE(p.brand, ''), $1)
      ) as score
    FROM catalog.products p
    WHERE ${whereClause}
    ORDER BY score DESC, p.name ASC
    LIMIT $${paramIndex++} OFFSET $${paramIndex}
  `;

  const rows = await query<ProductRow & { score: number }>(
    searchSql,
    [...params, limit, offset]
  );

  return {
    products: rows.map(mapProductRow),
    total,
  };
}

// =============================================================================
// STORE PRODUCT QUERIES
// =============================================================================

/**
 * Get store product
 */
export async function getStoreProduct(
  storeId: string,
  productId: string
): Promise<StoreProduct | null> {
  const row = await queryOne<StoreProductRow>(
    `SELECT * FROM catalog.store_products
     WHERE store_id = $1 AND product_id = $2`,
    [storeId, productId]
  );
  return row ? mapStoreProductRow(row) : null;
}

/**
 * List store products with pagination
 */
export async function listStoreProducts(
  storeId: string,
  options: {
    limit?: number;
    offset?: number;
    activeOnly?: boolean;
    lowStockOnly?: boolean;
  } = {}
): Promise<{ products: StoreProduct[]; total: number }> {
  const { limit = 50, offset = 0, activeOnly = true, lowStockOnly = false } = options;

  const whereClauses: string[] = ['store_id = $1'];
  const params: unknown[] = [storeId];
  let paramIndex = 2;

  if (activeOnly) {
    whereClauses.push('is_active = true');
  }

  if (lowStockOnly) {
    whereClauses.push('current_stock <= 10');
  }

  const whereClause = whereClauses.join(' AND ');

  // Count
  const countRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM catalog.store_products WHERE ${whereClause}`,
    params
  );
  const total = parseInt(countRow?.count ?? '0', 10);

  // List
  const rows = await query<StoreProductRow>(
    `SELECT * FROM catalog.store_products
     WHERE ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    [...params, limit, offset]
  );

  return {
    products: rows.map(mapStoreProductRow),
    total,
  };
}

/**
 * Update store product stock (from event)
 */
export async function updateStoreProductStock(
  client: PoolClient,
  storeId: string,
  productId: string,
  newStock: number,
  eventTimestamp: Date
): Promise<StoreProduct | null> {
  // Only update if event is newer (last-write-wins with ordering)
  const result = await client.query<StoreProductRow>(
    `UPDATE catalog.store_products
     SET current_stock = $3, stock_last_event_at = $4
     WHERE store_id = $1 AND product_id = $2
       AND (stock_last_event_at IS NULL OR stock_last_event_at < $4)
     RETURNING *`,
    [storeId, productId, newStock, eventTimestamp]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapStoreProductRow(result.rows[0]!);
}

// =============================================================================
// SUPPLIER PRODUCT QUERIES
// =============================================================================

/**
 * Get supplier product by ID
 */
export async function getSupplierProductById(id: string): Promise<SupplierProduct | null> {
  const row = await queryOne<SupplierProductRow>(
    `SELECT * FROM catalog.supplier_products WHERE id = $1`,
    [id]
  );
  return row ? mapSupplierProductRow(row) : null;
}

/**
 * Search supplier products using trigram similarity
 */
export async function searchSupplierProducts(
  supplierId: string,
  searchQuery: string,
  options: {
    limit?: number;
    offset?: number;
    activeOnly?: boolean;
  } = {}
): Promise<{ products: SupplierProduct[]; total: number }> {
  const { limit = 50, offset = 0, activeOnly = true } = options;

  const whereClauses = ['supplier_id = $1'];
  const params: unknown[] = [supplierId];
  let paramIndex = 2;

  // Search by name, brand, or barcode
  whereClauses.push(`(
    similarity(name, $${paramIndex}) > 0.3
    OR similarity(COALESCE(brand, ''), $${paramIndex}) > 0.3
    OR name ILIKE $${paramIndex + 1}
    OR barcode = $${paramIndex + 2}
  )`);
  params.push(searchQuery, `%${searchQuery}%`, searchQuery);
  paramIndex += 3;

  if (activeOnly) {
    whereClauses.push('is_active = true');
  }

  const whereClause = whereClauses.join(' AND ');

  // Count
  const countRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM catalog.supplier_products WHERE ${whereClause}`,
    params
  );
  const total = parseInt(countRow?.count ?? '0', 10);

  // Search
  const rows = await query<SupplierProductRow>(
    `SELECT *,
      GREATEST(
        similarity(name, $2),
        similarity(COALESCE(brand, ''), $2)
      ) as score
     FROM catalog.supplier_products
     WHERE ${whereClause}
     ORDER BY score DESC, name ASC
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    [...params, limit, offset]
  );

  return {
    products: rows.map(mapSupplierProductRow),
    total,
  };
}

/**
 * Get supplier products for a supplier (active only)
 */
export async function getSupplierProducts(
  supplierId: string,
  options: {
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ products: SupplierProduct[]; total: number }> {
  const { limit = 50, offset = 0 } = options;

  // Count
  const countRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM catalog.supplier_products
     WHERE supplier_id = $1 AND is_active = true`,
    [supplierId]
  );
  const total = parseInt(countRow?.count ?? '0', 10);

  // List
  const rows = await query<SupplierProductRow>(
    `SELECT * FROM catalog.supplier_products
     WHERE supplier_id = $1 AND is_active = true
     ORDER BY name ASC
     LIMIT $2 OFFSET $3`,
    [supplierId, limit, offset]
  );

  return {
    products: rows.map(mapSupplierProductRow),
    total,
  };
}

// =============================================================================
// PRODUCT MAPPING QUERIES
// =============================================================================

/**
 * Get mappings for a supplier product
 */
export async function getProductMappings(
  supplierProductId: string
): Promise<SupplierProductMap[]> {
  interface MapRow {
    id: string;
    supplier_product_id: string;
    product_id: string;
    mapping_type: string;
    confidence: string | null;
    mapped_by_user_id: string | null;
    mapped_at: Date;
    is_verified: boolean;
    created_at: Date;
    updated_at: Date;
  }

  const rows = await query<MapRow>(
    `SELECT * FROM catalog.supplier_product_map WHERE supplier_product_id = $1`,
    [supplierProductId]
  );

  return rows.map((row) => ({
    id: row.id,
    supplierProductId: row.supplier_product_id,
    productId: row.product_id,
    mappingType: row.mapping_type as SupplierProductMap['mappingType'],
    confidence: row.confidence ? parseFloat(row.confidence) : undefined,
    mappedByUserId: row.mapped_by_user_id ?? undefined,
    mappedAt: row.mapped_at,
    isVerified: row.is_verified,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

// Re-export getClient for transaction support
export { getClient };

// =============================================================================
// SEARCH-SELL-001: Store Product Search (SELL context only)
// =============================================================================

/**
 * Search group type for 2-step SELL UX
 * Groups products by normalized name+brand for SKU picker
 * GO-LIVE-TR-006: Includes Hindi translations for bilingual display
 */
export interface StoreSearchGroup {
  groupId: string;
  displayName: string;
  /** Hindi translation of display name (if available) */
  displayNameHi?: string;
  brand?: string;
  /** Hindi translation of brand (if available) */
  brandHi?: string;
  category?: string;
  matches: Array<{
    productId: string;
    storeProductId: string;
    sku?: string;
    barcode?: string;
    sellPrice?: number | null;
    currentStock: number;
    displayName?: string;
  }>;
}

/**
 * SEARCH-SELL-001: Search store products for SELL context
 *
 * CRITICAL: Only searches products that exist in catalog.store_products
 * (i.e., products the store has actually onboarded/received)
 *
 * Returns grouped results for 2-step add UX:
 * - First tap: Show groups (product families)
 * - Second tap: Select specific SKU from group
 *
 * @param storeId - Store ID (REQUIRED for tenant isolation)
 * @param searchQuery - Search term
 * @param options - Search options
 */
export async function searchStoreProducts(
  storeId: string,
  searchQuery: string,
  options: {
    limit?: number;
    includeZeroStock?: boolean;
  } = {}
): Promise<{ groups: StoreSearchGroup[]; total: number }> {
  const { limit = 30, includeZeroStock = true } = options;

  // TENANT-001: storeId is ALWAYS the first filter
  const params: unknown[] = [storeId, searchQuery];

  // Build stock filter
  const stockFilter = includeZeroStock ? '' : 'AND sp.current_stock > 0';

  // GO-LIVE-TR-006: Search query with Hindi + English parity
  // Priority ordering:
  // 1. Exact barcode/SKU match (highest priority)
  // 2. Prefix match on name (English or Hindi)
  // 3. Trigram similarity (English or Hindi)
  const searchSql = `
    WITH ranked_products AS (
      SELECT
        sp.id as store_product_id,
        sp.product_id,
        sp.sell_price,
        sp.mrp,
        sp.display_name as sp_display_name,
        sp.current_stock,
        p.name,
        p.brand,
        p.category,
        p.primary_barcode,
        pt.name as hindi_name,
        pt.brand as hindi_brand,
        -- Grouping key: normalized name + brand
        LOWER(TRIM(COALESCE(p.name, ''))) || '::' || LOWER(TRIM(COALESCE(p.brand, ''))) as group_key,
        -- Priority scoring (includes Hindi translations)
        CASE
          WHEN p.primary_barcode = $2 THEN 1000
          WHEN EXISTS (
            SELECT 1 FROM catalog.product_barcodes pb
            WHERE pb.product_id = p.id AND pb.barcode = $2
          ) THEN 900
          WHEN LOWER(p.name) = LOWER($2) THEN 800
          WHEN pt.name IS NOT NULL AND LOWER(pt.name) = LOWER($2) THEN 795
          WHEN LOWER(p.name) LIKE LOWER($2) || '%' THEN 700
          WHEN pt.name IS NOT NULL AND LOWER(pt.name) LIKE LOWER($2) || '%' THEN 695
          WHEN similarity(p.name, $2) > 0.5 THEN 500 + similarity(p.name, $2) * 100
          WHEN pt.name IS NOT NULL AND similarity(pt.name, $2) > 0.5 THEN 490 + similarity(pt.name, $2) * 100
          WHEN similarity(COALESCE(p.brand, ''), $2) > 0.5 THEN 400 + similarity(p.brand, $2) * 100
          WHEN pt.brand IS NOT NULL AND similarity(pt.brand, $2) > 0.5 THEN 395 + similarity(pt.brand, $2) * 100
          WHEN p.name ILIKE '%' || $2 || '%' THEN 300
          WHEN pt.name IS NOT NULL AND pt.name ILIKE '%' || $2 || '%' THEN 295
          WHEN similarity(p.name, $2) > 0.3 THEN 200 + similarity(p.name, $2) * 100
          WHEN pt.name IS NOT NULL AND similarity(pt.name, $2) > 0.3 THEN 195 + similarity(pt.name, $2) * 100
          ELSE 100 + GREATEST(similarity(p.name, $2), COALESCE(similarity(pt.name, $2), 0)) * 100
        END as priority_score
      FROM catalog.store_products sp
      JOIN catalog.products p ON p.id = sp.product_id
      LEFT JOIN catalog.product_translations pt ON pt.product_id = p.id AND pt.locale = 'hi'
      WHERE sp.store_id = $1
        AND sp.is_active = true
        AND p.is_active = true
        ${stockFilter}
        AND (
          p.primary_barcode = $2
          OR EXISTS (
            SELECT 1 FROM catalog.product_barcodes pb
            WHERE pb.product_id = p.id AND pb.barcode = $2
          )
          OR p.name ILIKE '%' || $2 || '%'
          OR similarity(p.name, $2) > 0.3
          OR similarity(COALESCE(p.brand, ''), $2) > 0.3
          -- GO-LIVE-TR-006: Hindi translation matching
          OR (pt.name IS NOT NULL AND pt.name ILIKE '%' || $2 || '%')
          OR (pt.name IS NOT NULL AND similarity(pt.name, $2) > 0.3)
          OR (pt.brand IS NOT NULL AND similarity(pt.brand, $2) > 0.3)
        )
      ORDER BY priority_score DESC
      LIMIT $3
    )
    SELECT * FROM ranked_products
    ORDER BY priority_score DESC, name ASC
  `;

  const rows = await query<{
    store_product_id: string;
    product_id: string;
    sell_price: number | null;
    mrp: number | null;
    sp_display_name: string | null;
    current_stock: number;
    name: string;
    brand: string | null;
    category: string | null;
    primary_barcode: string | null;
    hindi_name: string | null;
    hindi_brand: string | null;
    group_key: string;
    priority_score: number;
  }>(searchSql, [...params, limit]);

  // Group results by group_key for 2-step UX
  // GO-LIVE-TR-006: Include Hindi translations in response
  const groupsMap = new Map<string, StoreSearchGroup>();

  for (const row of rows) {
    let group = groupsMap.get(row.group_key);
    if (!group) {
      group = {
        groupId: row.group_key,
        displayName: row.name,
        displayNameHi: row.hindi_name ?? undefined,
        brand: row.brand ?? undefined,
        brandHi: row.hindi_brand ?? undefined,
        category: row.category ?? undefined,
        matches: [],
      };
      groupsMap.set(row.group_key, group);
    }

    group.matches.push({
      productId: row.product_id,
      storeProductId: row.store_product_id,
      barcode: row.primary_barcode ?? undefined,
      sellPrice: row.sell_price,
      currentStock: row.current_stock,
      displayName: row.sp_display_name ?? undefined,
    });
  }

  const groups = Array.from(groupsMap.values());

  return {
    groups,
    total: rows.length,
  };
}

/**
 * SEARCH-SELL-001: Get single store product for direct barcode scan
 * Used when scanner returns a specific barcode - can add directly
 */
export async function getStoreProductByBarcode(
  storeId: string,
  barcode: string
): Promise<{
  productId: string;
  storeProductId: string;
  name: string;
  brand?: string;
  barcode?: string;
  sellPrice?: number | null;
  currentStock: number;
} | null> {
  const row = await queryOne<{
    store_product_id: string;
    product_id: string;
    name: string;
    brand: string | null;
    primary_barcode: string | null;
    sell_price: number | null;
    current_stock: number;
  }>(
    `SELECT
      sp.id as store_product_id,
      sp.product_id,
      p.name,
      p.brand,
      p.primary_barcode,
      sp.sell_price,
      sp.current_stock
    FROM catalog.store_products sp
    JOIN catalog.products p ON p.id = sp.product_id
    WHERE sp.store_id = $1
      AND sp.is_active = true
      AND p.is_active = true
      AND (
        p.primary_barcode = $2
        OR EXISTS (
          SELECT 1 FROM catalog.product_barcodes pb
          WHERE pb.product_id = p.id AND pb.barcode = $2
        )
      )
    LIMIT 1`,
    [storeId, barcode]
  );

  if (!row) return null;

  return {
    productId: row.product_id,
    storeProductId: row.store_product_id,
    name: row.name,
    brand: row.brand ?? undefined,
    barcode: row.primary_barcode ?? undefined,
    sellPrice: row.sell_price,
    currentStock: row.current_stock,
  };
}
