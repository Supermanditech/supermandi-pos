// GO-LIVE-138: IP-based blocking after authentication failures
// Centralized service for tracking and blocking IPs with too many auth failures

import { getPool } from "../db/client";

// =============================================================================
// CONFIGURATION
// =============================================================================

// In-memory tracking (for fast lookups - DB is source of truth for persistence)
const ipFailures = new Map<string, {
  count: number;
  firstFailure: number;
  blockedUntil: number | null;
}>();

// Thresholds
const MAX_FAILURES_PER_WINDOW = 10;        // Block after 10 failures
const FAILURE_WINDOW_MS = 15 * 60 * 1000;  // 15 minute window
const BLOCK_DURATION_MS = 60 * 60 * 1000;  // 1 hour block

// Track different failure types
export type AuthFailureType =
  | 'login_failed'
  | 'otp_failed'
  | 'token_invalid'
  | 'rate_limited'
  | 'suspicious_activity';

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Check if an IP is currently blocked
 * Returns block status and details
 */
export function checkIpBlocked(ip: string): {
  blocked: boolean;
  blockedUntil?: Date;
  reason?: string;
} {
  const record = ipFailures.get(ip);
  const now = Date.now();

  if (!record) {
    return { blocked: false };
  }

  // Check if block has expired
  if (record.blockedUntil && record.blockedUntil > now) {
    return {
      blocked: true,
      blockedUntil: new Date(record.blockedUntil),
      reason: 'Too many failed authentication attempts',
    };
  }

  // Block expired - clear it
  if (record.blockedUntil && record.blockedUntil <= now) {
    ipFailures.delete(ip);
    return { blocked: false };
  }

  return { blocked: false };
}

/**
 * Record an authentication failure from an IP
 * Returns whether the IP is now blocked
 */
export async function recordAuthFailure(
  ip: string,
  failureType: AuthFailureType,
  metadata?: Record<string, unknown>
): Promise<{
  blocked: boolean;
  attemptsRemaining?: number;
  blockedUntil?: Date;
}> {
  const now = Date.now();
  let record = ipFailures.get(ip);

  // Check if within the failure window
  if (record) {
    // Reset if outside window
    if (now - record.firstFailure > FAILURE_WINDOW_MS) {
      record = { count: 0, firstFailure: now, blockedUntil: null };
    }
  } else {
    record = { count: 0, firstFailure: now, blockedUntil: null };
  }

  record.count += 1;
  ipFailures.set(ip, record);

  // Check if should be blocked
  if (record.count >= MAX_FAILURES_PER_WINDOW) {
    record.blockedUntil = now + BLOCK_DURATION_MS;
    ipFailures.set(ip, record);

    // Log to database asynchronously
    logIpBlock(ip, failureType, record.count, metadata).catch((err) => log.error('logIpBlock failed', { error: err instanceof Error ? err.message : err }));

    log.warn(`[GO-LIVE-138] IP ${ip} blocked after ${record.count} failures (${failureType})`);

    return {
      blocked: true,
      blockedUntil: new Date(record.blockedUntil),
    };
  }

  const attemptsRemaining = MAX_FAILURES_PER_WINDOW - record.count;
  return {
    blocked: false,
    attemptsRemaining,
  };
}

/**
 * Clear IP block (e.g., after successful login from that IP)
 */
export function clearIpFailures(ip: string): void {
  ipFailures.delete(ip);
}

/**
 * Get stats about currently blocked IPs (for monitoring)
 */
export function getBlockedIpStats(): {
  blockedCount: number;
  totalTracked: number;
} {
  const now = Date.now();
  let blockedCount = 0;

  for (const record of ipFailures.values()) {
    if (record.blockedUntil && record.blockedUntil > now) {
      blockedCount++;
    }
  }

  return {
    blockedCount,
    totalTracked: ipFailures.size,
  };
}

// =============================================================================
// DATABASE PERSISTENCE
// =============================================================================

async function logIpBlock(
  ip: string,
  failureType: AuthFailureType,
  failureCount: number,
  metadata?: Record<string, unknown>
): Promise<void> {
  const pool = getPool();
  if (!pool) return;

  try {
    await pool.query(
      `INSERT INTO auth.ip_blocks (ip_address, failure_type, failure_count, blocked_until, metadata)
       VALUES ($1, $2, $3, NOW() + INTERVAL '1 hour', $4)
       ON CONFLICT (ip_address) DO UPDATE SET
         failure_count = EXCLUDED.failure_count,
         failure_type = EXCLUDED.failure_type,
         blocked_until = NOW() + INTERVAL '1 hour',
         updated_at = NOW()`,
      [ip, failureType, failureCount, metadata ? JSON.stringify(metadata) : null]
    );
  } catch (err) {
    // Non-critical - in-memory tracking is primary
    log.warn('[GO-LIVE-138] Failed to persist IP block:', err);
  }
}

// =============================================================================
// CLEANUP
// =============================================================================

// Periodically clean up expired entries from memory
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of ipFailures.entries()) {
    // Clear if window expired and not blocked
    if (!record.blockedUntil && now - record.firstFailure > FAILURE_WINDOW_MS) {
      ipFailures.delete(ip);
    }
    // Clear if block expired
    if (record.blockedUntil && record.blockedUntil <= now) {
      ipFailures.delete(ip);
    }
  }
}, 5 * 60 * 1000).unref(); // Every 5 minutes

// =============================================================================
// EXPRESS MIDDLEWARE
// =============================================================================

import type { Request, Response, NextFunction } from 'express';
import { log } from "../lib/logger";

/**
 * Middleware to check if the client IP is blocked
 * Use this before auth routes to reject blocked IPs early
 */
export function checkIpBlockMiddleware(req: Request, res: Response, next: NextFunction): void {
  const clientIp = req.ip || req.socket?.remoteAddress || 'unknown';

  const blockStatus = checkIpBlocked(clientIp);

  if (blockStatus.blocked) {
    const retryAfter = blockStatus.blockedUntil
      ? Math.ceil((blockStatus.blockedUntil.getTime() - Date.now()) / 1000)
      : 3600;

    res.setHeader('Retry-After', retryAfter.toString());
    res.status(429).json({
      error: {
        code: 'IP_BLOCKED',
        message: 'Too many failed authentication attempts. Please try again later.',
        retryAfter,
      },
    });
    return;
  }

  next();
}
