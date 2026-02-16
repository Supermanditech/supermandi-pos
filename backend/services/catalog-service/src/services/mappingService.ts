// Mapping Service - V3.0.9 compliant
// Product mapping: manual mapping, auto-mapping, unmatched queue

import { ApiError, ERROR_CODES, query, queryOne, getClient } from '@supermandi/common';
import type { SupplierProductMap } from '@supermandi/common';
import type { PoolClient } from 'pg';

// =============================================================================
// TYPES
// =============================================================================

export interface UnmatchedProduct {
  supplierProductId: string;
  supplierId: string;
  supplierName: string;
  barcode?: string;
  name: string;
  category?: string;
  brand?: string;
  purchasePrice: number;
  stockStatus: string;
  createdAt: Date;
  // Suggested matches (if any)
  suggestedMatches: SuggestedMatch[];
}

export interface SuggestedMatch {
  productId: string;
  name: string;
  brand?: string;
  primaryBarcode?: string;
  similarity: number;
  matchReason: 'barcode' | 'name_similarity' | 'brand_name';
}

export interface GetUnmatchedInput {
  storeId: string;
  supplierId?: string;
  limit?: number;
  offset?: number;
}

export interface GetUnmatchedResult {
  products: UnmatchedProduct[];
  total: number;
  limit: number;
  offset: number;
}

export interface CreateMappingInput {
  storeId: string;
  supplierProductId: string;
  productId: string;
  userId?: string;
  isAutoMap?: boolean;
  confidence?: number;
}

export interface CreateMappingResult {
  mapping: SupplierProductMap;
  logId: string;
}

export interface DeleteMappingInput {
  storeId: string;
  mapId: string;
  userId?: string;
  reason?: string;
}

export interface AutoMapResult {
  mapped: number;
  skipped: number;
  details: Array<{
    supplierProductId: string;
    productId: string;
    barcode: string;
  }>;
}

// Database row types
interface UnmatchedRow {
  supplier_product_id: string;
  supplier_id: string;
  supplier_name: string;
  barcode: string | null;
  name: string;
  category: string | null;
  brand: string | null;
  purchase_price: string;
  stock_status: string;
  created_at: Date;
}

interface SuggestedMatchRow {
  product_id: string;
  name: string;
  brand: string | null;
  primary_barcode: string | null;
  similarity: string;
  match_reason: string;
}

interface MappingRow {
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

// =============================================================================
// UNMATCHED PRODUCTS
// =============================================================================

/**
 * Get unmatched supplier products for a store.
 * These are products from linked suppliers that don't have a mapping in supplier_product_map.
 */
export async function getUnmatchedProducts(
  input: GetUnmatchedInput
): Promise<GetUnmatchedResult> {
  const { storeId, supplierId, limit = 50, offset = 0 } = input;

  if (!storeId) {
    throw new ApiError(400, ERROR_CODES.VALIDATION_ERROR, 'storeId is required');
  }

  // Build WHERE clauses
  const whereClauses: string[] = [
    'ssl.store_id = $1',
    'ssl.status = $2',
    'sp.is_active = true',
    'spm.id IS NULL', // Not mapped
  ];
  const params: unknown[] = [storeId, 'active'];
  let paramIndex = 3;

  if (supplierId) {
    whereClauses.push(`sp.supplier_id = $${paramIndex++}`);
    params.push(supplierId);
  }

  const whereClause = whereClauses.join(' AND ');

  // Count query
  const countSql = `
    SELECT COUNT(*) as count
    FROM catalog.supplier_products sp
    JOIN supplier.supplier_store_links ssl ON ssl.supplier_id = sp.supplier_id
    LEFT JOIN catalog.supplier_product_map spm ON spm.supplier_product_id = sp.id
    WHERE ${whereClause}
  `;
  const countRow = await queryOne<{ count: string }>(countSql, params);
  const total = parseInt(countRow?.count ?? '0', 10);

  if (total === 0) {
    return { products: [], total: 0, limit, offset };
  }

  // Main query
  const mainSql = `
    SELECT
      sp.id as supplier_product_id,
      sp.supplier_id,
      s.business_name as supplier_name,
      sp.barcode,
      sp.name,
      sp.category,
      sp.brand,
      sp.purchase_price::text,
      sp.stock_status,
      sp.created_at
    FROM catalog.supplier_products sp
    JOIN supplier.suppliers s ON s.id = sp.supplier_id
    JOIN supplier.supplier_store_links ssl ON ssl.supplier_id = sp.supplier_id
    LEFT JOIN catalog.supplier_product_map spm ON spm.supplier_product_id = sp.id
    WHERE ${whereClause}
    ORDER BY sp.created_at DESC
    LIMIT $${paramIndex++} OFFSET $${paramIndex}
  `;

  const rows = await query<UnmatchedRow>(mainSql, [...params, limit, offset]);

  // Get suggested matches for each unmatched product
  const products: UnmatchedProduct[] = await Promise.all(
    rows.map(async (row) => {
      const suggestedMatches = await getSuggestedMatches(
        row.name,
        row.barcode,
        row.brand
      );

      return {
        supplierProductId: row.supplier_product_id,
        supplierId: row.supplier_id,
        supplierName: row.supplier_name,
        barcode: row.barcode ?? undefined,
        name: row.name,
        category: row.category ?? undefined,
        brand: row.brand ?? undefined,
        purchasePrice: parseFloat(row.purchase_price),
        stockStatus: row.stock_status,
        createdAt: row.created_at,
        suggestedMatches,
      };
    })
  );

  return { products, total, limit, offset };
}

/**
 * Get suggested product matches based on barcode and name similarity
 */
async function getSuggestedMatches(
  name: string,
  barcode: string | null,
  brand: string | null
): Promise<SuggestedMatch[]> {
  const matches: SuggestedMatch[] = [];

  // First check for exact barcode match (highest confidence)
  if (barcode) {
    const barcodeMatch = await queryOne<{
      id: string;
      name: string;
      brand: string | null;
      primary_barcode: string | null;
    }>(
      `SELECT p.id, p.name, p.brand, p.primary_barcode
       FROM catalog.products p
       JOIN catalog.product_barcodes pb ON pb.product_id = p.id
       WHERE pb.barcode = $1 AND p.is_active = true
       LIMIT 1`,
      [barcode]
    );

    if (barcodeMatch) {
      matches.push({
        productId: barcodeMatch.id,
        name: barcodeMatch.name,
        brand: barcodeMatch.brand ?? undefined,
        primaryBarcode: barcodeMatch.primary_barcode ?? undefined,
        similarity: 1.0,
        matchReason: 'barcode',
      });
      // If we have exact barcode match, it's the definitive answer
      return matches;
    }
  }

  // Find name similarity matches
  const similarityMatches = await query<SuggestedMatchRow>(
    `SELECT
      p.id as product_id,
      p.name,
      p.brand,
      p.primary_barcode,
      GREATEST(
        similarity(p.name, $1),
        similarity(COALESCE(p.brand, '') || ' ' || p.name, $1)
      )::text as similarity,
      CASE
        WHEN similarity(p.name, $1) > 0.5 THEN 'name_similarity'
        ELSE 'brand_name'
      END as match_reason
    FROM catalog.products p
    WHERE p.is_active = true
      AND (
        similarity(p.name, $1) > 0.4
        OR similarity(COALESCE(p.brand, '') || ' ' || p.name, $1) > 0.4
      )
    ORDER BY similarity DESC
    LIMIT 5`,
    [name]
  );

  for (const row of similarityMatches) {
    matches.push({
      productId: row.product_id,
      name: row.name,
      brand: row.brand ?? undefined,
      primaryBarcode: row.primary_barcode ?? undefined,
      similarity: parseFloat(row.similarity),
      matchReason: row.match_reason as 'name_similarity' | 'brand_name',
    });
  }

  return matches;
}

// =============================================================================
// MANUAL MAPPING
// =============================================================================

/**
 * Create a manual product mapping
 */
export async function createMapping(
  input: CreateMappingInput
): Promise<CreateMappingResult> {
  const {
    storeId,
    supplierProductId,
    productId,
    userId,
    isAutoMap = false,
    confidence = isAutoMap ? 1.0 : undefined,
  } = input;

  if (!storeId) {
    throw new ApiError(400, ERROR_CODES.VALIDATION_ERROR, 'storeId is required');
  }
  if (!supplierProductId) {
    throw new ApiError(400, ERROR_CODES.VALIDATION_ERROR, 'supplierProductId is required');
  }
  if (!productId) {
    throw new ApiError(400, ERROR_CODES.VALIDATION_ERROR, 'productId is required');
  }

  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Verify supplier product exists and is from a linked supplier
    const supplierProduct = await client.query<{
      id: string;
      supplier_id: string;
    }>(
      `SELECT sp.id, sp.supplier_id
       FROM catalog.supplier_products sp
       JOIN supplier.supplier_store_links ssl ON ssl.supplier_id = sp.supplier_id
       WHERE sp.id = $1 AND ssl.store_id = $2 AND ssl.status = 'active'`,
      [supplierProductId, storeId]
    );

    if (supplierProduct.rows.length === 0) {
      throw new ApiError(
        404,
        ERROR_CODES.NOT_FOUND,
        'Supplier product not found or supplier not linked to store'
      );
    }

    const supplierId = supplierProduct.rows[0]!.supplier_id;

    // Verify target product exists
    const targetProduct = await client.query<{ id: string }>(
      `SELECT id FROM catalog.products WHERE id = $1 AND is_active = true`,
      [productId]
    );

    if (targetProduct.rows.length === 0) {
      throw new ApiError(404, ERROR_CODES.NOT_FOUND, 'Target product not found');
    }

    // Check if mapping already exists
    const existingMapping = await client.query<{ id: string }>(
      `SELECT id FROM catalog.supplier_product_map
       WHERE supplier_product_id = $1`,
      [supplierProductId]
    );

    if (existingMapping.rows.length > 0) {
      throw new ApiError(
        409,
        ERROR_CODES.CONFLICT,
        'Mapping already exists for this supplier product'
      );
    }

    // Create the mapping
    const mappingType = isAutoMap ? 'auto' : 'manual';
    const mappingResult = await client.query<MappingRow>(
      `INSERT INTO catalog.supplier_product_map (
        supplier_product_id, product_id, mapping_type, confidence,
        mapped_by_user_id, mapped_at, is_verified
      ) VALUES ($1, $2, $3, $4, $5, NOW(), $6)
      RETURNING *`,
      [
        supplierProductId,
        productId,
        mappingType,
        confidence,
        userId,
        !isAutoMap, // Manual mappings are verified by default
      ]
    );

    const mappingRow = mappingResult.rows[0]!;

    // Log the mapping action
    const action = isAutoMap ? 'auto_map' : 'manual_map';
    const logResult = await client.query<{ id: string }>(
      `INSERT INTO catalog.catalog_mapping_log (
        store_id, supplier_id, supplier_product_id, product_id,
        action, confidence, actor_user_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id`,
      [storeId, supplierId, supplierProductId, productId, action, confidence, userId]
    );

    await client.query('COMMIT');

    const mapping: SupplierProductMap = {
      id: mappingRow.id,
      supplierProductId: mappingRow.supplier_product_id,
      productId: mappingRow.product_id,
      mappingType: mappingRow.mapping_type as 'auto' | 'manual',
      confidence: mappingRow.confidence ? parseFloat(mappingRow.confidence) : undefined,
      mappedByUserId: mappingRow.mapped_by_user_id ?? undefined,
      mappedAt: mappingRow.mapped_at,
      isVerified: mappingRow.is_verified,
      createdAt: mappingRow.created_at,
      updatedAt: mappingRow.updated_at,
    };

    return {
      mapping,
      logId: logResult.rows[0]!.id,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Delete a product mapping (unmap)
 */
export async function deleteMapping(input: DeleteMappingInput): Promise<void> {
  const { storeId, mapId, userId, reason } = input;

  if (!storeId) {
    throw new ApiError(400, ERROR_CODES.VALIDATION_ERROR, 'storeId is required');
  }
  if (!mapId) {
    throw new ApiError(400, ERROR_CODES.VALIDATION_ERROR, 'mapId is required');
  }

  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Get the mapping details and verify it belongs to a linked supplier
    const mappingResult = await client.query<{
      id: string;
      supplier_product_id: string;
      product_id: string;
      supplier_id: string;
    }>(
      `SELECT spm.id, spm.supplier_product_id, spm.product_id, sp.supplier_id
       FROM catalog.supplier_product_map spm
       JOIN catalog.supplier_products sp ON sp.id = spm.supplier_product_id
       JOIN supplier.supplier_store_links ssl ON ssl.supplier_id = sp.supplier_id
       WHERE spm.id = $1 AND ssl.store_id = $2 AND ssl.status = 'active'`,
      [mapId, storeId]
    );

    if (mappingResult.rows.length === 0) {
      throw new ApiError(
        404,
        ERROR_CODES.NOT_FOUND,
        'Mapping not found or supplier not linked to store'
      );
    }

    const mapping = mappingResult.rows[0]!;

    // Log the unmap action before deleting
    await client.query(
      `INSERT INTO catalog.catalog_mapping_log (
        store_id, supplier_id, supplier_product_id, product_id,
        action, actor_user_id
      ) VALUES ($1, $2, $3, $4, 'unmap', $5)`,
      [storeId, mapping.supplier_id, mapping.supplier_product_id, mapping.product_id, userId]
    );

    // FIX-006: Delete with store ownership verification (defense-in-depth)
    // The SELECT above already validated ownership, but the DELETE also checks via JOIN
    await client.query(
      `DELETE FROM catalog.supplier_product_map spm
       USING catalog.supplier_products sp
       JOIN supplier.supplier_store_links ssl ON ssl.supplier_id = sp.supplier_id
       WHERE spm.id = $1
         AND spm.supplier_product_id = sp.id
         AND ssl.store_id = $2
         AND ssl.status = 'active'`,
      [mapId, storeId]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// =============================================================================
// AUTO-MAPPING
// =============================================================================

/**
 * Auto-map supplier products by barcode match.
 * This is typically called when new supplier products are added.
 */
export async function autoMapByBarcode(
  storeId: string,
  supplierId?: string
): Promise<AutoMapResult> {
  if (!storeId) {
    throw new ApiError(400, ERROR_CODES.VALIDATION_ERROR, 'storeId is required');
  }

  const client = await getClient();
  const result: AutoMapResult = { mapped: 0, skipped: 0, details: [] };

  try {
    await client.query('BEGIN');

    // Build WHERE clause
    const whereClauses: string[] = [
      'ssl.store_id = $1',
      'ssl.status = $2',
      'sp.is_active = true',
      'sp.barcode IS NOT NULL',
      'spm.id IS NULL', // Not already mapped
    ];
    const params: unknown[] = [storeId, 'active'];
    let paramIndex = 3;

    if (supplierId) {
      whereClauses.push(`sp.supplier_id = $${paramIndex++}`);
      params.push(supplierId);
    }

    const whereClause = whereClauses.join(' AND ');

    // Find unmapped supplier products with barcodes that match master products
    const matchesSql = `
      SELECT
        sp.id as supplier_product_id,
        sp.supplier_id,
        sp.barcode,
        p.id as product_id
      FROM catalog.supplier_products sp
      JOIN supplier.supplier_store_links ssl ON ssl.supplier_id = sp.supplier_id
      LEFT JOIN catalog.supplier_product_map spm ON spm.supplier_product_id = sp.id
      JOIN catalog.product_barcodes pb ON pb.barcode = sp.barcode
      JOIN catalog.products p ON p.id = pb.product_id AND p.is_active = true
      WHERE ${whereClause}
    `;

    const matches = await client.query<{
      supplier_product_id: string;
      supplier_id: string;
      barcode: string;
      product_id: string;
    }>(matchesSql, params);

    for (const match of matches.rows) {
      try {
        // Create the mapping
        await client.query(
          `INSERT INTO catalog.supplier_product_map (
            supplier_product_id, product_id, mapping_type, confidence,
            mapped_at, is_verified
          ) VALUES ($1, $2, 'auto', 1.0, NOW(), false)
          ON CONFLICT (supplier_product_id) DO NOTHING`,
          [match.supplier_product_id, match.product_id]
        );

        // Log the action
        await client.query(
          `INSERT INTO catalog.catalog_mapping_log (
            store_id, supplier_id, supplier_product_id, product_id,
            action, confidence
          ) VALUES ($1, $2, $3, $4, 'auto_map', 1.0)`,
          [storeId, match.supplier_id, match.supplier_product_id, match.product_id]
        );

        result.mapped++;
        result.details.push({
          supplierProductId: match.supplier_product_id,
          productId: match.product_id,
          barcode: match.barcode,
        });
      } catch {
        // Skip if there's a conflict or error
        result.skipped++;
      }
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return result;
}

/**
 * Get mapping by ID
 */
export async function getMappingById(
  mapId: string
): Promise<SupplierProductMap | null> {
  const row = await queryOne<MappingRow>(
    `SELECT * FROM catalog.supplier_product_map WHERE id = $1`,
    [mapId]
  );

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    supplierProductId: row.supplier_product_id,
    productId: row.product_id,
    mappingType: row.mapping_type as 'auto' | 'manual',
    confidence: row.confidence ? parseFloat(row.confidence) : undefined,
    mappedByUserId: row.mapped_by_user_id ?? undefined,
    mappedAt: row.mapped_at,
    isVerified: row.is_verified,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Verify a mapping (mark auto-mapped products as verified after review)
 */
export async function verifyMapping(
  mapId: string,
  userId?: string,
  storeId?: string
): Promise<SupplierProductMap> {
  if (!mapId) {
    throw new ApiError(400, ERROR_CODES.VALIDATION_ERROR, 'mapId is required');
  }

  // FIX-005: store_id isolation — verify ownership through supplier_store_links chain
  const result = await query<MappingRow>(
    `UPDATE catalog.supplier_product_map spm
     SET is_verified = true, mapped_by_user_id = COALESCE($2, spm.mapped_by_user_id), updated_at = NOW()
     FROM catalog.supplier_products sp
     JOIN supplier.supplier_store_links ssl ON ssl.supplier_id = sp.supplier_id
     WHERE spm.id = $1
       AND spm.supplier_product_id = sp.id
       AND ($3::uuid IS NULL OR (ssl.store_id = $3 AND ssl.status = 'active'))
     RETURNING spm.*`,
    [mapId, userId, storeId || null]
  );

  if (result.length === 0) {
    throw new ApiError(404, ERROR_CODES.NOT_FOUND, 'Mapping not found or not accessible by this store');
  }

  const row = result[0]!;

  return {
    id: row.id,
    supplierProductId: row.supplier_product_id,
    productId: row.product_id,
    mappingType: row.mapping_type as 'auto' | 'manual',
    confidence: row.confidence ? parseFloat(row.confidence) : undefined,
    mappedByUserId: row.mapped_by_user_id ?? undefined,
    mappedAt: row.mapped_at,
    isVerified: row.is_verified,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
