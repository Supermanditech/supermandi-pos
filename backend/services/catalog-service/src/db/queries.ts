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
