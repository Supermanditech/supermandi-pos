// Catalog Service - V3.0.9 compliant
// Unified catalog API: Only returns products mapped via supplier_product_map
// and from suppliers linked to the store

import { ApiError, ERROR_CODES, query, queryOne } from '@supermandi/common';
import { config } from '../config';
import { cacheGetOrSet, catalogCacheKey } from '../cache/redis';
import {
  mapCatalogProduct,
  mapCatalogProducts,
  mapSupplierRows,
  mapSupplierRowsByProduct,
  type CatalogProduct,
  type CatalogProductRow,
  type GetCatalogInput,
  type GetCatalogResult,
  type SupplierDetailRow,
} from './catalogServiceSupport';

export type {
  CatalogProduct,
  CatalogSupplierInfo,
  GetCatalogInput,
  GetCatalogResult,
} from './catalogServiceSupport';

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
  // SM-003: CRITICAL visibility filter - only verified suppliers + approved products
  const whereClauses: string[] = [
    'ssl.store_id = $1',
    'ssl.status = $2',
    'p.is_active = true',
    'sp.is_active = true',
    "s.verification_status = 'verified'",      // SM-003: Only verified suppliers
    "sp.approval_status = 'approved'",          // SM-003: Only approved products
  ];
  const params: unknown[] = [storeId, 'active'];
  let paramIndex = 3;

  if (search && search.trim().length >= 2) {
    // GO-LIVE-TR-006: Hindi + English search parity for BUY catalog
    whereClauses.push(`(
      similarity(p.name, $${paramIndex}) > 0.3
      OR similarity(COALESCE(p.brand, ''), $${paramIndex}) > 0.3
      OR p.name ILIKE $${paramIndex + 1}
      OR p.brand ILIKE $${paramIndex + 1}
      OR p.primary_barcode = $${paramIndex + 2}
      OR EXISTS (
        SELECT 1 FROM catalog.product_translations pt
        WHERE pt.product_id = p.id AND pt.locale = 'hi'
        AND (
          similarity(pt.name, $${paramIndex}) > 0.3
          OR pt.name ILIKE $${paramIndex + 1}
          OR similarity(COALESCE(pt.brand, ''), $${paramIndex}) > 0.3
        )
      )
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
  // SM-003: Join with suppliers table for verification_status filter
  const countSql = `
    SELECT COUNT(DISTINCT p.id) as count
    FROM catalog.products p
    JOIN catalog.supplier_product_map spm ON spm.product_id = p.id
    JOIN catalog.supplier_products sp ON sp.id = spm.supplier_product_id
    JOIN supplier.suppliers s ON s.id = sp.supplier_id
    JOIN supplier.supplier_store_links ssl ON ssl.supplier_id = sp.supplier_id
    WHERE ${whereClause}
  `;
  const countRow = await queryOne<{ count: string }>(countSql, params);
  const total = parseInt(countRow?.count ?? '0', 10);

  if (total === 0) {
    return { products: [], total: 0 };
  }

  // Main query - get products with aggregated supplier info
  // SM-003: Join with suppliers for verification_status filter
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
      p.image_url,
      p.thumbnail_url,
      p.manufacturer_name,
      p.country_of_origin,
      p.shelf_life_days,
      p.net_content_value,
      p.net_content_unit,
      MIN(sp.purchase_price) as best_price,
      MIN(sp.moq) as min_moq,
      COUNT(DISTINCT sp.supplier_id)::text as supplier_count,
      SUM(sp.stock_quantity)::text as total_stock
    FROM catalog.products p
    JOIN catalog.supplier_product_map spm ON spm.product_id = p.id
    JOIN catalog.supplier_products sp ON sp.id = spm.supplier_product_id
    JOIN supplier.suppliers s ON s.id = sp.supplier_id
    JOIN supplier.supplier_store_links ssl ON ssl.supplier_id = sp.supplier_id
    WHERE ${whereClause}
    GROUP BY p.id, p.name, p.description, p.brand, p.category, p.unit,
             p.pack_size, p.primary_barcode, p.hsn_code, p.default_gst_rate, p.is_active,
             p.image_url, p.thumbnail_url, p.manufacturer_name, p.country_of_origin, p.shelf_life_days,
             p.net_content_value, p.net_content_unit
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
  // SM-003: Include margin, BNPL fields, and visibility filters
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
      COALESCE(ssl.is_preferred, false) as is_preferred,
      COALESCE(sp.supermandi_margin_minor, 0) as supermandi_margin_minor,
      COALESCE(sp.bnpl_eligible, false) as bnpl_eligible,
      sp.bnpl_max_days
    FROM catalog.products p
    JOIN catalog.supplier_product_map spm ON spm.product_id = p.id
    JOIN catalog.supplier_products sp ON sp.id = spm.supplier_product_id
    JOIN supplier.suppliers s ON s.id = sp.supplier_id
    JOIN supplier.supplier_store_links ssl ON ssl.supplier_id = sp.supplier_id
    WHERE ssl.store_id = $1
      AND ssl.status = 'active'
      AND p.id = ANY($2::uuid[])
      AND s.verification_status = 'verified'
      AND sp.approval_status = 'approved'
    ORDER BY sp.purchase_price ASC
  `;

  const supplierRows = await query<SupplierDetailRow>(
    supplierDetailsSql,
    [storeId, productIds]
  );

  // Group suppliers and map consolidated product response using shared mappers.
  const suppliersByProduct = mapSupplierRowsByProduct(supplierRows);
  const products = mapCatalogProducts(productRows, suppliersByProduct);

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
  // SM-003: Add visibility filter for verified suppliers + approved products
  const checkSql = `
    SELECT COUNT(*) as count
    FROM catalog.products p
    JOIN catalog.supplier_product_map spm ON spm.product_id = p.id
    JOIN catalog.supplier_products sp ON sp.id = spm.supplier_product_id
    JOIN supplier.suppliers s ON s.id = sp.supplier_id
    JOIN supplier.supplier_store_links ssl ON ssl.supplier_id = sp.supplier_id
    WHERE ssl.store_id = $1
      AND ssl.status = 'active'
      AND p.id = $2
      AND p.is_active = true
      AND s.verification_status = 'verified'
      AND sp.approval_status = 'approved'
  `;
  const checkRow = await queryOne<{ count: string }>(checkSql, [storeId, productId]);

  if (parseInt(checkRow?.count ?? '0', 10) === 0) {
    throw new ApiError(
      404,
      ERROR_CODES.NOT_FOUND,
      `Product ${productId} not found in store catalog`
    );
  }

  // Filter to the specific product
  // SM-003: Add visibility filter for verified suppliers + approved products
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
      p.image_url,
      p.thumbnail_url,
      p.manufacturer_name,
      p.country_of_origin,
      p.shelf_life_days,
      p.net_content_value,
      p.net_content_unit,
      MIN(sp.purchase_price) as best_price,
      MIN(sp.moq) as min_moq,
      COUNT(DISTINCT sp.supplier_id)::text as supplier_count,
      SUM(sp.stock_quantity)::text as total_stock
    FROM catalog.products p
    JOIN catalog.supplier_product_map spm ON spm.product_id = p.id
    JOIN catalog.supplier_products sp ON sp.id = spm.supplier_product_id
    JOIN supplier.suppliers s ON s.id = sp.supplier_id
    JOIN supplier.supplier_store_links ssl ON ssl.supplier_id = sp.supplier_id
    WHERE ssl.store_id = $1
      AND ssl.status = 'active'
      AND p.id = $2
      AND p.is_active = true
      AND sp.is_active = true
      AND s.verification_status = 'verified'
      AND sp.approval_status = 'approved'
    GROUP BY p.id, p.name, p.description, p.brand, p.category, p.unit,
             p.pack_size, p.primary_barcode, p.hsn_code, p.default_gst_rate, p.is_active,
             p.image_url, p.thumbnail_url, p.manufacturer_name, p.country_of_origin, p.shelf_life_days,
             p.net_content_value, p.net_content_unit
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
  // SM-003: Add visibility filter and margin/BNPL fields
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
      COALESCE(ssl.is_preferred, false) as is_preferred,
      COALESCE(sp.supermandi_margin_minor, 0) as supermandi_margin_minor,
      COALESCE(sp.bnpl_eligible, false) as bnpl_eligible,
      sp.bnpl_max_days
    FROM catalog.products p
    JOIN catalog.supplier_product_map spm ON spm.product_id = p.id
    JOIN catalog.supplier_products sp ON sp.id = spm.supplier_product_id
    JOIN supplier.suppliers s ON s.id = sp.supplier_id
    JOIN supplier.supplier_store_links ssl ON ssl.supplier_id = sp.supplier_id
    WHERE ssl.store_id = $1
      AND ssl.status = 'active'
      AND p.id = $2
      AND s.verification_status = 'verified'
      AND sp.approval_status = 'approved'
    ORDER BY sp.purchase_price ASC
  `;

  const supplierRows = await query<SupplierDetailRow>(
    supplierDetailsSql,
    [storeId, productId]
  );

  const suppliers = mapSupplierRows(supplierRows);
  return mapCatalogProduct(productRow, suppliers);
}
