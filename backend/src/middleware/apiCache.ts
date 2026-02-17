// GO-LIVE-098: API Response Caching Middleware
// Uses Redis for caching with configurable TTLs from admin.cache_config

import { Request, Response, NextFunction, RequestHandler } from 'express';
import { getRedis, cacheGet, cacheSet } from '../db/redis';
import { getPool } from '../db/client';
import { log } from "../lib/logger";

// In-memory cache for TTL config (to avoid DB queries on every request)
const ttlConfigCache: Map<string, { ttl: number; enabled: boolean; lastFetch: number }> = new Map();
const TTL_CONFIG_CACHE_DURATION = 60000; // Refresh config every 60 seconds

// Default cache configurations (used if DB unavailable)
const DEFAULT_CACHE_CONFIG: Record<string, { ttl: number; enabled: boolean }> = {
  'catalog:products': { ttl: 300, enabled: true },
  'analytics:overview': { ttl: 60, enabled: true },
  'store:settings': { ttl: 600, enabled: true },
  'supplier:catalog': { ttl: 300, enabled: true },
};

/**
 * GO-LIVE-098: Fetch cache TTL from database or use defaults
 */
async function getCacheTtl(cacheKey: string): Promise<{ ttl: number; enabled: boolean }> {
  // Check in-memory cache first
  const cached = ttlConfigCache.get(cacheKey);
  if (cached && Date.now() - cached.lastFetch < TTL_CONFIG_CACHE_DURATION) {
    return { ttl: cached.ttl, enabled: cached.enabled };
  }

  // Try to fetch from database
  try {
    const pool = getPool();
    if (pool) {
      const result = await pool.query(
        `SELECT ttl_seconds, enabled FROM admin.cache_config WHERE cache_key = $1`,
        [cacheKey]
      );

      if (result.rows[0]) {
        const config = {
          ttl: result.rows[0].ttl_seconds,
          enabled: result.rows[0].enabled,
          lastFetch: Date.now(),
        };
        ttlConfigCache.set(cacheKey, config);
        return { ttl: config.ttl, enabled: config.enabled };
      }
    }
  } catch (error) {
    log.error(`[ApiCache] Failed to fetch TTL config for ${cacheKey}:`, error);
  }

  // Fall back to defaults
  const defaultConfig = DEFAULT_CACHE_CONFIG[cacheKey] || { ttl: 300, enabled: true };
  ttlConfigCache.set(cacheKey, { ...defaultConfig, lastFetch: Date.now() });
  return defaultConfig;
}

/**
 * GO-LIVE-098: Generate cache key from request
 */
function generateCacheKey(req: Request, prefix: string): string {
  // Include query params in cache key for filtered requests
  const queryString = Object.keys(req.query).length > 0
    ? ':' + Object.entries(req.query)
        .filter(([_, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${v}`)
        .join('&')
    : '';

  // Include store_id if present for store-specific caching
  const storeId = (req.query.storeId || req.query.store_id || '') as string;
  const storePrefix = storeId ? `:store:${storeId}` : '';

  return `api:${prefix}${storePrefix}${queryString}`;
}

interface CachedResponse {
  statusCode: number;
  data: unknown;
  cachedAt: number;
}

/**
 * GO-LIVE-098: API Response Caching Middleware Factory
 *
 * @param cacheKeyPrefix - Prefix for cache key (e.g., 'catalog:products')
 * @param options - Additional caching options
 */
export function apiCache(
  cacheKeyPrefix: string,
  options: {
    // Override TTL (uses DB config if not specified)
    ttlSeconds?: number;
    // Only cache successful responses (2xx)
    onlySuccessful?: boolean;
    // Skip cache based on request
    skipIf?: (req: Request) => boolean;
    // Custom cache key generator
    keyGenerator?: (req: Request) => string;
  } = {}
): RequestHandler {
  const {
    ttlSeconds,
    onlySuccessful = true,
    skipIf,
    keyGenerator,
  } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    // Skip caching for non-GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Check if Redis is available
    const redis = getRedis();
    if (!redis) {
      return next();
    }

    // Check custom skip condition
    if (skipIf && skipIf(req)) {
      return next();
    }

    // Generate cache key
    const cacheKey = keyGenerator
      ? keyGenerator(req)
      : generateCacheKey(req, cacheKeyPrefix);

    // Check cache configuration
    const config = await getCacheTtl(cacheKeyPrefix);
    if (!config.enabled) {
      return next();
    }

    const finalTtl = ttlSeconds ?? config.ttl;

    try {
      // Try to get from cache
      const cached = await cacheGet<CachedResponse>(cacheKey);

      if (cached) {
        // Add cache headers
        res.set('X-Cache', 'HIT');
        res.set('X-Cache-Age', String(Math.floor((Date.now() - cached.cachedAt) / 1000)));
        res.set('Cache-Control', `private, max-age=${finalTtl}`);

        return res.status(cached.statusCode).json(cached.data);
      }

      // Cache miss - intercept response
      res.set('X-Cache', 'MISS');

      // Store original json method
      const originalJson = res.json.bind(res);

      // Override json method to cache the response
      res.json = (body: unknown): Response => {
        // Only cache successful responses if configured
        if (onlySuccessful && res.statusCode >= 400) {
          return originalJson(body);
        }

        // Cache the response asynchronously
        const cachedResponse: CachedResponse = {
          statusCode: res.statusCode,
          data: body,
          cachedAt: Date.now(),
        };

        cacheSet(cacheKey, cachedResponse, finalTtl).catch((err) => {
          log.error(`[ApiCache] Failed to cache ${cacheKey}:`, err);
        });

        return originalJson(body);
      };

      next();
    } catch (error) {
      log.error(`[ApiCache] Error for ${cacheKey}:`, error);
      // On error, proceed without caching
      next();
    }
  };
}

/**
 * GO-LIVE-098: Invalidate cache for a specific prefix
 */
export async function invalidateCache(pattern: string): Promise<number> {
  try {
    const redis = getRedis();
    if (!redis) return 0;

    const keys = await redis.keys(`supermandi:api:${pattern}*`);
    if (keys.length === 0) return 0;

    const deleted = await redis.del(...keys);
    log.info(`[ApiCache] Invalidated ${deleted} keys matching ${pattern}`);
    return deleted;
  } catch (error) {
    log.error(`[ApiCache] Failed to invalidate ${pattern}:`, error);
    return 0;
  }
}

/**
 * GO-LIVE-098: Clear the in-memory TTL config cache
 * Useful when cache configurations are updated
 */
export function clearTtlConfigCache(): void {
  ttlConfigCache.clear();
  log.info('[ApiCache] TTL config cache cleared');
}
