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
