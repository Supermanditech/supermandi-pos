/**
 * GO-LIVE-184/185/186/187: Per-store and per-device rate limiting for POS operations
 *
 * This middleware provides rate limiting keyed by storeId or deviceId,
 * which is more appropriate for multi-tenant POS systems than IP-based limiting.
 *
 * Features:
 * - Per-store rate limiting for financial operations (sales, approvals)
 * - Per-device rate limiting for device-specific operations
 * - Automatic cleanup of stale entries (GO-LIVE-191: prevents memory leaks)
 * - Configurable limits per operation type
 */

import type { NextFunction, Request, Response } from "express";
import type { PosDeviceContext } from "./deviceToken";

interface RateLimitEntry {
  timestamps: number[];
  lastAccess: number;
}

interface RateLimiterConfig {
  windowMs: number;        // Time window in milliseconds
  max: number;             // Max requests per window
  keyType: "store" | "device" | "ip";  // What to use as the rate limit key
  cleanupIntervalMs?: number;  // How often to clean up stale entries (default: 5 min)
  staleThresholdMs?: number;   // When to consider an entry stale (default: 10 min)
  errorCode?: string;      // Custom error code
  errorMessage?: string;   // Custom error message
}

interface RateLimitState {
  entries: Map<string, RateLimitEntry>;
  lastCleanup: number;
  cleanupIntervalMs: number;
  staleThresholdMs: number;
}

/**
 * Creates a per-store or per-device rate limiter middleware
 */
export function createPosRateLimiter(config: RateLimiterConfig) {
  const state: RateLimitState = {
    entries: new Map(),
    lastCleanup: Date.now(),
    cleanupIntervalMs: config.cleanupIntervalMs ?? 5 * 60 * 1000,  // 5 minutes default
    staleThresholdMs: config.staleThresholdMs ?? 10 * 60 * 1000,   // 10 minutes default
  };

  // GO-LIVE-191: Cleanup function to prevent memory leaks
  function cleanupStaleEntries(now: number): void {
    if (now - state.lastCleanup < state.cleanupIntervalMs) return;

    state.lastCleanup = now;
    const staleThreshold = now - state.staleThresholdMs;

    for (const [key, entry] of state.entries) {
      if (entry.lastAccess < staleThreshold) {
        state.entries.delete(key);
      }
    }
  }

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();

    // Run cleanup periodically
    cleanupStaleEntries(now);

    // Determine the rate limit key based on config
    let key: string;
    if (config.keyType === "store" || config.keyType === "device") {
      const posDevice = (req as any).posDevice as PosDeviceContext | undefined;
      if (!posDevice) {
        // If posDevice not available, middleware order issue - skip rate limiting
        // This shouldn't happen if requireDeviceToken runs first
        return next();
      }
      key = config.keyType === "store"
        ? `store:${posDevice.storeId}`
        : `device:${posDevice.deviceId}`;
    } else {
      key = `ip:${req.ip || "unknown"}`;
    }

    // Get or create entry
    let entry = state.entries.get(key);
    if (!entry) {
      entry = { timestamps: [], lastAccess: now };
      state.entries.set(key, entry);
    }

    // Filter out timestamps outside the window
    entry.timestamps = entry.timestamps.filter(t => now - t < config.windowMs);
    entry.lastAccess = now;

    // Check if rate limit exceeded
    if (entry.timestamps.length >= config.max) {
      const retryAfterMs = config.windowMs - (now - entry.timestamps[0]);
      const retryAfterSec = Math.ceil(retryAfterMs / 1000);

      // BATCH5-SUGGESTION-1: Structured logging for observability
      const posDevice = (req as any).posDevice as PosDeviceContext | undefined;
      console.log(JSON.stringify({
        event: "rate_limited",
        key_type: config.keyType,
        route: req.path,
        method: req.method,
        limit: config.max,
        window_ms: config.windowMs,
        retry_after_ms: retryAfterMs,
        storeId: posDevice?.storeId || null,
        deviceId: posDevice?.deviceId || null,
        ip: req.ip || "unknown",
        error_code: config.errorCode ?? "RATE_LIMIT_EXCEEDED",
      }));

      res.setHeader("Retry-After", retryAfterSec);
      res.setHeader("X-RateLimit-Limit", config.max);
      res.setHeader("X-RateLimit-Remaining", 0);
      res.setHeader("X-RateLimit-Reset", Math.ceil((entry.timestamps[0] + config.windowMs) / 1000));

      return res.status(429).json({
        error: {
          code: config.errorCode ?? "RATE_LIMIT_EXCEEDED",
          message: config.errorMessage ?? "Too many requests. Please try again later.",
          retryAfterSeconds: retryAfterSec
        }
      });
    }

    // Add current timestamp
    entry.timestamps.push(now);

    // Set rate limit headers
    res.setHeader("X-RateLimit-Limit", config.max);
    res.setHeader("X-RateLimit-Remaining", config.max - entry.timestamps.length);
    res.setHeader("X-RateLimit-Reset", Math.ceil((now + config.windowMs) / 1000));

    next();
  };
}

/**
 * GO-LIVE-184: Rate limiter for POST /sales endpoint
 * 60 sales per minute per store (1 per second average)
 * This is generous for normal operation but prevents abuse
 */
export const salesRateLimiter = createPosRateLimiter({
  windowMs: 60 * 1000,  // 1 minute
  max: 60,              // 60 sales per minute per store
  keyType: "store",
  errorCode: "SALES_RATE_LIMIT_EXCEEDED",
  errorMessage: "Too many sales requests. Please wait before creating another sale."
});

/**
 * GO-LIVE-185: Rate limiter for supplier approval endpoint
 * 10 approvals per minute per admin (IP-based for admin operations)
 */
export const supplierApprovalRateLimiter = createPosRateLimiter({
  windowMs: 60 * 1000,  // 1 minute
  max: 10,              // 10 approvals per minute
  keyType: "ip",
  errorCode: "APPROVAL_RATE_LIMIT_EXCEEDED",
  errorMessage: "Too many approval requests. Please wait before approving more suppliers."
});

/**
 * GO-LIVE-186: Rate limiter for store update endpoint (POS context)
 * 20 updates per minute per store
 */
export const storeUpdateRateLimiter = createPosRateLimiter({
  windowMs: 60 * 1000,  // 1 minute
  max: 20,              // 20 updates per minute
  keyType: "store",
  errorCode: "STORE_UPDATE_RATE_LIMIT_EXCEEDED",
  errorMessage: "Too many store update requests. Please wait before making more changes."
});

/**
 * GO-LIVE-186: Rate limiter for admin store operations (IP-based)
 * 30 updates per minute per IP for admin operations
 */
export const adminStoreOperationsRateLimiter = createPosRateLimiter({
  windowMs: 60 * 1000,  // 1 minute
  max: 30,              // 30 operations per minute per IP
  keyType: "ip",
  errorCode: "ADMIN_STORE_RATE_LIMIT_EXCEEDED",
  errorMessage: "Too many store operations. Please wait before making more changes."
});

/**
 * GO-LIVE-187: Rate limiter for device enrollment endpoint
 * 5 enrollments per 10 minutes per IP (very strict to prevent abuse)
 */
export const deviceEnrollmentRateLimiter = createPosRateLimiter({
  windowMs: 10 * 60 * 1000,  // 10 minutes
  max: 5,                     // 5 enrollments per 10 minutes
  keyType: "ip",
  errorCode: "ENROLLMENT_RATE_LIMIT_EXCEEDED",
  errorMessage: "Too many device enrollment attempts. Please wait before trying again."
});

/**
 * GO-LIVE-188: Rate limiter for token revocation endpoint
 * 10 revocations per minute per IP
 */
export const tokenRevocationRateLimiter = createPosRateLimiter({
  windowMs: 60 * 1000,  // 1 minute
  max: 10,              // 10 revocations per minute
  keyType: "ip",
  errorCode: "REVOCATION_RATE_LIMIT_EXCEEDED",
  errorMessage: "Too many token revocation requests. Please wait before trying again."
});

/**
 * Financial operations rate limiter (payments, confirmations)
 * 30 per minute per store
 */
export const financialOperationsRateLimiter = createPosRateLimiter({
  windowMs: 60 * 1000,  // 1 minute
  max: 30,              // 30 operations per minute per store
  keyType: "store",
  errorCode: "FINANCIAL_RATE_LIMIT_EXCEEDED",
  errorMessage: "Too many payment operations. Please wait before processing more payments."
});

/**
 * GO-LIVE-189: Rate limiter for authentication endpoints
 * 5 attempts per minute per IP (strict to prevent store code enumeration)
 */
export const authRateLimiter = createPosRateLimiter({
  windowMs: 60 * 1000,  // 1 minute
  max: 5,               // 5 auth attempts per minute per IP
  keyType: "ip",
  errorCode: "AUTH_RATE_LIMIT_EXCEEDED",
  errorMessage: "Too many authentication attempts. Please wait before trying again."
});

export default createPosRateLimiter;
