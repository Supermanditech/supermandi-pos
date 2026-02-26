// Redis Cache Module - V3.0.9 compliant
// Provides caching with configurable TTL

import Redis from 'ioredis';
import { createLogger } from '@supermandi/common';
import { config } from '../config';

const logger = createLogger({ service: 'catalog-service', level: process.env.LOG_LEVEL || 'info' });

// =============================================================================
// REDIS CLIENT
// =============================================================================

let redisClient: Redis | null = null;

/**
 * Get or create the Redis client
 */
export function getRedisClient(): Redis {
  if (redisClient) {
    return redisClient;
  }

  redisClient = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password || undefined,
    db: config.redis.db,
    retryStrategy: (times) => {
      // Exponential backoff with max 30 seconds
      const delay = Math.min(times * 100, 30000);
      logger.info(`Redis retry attempt ${times}, waiting ${delay}ms`);
      return delay;
    },
    maxRetriesPerRequest: 3,
  });

  redisClient.on('error', (err) => {
    logger.error('Redis connection error:', undefined, { message: err.message });
  });

  redisClient.on('connect', () => {
    logger.info('Redis connected');
  });

  return redisClient;
}

/**
 * Close the Redis connection
 */
export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}

/**
 * Check Redis health
 */
export async function redisHealthCheck(): Promise<boolean> {
  try {
    const client = getRedisClient();
    const pong = await client.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}

// =============================================================================
// CACHE OPERATIONS
// =============================================================================

/**
 * Cache key prefix
 */
const CACHE_PREFIX = 'catalog:';

/**
 * Build a cache key
 */
function buildKey(namespace: string, key: string): string {
  return `${CACHE_PREFIX}${namespace}:${key}`;
}

/**
 * Get a value from cache
 */
export async function cacheGet<T>(namespace: string, key: string): Promise<T | null> {
  try {
    const client = getRedisClient();
    const cacheKey = buildKey(namespace, key);
    const value = await client.get(cacheKey);

    if (!value) {
      return null;
    }

    return JSON.parse(value) as T;
  } catch (error) {
    logger.error(`Cache get error for ${namespace}:${key}:`, error instanceof Error ? error : undefined);
    return null;
  }
}

/**
 * Set a value in cache with TTL
 */
export async function cacheSet<T>(
  namespace: string,
  key: string,
  value: T,
  ttlSeconds: number = config.cache.defaultTtl
): Promise<void> {
  try {
    const client = getRedisClient();
    const cacheKey = buildKey(namespace, key);
    await client.setex(cacheKey, ttlSeconds, JSON.stringify(value));
  } catch (error) {
    logger.error(`Cache set error for ${namespace}:${key}:`, error instanceof Error ? error : undefined);
    // Don't throw - cache failures shouldn't break the app
  }
}

/**
 * Delete a value from cache
 */
export async function cacheDelete(namespace: string, key: string): Promise<void> {
  try {
    const client = getRedisClient();
    const cacheKey = buildKey(namespace, key);
    await client.del(cacheKey);
  } catch (error) {
    logger.error(`Cache delete error for ${namespace}:${key}:`, error instanceof Error ? error : undefined);
  }
}

/**
 * Delete all keys matching a pattern
 */
export async function cacheDeletePattern(namespace: string, pattern: string): Promise<void> {
  try {
    const client = getRedisClient();
    const searchPattern = buildKey(namespace, pattern);
    const keys = await client.keys(searchPattern);

    if (keys.length > 0) {
      await client.del(...keys);
    }
  } catch (error) {
    logger.error(`Cache delete pattern error for ${namespace}:${pattern}:`, error instanceof Error ? error : undefined);
  }
}

/**
 * Get or set a cached value (cache-aside pattern)
 */
export async function cacheGetOrSet<T>(
  namespace: string,
  key: string,
  fetchFn: () => Promise<T>,
  ttlSeconds: number = config.cache.defaultTtl
): Promise<T> {
  // Try to get from cache first
  const cached = await cacheGet<T>(namespace, key);
  if (cached !== null) {
    return cached;
  }

  // Fetch fresh data
  const value = await fetchFn();

  // Store in cache (fire and forget)
  // FIX-014: Log cache write failures instead of silently swallowing
  cacheSet(namespace, key, value, ttlSeconds).catch((err) => {
    logger.warn(`[cache] Failed to set ${namespace}:${key}:`, { message: (err as Error)?.message || String(err) });
  });

  return value;
}

// =============================================================================
// CACHE KEY GENERATORS
// =============================================================================

/**
 * Generate cache key for product search results
 */
export function searchCacheKey(storeId: string, query: string, options: {
  limit?: number;
  offset?: number;
  category?: string;
  supplierId?: string;
}): string {
  const parts = [
    storeId,
    query.toLowerCase().trim(),
    options.limit ?? config.search.defaultLimit,
    options.offset ?? 0,
    options.category ?? '',
    options.supplierId ?? '',
  ];
  return parts.join(':');
}

/**
 * Generate cache key for product by ID
 */
export function productCacheKey(productId: string): string {
  return productId;
}

/**
 * Generate cache key for store catalog
 */
export function catalogCacheKey(storeId: string, page: number, limit: number): string {
  return `${storeId}:${page}:${limit}`;
}
