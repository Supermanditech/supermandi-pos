// Catalog Service - V3.0.9 compliant
// Unified catalog API: Only returns products mapped via supplier_product_map
// and from suppliers linked to the store

import { ApiError, ERROR_CODES, query, queryOne } from '@supermandi/common';
import { config } from '../config.js';
import { cacheGetOrSet, catalogCacheKey } from '../cache/redis.js';

// =============================================================================
// TYPES
// =============================================================================

export interface CatalogProduct {
  id: string;
  name: string;
  description?: string;
  brand?: string;
  category?: string;
  unit?: string;
  packSize?: number;
  primaryBarcode?: string;
  hsnCode?: string;
  defaultGstRate?: number;
  isActive: boolean;
  // Aggregated from suppliers
  bestPrice: number;
  minMoq: number;
  supplierCount: number;
  stockStatus: 'in_stock' | 'low_stock' | 'out_of_stock';
  suppliers: CatalogSupplierInfo[];
}

export interface CatalogSupplierInfo {
  supplierId: string;
  supplierName: string;
  supplierProductId: string;
  purchasePrice: number;
  mrp?: number;
  moq: number;
  maxQty?: number;
  stockQuantity: number;
  stockStatus: string;
  isPreferred: boolean;
}

export interface GetCatalogInput {
  storeId: string;
  search?: string;
  category?: string;
  inStockOnly?: boolean;
  page?: number;
  limit?: number;
}

export interface GetCatalogResult {
  products: CatalogProduct[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

// Database row types
interface CatalogProductRow {
  product_id: string;
  product_name: string;
  description: string | null;
  brand: string | null;
  category: string | null;
  unit: string | null;
  pack_size: number | null;
  primary_barcode: string | null;
  hsn_code: string | null;
  default_gst_rate: string | null;
  is_active: boolean;
  best_price: string;
  min_moq: number;
  supplier_count: string;
  total_stock: string;
}

interface SupplierDetailRow {
  product_id: string;
  supplier_id: string;
  supplier_name: string;
  supplier_product_id: string;
  purchase_price: string;
  mrp: string | null;
  moq: number;
  max_qty: number | null;
  stock_quantity: number;
  stock_status: string;
  is_preferred: boolean;
}

// =============================================================================
// UNIFIED CATALOG QUERY
// =============================================================================

/**
 * Get the unified catalog for a store.
 * CRITICAL: Only returns products that are:
 * 1. Mapped via supplier_product_map
 * 2. From suppliers linked to the store (supplier_store_links.status = 'active')
 */
export async function getStoreCatalog(
  input: GetCatalogInput
): Promise<GetCatalogResult> {
  const {
    storeId,
    search,
    category,
    inStockOnly = false,
    page = 1,
    limit = config.search.defaultLimit,
  } = input;

  // Validate inputs
  if (!storeId) {
    throw new ApiError(400, ERROR_CODES.VALIDATION_ERROR, 'storeId is required');
  }

  const effectiveLimit = Math.min(limit, config.search.maxLimit);
  const offset = (page - 1) * effectiveLimit;

  // Generate cache key
  const cacheKey = `store:${storeId}:${search || ''}:${category || ''}:${inStockOnly}:${page}:${effectiveLimit}`;

  // Use cache-aside pattern
  const result = await cacheGetOrSet(
    'catalog',
    cacheKey,
    async () => fetchStoreCatalog(storeId, {
      search,
      category,
      inStockOnly,
      limit: effectiveLimit,
      offset,
    }),
    config.cache.catalogTtl
  );

  return {
    products: result.products,
    total: result.total,
    page,
    limit: effectiveLimit,
    hasMore: offset + result.products.length < result.total,
  };
}

/**
 * Fetch catalog data from database
 */
async function fetchStoreCatalog(
  storeId: string,
  options: {
    search?: string;
    category?: string;
    inStockOnly?: boolean;
    limit: number;
    offset: number;
  }
): Promise<{ products: CatalogProduct[]; total: number }> {
  const { search, category, inStockOnly, limit, offset } = options;

  // Build WHERE clauses
  const whereClauses: string[] = [
    'ssl.store_id = $1',
    'ssl.status = $2',
    'p.is_active = true',
    'sp.is_active = true',
  ];
  const params: unknown[] = [storeId, 'active'];
  let paramIndex = 3;

  if (search && search.trim().length >= 2) {
    whereClauses.push(`(
      similarity(p.name, $${paramIndex}) > 0.3
      OR similarity(COALESCE(p.brand, ''), $${paramIndex}) > 0.3
      OR p.name ILIKE $${paramIndex + 1}
      OR p.brand ILIKE $${paramIndex + 1}
      OR p.primary_barcode = $${paramIndex + 2}
    )`);
    params.push(search, `%${search}%`, search);
    paramIndex += 3;
  }

  if (category) {
    whereClauses.push(`p.category = $${paramIndex++}`);
    params.push(category);
  }

  if (inStockOnly) {
    whereClauses.push(`sp.stock_status != 'out_of_stock'`);
  }

  const whereClause = whereClauses.join(' AND ');

  // Count query - count distinct products
  const countSql = `
    SELECT COUNT(DISTINCT p.id) as count
    FROM catalog.products p
    JOIN catalog.supplier_product_map spm ON spm.product_id = p.id
    JOIN catalog.supplier_products sp ON sp.id = spm.supplier_product_id
    JOIN supplier.supplier_store_links ssl ON ssl.supplier_id = sp.supplier_id
    WHERE ${whereClause}
  `;
  const countRow = await queryOne<{ count: string }>(countSql, params);
  const total = parseInt(countRow?.count ?? '0', 10);

  if (total === 0) {
    return { products: [], total: 0 };
  }

  // Main query - get products with aggregated supplier info
  const mainSql = `
    SELECT
      p.id as product_id,
      p.name as product_name,
      p.description,
      p.brand,
      p.category,
      p.unit,
      p.pack_size,
      p.primary_barcode,
      p.hsn_code,
      p.default_gst_rate,
      p.is_active,
      MIN(sp.purchase_price) as best_price,
      MIN(sp.moq) as min_moq,
      COUNT(DISTINCT sp.supplier_id)::text as supplier_count,
      SUM(sp.stock_quantity)::text as total_stock
    FROM catalog.products p
    JOIN catalog.supplier_product_map spm ON spm.product_id = p.id
    JOIN catalog.supplier_products sp ON sp.id = spm.supplier_product_id
    JOIN supplier.supplier_store_links ssl ON ssl.supplier_id = sp.supplier_id
    WHERE ${whereClause}
    GROUP BY p.id, p.name, p.description, p.brand, p.category, p.unit,
             p.pack_size, p.primary_barcode, p.hsn_code, p.default_gst_rate, p.is_active
    ORDER BY p.name ASC
    LIMIT $${paramIndex++} OFFSET $${paramIndex}
  `;

  const productRows = await query<CatalogProductRow>(
    mainSql,
    [...params, limit, offset]
  );

  if (productRows.length === 0) {
    return { products: [], total };
  }

  // Get supplier details for these products
  const productIds = productRows.map((r) => r.product_id);
  const supplierDetailsSql = `
    SELECT
      p.id as product_id,
      sp.supplier_id,
      s.business_name as supplier_name,
      sp.id as supplier_product_id,
      sp.purchase_price::text,
      sp.mrp::text,
      sp.moq,
      sp.max_qty,
      sp.stock_quantity,
      sp.stock_status,
      COALESCE(ssl.is_preferred, false) as is_preferred
    FROM catalog.products p
    JOIN catalog.supplier_product_map spm ON spm.product_id = p.id
    JOIN catalog.supplier_products sp ON sp.id = spm.supplier_product_id
    JOIN supplier.suppliers s ON s.id = sp.supplier_id
    JOIN supplier.supplier_store_links ssl ON ssl.supplier_id = sp.supplier_id
    WHERE ssl.store_id = $1
      AND ssl.status = 'active'
      AND p.id = ANY($2::uuid[])
    ORDER BY sp.purchase_price ASC
  `;

  const supplierRows = await query<SupplierDetailRow>(
    supplierDetailsSql,
    [storeId, productIds]
  );

  // Group supplier details by product
  const suppliersByProduct = new Map<string, CatalogSupplierInfo[]>();
  for (const row of supplierRows) {
    const suppliers = suppliersByProduct.get(row.product_id) || [];
    suppliers.push({
      supplierId: row.supplier_id,
      supplierName: row.supplier_name,
      supplierProductId: row.supplier_product_id,
      purchasePrice: parseFloat(row.purchase_price),
      mrp: row.mrp ? parseFloat(row.mrp) : undefined,
      moq: row.moq,
      maxQty: row.max_qty ?? undefined,
      stockQuantity: row.stock_quantity,
      stockStatus: row.stock_status,
      isPreferred: row.is_preferred,
    });
    suppliersByProduct.set(row.product_id, suppliers);
  }

  // Map to CatalogProduct
  const products: CatalogProduct[] = productRows.map((row) => {
    const suppliers = suppliersByProduct.get(row.product_id) || [];
    const totalStock = parseInt(row.total_stock || '0', 10);

    // Determine overall stock status
    let stockStatus: CatalogProduct['stockStatus'] = 'out_of_stock';
    if (totalStock > 100) {
      stockStatus = 'in_stock';
    } else if (totalStock > 0) {
      stockStatus = 'low_stock';
    }

    return {
      id: row.product_id,
      name: row.product_name,
      description: row.description ?? undefined,
      brand: row.brand ?? undefined,
      category: row.category ?? undefined,
      unit: row.unit ?? undefined,
      packSize: row.pack_size ?? undefined,
      primaryBarcode: row.primary_barcode ?? undefined,
      hsnCode: row.hsn_code ?? undefined,
      defaultGstRate: row.default_gst_rate
        ? parseFloat(row.default_gst_rate)
        : undefined,
      isActive: row.is_active,
      bestPrice: parseFloat(row.best_price),
      minMoq: row.min_moq,
      supplierCount: parseInt(row.supplier_count, 10),
      stockStatus,
      suppliers,
    };
  });

  return { products, total };
}

/**
 * Get a single product from the store catalog by ID
 */
export async function getStoreCatalogProduct(
  storeId: string,
  productId: string
): Promise<CatalogProduct> {
  if (!storeId) {
    throw new ApiError(400, ERROR_CODES.VALIDATION_ERROR, 'storeId is required');
  }
  if (!productId) {
    throw new ApiError(400, ERROR_CODES.VALIDATION_ERROR, 'productId is required');
  }

  // Check if product is in store's catalog (mapped and linked)
  const checkSql = `
    SELECT COUNT(*) as count
    FROM catalog.products p
    JOIN catalog.supplier_product_map spm ON spm.product_id = p.id
    JOIN catalog.supplier_products sp ON sp.id = spm.supplier_product_id
    JOIN supplier.supplier_store_links ssl ON ssl.supplier_id = sp.supplier_id
    WHERE ssl.store_id = $1
      AND ssl.status = 'active'
      AND p.id = $2
      AND p.is_active = true
  `;
  const checkRow = await queryOne<{ count: string }>(checkSql, [storeId, productId]);

  if (parseInt(checkRow?.count ?? '0', 10) === 0) {
    throw new ApiError(
      404,
      ERROR_CODES.NOT_FOUND,
      `Product ${productId} not found in store catalog`
    );
  }

  // Fetch the product with supplier details
  const result = await fetchStoreCatalog(storeId, {
    limit: 1,
    offset: 0,
  });

  // Filter to the specific product
  const sql = `
    SELECT
      p.id as product_id,
      p.name as product_name,
      p.description,
      p.brand,
      p.category,
      p.unit,
      p.pack_size,
      p.primary_barcode,
      p.hsn_code,
      p.default_gst_rate,
      p.is_active,
      MIN(sp.purchase_price) as best_price,
      MIN(sp.moq) as min_moq,
      COUNT(DISTINCT sp.supplier_id)::text as supplier_count,
      SUM(sp.stock_quantity)::text as total_stock
    FROM catalog.products p
    JOIN catalog.supplier_product_map spm ON spm.product_id = p.id
    JOIN catalog.supplier_products sp ON sp.id = spm.supplier_product_id
    JOIN supplier.supplier_store_links ssl ON ssl.supplier_id = sp.supplier_id
    WHERE ssl.store_id = $1
      AND ssl.status = 'active'
      AND p.id = $2
      AND p.is_active = true
      AND sp.is_active = true
    GROUP BY p.id, p.name, p.description, p.brand, p.category, p.unit,
             p.pack_size, p.primary_barcode, p.hsn_code, p.default_gst_rate, p.is_active
  `;

  const productRow = await queryOne<CatalogProductRow>(sql, [storeId, productId]);

  if (!productRow) {
    throw new ApiError(
      404,
      ERROR_CODES.NOT_FOUND,
      `Product ${productId} not found in store catalog`
    );
  }

  // Get supplier details
  const supplierDetailsSql = `
    SELECT
      p.id as product_id,
      sp.supplier_id,
      s.business_name as supplier_name,
      sp.id as supplier_product_id,
      sp.purchase_price::text,
      sp.mrp::text,
      sp.moq,
      sp.max_qty,
      sp.stock_quantity,
      sp.stock_status,
      COALESCE(ssl.is_preferred, false) as is_preferred
    FROM catalog.products p
    JOIN catalog.supplier_product_map spm ON spm.product_id = p.id
    JOIN catalog.supplier_products sp ON sp.id = spm.supplier_product_id
    JOIN supplier.suppliers s ON s.id = sp.supplier_id
    JOIN supplier.supplier_store_links ssl ON ssl.supplier_id = sp.supplier_id
    WHERE ssl.store_id = $1
      AND ssl.status = 'active'
      AND p.id = $2
    ORDER BY sp.purchase_price ASC
  `;

  const supplierRows = await query<SupplierDetailRow>(
    supplierDetailsSql,
    [storeId, productId]
  );

  const suppliers: CatalogSupplierInfo[] = supplierRows.map((row) => ({
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    supplierProductId: row.supplier_product_id,
    purchasePrice: parseFloat(row.purchase_price),
    mrp: row.mrp ? parseFloat(row.mrp) : undefined,
    moq: row.moq,
    maxQty: row.max_qty ?? undefined,
    stockQuantity: row.stock_quantity,
    stockStatus: row.stock_status,
    isPreferred: row.is_preferred,
  }));

  const totalStock = parseInt(productRow.total_stock || '0', 10);
  let stockStatus: CatalogProduct['stockStatus'] = 'out_of_stock';
  if (totalStock > 100) {
    stockStatus = 'in_stock';
  } else if (totalStock > 0) {
    stockStatus = 'low_stock';
  }

  return {
    id: productRow.product_id,
    name: productRow.product_name,
    description: productRow.description ?? undefined,
    brand: productRow.brand ?? undefined,
    category: productRow.category ?? undefined,
    unit: productRow.unit ?? undefined,
    packSize: productRow.pack_size ?? undefined,
    primaryBarcode: productRow.primary_barcode ?? undefined,
    hsnCode: productRow.hsn_code ?? undefined,
    defaultGstRate: productRow.default_gst_rate
      ? parseFloat(productRow.default_gst_rate)
      : undefined,
    isActive: productRow.is_active,
    bestPrice: parseFloat(productRow.best_price),
    minMoq: productRow.min_moq,
    supplierCount: parseInt(productRow.supplier_count, 10),
    stockStatus,
    suppliers,
  };
}
