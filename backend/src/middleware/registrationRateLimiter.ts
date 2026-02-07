/**
 * DR-006: Anti-Spam / Abuse Controls for Public Registration
 *
 * Body-aware rate limiting for registration endpoint.
 * Limits by phone number and GSTIN to prevent mass fake store creation.
 *
 * - Phone: 3 attempts per hour (legitimate users register once)
 * - GSTIN: 3 attempts per hour
 * - Audit logging for investigation
 */

import type { Request, Response, NextFunction } from "express";

// =============================================================================
// CONFIGURATION
// =============================================================================

const PHONE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const PHONE_MAX_ATTEMPTS = 3;

const GSTIN_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const GSTIN_MAX_ATTEMPTS = 3;

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ENTRIES = 10_000; // Memory cap

// =============================================================================
// STATE
// =============================================================================

interface AttemptEntry {
  timestamps: number[];
  lastAccess: number;
}

const phoneAttempts = new Map<string, AttemptEntry>();
const gstinAttempts = new Map<string, AttemptEntry>();
let lastCleanup = Date.now();

// =============================================================================
// HELPERS
// =============================================================================

function normalizePhone(phone: string): string {
  // Strip spaces/dashes, keep digits and leading +
  return phone.replace(/[\s\-()]/g, "");
}

function normalizeGstin(gstin: string): string {
  return gstin.replace(/\s/g, "").toUpperCase();
}

function cleanupStaleEntries(map: Map<string, AttemptEntry>, windowMs: number): void {
  const now = Date.now();
  const staleThreshold = now - windowMs * 2; // Keep entries for 2x the window
  for (const [key, entry] of map) {
    if (entry.lastAccess < staleThreshold) {
      map.delete(key);
    }
  }
}

function evictIfFull(map: Map<string, AttemptEntry>): void {
  if (map.size >= MAX_ENTRIES) {
    // Evict oldest entry
    const firstKey = map.keys().next().value;
    if (firstKey) map.delete(firstKey);
  }
}

function checkLimit(
  map: Map<string, AttemptEntry>,
  key: string,
  windowMs: number,
  maxAttempts: number
): { allowed: boolean; count: number; retryAfterSec: number } {
  const now = Date.now();

  let entry = map.get(key);
  if (!entry) {
    entry = { timestamps: [], lastAccess: now };
    evictIfFull(map);
    map.set(key, entry);
  }

  // Filter out timestamps outside the window
  entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);
  entry.lastAccess = now;

  if (entry.timestamps.length >= maxAttempts) {
    const retryAfterMs = windowMs - (now - entry.timestamps[0]);
    return { allowed: false, count: entry.timestamps.length, retryAfterSec: Math.ceil(retryAfterMs / 1000) };
  }

  entry.timestamps.push(now);
  return { allowed: true, count: entry.timestamps.length, retryAfterSec: 0 };
}

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * DR-006: Registration abuse protection middleware.
 * Must be applied AFTER body parsing but BEFORE the registration handler.
 *
 * Checks phone and GSTIN rate limits from request body.
 * Returns 429 with audit-friendly error if limits exceeded.
 */
export function registrationAbuseGuard(req: Request, res: Response, next: NextFunction): void {
  const now = Date.now();

  // Periodic cleanup
  if (now - lastCleanup > CLEANUP_INTERVAL_MS) {
    lastCleanup = now;
    cleanupStaleEntries(phoneAttempts, PHONE_WINDOW_MS);
    cleanupStaleEntries(gstinAttempts, GSTIN_WINDOW_MS);
  }

  const phone = typeof req.body?.phone === "string" ? normalizePhone(req.body.phone) : null;
  const gstin = typeof req.body?.gstin === "string" ? normalizeGstin(req.body.gstin) : null;
  const ipAddress =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "unknown";

  // Check phone-level limit
  if (phone) {
    const phoneCheck = checkLimit(phoneAttempts, phone, PHONE_WINDOW_MS, PHONE_MAX_ATTEMPTS);
    if (!phoneCheck.allowed) {
      console.warn(JSON.stringify({
        event: "DR-006:registration_blocked",
        reason: "phone_rate_limit",
        phone: phone.slice(0, 6) + "****", // Partial for audit
        attempts: phoneCheck.count,
        ip: ipAddress,
        retryAfterSec: phoneCheck.retryAfterSec,
        path: req.path,
      }));

      res.setHeader("Retry-After", phoneCheck.retryAfterSec);
      res.status(429).json({
        error: "REGISTRATION_RATE_LIMITED",
        message: "Too many registration attempts with this phone number. Please try again later.",
        retryAfterSeconds: phoneCheck.retryAfterSec,
      });
      return;
    }
  }

  // Check GSTIN-level limit
  if (gstin) {
    const gstinCheck = checkLimit(gstinAttempts, gstin, GSTIN_WINDOW_MS, GSTIN_MAX_ATTEMPTS);
    if (!gstinCheck.allowed) {
      console.warn(JSON.stringify({
        event: "DR-006:registration_blocked",
        reason: "gstin_rate_limit",
        gstin: gstin.slice(0, 4) + "***" + gstin.slice(-3), // Partial for audit
        attempts: gstinCheck.count,
        ip: ipAddress,
        retryAfterSec: gstinCheck.retryAfterSec,
        path: req.path,
      }));

      res.setHeader("Retry-After", gstinCheck.retryAfterSec);
      res.status(429).json({
        error: "REGISTRATION_RATE_LIMITED",
        message: "Too many registration attempts with this GSTIN. Please try again later.",
        retryAfterSeconds: gstinCheck.retryAfterSec,
      });
      return;
    }
  }

  next();
}

export default registrationAbuseGuard;
