// Rate Limiter Middleware - V3.0.10 compliant
// Protects API from abuse with configurable rate limits
// GL-CRIT-0027: Reduced default from 100 to 30/min, auth endpoints 5/min

import rateLimit, { type Store, type IncrementResponse, type Options } from 'express-rate-limit';
import { config } from '../config';
import { getGatewayRedis } from '../redis';

// LIVE.GW.RATE_LIMIT_REDIS_BACKED.001: Redis-backed rate limit store for distributed limiting
// Falls back to in-memory when Redis is unavailable (single-instance still works)
class RedisRateLimitStore implements Store {
  // Use _prefix/_windowMs to avoid structural conflict with Store.prefix?: string
  private _prefix: string;
  private _windowMs: number;
  private localStore = new Map<string, { totalHits: number; resetTime: Date }>();

  constructor(prefix: string, windowMs: number) {
    this._prefix = `rl:${prefix}:`;
    this._windowMs = windowMs;
  }

  async increment(key: string): Promise<IncrementResponse> {
    const redis = getGatewayRedis();
    if (redis) {
      try {
        const redisKey = this._prefix + key;
        const ttlSeconds = Math.ceil(this._windowMs / 1000);
        const hits = await redis.incr(redisKey);
        if (hits === 1) await redis.expire(redisKey, ttlSeconds);
        const ttl = await redis.ttl(redisKey);
        return { totalHits: hits, resetTime: new Date(Date.now() + ttl * 1000) };
      } catch { /* fall through to local */ }
    }
    // Fallback: in-memory
    const now = Date.now();
    const entry = this.localStore.get(key);
    if (entry && entry.resetTime.getTime() > now) {
      entry.totalHits++;
      return { totalHits: entry.totalHits, resetTime: entry.resetTime };
    }
    const resetTime = new Date(now + this._windowMs);
    this.localStore.set(key, { totalHits: 1, resetTime });
    return { totalHits: 1, resetTime };
  }

  async decrement(key: string): Promise<void> {
    const redis = getGatewayRedis();
    if (redis) {
      try { await redis.decr(this._prefix + key); return; } catch { /* fall through */ }
    }
    const entry = this.localStore.get(key);
    if (entry && entry.totalHits > 0) entry.totalHits--;
  }

  async resetKey(key: string): Promise<void> {
    const redis = getGatewayRedis();
    if (redis) {
      try { await redis.del(this._prefix + key); } catch { /* fall through */ }
    }
    this.localStore.delete(key);
  }

  // Required by interface but not all versions need it
  init(_options: Options): void { /* no-op */ }
}

function createStore(prefix: string, windowMs: number): RedisRateLimitStore {
  return new RedisRateLimitStore(prefix, windowMs);
}

// LIVE.GW.HEALTH_BYPASS_EXPLICIT_ALLOWLIST.001: Explicit health endpoint allowlist
const HEALTH_BYPASS_PATHS = new Set(['/healthz', '/health', '/readyz']);

/**
 * General rate limiter middleware
 * - Limits requests per IP per time window
 * - Returns 429 Too Many Requests when exceeded
 * - GL-CRIT-0027: Reduced to 30/min for public APIs
 */
export const rateLimiterMiddleware = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMax,
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false, // Disable X-RateLimit-* headers
  store: createStore('general', config.rateLimitWindowMs),

  // Custom response
  message: {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later',
    },
  },

  // LIVE.GW.HEALTH_BYPASS_EXPLICIT_ALLOWLIST.001: Use explicit allowlist for health bypasses
  // RET-AUD-019: Admin routes are authenticated and have separate adminRateLimiter
  skip: (req) => {
    return HEALTH_BYPASS_PATHS.has(req.path) ||
           req.path.startsWith('/api/v1/admin');
  },

  // Key generator (use IP + correlation ID for more granular limiting)
  keyGenerator: (req) => {
    return req.ip || 'unknown';
  },
});

/**
 * Strict rate limiter for auth endpoints
 * GL-CRIT-0027: 5 requests per minute for login/auth to prevent brute force
 */
export const authRateLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.authRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  store: createStore('auth', config.rateLimitWindowMs),

  message: {
    error: {
      code: 'AUTH_RATE_LIMIT_EXCEEDED',
      message: 'Too many authentication attempts, please try again later',
    },
  },

  keyGenerator: (req) => {
    return req.ip || 'unknown';
  },
});

/**
 * GO-LIVE-003 + STAGING-FIX-012: Rate limiter for admin panel API calls
 * STAGING-FIX-012: Increased from 5 to 60/min — the admin panel makes many API calls
 * per tab switch. Only failed requests count (skipSuccessfulRequests), but in a fresh
 * staging DB many endpoints fail due to missing tables, quickly hitting a low limit.
 */
export const adminRateLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs, // 1 minute
  max: config.adminPanelRateLimitMax, // 60 failed attempts per minute (STAGING-FIX-012)
  standardHeaders: true,
  legacyHeaders: false,
  store: createStore('admin', config.rateLimitWindowMs),

  message: {
    error: {
      code: 'ADMIN_RATE_LIMIT_EXCEEDED',
      message: 'Too many admin requests, please try again later',
    },
  },

  keyGenerator: (req) => {
    return req.ip || 'unknown';
  },

  // Only count failed admin requests
  skipSuccessfulRequests: true,
});

export default rateLimiterMiddleware;
