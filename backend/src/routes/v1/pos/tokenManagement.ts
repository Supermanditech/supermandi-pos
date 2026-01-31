// GL-WF-045-A: Token Management Endpoints
// Provides token refresh and revocation capabilities

import { Router, Request, Response } from "express";
import { requireDeviceToken } from "../../../middleware/deviceToken";
import { refreshDeviceToken, revokeDeviceToken, logTokenEvent } from "../../../middleware/tokenSecurity";
import { getPool } from "../../../db/client";
// GO-LIVE-188: Import rate limiter for token operations
import { tokenRevocationRateLimiter, financialOperationsRateLimiter } from "../../../middleware/posRateLimiter";

export const tokenManagementRouter = Router();

/**
 * POST /api/v1/pos/token/refresh
 * Refresh the current device token expiry
 * Requires valid device token
 * GO-LIVE-188: Rate limit token refresh to prevent DoS
 */
tokenManagementRouter.post("/token/refresh", requireDeviceToken, financialOperationsRateLimiter, async (req: Request, res: Response) => {
  const posDevice = (req as any).posDevice;

  if (!posDevice?.deviceId || !posDevice?.storeId) {
    return res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "Device context not found" }
    });
  }

  const result = await refreshDeviceToken(posDevice.deviceId, posDevice.storeId);

  if (!result.success) {
    return res.status(400).json({
      error: { code: "REFRESH_FAILED", message: result.error || "Token refresh failed" }
    });
  }

  return res.json({
    data: {
      success: true,
      expiresAt: result.newExpiresAt?.toISOString(),
      message: "Token expiry extended successfully"
    }
  });
});

/**
 * GET /api/v1/pos/token/status
 * Get current token status including expiry and revocation info
 * Requires valid device token
 */
tokenManagementRouter.get("/token/status", requireDeviceToken, async (req: Request, res: Response) => {
  const posDevice = (req as any).posDevice;

  if (!posDevice?.deviceId || !posDevice?.storeId) {
    return res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "Device context not found" }
    });
  }

  const pool = getPool();
  if (!pool) {
    return res.status(503).json({
      error: { code: "DATABASE_UNAVAILABLE", message: "Database service unavailable" }
    });
  }

  try {
    const result = await pool.query(
      `SELECT
        d.id,
        d.token_expires_at,
        d.token_refreshed_at,
        d.token_revoked_at,
        d.last_active_at,
        d.created_at as enrolled_at
       FROM pos_devices d
       WHERE d.id = $1 AND d.store_id = $2`,
      [posDevice.deviceId, posDevice.storeId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Device not found" }
      });
    }

    const device = result.rows[0];
    const expiresAt = device.token_expires_at ? new Date(device.token_expires_at) : null;
    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

    return res.json({
      data: {
        deviceId: posDevice.deviceId,
        storeId: posDevice.storeId,
        tokenStatus: {
          valid: true,
          expiresAt: expiresAt?.toISOString() || null,
          expiresInDays: expiresAt ? Math.floor((expiresAt.getTime() - now) / (24 * 60 * 60 * 1000)) : null,
          needsRefresh: expiresAt ? expiresAt.getTime() < now + thirtyDaysMs : false,
          lastRefreshed: device.token_refreshed_at?.toISOString() || null,
          revoked: device.token_revoked_at != null,
        },
        lastActive: device.last_active_at?.toISOString() || null,
        enrolledAt: device.enrolled_at?.toISOString() || null,
      }
    });
  } catch (error) {
    console.error("[TokenManagement] Status check error:", error);
    return res.status(500).json({
      error: { code: "STATUS_CHECK_FAILED", message: "Failed to check token status" }
    });
  }
});

/**
 * POST /api/v1/pos/token/revoke-self
 * Revoke the current device's own token (logout/de-enrollment)
 * Requires valid device token
 * GO-LIVE-188: Rate limit token revocation to prevent DoS
 */
tokenManagementRouter.post("/token/revoke-self", requireDeviceToken, tokenRevocationRateLimiter, async (req: Request, res: Response) => {
  const posDevice = (req as any).posDevice;
  const { reason } = req.body;

  if (!posDevice?.deviceId || !posDevice?.storeId) {
    return res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "Device context not found" }
    });
  }

  const success = await revokeDeviceToken({
    deviceId: posDevice.deviceId,
    storeId: posDevice.storeId,
    revokedBy: "user",
    reason: reason || "Self-revocation (device logout)",
  });

  if (!success) {
    return res.status(400).json({
      error: { code: "REVOKE_FAILED", message: "Failed to revoke token" }
    });
  }

  return res.json({
    data: {
      success: true,
      message: "Token revoked. Device will need to re-enroll to use the POS."
    }
  });
});

/**
 * GET /api/v1/pos/token/audit
 * Get recent token audit events for the current device
 * Requires valid device token
 */
tokenManagementRouter.get("/token/audit", requireDeviceToken, async (req: Request, res: Response) => {
  const posDevice = (req as any).posDevice;
  const limit = Math.min(100, parseInt(req.query.limit as string) || 20);

  if (!posDevice?.deviceId || !posDevice?.storeId) {
    return res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "Device context not found" }
    });
  }

  const pool = getPool();
  if (!pool) {
    return res.status(503).json({
      error: { code: "DATABASE_UNAVAILABLE", message: "Database service unavailable" }
    });
  }

  try {
    const result = await pool.query(
      `SELECT
        event_type,
        ip_address,
        endpoint,
        success,
        error_code,
        created_at
       FROM pos_token_audit_log
       WHERE device_id = $1 AND store_id = $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [posDevice.deviceId, posDevice.storeId, limit]
    );

    return res.json({
      data: {
        events: result.rows.map(row => ({
          eventType: row.event_type,
          ipAddress: row.ip_address,
          endpoint: row.endpoint,
          success: row.success,
          errorCode: row.error_code,
          timestamp: row.created_at?.toISOString(),
        })),
        total: result.rows.length,
      }
    });
  } catch (error) {
    console.error("[TokenManagement] Audit fetch error:", error);
    return res.status(500).json({
      error: { code: "AUDIT_FETCH_FAILED", message: "Failed to fetch audit log" }
    });
  }
});
