// T-184: Redis client for API Gateway token blacklist
// Used for immediate token revocation on logout

import Redis from 'ioredis';
import { createLogger } from '@supermandi/common';

const logger = createLogger({ service: 'api-gateway', level: process.env.LOG_LEVEL || 'info' });

let redisClient: Redis | null = null;

// =============================================================================
// T-184: TOKEN BLACKLIST PREFIX
// Key format: token_blacklist:{jti_or_hash}
// Value: "1" (presence is enough)
// TTL: remaining token lifetime
// =============================================================================
const BLACKLIST_PREFIX = 'supermandi:token_blacklist:';

/**
 * Get or create the Redis client for the API gateway.
 * Returns null if Redis is disabled or unavailable (fail-open).
 */
export function getGatewayRedis(): Redis | null {
  if (redisClient) return redisClient;

  // Allow disabling Redis (gateway falls back to accepting all non-expired tokens)
  if (process.env.REDIS_ENABLED === 'false') {
    return null;
  }

  // LIVE.CONFIG.REDIS_FAIL_FAST_GLOBAL.001: Fail-fast if REDIS_HOST not set in non-dev
  const host = process.env.REDIS_HOST || (() => {
    if (process.env.NODE_ENV !== 'development') {
      logger.error('[Gateway Redis] FATAL: REDIS_HOST must be set in non-development environments');
      return undefined; // Will cause connection to fail fast
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
      maxRetriesPerRequest: 1, // Fast fail for gateway — don't block requests
      enableReadyCheck: true,
      lazyConnect: false,
      retryStrategy: (times: number) => {
        if (times > 5) return null; // Stop retrying after 5 attempts
        return Math.min(times * 200, 5000);
      },
    });

    redisClient.on('error', (err) => {
      logger.error('[Gateway Redis] Connection error', undefined, { message: err.message });
    });

    redisClient.on('connect', () => {
      logger.info('[Gateway Redis] Connected');
    });

    return redisClient;
  } catch (error) {
    logger.error('[Gateway Redis] Failed to initialize', error instanceof Error ? error : undefined, { raw: error });
    return null;
  }
}

/**
 * T-184: Check if a token (by JTI or hash) is blacklisted in Redis.
 * Returns true if the token has been revoked.
 * Fails open (returns false) if Redis is unavailable.
 */
export async function isTokenBlacklisted(jtiOrHash: string): Promise<boolean> {
  try {
    const client = getGatewayRedis();
    if (!client) return false; // Fail open — Redis unavailable

    const result = await client.get(BLACKLIST_PREFIX + jtiOrHash);
    return result !== null;
  } catch (error) {
    logger.error('[Gateway Redis] Blacklist check error', error instanceof Error ? error : undefined, { raw: error });
    return false; // Fail open
  }
}

/**
 * T-184: Add a token to the Redis blacklist.
 * Called during logout to immediately revoke the token.
 *
 * @param jtiOrHash - The JWT's jti claim or a hash of the token
 * @param ttlSeconds - TTL matching the token's remaining lifetime
 */
export async function blacklistToken(jtiOrHash: string, ttlSeconds: number): Promise<void> {
  try {
    const client = getGatewayRedis();
    if (!client) return; // Silently skip if Redis unavailable

    // Store with TTL so blacklist entries auto-expire when the token would have expired
    const effectiveTtl = Math.max(1, Math.ceil(ttlSeconds));
    await client.setex(BLACKLIST_PREFIX + jtiOrHash, effectiveTtl, '1');

    logger.info(`[T-184] Token blacklisted: ${jtiOrHash.substring(0, 8)}..., TTL: ${effectiveTtl}s`);
  } catch (error) {
    logger.error('[Gateway Redis] Blacklist write error', error instanceof Error ? error : undefined, { raw: error });
    // Non-fatal — token will still be checked against DB on next request
  }
}
