import { Router } from "express";
import { getPool } from "../../../db/client";
import { requireDeviceTokenAllowInactive, type PosDeviceStatusContext } from "../../../middleware/deviceToken";

export const posDevicesRouter = Router();

// P3-001: Helper to safely extract trimmed strings
// AUDIT-API-037: Enforce max length to prevent unbounded metadata strings
function asTrimmedString(value: unknown, maxLength = 255): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return value.trim().slice(0, maxLength);
}

// GET /api/v1/pos/devices/me
posDevicesRouter.get("/devices/me", requireDeviceTokenAllowInactive, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const status = (req as any).posDeviceStatus as PosDeviceStatusContext;

  const result = await pool.query(
    `
    SELECT d.id AS device_id, d.store_id, s.name AS store_name
    FROM pos_devices d
    LEFT JOIN platform.stores s ON s.id = d.store_id::uuid
    WHERE d.id = $1
    `,
    [status.deviceId]
  );

  const row = result.rows[0];
  return res.json({
    deviceId: status.deviceId,
    storeId: row?.store_id ? String(row.store_id) : null,
    storeName: row?.store_name ? String(row.store_name) : null
  });
});

// P3-001: PATCH /api/v1/pos/devices/me - Update device metadata
// Called by mobile app on startup to ensure metadata is captured for pre-existing devices
posDevicesRouter.patch("/devices/me", requireDeviceTokenAllowInactive, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const status = (req as any).posDeviceStatus as PosDeviceStatusContext;

  // Extract optional metadata fields
  const manufacturer = asTrimmedString(req.body?.manufacturer);
  const model = asTrimmedString(req.body?.model);
  const androidVersion = asTrimmedString(req.body?.androidVersion);
  const appVersion = asTrimmedString(req.body?.appVersion);

  // Only update non-null fields, preserve existing values for null fields
  await pool.query(
    `
    UPDATE pos_devices
    SET
      manufacturer = COALESCE($2, manufacturer),
      model = COALESCE($3, model),
      android_version = COALESCE($4, android_version),
      app_version = COALESCE($5, app_version),
      last_seen_online = NOW(),
      updated_at = NOW()
    WHERE id = $1
    `,
    [status.deviceId, manufacturer, model, androidVersion, appVersion]
  );

  return res.json({ ok: true });
});

// SA-P2-005: GET /api/v1/pos/devices/me/pending-sync
// Check if there's a pending force-sync command for this device.
// Called by POS autoSync on each tick to detect admin-triggered sync requests.
posDevicesRouter.get("/devices/me/pending-sync", requireDeviceTokenAllowInactive, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const status = (req as any).posDeviceStatus as PosDeviceStatusContext;

  const result = await pool.query(
    `SELECT id, reason, requested_at
     FROM device_sync_requests
     WHERE device_id = $1 AND status = 'pending'
     ORDER BY requested_at DESC
     LIMIT 1`,
    [status.deviceId]
  );

  const pending = result.rows[0] ?? null;

  return res.json({
    hasPendingSync: Boolean(pending),
    syncRequest: pending ? {
      id: pending.id,
      reason: pending.reason,
      requested_at: new Date(pending.requested_at).toISOString(),
    } : null,
  });
});

// SA-P2-005: POST /api/v1/pos/devices/me/acknowledge-sync
// Acknowledge (complete) a pending force-sync request after POS has performed the sync.
posDevicesRouter.post("/devices/me/acknowledge-sync", requireDeviceTokenAllowInactive, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const status = (req as any).posDeviceStatus as PosDeviceStatusContext;
  const requestId = typeof req.body?.requestId === "string" ? req.body.requestId.trim() : "";

  if (!requestId) {
    return res.status(400).json({ error: "requestId is required" });
  }

  const result = await pool.query(
    `UPDATE device_sync_requests
     SET status = 'completed', completed_at = NOW()
     WHERE id = $1 AND device_id = $2 AND status = 'pending'
     RETURNING id, status, completed_at`,
    [requestId, status.deviceId]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ error: "pending sync request not found" });
  }

  return res.json({
    success: true,
    completed_at: new Date(result.rows[0].completed_at).toISOString(),
  });
});
