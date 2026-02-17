// GL-WF-045-A: Token Security Hardening
// Provides token refresh, revocation, rate limiting, and audit logging

import type { Request, Response, NextFunction } from "express";
import { getPool } from "../db/client";
import { createHash } from "crypto";
import { log } from "../lib/logger";

// =============================================================================
// CONFIGURATION
// =============================================================================

const TOKEN_EXPIRY_DAYS = 90;
const TOKEN_REFRESH_THRESHOLD_DAYS = 30; // Refresh if expiring within 30 days

// Rate limits per minute
const RATE_LIMITS = {
  general: 120,   // 120 requests/min for general API
  write: 30,      // 30 writes/min (sales, inventory updates)
  scan: 200,      // 200 scans/min for barcode scanning
};

// =============================================================================
// HELPERS
// =============================================================================

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// =============================================================================
// AUDIT LOGGING
// =============================================================================

export async function logTokenEvent(params: {
  deviceId: string;
  storeId?: string;
  eventType: "issued" | "refreshed" | "revoked" | "expired" | "invalid_attempt" | "rate_limited";
  ipAddress?: string;
  userAgent?: string;
  endpoint?: string;
  success?: boolean;
  errorCode?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const pool = getPool();
  if (!pool) return;

  try {
    await pool.query(
      `INSERT INTO pos_token_audit_log
       (device_id, store_id, event_type, ip_address, user_agent, endpoint, success, error_code, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        params.deviceId,
        params.storeId || null,
        params.eventType,
        params.ipAddress || null,
        params.userAgent || null,
        params.endpoint || null,
        params.success ?? true,
        params.errorCode || null,
        params.metadata ? JSON.stringify(params.metadata) : null,
      ]
    );
  } catch (err) {
    // Non-critical, just log
    log.warn("[TokenSecurity] Failed to log token event:", err);
  }
}

// =============================================================================
// TOKEN REVOCATION
// =============================================================================

export async function revokeDeviceToken(params: {
  deviceId: string;
  storeId: string;
  revokedBy: "admin" | "system" | "user";
  reason?: string;
  currentToken?: string;
}): Promise<boolean> {
  const pool = getPool();
  if (!pool) return false;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Get current token for audit
    const deviceRes = await client.query(
      `SELECT device_token FROM pos_devices WHERE id = $1 AND store_id = $2`,
      [params.deviceId, params.storeId]
    );

    if (deviceRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return false;
    }

    const oldToken = deviceRes.rows[0].device_token;
    const tokenHash = oldToken ? hashToken(oldToken) : null;

    // Mark device token as revoked
    await client.query(
      `UPDATE pos_devices
       SET token_revoked_at = NOW(),
           token_revoke_reason = $1,
           updated_at = NOW()
       WHERE id = $2 AND store_id = $3`,
      [params.reason || "Manual revocation", params.deviceId, params.storeId]
    );

    // Record revocation
    await client.query(
      `INSERT INTO pos_token_revocations (device_id, store_id, revoked_by, reason, old_token_hash)
       VALUES ($1, $2, $3, $4, $5)`,
      [params.deviceId, params.storeId, params.revokedBy, params.reason, tokenHash]
    );

    await client.query("COMMIT");

    // Audit log
    await logTokenEvent({
      deviceId: params.deviceId,
      storeId: params.storeId,
      eventType: "revoked",
      metadata: { revokedBy: params.revokedBy, reason: params.reason },
    });

    log.info(`[TokenSecurity] Token revoked: device=${params.deviceId} by=${params.revokedBy}`);
    return true;
  } catch (err) {
    await client.query("ROLLBACK");
    log.error("[TokenSecurity] Failed to revoke token:", err);
    return false;
  } finally {
    client.release();
  }
}

// =============================================================================
// TOKEN REFRESH
// =============================================================================

export async function refreshDeviceToken(deviceId: string, storeId: string): Promise<{
  success: boolean;
  newExpiresAt?: Date;
  error?: string;
}> {
  const pool = getPool();
  if (!pool) return { success: false, error: "Database unavailable" };

  try {
    const newExpiresAt = new Date(Date.now() + TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    const result = await pool.query(
      `UPDATE pos_devices
       SET token_expires_at = $1,
           token_refreshed_at = NOW(),
           updated_at = NOW()
       WHERE id = $2 AND store_id = $3 AND token_revoked_at IS NULL
       RETURNING id`,
      [newExpiresAt, deviceId, storeId]
    );

    if (result.rows.length === 0) {
      return { success: false, error: "Device not found or token revoked" };
    }

    // Audit log
    await logTokenEvent({
      deviceId,
      storeId,
      eventType: "refreshed",
      metadata: { newExpiresAt: newExpiresAt.toISOString() },
    });

    log.info(`[TokenSecurity] Token refreshed: device=${deviceId}`);
    return { success: true, newExpiresAt };
  } catch (err) {
    log.error("[TokenSecurity] Failed to refresh token:", err);
    return { success: false, error: "Refresh failed" };
  }
}

// =============================================================================
// RATE LIMITING MIDDLEWARE
// =============================================================================

type EndpointGroup = "general" | "write" | "scan";

function getEndpointGroup(path: string, method: string): EndpointGroup {
  // Scan endpoints
  if (path.includes("/scan") || path.includes("/lookup")) {
    return "scan";
  }
  // Write endpoints
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase())) {
    return "write";
  }
  return "general";
}

export async function checkRateLimit(
  deviceId: string,
  storeId: string,
  endpointGroup: EndpointGroup
): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  const pool = getPool();
  const limit = RATE_LIMITS[endpointGroup];
  const windowStart = new Date();
  windowStart.setSeconds(0, 0); // Round to minute

  if (!pool) {
    // Fail open if DB unavailable
    return { allowed: true, remaining: limit, resetAt: new Date(windowStart.getTime() + 60000) };
  }

  try {
    // Upsert rate limit counter
    const result = await pool.query(
      `INSERT INTO pos_rate_limits (device_id, store_id, window_start, endpoint_group, request_count)
       VALUES ($1, $2, $3, $4, 1)
       ON CONFLICT (device_id, window_start, endpoint_group)
       DO UPDATE SET request_count = pos_rate_limits.request_count + 1
       RETURNING request_count`,
      [deviceId, storeId, windowStart, endpointGroup]
    );

    const count = result.rows[0]?.request_count || 1;
    const remaining = Math.max(0, limit - count);
    const resetAt = new Date(windowStart.getTime() + 60000);

    return {
      allowed: count <= limit,
      remaining,
      resetAt,
    };
  } catch (err) {
    // Fail open
    log.warn("[TokenSecurity] Rate limit check failed:", err);
    return { allowed: true, remaining: limit, resetAt: new Date(windowStart.getTime() + 60000) };
  }
}

export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  const posDevice = (req as any).posDevice;
  if (!posDevice?.deviceId || !posDevice?.storeId) {
    // No device context, skip rate limiting
    next();
    return;
  }

  const endpointGroup = getEndpointGroup(req.path, req.method);

  checkRateLimit(posDevice.deviceId, posDevice.storeId, endpointGroup)
    .then((result) => {
      // Set rate limit headers
      res.setHeader("X-RateLimit-Limit", RATE_LIMITS[endpointGroup]);
      res.setHeader("X-RateLimit-Remaining", result.remaining);
      res.setHeader("X-RateLimit-Reset", Math.floor(result.resetAt.getTime() / 1000));

      if (!result.allowed) {
        // Log rate limit event
        logTokenEvent({
          deviceId: posDevice.deviceId,
          storeId: posDevice.storeId,
          eventType: "rate_limited",
          ipAddress: req.ip,
          endpoint: req.path,
          success: false,
          metadata: { endpointGroup },
        }).catch(() => {});

        res.status(429).json({
          error: {
            code: "RATE_LIMITED",
            message: "Too many requests. Please slow down.",
            retryAfter: Math.ceil((result.resetAt.getTime() - Date.now()) / 1000),
          },
        });
        return;
      }

      next();
    })
    .catch((err) => {
      log.warn("[TokenSecurity] Rate limit middleware error:", err);
      next(); // Fail open
    });
}

// =============================================================================
// ENHANCED TOKEN VALIDATION (with revocation check)
// =============================================================================

export async function isTokenRevoked(deviceId: string): Promise<boolean> {
  const pool = getPool();
  if (!pool) return false;

  try {
    const result = await pool.query(
      `SELECT token_revoked_at FROM pos_devices WHERE id = $1`,
      [deviceId]
    );

    return result.rows[0]?.token_revoked_at != null;
  } catch (err) {
    log.warn("[TokenSecurity] Revocation check failed:", err);
    return false; // Fail open
  }
}

// =============================================================================
// CLEANUP (run periodically via cron)
// =============================================================================

export async function cleanupOldRateLimits(): Promise<number> {
  const pool = getPool();
  if (!pool) return 0;

  try {
    // Delete rate limit records older than 1 hour
    const result = await pool.query(
      `DELETE FROM pos_rate_limits WHERE window_start < NOW() - INTERVAL '1 hour'`
    );
    return result.rowCount || 0;
  } catch (err) {
    log.warn("[TokenSecurity] Cleanup failed:", err);
    return 0;
  }
}

export async function cleanupOldAuditLogs(daysToKeep: number = 90): Promise<number> {
  const pool = getPool();
  if (!pool) return 0;

  try {
    const result = await pool.query(
      `DELETE FROM pos_token_audit_log WHERE created_at < NOW() - ($1 * INTERVAL '1 day')`,
      [daysToKeep]
    );
    return result.rowCount || 0;
  } catch (err) {
    log.warn("[TokenSecurity] Audit log cleanup failed:", err);
    return 0;
  }
}
