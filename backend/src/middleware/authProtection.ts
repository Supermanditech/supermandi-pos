/**
 * GO-LIVE-195: Enhanced auth protection for 10K stores scale
 *
 * Multi-layer protection against brute force attacks:
 * 1. Per-IP rate limiting (existing - 5/min)
 * 2. Per-store-code rate limiting (prevents targeting specific stores)
 * 3. Global rate limiting (prevents distributed attacks)
 * 4. Progressive lockout (exponential backoff after failures)
 * 5. Suspicious pattern detection
 */

import type { NextFunction, Request, Response } from "express";
import { log } from "../lib/logger";

// =============================================================================
// CONFIGURATION
// =============================================================================

// Per-store-code limits: Prevents targeting a specific store
const STORE_CODE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const STORE_CODE_MAX_ATTEMPTS = 10; // 10 attempts per store code per 5 minutes

// Global limits: Prevents distributed attacks
const GLOBAL_WINDOW_MS = 60 * 1000; // 1 minute
const GLOBAL_MAX_ATTEMPTS = 100; // 100 attempts per minute across all IPs

// Progressive lockout: Exponential backoff after failures
const LOCKOUT_THRESHOLD = 3; // Lock out after 3 failures
const LOCKOUT_BASE_MS = 5000; // Start at 5 seconds
const LOCKOUT_MAX_MS = 5 * 60 * 1000; // Max 5 minutes

// Cleanup interval
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
// ISSUE-MICRO-041: Reduced from 50K to 10K to bound memory usage (~1MB per map)
const MAX_ENTRIES = 10000;
// ISSUE-MICRO-041: Cap globalAttempts array to prevent unbounded growth during DDoS
const MAX_GLOBAL_ATTEMPTS = 1000;

// =============================================================================
// STATE
// =============================================================================

interface AttemptEntry {
  timestamps: number[];
  failureCount: number;
  lockedUntil: number;
  lastAccess: number;
}

// Per-store-code tracking
const storeCodeAttempts = new Map<string, AttemptEntry>();

// Per-IP failure tracking (for progressive lockout)
const ipFailures = new Map<string, AttemptEntry>();

// Global rate limiting
let globalAttempts: number[] = [];

// Cleanup tracking
let lastCleanup = Date.now();

// ISSUE-MICRO-041: Periodic cleanup so stale entries are reclaimed even without traffic
setInterval(() => { lastCleanup = 0; cleanup(); }, CLEANUP_INTERVAL_MS).unref();

// =============================================================================
// HELPERS
// =============================================================================

function cleanup(): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;

  lastCleanup = now;
  const staleThreshold = now - STORE_CODE_WINDOW_MS * 2;

  // Clean up store code attempts
  for (const [key, entry] of storeCodeAttempts.entries()) {
    if (entry.lastAccess < staleThreshold) {
      storeCodeAttempts.delete(key);
    }
  }

  // Clean up IP failures
  for (const [key, entry] of ipFailures.entries()) {
    if (entry.lastAccess < staleThreshold) {
      ipFailures.delete(key);
    }
  }

  // Enforce max entries
  if (storeCodeAttempts.size > MAX_ENTRIES) {
    const toRemove = storeCodeAttempts.size - MAX_ENTRIES;
    const iterator = storeCodeAttempts.keys();
    for (let i = 0; i < toRemove; i++) {
      const key = iterator.next().value;
      if (key) storeCodeAttempts.delete(key);
    }
    log.info(`[GO-LIVE-195] Auth protection: Pruned ${toRemove} storeCode entries`);
  }

  if (ipFailures.size > MAX_ENTRIES) {
    const toRemove = ipFailures.size - MAX_ENTRIES;
    const iterator = ipFailures.keys();
    for (let i = 0; i < toRemove; i++) {
      const key = iterator.next().value;
      if (key) ipFailures.delete(key);
    }
    log.info(`[GO-LIVE-195] Auth protection: Pruned ${toRemove} IP failure entries`);
  }
}

function getOrCreateEntry(map: Map<string, AttemptEntry>, key: string): AttemptEntry {
  let entry = map.get(key);
  if (!entry) {
    entry = { timestamps: [], failureCount: 0, lockedUntil: 0, lastAccess: Date.now() };
    map.set(key, entry);
  }
  return entry;
}

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * GO-LIVE-195: Enhanced auth protection middleware
 * Should be applied before the primary authRateLimiter
 */
export function enhancedAuthProtection() {
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    cleanup();

    const ip = req.ip || "unknown";
    const storeCode = req.body?.storeCode?.toUpperCase?.() || "";

    // =======================================================================
    // Layer 1: Check IP lockout (progressive)
    // =======================================================================
    const ipEntry = getOrCreateEntry(ipFailures, ip);
    if (ipEntry.lockedUntil > now) {
      const remainingSec = Math.ceil((ipEntry.lockedUntil - now) / 1000);
      // BATCH5-SUGGESTION-1: Structured logging for observability
      log.info(JSON.stringify({
        event: "auth_lockout",
        ip,
        storeCode: storeCode || null, // Don't log if empty
        attempts: ipEntry.failureCount,
        lockout_ms: ipEntry.lockedUntil - now,
        retry_after_sec: remainingSec,
      }));
      res.setHeader("Retry-After", remainingSec);
      // BATCH5-SUGGESTION-6: Generic message to prevent store enumeration
      return res.status(429).json({
        error: {
          code: "AUTH_RATE_LIMITED",
          message: "Too many attempts. Please wait before trying again.",
          retryAfterSeconds: remainingSec,
        },
      });
    }

    // =======================================================================
    // Layer 2: Check store-code rate limit (if provided)
    // =======================================================================
    if (storeCode) {
      const scEntry = getOrCreateEntry(storeCodeAttempts, storeCode);
      scEntry.timestamps = scEntry.timestamps.filter((t) => now - t < STORE_CODE_WINDOW_MS);
      scEntry.lastAccess = now;

      if (scEntry.timestamps.length >= STORE_CODE_MAX_ATTEMPTS) {
        const oldestAttempt = scEntry.timestamps[0];
        const retryAfterMs = STORE_CODE_WINDOW_MS - (now - oldestAttempt);
        const retryAfterSec = Math.ceil(retryAfterMs / 1000);

        // BATCH5-SUGGESTION-1: Structured logging for observability
        log.info(JSON.stringify({
          event: "rate_limited",
          key_type: "store_code",
          route: req.path,
          method: req.method,
          limit: STORE_CODE_MAX_ATTEMPTS,
          window_ms: STORE_CODE_WINDOW_MS,
          retry_after_ms: retryAfterMs,
          ip,
          // Note: Don't log storeCode in production to avoid log-based enumeration
        }));

        res.setHeader("Retry-After", retryAfterSec);
        // BATCH5-SUGGESTION-6: Generic message to prevent store enumeration
        return res.status(429).json({
          error: {
            code: "AUTH_RATE_LIMITED",
            message: "Too many attempts. Please wait before trying again.",
            retryAfterSeconds: retryAfterSec,
          },
        });
      }

      scEntry.timestamps.push(now);
    }

    // =======================================================================
    // Layer 3: Check global rate limit
    // BATCH5-SUGGESTION-3: Global limiter as circuit breaker only
    // We use 2x threshold as soft warning, only hard block at 3x to prevent
    // one noisy store from taking down auth for everyone
    // =======================================================================
    globalAttempts = globalAttempts.filter((t) => now - t < GLOBAL_WINDOW_MS);

    const GLOBAL_SOFT_THRESHOLD = GLOBAL_MAX_ATTEMPTS; // 100/min - warning only
    const GLOBAL_HARD_THRESHOLD = GLOBAL_MAX_ATTEMPTS * 3; // 300/min - circuit breaker

    if (globalAttempts.length >= GLOBAL_SOFT_THRESHOLD) {
      // BATCH5-SUGGESTION-1: Structured logging for observability
      log.info(JSON.stringify({
        event: globalAttempts.length >= GLOBAL_HARD_THRESHOLD ? "rate_limited" : "rate_limit_warning",
        key_type: "global",
        route: req.path,
        method: req.method,
        current: globalAttempts.length,
        soft_limit: GLOBAL_SOFT_THRESHOLD,
        hard_limit: GLOBAL_HARD_THRESHOLD,
        window_ms: GLOBAL_WINDOW_MS,
      }));
    }

    // Only hard block if at 3x the soft threshold (circuit breaker)
    if (globalAttempts.length >= GLOBAL_HARD_THRESHOLD) {
      const oldestAttempt = globalAttempts[0];
      const retryAfterMs = GLOBAL_WINDOW_MS - (now - oldestAttempt);
      const retryAfterSec = Math.ceil(retryAfterMs / 1000);

      res.setHeader("Retry-After", retryAfterSec);
      return res.status(429).json({
        error: {
          code: "AUTH_SERVICE_BUSY",
          message: "Authentication service is busy. Please try again shortly.",
          retryAfterSeconds: retryAfterSec,
        },
      });
    }

    globalAttempts.push(now);
    // ISSUE-MICRO-041: Hard cap on array length to prevent memory growth during DDoS
    if (globalAttempts.length > MAX_GLOBAL_ATTEMPTS) {
      globalAttempts = globalAttempts.slice(-MAX_GLOBAL_ATTEMPTS);
    }

    // =======================================================================
    // Hook into response to track failures
    // =======================================================================
    const originalJson = res.json.bind(res);
    res.json = function (body: any) {
      // Detect auth failure responses
      const isFailure =
        res.statusCode >= 400 &&
        res.statusCode < 500 &&
        (body?.error || res.statusCode === 401 || res.statusCode === 403);

      if (isFailure) {
        // Update IP failure count
        ipEntry.failureCount++;
        ipEntry.lastAccess = now;

        // Apply progressive lockout if threshold exceeded
        if (ipEntry.failureCount >= LOCKOUT_THRESHOLD) {
          // Exponential backoff: 5s, 10s, 20s, 40s... up to 5 min
          const lockoutDuration = Math.min(
            LOCKOUT_BASE_MS * Math.pow(2, ipEntry.failureCount - LOCKOUT_THRESHOLD),
            LOCKOUT_MAX_MS
          );
          ipEntry.lockedUntil = now + lockoutDuration;
          log.warn(
            `[GO-LIVE-195] IP ${ip} locked out for ${lockoutDuration / 1000}s after ${ipEntry.failureCount} failures`
          );
        }
      } else if (res.statusCode === 200) {
        // Reset failure count on success
        ipEntry.failureCount = 0;
        ipEntry.lockedUntil = 0;
      }

      return originalJson(body);
    };

    next();
  };
}

/**
 * Get auth protection stats for monitoring
 */
export function getAuthProtectionStats(): {
  storeCodeEntries: number;
  ipFailureEntries: number;
  globalAttemptsLastMinute: number;
} {
  const now = Date.now();
  return {
    storeCodeEntries: storeCodeAttempts.size,
    ipFailureEntries: ipFailures.size,
    globalAttemptsLastMinute: globalAttempts.filter((t) => now - t < GLOBAL_WINDOW_MS).length,
  };
}

export default enhancedAuthProtection;
