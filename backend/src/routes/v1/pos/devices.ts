import { Router } from "express";
import { getPool } from "../../../db/client";
import { requireDeviceTokenAllowInactive, type PosDeviceStatusContext } from "../../../middleware/deviceToken";

export const posDevicesRouter = Router();

// P3-001: Helper to safely extract trimmed strings
function asTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
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
