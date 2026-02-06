import type { NextFunction, Request, Response } from "express";
import { getPool } from "../db/client";

export type PosDeviceContext = {
  deviceId: string;
  storeId: string | null;
};

export type PosDeviceStatusContext = {
  deviceId: string;
  storeId: string | null;
  deviceActive: boolean;
  storeActive: boolean | null;
};

type StoreIdCandidate = {
  source: string;
  value: string;
};

function normalizeStoreId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function collectStoreIdCandidates(candidates: StoreIdCandidate[], value: unknown, source: string): void {
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectStoreIdCandidates(candidates, entry, source);
    }
    return;
  }
  const normalized = normalizeStoreId(value);
  if (normalized) {
    candidates.push({ source, value: normalized });
  }
}

function extractClientStoreIds(req: Request): StoreIdCandidate[] {
  const candidates: StoreIdCandidate[] = [];
  collectStoreIdCandidates(candidates, (req.params as any)?.storeId, "params.storeId");
  collectStoreIdCandidates(candidates, (req.params as any)?.store_id, "params.store_id");
  collectStoreIdCandidates(candidates, (req.query as any)?.storeId, "query.storeId");
  collectStoreIdCandidates(candidates, (req.query as any)?.store_id, "query.store_id");

  if (req.body && typeof req.body === "object") {
    const body = req.body as any;
    collectStoreIdCandidates(candidates, body.storeId, "body.storeId");
    collectStoreIdCandidates(candidates, body.store_id, "body.store_id");

    const payload = body.payload;
    if (payload && typeof payload === "object") {
      collectStoreIdCandidates(candidates, payload.storeId, "body.payload.storeId");
      collectStoreIdCandidates(candidates, payload.store_id, "body.payload.store_id");
    }
  }

  return candidates;
}

function enforceStoreBinding(req: Request, res: Response, status: PosDeviceStatusContext): boolean {
  if (!status.storeId) return true;

  const candidates = extractClientStoreIds(req);
  if (candidates.length === 0) return true;

  const mismatches = candidates.filter((candidate) => candidate.value !== status.storeId);
  if (mismatches.length === 0) return true;

  console.warn("store_mismatch_reject", {
    deviceId: status.deviceId,
    enrolledStoreId: status.storeId,
    method: req.method,
    path: req.originalUrl ?? req.url,
    mismatches
  });

  res.status(403).json({ error: "store_mismatch" });
  return false;
}

// FINDING-026: Token expiry duration (90 days) - must match enroll.ts
const TOKEN_EXPIRY_DAYS = 90;

// FINDING-026: Extended device status context with token expiry info
// GL-WF-045-A: Added tokenRevoked for revocation check
type PosDeviceStatusContextExtended = PosDeviceStatusContext & {
  tokenExpiresAt: Date | null;
  tokenExpired: boolean;
  tokenRevoked: boolean;
};

async function resolveDeviceFromToken(req: Request, res: Response): Promise<PosDeviceStatusContextExtended | null> {
  const token = req.header("x-device-token")?.trim();
  if (!token) {
    res.status(401).json({ error: "device_unauthorized" });
    return null;
  }

  const pool = getPool();
  if (!pool) {
    res.status(503).json({ error: "database unavailable" });
    return null;
  }

  // FINDING-026: Include token_expires_at in query
  // GL-WF-045-A: Include token_revoked_at for revocation check
  const result = await pool.query(
    `
    SELECT d.id AS device_id, d.store_id, d.active AS device_active,
           (s.status = 'ACTIVE') AS store_active,
           d.token_expires_at,
           d.token_revoked_at
    FROM pos_devices d
    LEFT JOIN platform.stores s ON s.id = d.store_id::uuid
    WHERE d.device_token = $1
    `,
    [token]
  );

  const row = result.rows[0];
  if (!row) {
    res.status(401).json({ error: "device_unauthorized" });
    return null;
  }

  const storeId = row.store_id ? String(row.store_id) : null;
  const storeActive =
    typeof row.store_active === "boolean"
      ? Boolean(row.store_active)
      : row.store_active === null || row.store_active === undefined
      ? null
      : Boolean(row.store_active);

  // FINDING-026: Check token expiry
  const tokenExpiresAt = row.token_expires_at ? new Date(row.token_expires_at) : null;
  const tokenExpired = tokenExpiresAt ? tokenExpiresAt.getTime() < Date.now() : false;

  // GL-WF-045-A: Check token revocation
  const tokenRevoked = row.token_revoked_at != null;

  return {
    deviceId: String(row.device_id),
    storeId,
    deviceActive: Boolean(row.device_active),
    storeActive,
    tokenExpiresAt,
    tokenExpired,
    tokenRevoked
  };
}

// FINDING-026: Auto-refresh token expiry on valid API use
// Extends token by 90 days if it's about to expire within 30 days
async function autoRefreshTokenIfNeeded(deviceId: string, tokenExpiresAt: Date | null): Promise<void> {
  if (!tokenExpiresAt) return;

  const pool = getPool();
  if (!pool) return;

  // Refresh if token expires within 30 days
  const thirtyDaysFromNow = Date.now() + 30 * 24 * 60 * 60 * 1000;
  if (tokenExpiresAt.getTime() < thirtyDaysFromNow) {
    try {
      // ISSUE-MICRO-001: Parameterized interval to eliminate SQL injection vector
      // ISSUE-MICRO-042: WHERE guard prevents redundant concurrent updates
      await pool.query(
        `UPDATE pos_devices
         SET token_expires_at = NOW() + INTERVAL '1 day' * $2,
             token_refreshed_at = NOW(),
             last_active_at = NOW()
         WHERE id = $1
           AND token_expires_at < NOW() + INTERVAL '30 days'`,
        [deviceId, TOKEN_EXPIRY_DAYS]
      );
      console.log(`[DeviceToken] Auto-refreshed token expiry for device ${deviceId}`);
    } catch (err) {
      // Non-critical, just log
      console.warn("[DeviceToken] Failed to auto-refresh token:", err);
    }
  } else {
    // Just update last_active_at
    try {
      await pool.query(
        `UPDATE pos_devices SET last_active_at = NOW() WHERE id = $1`,
        [deviceId]
      );
    } catch (err) {
      // ISSUE-MICRO-012: Log instead of silently swallowing
      console.warn("[DeviceToken] Failed to update last_active_at:", err);
    }
  }
}

// ITER3-006: Request audit logging for 10k store monitoring
function logPosRequest(params: {
  storeId: string;
  deviceId: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
}): void {
  // Structured logging for aggregation/monitoring (JSON format for log parsers)
  console.log(JSON.stringify({
    type: "pos_request",
    ts: new Date().toISOString(),
    store: params.storeId,
    device: params.deviceId,
    method: params.method,
    path: params.path,
    status: params.statusCode,
    duration_ms: params.durationMs
  }));
}

// Require device token for POS endpoints. Derives store/device server-side.
export async function requireDeviceToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  const startTime = Date.now();
  const status = await resolveDeviceFromToken(req, res);
  if (!status) return;
  if (!enforceStoreBinding(req, res, status)) return;

  if (!status.storeId) {
    res.status(403).json({ error: "device_not_enrolled" });
    return;
  }
  if (!status.deviceActive) {
    res.status(403).json({ error: "device_inactive" });
    return;
  }
  // SEC-001: Removed storeActive check - let status gate middleware handle status-based access control
  // This allows products endpoints to work for non-ACTIVE stores (ENROLLED, KYC_SUBMITTED, etc.)
  // Routes that require ACTIVE status use requireActiveStore middleware

  // FINDING-026: Check token expiry - require re-enrollment if expired
  if (status.tokenExpired) {
    res.status(401).json({
      error: "token_expired",
      message: "Device token has expired. Please re-enroll the device.",
      code: "TOKEN_EXPIRED"
    });
    return;
  }

  // GL-WF-045-A: Check token revocation - require re-enrollment if revoked
  if (status.tokenRevoked) {
    res.status(401).json({
      error: "token_revoked",
      message: "Device token has been revoked. Please re-enroll the device.",
      code: "TOKEN_REVOKED"
    });
    return;
  }

  // FINDING-026: Auto-refresh token if about to expire (non-blocking)
  // ISSUE-MICRO-012: Log errors instead of silently swallowing
  autoRefreshTokenIfNeeded(status.deviceId, status.tokenExpiresAt).catch((err) => {
    console.warn("[DeviceToken] Auto-refresh background error:", err);
  });

  (req as any).posDevice = {
    deviceId: status.deviceId,
    storeId: status.storeId
  } satisfies PosDeviceContext;

  // ITER3-006: Log request on response finish
  res.on("finish", () => {
    logPosRequest({
      storeId: status.storeId!,
      deviceId: status.deviceId,
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode: res.statusCode,
      durationMs: Date.now() - startTime
    });
  });

  next();
}

// Allows read-only POS endpoints to return status even if store/device are inactive.
export async function requireDeviceTokenAllowInactive(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const status = await resolveDeviceFromToken(req, res);
  if (!status) return;
  if (!enforceStoreBinding(req, res, status)) return;

  (req as any).posDeviceStatus = status satisfies PosDeviceStatusContext;
  (req as any).posDevice = {
    deviceId: status.deviceId,
    storeId: status.storeId
  } satisfies PosDeviceContext;

  next();
}
