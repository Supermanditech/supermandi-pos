// SEC-006: Redis client for auth-service rate limiting
// Used for distributed login rate limiting across Cloud Run instances
// Falls back gracefully when Redis is unavailable

import Redis from 'ioredis';
import { createLogger } from '@supermandi/common';

const logger = createLogger({ service: 'auth-service', level: process.env.LOG_LEVEL || 'info' });

let redisClient: Redis | null = null;
let initAttempted = false;

/**
 * Get or create the Redis client for the auth service.
 * Returns null if Redis is disabled or unavailable (fail-open for rate limiting).
 */
// SEC-002: Access token blacklist key prefix
// MUST match api-gateway prefix (supermandi:token_blacklist:) for cross-service compatibility.
// Gateway checks this on every request via isTokenBlacklisted() (T-184).
const BLACKLIST_PREFIX = 'supermandi:token_blacklist:';

export function getRedis(): Redis | null {
  if (redisClient) return redisClient;
  if (initAttempted) return null; // Already failed once, don't retry every request

  initAttempted = true;

  if (process.env.REDIS_ENABLED === 'false') {
    return null;
  }

  const host = process.env.REDIS_HOST || (() => {
    if (process.env.NODE_ENV !== 'development') {
      logger.error('[Auth Redis] FATAL: REDIS_HOST must be set in non-development environments');
      return undefined;
    }
    return 'localhost';
  })();
  const port = parseInt(process.env.REDIS_PORT || '6379', 10);
  const password = process.env.REDIS_PASSWORD || undefined;
  const db = parseInt(process.env.REDIS_DB || '0', 10);

  try {
    redisClient = new Redis({
      host,
      port,
      password,
      db,
      connectTimeout: 5000,
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      lazyConnect: false,
      retryStrategy: (times: number) => {
        if (times > 5) return null;
        return Math.min(times * 200, 5000);
      },
    });

    redisClient.on('error', (err: Error) => {
      logger.error('[Auth Redis] Connection error', undefined, { message: err.message });
    });

    redisClient.on('connect', () => {
      logger.info('[Auth Redis] Connected');
    });

    return redisClient;
  } catch (error) {
    logger.error('[Auth Redis] Failed to initialize', error instanceof Error ? error : undefined, { raw: error });
    redisClient = null;
    return null;
  }
}

/**
 * SEC-002: Blacklist an access token by its JTI or hash.
 * The API gateway checks this key on every request (T-184 isTokenBlacklisted).
 * TTL should match remaining token lifetime (max 900s for 15-min tokens).
 *
 * Fails open (silently returns) if Redis is unavailable — token will expire
 * naturally within 15 minutes.
 */
export async function blacklistAccessToken(jtiOrHash: string, ttlSeconds: number): Promise<void> {
  const redis = getRedis();
  if (!redis) return; // Fail open if Redis unavailable
  try {
    const effectiveTtl = Math.max(1, Math.ceil(ttlSeconds));
    await redis.setex(BLACKLIST_PREFIX + jtiOrHash, effectiveTtl, '1');
    logger.info(`[SEC-002] Access token blacklisted: ${jtiOrHash.substring(0, 8)}..., TTL: ${effectiveTtl}s`);
  } catch (error) {
    // Non-fatal — token will expire naturally within 15 minutes
    logger.error('[SEC-002] Failed to blacklist access token', error instanceof Error ? error : undefined);
  }
}
