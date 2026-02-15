// GO-LIVE-077: Redis client with HA (Sentinel) support
// This module provides a centralized Redis client for the main backend

import Redis, { RedisOptions } from 'ioredis';

let redisClient: Redis | null = null;

// =============================================================================
// CONFIGURATION
// =============================================================================

interface RedisConfig {
  // Standard Redis configuration
  host: string;
  port: number;
  password: string | undefined;
  db: number;

  // HA/Sentinel configuration
  sentinelEnabled: boolean;
  sentinels: Array<{ host: string; port: number }>;
  sentinelName: string;

  // Connection options
  connectTimeout: number;
  maxRetriesPerRequest: number;
  enableReadyCheck: boolean;
  lazyConnect: boolean;
}

function getRedisConfig(): RedisConfig {
  const sentinelHosts = process.env.REDIS_SENTINELS || '';
  const sentinels = sentinelHosts
    .split(',')
    .filter(Boolean)
    .map((hostPort) => {
      const [host, port] = hostPort.split(':');
      return { host: host.trim(), port: parseInt(port?.trim() || '26379', 10) };
    });

  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),

    sentinelEnabled: process.env.REDIS_SENTINEL_ENABLED === 'true',
    sentinels,
    sentinelName: process.env.REDIS_SENTINEL_NAME || 'mymaster',

    connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT || '10000', 10),
    maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES || '3', 10),
    enableReadyCheck: true,
    lazyConnect: false,
  };
}

// =============================================================================
// REDIS CLIENT
// =============================================================================

/**
 * Get or create the Redis client with HA support
 */
export function getRedis(): Redis | null {
  if (redisClient) {
    return redisClient;
  }

  // Check if Redis is enabled
  if (process.env.REDIS_ENABLED === 'false') {
    console.log('[Redis] Disabled via REDIS_ENABLED=false');
    return null;
  }

  const config = getRedisConfig();

  try {
    let options: RedisOptions;

    if (config.sentinelEnabled && config.sentinels.length > 0) {
      // GO-LIVE-077: Sentinel mode for HA
      console.log(`[Redis] Connecting via Sentinel (master: ${config.sentinelName})`);
      options = {
        sentinels: config.sentinels,
        name: config.sentinelName,
        password: config.password,
        db: config.db,
        connectTimeout: config.connectTimeout,
        maxRetriesPerRequest: config.maxRetriesPerRequest,
        enableReadyCheck: config.enableReadyCheck,
        lazyConnect: config.lazyConnect,
        retryStrategy: retryStrategy,
        sentinelRetryStrategy: retryStrategy,
      };
    } else {
      // Standard single-instance mode
      console.log(`[Redis] Connecting to ${config.host}:${config.port}`);
      options = {
        host: config.host,
        port: config.port,
        password: config.password,
        db: config.db,
        connectTimeout: config.connectTimeout,
        maxRetriesPerRequest: config.maxRetriesPerRequest,
        enableReadyCheck: config.enableReadyCheck,
        lazyConnect: config.lazyConnect,
        retryStrategy: retryStrategy,
      };
    }

    redisClient = new Redis(options);

    // Event handlers
    redisClient.on('error', (err) => {
      console.error('[Redis] Connection error:', err.message);
    });

    redisClient.on('connect', () => {
      console.log('[Redis] Connected successfully');
    });

    redisClient.on('ready', () => {
      console.log('[Redis] Ready to accept commands');
    });

    redisClient.on('close', () => {
      console.log('[Redis] Connection closed');
    });

    redisClient.on('reconnecting', (delay: number) => {
      console.log(`[Redis] Reconnecting in ${delay}ms`);
    });

    // GO-LIVE-077: Sentinel-specific events
    if (config.sentinelEnabled) {
      redisClient.on('+switch-master', (msg) => {
        console.log('[Redis Sentinel] Master switched:', msg);
      });
    }

    return redisClient;
  } catch (error) {
    console.error('[Redis] Failed to initialize client:', error);
    return null;
  }
}

/**
 * Retry strategy with exponential backoff
 */
function retryStrategy(times: number): number | null {
  if (times > 10) {
    console.error('[Redis] Max retries exceeded, giving up');
    return null; // Stop retrying
  }

  // Exponential backoff: 100ms, 200ms, 400ms, ... up to 30 seconds
  const delay = Math.min(times * 100, 30000);
  console.log(`[Redis] Retry attempt ${times}, waiting ${delay}ms`);
  return delay;
}

/**
 * Close the Redis connection
 */
export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    console.log('[Redis] Connection closed');
  }
}

/**
 * Check Redis health
 */
export async function redisHealthCheck(): Promise<{
  healthy: boolean;
  latencyMs?: number;
  error?: string;
}> {
  try {
    const client = getRedis();
    if (!client) {
      return { healthy: false, error: 'Redis not enabled' };
    }

    const start = Date.now();
    const pong = await client.ping();
    const latencyMs = Date.now() - start;

    if (pong === 'PONG') {
      return { healthy: true, latencyMs };
    } else {
      return { healthy: false, error: `Unexpected response: ${pong}` };
    }
  } catch (error) {
    return { healthy: false, error: String(error) };
  }
}

// =============================================================================
// CACHE OPERATIONS (Centralized for main backend)
// =============================================================================

const CACHE_PREFIX = 'supermandi:';

/**
 * Get a value from cache
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const client = getRedis();
    if (!client) return null;

    const value = await client.get(CACHE_PREFIX + key);
    if (!value) return null;

    return JSON.parse(value) as T;
  } catch (error) {
    console.error(`[Redis Cache] Get error for ${key}:`, error);
    return null;
  }
}

/**
 * Set a value in cache with TTL
 */
export async function cacheSet<T>(
  key: string,
  value: T,
  ttlSeconds: number = 300
): Promise<void> {
  try {
    const client = getRedis();
    if (!client) return;

    await client.setex(CACHE_PREFIX + key, ttlSeconds, JSON.stringify(value));
  } catch (error) {
    console.error(`[Redis Cache] Set error for ${key}:`, error);
    // Don't throw - cache failures shouldn't break the app
  }
}

/**
 * Delete a value from cache
 */
export async function cacheDelete(key: string): Promise<void> {
  try {
    const client = getRedis();
    if (!client) return;

    await client.del(CACHE_PREFIX + key);
  } catch (error) {
    console.error(`[Redis Cache] Delete error for ${key}:`, error);
  }
}

/**
 * Get or set pattern (cache-aside)
 */
export async function cacheGetOrSet<T>(
  key: string,
  fetchFn: () => Promise<T>,
  ttlSeconds: number = 300
): Promise<T> {
  const cached = await cacheGet<T>(key);
  if (cached !== null) {
    return cached;
  }

  const value = await fetchFn();
  cacheSet(key, value, ttlSeconds).catch(() => {});
  return value;
}

// =============================================================================
// RATE LIMITING (Use Redis instead of in-memory)
// =============================================================================

/**
 * GO-LIVE-077: Rate limiting using Redis sliding window
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  try {
    const client = getRedis();
    if (!client) {
      // If Redis unavailable, allow the request (fail open)
      return { allowed: true, remaining: limit, resetAt: 0 };
    }

    const now = Date.now();
    const windowStart = now - (windowSeconds * 1000);
    const rateLimitKey = `ratelimit:${key}`;

    // Remove old entries
    await client.zremrangebyscore(rateLimitKey, 0, windowStart);

    // Count current entries
    const count = await client.zcard(rateLimitKey);

    if (count >= limit) {
      // Get oldest entry to calculate reset time
      const oldest = await client.zrange(rateLimitKey, 0, 0, 'WITHSCORES');
      const resetAt = oldest.length >= 2 ? parseInt(oldest[1], 10) + (windowSeconds * 1000) : now + (windowSeconds * 1000);

      return { allowed: false, remaining: 0, resetAt };
    }

    // Add new entry
    await client.zadd(rateLimitKey, now, `${now}`);
    await client.expire(rateLimitKey, windowSeconds + 1);

    return { allowed: true, remaining: limit - count - 1, resetAt: 0 };
  } catch (error) {
    console.error(`[Redis Rate Limit] Error for ${key}:`, error);
    // Fail open on error
    return { allowed: true, remaining: limit, resetAt: 0 };
  }
}

// =============================================================================
// SESSION STORAGE (Use Redis instead of in-memory)
// =============================================================================

const SESSION_PREFIX = 'session:';
const DEFAULT_SESSION_TTL = 3600; // 1 hour

/**
 * GO-LIVE-077: Store session in Redis
 */
export async function setSession<T>(
  sessionId: string,
  data: T,
  ttlSeconds: number = DEFAULT_SESSION_TTL
): Promise<void> {
  await cacheSet(SESSION_PREFIX + sessionId, data, ttlSeconds);
}

/**
 * GO-LIVE-077: Get session from Redis
 */
export async function getSession<T>(sessionId: string): Promise<T | null> {
  return cacheGet<T>(SESSION_PREFIX + sessionId);
}

/**
 * GO-LIVE-077: Delete session from Redis
 */
export async function deleteSession(sessionId: string): Promise<void> {
  await cacheDelete(SESSION_PREFIX + sessionId);
}

// =============================================================================
// T-184: TOKEN BLACKLIST (Shared with API Gateway)
// Key format must match api-gateway/src/redis.ts BLACKLIST_PREFIX
// =============================================================================

const BLACKLIST_PREFIX = 'token_blacklist:';

/**
 * T-184: Add a token to the Redis blacklist for immediate revocation.
 * The API gateway checks this blacklist on every request.
 *
 * @param jtiOrHash - The JWT's jti claim or a sha256 hash of the token
 * @param ttlSeconds - TTL matching the token's remaining lifetime
 */
export async function blacklistToken(jtiOrHash: string, ttlSeconds: number): Promise<void> {
  try {
    const client = getRedis();
    if (!client) return; // Silently skip if Redis unavailable

    const effectiveTtl = Math.max(1, Math.ceil(ttlSeconds));
    // Uses CACHE_PREFIX + BLACKLIST_PREFIX to match gateway key: supermandi:token_blacklist:{key}
    await client.setex(CACHE_PREFIX + BLACKLIST_PREFIX + jtiOrHash, effectiveTtl, '1');

    console.log(`[T-184] Token blacklisted via backend: ${jtiOrHash.substring(0, 8)}..., TTL: ${effectiveTtl}s`);
  } catch (error) {
    console.error('[T-184] Redis blacklist write error:', error);
    // Non-fatal — DB revocation table is the fallback
  }
}
