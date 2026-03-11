import type { NextFunction, Request, Response } from "express";
import { log } from "../lib/logger";
import { checkRateLimit } from "../db/redis";

// =============================================================================
// SA-P2-011: Redis-backed persistent rate limiting
// =============================================================================

export interface RedisRateLimitOptions {
  /** Time window in milliseconds */
  windowMs: number;
  /** Maximum requests per window */
  max: number;
  /** Custom key generator (defaults to req.ip) */
  keyGenerator?: (req: Request) => string;
  /** Skip counting failed requests (non-2xx responses) */
  skipFailedRequests?: boolean;
}

/**
 * SA-P2-011: Redis-backed rate limiter with in-memory fallback.
 *
 * Uses the existing `checkRateLimit()` from redis.ts (sorted-set sliding window).
 * If Redis is unavailable, falls back to in-memory tracking so requests are
 * never blocked due to Redis outages (fail-open).
 */
export function redisRateLimit(opts: RedisRateLimitOptions) {
  // In-memory fallback state (used only when Redis is down)
  const fallbackHits = new Map<string, number[]>();
  let lastCleanup = Date.now();
  const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
  const MAX_ENTRIES = 10000;

  function cleanupFallback(now: number): void {
    if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
    lastCleanup = now;
    const staleThreshold = now - opts.windowMs * 2;

    for (const [key, timestamps] of fallbackHits.entries()) {
      const latestTimestamp = Math.max(...timestamps, 0);
      if (latestTimestamp < staleThreshold) {
        fallbackHits.delete(key);
      }
    }

    if (fallbackHits.size > MAX_ENTRIES) {
      const entriesToRemove = fallbackHits.size - MAX_ENTRIES;
      const iterator = fallbackHits.keys();
      for (let i = 0; i < entriesToRemove; i++) {
        const key = iterator.next().value;
        if (key) fallbackHits.delete(key);
      }
    }
  }

  function inMemoryCheck(key: string, now: number): boolean {
    cleanupFallback(now);
    const arr = fallbackHits.get(key) ?? [];
    const filtered = arr.filter((t) => now - t < opts.windowMs);
    filtered.push(now);
    fallbackHits.set(key, filtered);
    return filtered.length > opts.max;
  }

  return (req: Request, res: Response, next: NextFunction) => {
    const keyGen = opts.keyGenerator || ((r: Request) => r.ip || "unknown");
    const key = keyGen(req);
    const windowSeconds = Math.ceil(opts.windowMs / 1000);

    // Attempt Redis-backed rate limit check
    checkRateLimit(key, opts.max, windowSeconds)
      .then((result) => {
        if (!result.allowed) {
          const retryAfterSeconds = result.resetAt
            ? Math.ceil((result.resetAt - Date.now()) / 1000)
            : windowSeconds;
          res.set("Retry-After", String(Math.max(1, retryAfterSeconds)));
          res.status(429).json({ error: "Rate limit exceeded" });
          return;
        }

        // Set standard rate limit headers
        res.set("X-RateLimit-Limit", String(opts.max));
        res.set("X-RateLimit-Remaining", String(result.remaining));

        next();
      })
      .catch((err) => {
        // Redis error — fall back to in-memory check
        log.warn("[redisRateLimit] Redis error, falling back to in-memory:", err?.message);
        const now = Date.now();
        if (inMemoryCheck(key, now)) {
          res.status(429).json({ error: "Rate limit exceeded" });
          return;
        }
        next();
      });
  };
}

// =============================================================================
// Legacy in-memory rate limiter (kept for backward compatibility)
// =============================================================================

/**
 * Simple in-memory rate limit (per PM2 process) to control costs.
 * GO-LIVE-191: Added periodic cleanup to prevent memory leaks.
 *
 * @deprecated Use `redisRateLimit()` for persistent, cross-instance rate limiting.
 */
export function rateLimitAi(opts: { windowMs: number; max: number }) {
  const hits = new Map<string, number[]>();
  let lastCleanup = Date.now();
  const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  const MAX_ENTRIES = 10000; // Maximum entries to prevent unbounded growth

  // GO-LIVE-191: Cleanup function to prevent memory leaks
  function cleanupStaleEntries(now: number): void {
    // Only run cleanup every CLEANUP_INTERVAL_MS
    if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;

    lastCleanup = now;
    const staleThreshold = now - opts.windowMs * 2; // Remove entries 2x older than window

    for (const [key, timestamps] of hits.entries()) {
      // Remove entries where all timestamps are stale
      const latestTimestamp = Math.max(...timestamps, 0);
      if (latestTimestamp < staleThreshold) {
        hits.delete(key);
      }
    }

    // GO-LIVE-191: If still over limit, remove oldest entries
    if (hits.size > MAX_ENTRIES) {
      const entriesToRemove = hits.size - MAX_ENTRIES;
      const iterator = hits.keys();
      for (let i = 0; i < entriesToRemove; i++) {
        const key = iterator.next().value;
        if (key) hits.delete(key);
      }
      log.info(`[rateLimitAi] GO-LIVE-191: Cache pruned, removed ${entriesToRemove} entries`);
    }
  }

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();

    // GO-LIVE-191: Run cleanup periodically
    cleanupStaleEntries(now);

    const key = req.ip || "unknown";
    const arr = hits.get(key) ?? [];
    const filtered = arr.filter((t) => now - t < opts.windowMs);
    filtered.push(now);
    hits.set(key, filtered);

    if (filtered.length > opts.max) {
      res.status(429).json({ error: "Rate limit exceeded" });
      return;
    }

    next();
  };
}
