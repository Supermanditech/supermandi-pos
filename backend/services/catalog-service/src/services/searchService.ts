// Search Service - V3.0.9 compliant
// Provides product search with trigram similarity and caching

import { ApiError, ERROR_CODES, createLogger } from '@supermandi/common';

const logger = createLogger({ service: 'catalog-service', level: process.env.LOG_LEVEL || 'info' });
import { config } from '../config';
import {
  searchProducts,
  searchSupplierProducts,
  getProductById,
  getProductByBarcode,
  getSupplierProductById,
} from '../db/queries';
import type { Product, SupplierProduct } from '../db/queries';
import {
  cacheGetOrSet,
  cacheDelete,
  searchCacheKey,
  productCacheKey,
} from '../cache/redis';

// =============================================================================
// TYPES
// =============================================================================

export interface SearchProductsInput {
  query: string;
  limit?: number;
  offset?: number;
  category?: string;
}

export interface SearchProductsResult {
  products: Product[];
  total: number;
  limit: number;
  offset: number;
  query: string;
}

export interface SearchSupplierProductsInput {
  supplierId: string;
  query: string;
  limit?: number;
  offset?: number;
}

export interface SearchSupplierProductsResult {
  products: SupplierProduct[];
  total: number;
  limit: number;
  offset: number;
  query: string;
}

// =============================================================================
// PRODUCT SEARCH
// =============================================================================

/**
 * Search master catalog products using trigram similarity
 * Results are cached for performance
 */
export async function searchProductsService(
  input: SearchProductsInput
): Promise<SearchProductsResult> {
  const {
    query,
    limit = config.search.defaultLimit,
    offset = 0,
    category,
  } = input;

  // Validate query
  if (!query || query.trim().length < 2) {
    throw new ApiError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      'Search query must be at least 2 characters'
    );
  }

  // Validate limit
  const effectiveLimit = Math.min(limit, config.search.maxLimit);

  // Generate cache key
  const cacheKey = searchCacheKey('global', query, { limit: effectiveLimit, offset, category });

  // Use cache-aside pattern
  const result = await cacheGetOrSet(
    'search',
    cacheKey,
    async () => {
      return searchProducts(query.trim(), {
        limit: effectiveLimit,
        offset,
        category,
        activeOnly: true,
      });
    },
    config.cache.searchTtl
  );

  return {
    products: result.products,
    total: result.total,
    limit: effectiveLimit,
    offset,
    query: query.trim(),
  };
}

/**
 * Get product by ID with caching
 */
export async function getProductByIdService(productId: string): Promise<Product> {
  if (!productId) {
    throw new ApiError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      'productId is required'
    );
  }

  const product = await cacheGetOrSet(
    'product',
    productCacheKey(productId),
    () => getProductById(productId),
    config.cache.catalogTtl
  );

  if (!product) {
    throw new ApiError(
      404,
      ERROR_CODES.NOT_FOUND,
      `Product not found: ${productId}`
    );
  }

  return product;
}

/**
 * Get product by barcode with caching
 */
export async function getProductByBarcodeService(barcode: string): Promise<Product> {
  if (!barcode) {
    throw new ApiError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      'barcode is required'
    );
  }

  const product = await cacheGetOrSet(
    'barcode',
    barcode,
    () => getProductByBarcode(barcode),
    config.cache.catalogTtl
  );

  if (!product) {
    throw new ApiError(
      404,
      ERROR_CODES.NOT_FOUND,
      `Product not found for barcode: ${barcode}`
    );
  }

  return product;
}

// =============================================================================
// SUPPLIER PRODUCT SEARCH
// =============================================================================

/**
 * Search supplier products using trigram similarity
 * Results are cached per supplier
 */
export async function searchSupplierProductsService(
  input: SearchSupplierProductsInput
): Promise<SearchSupplierProductsResult> {
  const {
    supplierId,
    query,
    limit = config.search.defaultLimit,
    offset = 0,
  } = input;

  // Validate inputs
  if (!supplierId) {
    throw new ApiError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      'supplierId is required'
    );
  }

  if (!query || query.trim().length < 2) {
    throw new ApiError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      'Search query must be at least 2 characters'
    );
  }

  const effectiveLimit = Math.min(limit, config.search.maxLimit);

  // Generate cache key
  const cacheKey = searchCacheKey(supplierId, query, { limit: effectiveLimit, offset });

  // Use cache-aside pattern
  const result = await cacheGetOrSet(
    'supplier-search',
    cacheKey,
    async () => {
      return searchSupplierProducts(supplierId, query.trim(), {
        limit: effectiveLimit,
        offset,
        activeOnly: true,
      });
    },
    config.cache.searchTtl
  );

  return {
    products: result.products,
    total: result.total,
    limit: effectiveLimit,
    offset,
    query: query.trim(),
  };
}

/**
 * Get supplier product by ID with caching
 */
export async function getSupplierProductByIdService(
  supplierProductId: string
): Promise<SupplierProduct> {
  if (!supplierProductId) {
    throw new ApiError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      'supplierProductId is required'
    );
  }

  const product = await cacheGetOrSet(
    'supplier-product',
    supplierProductId,
    () => getSupplierProductById(supplierProductId),
    config.cache.catalogTtl
  );

  if (!product) {
    throw new ApiError(
      404,
      ERROR_CODES.NOT_FOUND,
      `Supplier product not found: ${supplierProductId}`
    );
  }

  return product;
}

// =============================================================================
// CACHE INVALIDATION
// =============================================================================

/**
 * Invalidate product cache
 */
export async function invalidateProductCache(productId: string): Promise<void> {
  await cacheDelete('product', productCacheKey(productId));
}

/**
 * STG-516: Invalidate search cache on product add/price change.
 * Uses cacheDeletePattern to clear all search keys for a store,
 * or all search keys globally when no storeId is provided.
 */
export async function invalidateSearchCache(storeId?: string): Promise<void> {
  const pattern = storeId ? `${storeId}:*` : '*';
  await cacheDeletePattern('search', pattern);
  logger.info(`Search cache invalidated`, { storeId: storeId ?? 'all' });
}
