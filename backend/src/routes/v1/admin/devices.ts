import { Router } from "express";
import { getPool } from "../../../db/client";
import { requireAdminToken } from "../../../middleware/adminToken";
import { log } from "../../../lib/logger";
import * as fcmService from "../../../services/fcmService";

export const adminDevicesRouter = Router();

const DEVICE_TYPES = new Set(["OEM_HANDHELD", "SUPMANDI_PHONE", "RETAILER_PHONE"]);
const PRINTING_MODES = new Set(["DIRECT_ESC_POS", "SHARE_TO_PRINTER_APP", "NONE"]);

function asTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeEnum(value: string | null): string | null {
  return value ? value.trim().toUpperCase() : null;
}

adminDevicesRouter.get("/devices", requireAdminToken, async (req, res) => {
  const storeId = typeof req.query?.storeId === "string" ? req.query.storeId.trim() : "";
  const deviceId = typeof req.query?.deviceId === "string" ? req.query.deviceId.trim() : "";

  const pool = getPool();
  if (!pool) {
    return res.status(503).json({ error: "database unavailable" });
  }

  // ADMIN-PAGINATION-001: Support limit/offset pagination
  const limit = Math.min(Math.max(parseInt(String(req.query.limit)) || 50, 1), 200);
  const offset = Math.max(parseInt(String(req.query.offset)) || 0, 0);

  const conditions: string[] = [];
  const countParams: string[] = [];
  const queryParams: (string | number)[] = [];
  let countIdx = 1;
  let queryIdx = 1;

  if (storeId) {
    conditions.push(`d.store_id = $${countIdx}::uuid`);
    countParams.push(storeId);
    queryParams.push(storeId);
    countIdx++;
    queryIdx++;
  }
  if (deviceId) {
    conditions.push(`d.id::text ILIKE $${countIdx}`);
    countParams.push(`%${deviceId}%`);
    queryParams.push(`%${deviceId}%`);
    countIdx++;
    queryIdx++;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  queryParams.push(limit, offset);

  const [countResult, result] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int as total FROM pos_devices d ${where}`,
      countParams
    ),
    pool.query(
      `
      SELECT d.id,
             d.store_id,
             s.name AS store_name,
             d.active,
             d.label,
             d.device_type,
             d.manufacturer,
             d.model,
             d.android_version,
             d.app_version,
             d.printing_mode,
             d.scan_lookup_v2_enabled,
             d.last_seen_online,
             d.last_sync_at,
             d.pending_outbox_count,
             d.created_at,
             d.updated_at
      FROM pos_devices d
      LEFT JOIN platform.stores s ON s.id = d.store_id::uuid
      ${where}
      ORDER BY d.last_seen_online DESC NULLS LAST
      LIMIT $${queryIdx} OFFSET $${queryIdx + 1}
      `,
      queryParams
    ),
  ]);

  const total = countResult.rows[0]?.total ?? 0;
  const devices = result.rows.map((row) => ({
    id: row.id,
    store_id: row.store_id,
    store_name: row.store_name ?? null,
    active: row.active,
    label: row.label,
    device_type: row.device_type,
    manufacturer: row.manufacturer,
    model: row.model,
    android_version: row.android_version,
    app_version: row.app_version,
    printing_mode: row.printing_mode,
    scan_lookup_v2_enabled: row.scan_lookup_v2_enabled ?? null,
    last_seen_online: row.last_seen_online ? new Date(row.last_seen_online).toISOString() : null,
    last_sync_at: row.last_sync_at ? new Date(row.last_sync_at).toISOString() : null,
    pending_outbox_count: row.pending_outbox_count,
    created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
    updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : null
  }));

  // T-185: Include max_devices and active device count when filtering by store
  let storeDeviceInfo: { max_devices: number; active_device_count: number } | undefined;
  if (storeId) {
    try {
      const [maxRes, activeRes] = await Promise.all([
        pool.query(
          `SELECT COALESCE(max_devices, 10) as max_devices FROM platform.stores WHERE id = $1::uuid`,
          [storeId]
        ),
        pool.query(
          `SELECT COUNT(*)::int as count FROM pos_devices WHERE store_id = $1 AND active = true`,
          [storeId]
        ),
      ]);
      storeDeviceInfo = {
        max_devices: maxRes.rows[0]?.max_devices ?? 10,
        active_device_count: activeRes.rows[0]?.count ?? 0,
      };
    } catch {
      // Non-critical — continue without device info
    }
  }

  return res.json({ devices, total, limit, offset, ...(storeDeviceInfo ? { storeDeviceInfo } : {}) });
});

// PATCH /api/v1/admin/devices/:deviceId
// T-185: Default max devices per store (matches enroll.ts)
const DEFAULT_MAX_DEVICES_PER_STORE = 10;

adminDevicesRouter.patch("/devices/:deviceId", requireAdminToken, async (req, res) => {
  const deviceId = typeof req.params.deviceId === "string" ? req.params.deviceId.trim() : "";
  if (!deviceId) {
    return res.status(400).json({ error: "deviceId is required" });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const hasLabel = Object.prototype.hasOwnProperty.call(body, "label");
  const hasDeviceType = Object.prototype.hasOwnProperty.call(body, "deviceType");
  const hasActive = Object.prototype.hasOwnProperty.call(body, "active");
  const hasPrintingMode = Object.prototype.hasOwnProperty.call(body, "printingMode");
  const hasScanLookupV2 =
    Object.prototype.hasOwnProperty.call(body, "scanLookupV2Enabled") ||
    Object.prototype.hasOwnProperty.call(body, "scan_lookup_v2_enabled");
  const resetToken = body.resetToken === true;

  const label = hasLabel ? asTrimmedString(body.label) : null;
  const deviceType = hasDeviceType ? normalizeEnum(asTrimmedString(body.deviceType)) : null;
  const printingMode = hasPrintingMode ? normalizeEnum(asTrimmedString(body.printingMode)) : null;
  const active = hasActive && typeof body.active === "boolean" ? body.active : null;
  const scanLookupV2Raw = hasScanLookupV2
    ? (body.scanLookupV2Enabled ?? body.scan_lookup_v2_enabled)
    : undefined;
  const scanLookupV2Enabled =
    hasScanLookupV2 && typeof scanLookupV2Raw === "boolean" ? scanLookupV2Raw : null;

  if (hasLabel && !label) {
    return res.status(400).json({ error: "label is required" });
  }
  if (hasDeviceType && (!deviceType || !DEVICE_TYPES.has(deviceType))) {
    return res.status(400).json({ error: "deviceType invalid" });
  }
  if (hasPrintingMode && (!printingMode || !PRINTING_MODES.has(printingMode))) {
    return res.status(400).json({ error: "printingMode invalid" });
  }
  if (hasScanLookupV2 && scanLookupV2Raw !== null && typeof scanLookupV2Raw !== "boolean") {
    return res.status(400).json({ error: "scanLookupV2Enabled must be boolean or null" });
  }

  if (!hasLabel && !hasDeviceType && !hasActive && !hasPrintingMode && !hasScanLookupV2 && !resetToken) {
    return res.status(400).json({ error: "no updates provided" });
  }

  // T-185: Enforce max_devices when activating a device
  if (hasActive && active === true) {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "database unavailable" });

    // Get the device's store_id first
    const deviceRes = await pool.query(
      `SELECT store_id FROM pos_devices WHERE id = $1`,
      [deviceId]
    );
    if (deviceRes.rowCount === 0) {
      return res.status(404).json({ error: "device not found" });
    }
    const storeId = deviceRes.rows[0].store_id;

    if (storeId) {
      // Check if this device is already active (if so, no need to check limit)
      const alreadyActiveRes = await pool.query(
        `SELECT active FROM pos_devices WHERE id = $1`,
        [deviceId]
      );
      const alreadyActive = alreadyActiveRes.rows[0]?.active === true;

      if (!alreadyActive) {
        // Count active devices for the store (excluding this device)
        const countRes = await pool.query(
          `SELECT COUNT(*)::int as count FROM pos_devices WHERE store_id = $1 AND active = true AND id != $2`,
          [storeId, deviceId]
        );
        const activeCount = countRes.rows[0]?.count ?? 0;

        // Get max_devices from store
        const storeRes = await pool.query(
          `SELECT COALESCE(max_devices, $2) as max_devices FROM platform.stores WHERE id = $1::uuid`,
          [storeId, DEFAULT_MAX_DEVICES_PER_STORE]
        );
        const maxDevices = storeRes.rows[0]?.max_devices ?? DEFAULT_MAX_DEVICES_PER_STORE;

        if (activeCount >= maxDevices) {
          return res.status(403).json({
            error: "DEVICE_LIMIT_EXCEEDED",
            message: `Maximum devices reached for this store (${activeCount}/${maxDevices})`
          });
        }
      }
    }
  }

  const updates: string[] = [];
  const params: Array<string | boolean | null> = [];

  if (hasLabel) {
    params.push(label as string);
    updates.push(`label = $${params.length}`);
  }

  if (hasDeviceType) {
    params.push(deviceType as string);
    updates.push(`device_type = $${params.length}`);
  }

  if (hasPrintingMode) {
    params.push(printingMode as string);
    updates.push(`printing_mode = $${params.length}`);
  }

  if (hasActive) {
    params.push(active as boolean);
    updates.push(`active = $${params.length}`);
  }

  if (hasScanLookupV2) {
    params.push(scanLookupV2Raw === null ? null : scanLookupV2Enabled);
    updates.push(`scan_lookup_v2_enabled = $${params.length}`);
  }

  if (resetToken) {
    updates.push(`device_token = NULL`);
  }

  updates.push("updated_at = NOW()");

  const pool = getPool();
  if (!pool) {
    return res.status(503).json({ error: "database unavailable" });
  }

  const updateSql = `
    UPDATE pos_devices
    SET ${updates.join(", ")}
    WHERE id = $${params.length + 1}
    RETURNING id,
              store_id,
              active,
              label,
              device_type,
              manufacturer,
              model,
              android_version,
              app_version,
              printing_mode,
              scan_lookup_v2_enabled,
              last_seen_online,
              last_sync_at,
              pending_outbox_count,
              created_at,
              updated_at
  `;

  const result = await pool.query(updateSql, [...params, deviceId]);
  const row = result.rows[0];
  if (!row) {
    return res.status(404).json({ error: "device not found" });
  }

  let storeName: string | null = null;
  if (row.store_id) {
    const storeRes = await pool.query(`SELECT name FROM platform.stores WHERE id = $1::uuid`, [row.store_id]);
    storeName = storeRes.rows[0]?.name ? String(storeRes.rows[0].name) : null;
  }

  return res.json({
    device: {
      id: row.id,
      store_id: row.store_id,
      store_name: storeName,
      active: row.active,
      label: row.label,
      device_type: row.device_type,
      manufacturer: row.manufacturer,
      model: row.model,
      android_version: row.android_version,
      app_version: row.app_version,
      printing_mode: row.printing_mode,
      scan_lookup_v2_enabled: row.scan_lookup_v2_enabled ?? null,
      last_seen_online: row.last_seen_online ? new Date(row.last_seen_online).toISOString() : null,
      last_sync_at: row.last_sync_at ? new Date(row.last_sync_at).toISOString() : null,
      pending_outbox_count: row.pending_outbox_count,
      created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
      updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : null
    }
  });
});

// ISSUE-024: POST /api/v1/admin/devices/:deviceId/revoke
// Convenience endpoint — deactivates device and clears its token
adminDevicesRouter.post("/devices/:deviceId/revoke", requireAdminToken, async (req, res) => {
  const deviceId = req.params.deviceId?.trim();
  if (!deviceId) {
    return res.status(400).json({ error: "deviceId is required" });
  }

  const pool = getPool();
  if (!pool) {
    return res.status(503).json({ error: "database unavailable" });
  }

  const result = await pool.query(
    `UPDATE pos_devices SET active = false, device_token = NULL, updated_at = NOW()
     WHERE id = $1
     RETURNING id, store_id, active, label`,
    [deviceId]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ error: "device not found" });
  }

  return res.json({ success: true, device: result.rows[0] });
});

// SA-P2-001: POST /api/v1/admin/devices/:deviceId/force-re-enroll
// Force-invalidates a device's enrollment and requires re-enrollment.
// Clears device_token, sets active=false, marks token_revoked_at, and logs audit event.
// On next API call the device middleware returns TOKEN_REVOKED → POS shows enrollment screen.
adminDevicesRouter.post("/devices/:deviceId/force-re-enroll", requireAdminToken, async (req, res) => {
  const deviceId = req.params.deviceId?.trim();
  if (!deviceId) {
    return res.status(400).json({ error: "deviceId is required" });
  }

  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";

  const pool = getPool();
  if (!pool) {
    return res.status(503).json({ error: "database unavailable" });
  }

  // Fetch current device state (verify exists + get store_id for audit)
  const deviceRes = await pool.query(
    `SELECT id, store_id, label, active, device_token FROM pos_devices WHERE id = $1`,
    [deviceId]
  );

  if (deviceRes.rowCount === 0) {
    return res.status(404).json({ error: "device not found" });
  }

  const device = deviceRes.rows[0];

  // Invalidate: clear token, deactivate, mark revoked, clear re_enrolled flag
  const result = await pool.query(
    `UPDATE pos_devices
     SET device_token = NULL,
         active = false,
         token_revoked_at = NOW(),
         re_enrolled = false,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, store_id, label, active`,
    [deviceId]
  );

  // Log audit event to device_enrollment_events table
  try {
    await pool.query(
      `INSERT INTO device_enrollment_events
         (store_id, device_id, event_type, device_label, metadata)
       VALUES ($1, $2, 'force_re_enroll', $3, $4)`,
      [
        device.store_id,
        deviceId,
        device.label,
        JSON.stringify({
          reason: reason || "Forced re-enrollment by superadmin",
          previousActive: device.active,
          hadToken: Boolean(device.device_token),
        }),
      ]
    );
  } catch (auditErr) {
    // Non-critical — device is already invalidated, just log
    log.warn("[ForceReEnroll] Failed to write audit event:", auditErr);
  }

  log.info(`[ForceReEnroll] Device ${deviceId} (store=${device.store_id}) forced to re-enroll. reason=${reason || "none"}`);

  return res.json({
    success: true,
    device: result.rows[0],
    message: "Device has been deregistered and will require re-enrollment.",
  });
});

// SA-P2-002: Remote Config Push
// =============================================================================

/**
 * Check if Firebase Admin SDK is initialized and messaging is available.
 * Returns false if firebase-admin is not configured (no service account).
 */
function isFcmAvailable(): boolean {
  try {
    // If firebase-admin is not initialized, this will throw
    const admin = require("firebase-admin");
    const apps = admin.apps;
    return Array.isArray(apps) && apps.length > 0;
  } catch {
    return false;
  }
}

// POST /api/v1/admin/devices/:deviceId/push-config
// Push a config update to a specific device via FCM or poll fallback
adminDevicesRouter.post("/devices/:deviceId/push-config", requireAdminToken, async (req, res) => {
  const deviceId = req.params.deviceId?.trim();
  if (!deviceId) {
    return res.status(400).json({ error: "deviceId is required" });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const configKey = typeof body.configKey === "string" ? body.configKey.trim() : "";
  const configValue = typeof body.configValue === "string" ? body.configValue.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!configKey) {
    return res.status(400).json({ error: "configKey is required" });
  }
  if (!configValue && configValue !== "false" && configValue !== "0") {
    return res.status(400).json({ error: "configValue is required" });
  }

  const pool = getPool();
  if (!pool) {
    return res.status(503).json({ error: "database unavailable" });
  }

  // Verify device exists
  const deviceRes = await pool.query(
    `SELECT id, store_id FROM pos_devices WHERE id = $1`,
    [deviceId]
  );
  if (deviceRes.rowCount === 0) {
    return res.status(404).json({ error: "device not found" });
  }

  const device = deviceRes.rows[0];
  let method: "fcm" | "poll" = "poll";

  // Attempt FCM delivery if available
  if (isFcmAvailable()) {
    try {
      if (device.store_id) {
        const tokenRes = await pool.query(
          `SELECT dt.token
           FROM auth.device_tokens dt
           JOIN auth.users u ON u.id = dt.user_id
           WHERE u.store_id = $1 AND dt.is_active = true`,
          [device.store_id]
        );
        const tokens = tokenRes.rows.map((r: { token: string }) => r.token);
        if (tokens.length > 0) {
          await fcmService.sendToTokens(tokens, {
            title: "Config Update",
            body: message || `Configuration "${configKey}" updated`,
            data: {
              type: "CONFIG_PUSH",
              configKey,
              configValue,
              deviceId,
            },
            priority: "high",
            channel: "alerts",
          });
          method = "fcm";
        }
      }
    } catch (err) {
      log.warn("[ConfigPush] FCM send failed, falling back to poll:", err);
      method = "poll";
    }
  }

  // Record the config push in DB (for poll fallback or audit trail)
  const insertRes = await pool.query(
    `INSERT INTO device_config_pushes (device_id, store_id, config_key, config_value, message, method, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, created_at`,
    [deviceId, device.store_id, configKey, configValue, message || null, method, method === "fcm" ? "delivered" : "pending"]
  );

  log.info(`[ConfigPush] Pushed "${configKey}" to device ${deviceId} via ${method}`);

  return res.json({
    queued: true,
    method,
    pushId: insertRes.rows[0].id,
    createdAt: insertRes.rows[0].created_at,
  });
});

// POST /api/v1/admin/devices/broadcast-config
// Broadcast a config update to all active devices
adminDevicesRouter.post("/devices/broadcast-config", requireAdminToken, async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const configKey = typeof body.configKey === "string" ? body.configKey.trim() : "";
  const configValue = typeof body.configValue === "string" ? body.configValue.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!configKey) {
    return res.status(400).json({ error: "configKey is required" });
  }
  if (!configValue && configValue !== "false" && configValue !== "0") {
    return res.status(400).json({ error: "configValue is required" });
  }

  const pool = getPool();
  if (!pool) {
    return res.status(503).json({ error: "database unavailable" });
  }

  // Get all active devices
  const devicesRes = await pool.query(
    `SELECT id, store_id FROM pos_devices WHERE active = true`
  );

  if (devicesRes.rowCount === 0) {
    return res.json({ queued: true, method: "poll" as const, deviceCount: 0 });
  }

  let method: "fcm" | "poll" = "poll";
  const devices = devicesRes.rows as Array<{ id: string; store_id: string | null }>;

  // Attempt FCM broadcast if available
  if (isFcmAvailable()) {
    try {
      const tokenRes = await pool.query(
        `SELECT dt.token FROM auth.device_tokens dt WHERE dt.is_active = true`
      );
      const tokens = tokenRes.rows.map((r: { token: string }) => r.token);
      if (tokens.length > 0) {
        await fcmService.sendToTokens(tokens, {
          title: "Config Update",
          body: message || `Configuration "${configKey}" updated for all devices`,
          data: {
            type: "CONFIG_PUSH",
            configKey,
            configValue,
            broadcast: "true",
          },
          priority: "high",
          channel: "alerts",
        });
        method = "fcm";
      }
    } catch (err) {
      log.warn("[ConfigPush] FCM broadcast failed, falling back to poll:", err);
      method = "poll";
    }
  }

  // Record a config push entry per device
  const status = method === "fcm" ? "delivered" : "pending";
  const values: string[] = [];
  const params: Array<string | null> = [];
  let paramIdx = 1;
  for (const d of devices) {
    values.push(`($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5}, $${paramIdx + 6})`);
    params.push(d.id, d.store_id, configKey, configValue, message || null, method, status);
    paramIdx += 7;
  }

  await pool.query(
    `INSERT INTO device_config_pushes (device_id, store_id, config_key, config_value, message, method, status)
     VALUES ${values.join(", ")}`,
    params
  );

  log.info(`[ConfigPush] Broadcast "${configKey}" to ${devices.length} devices via ${method}`);

  return res.json({
    queued: true,
    method,
    deviceCount: devices.length,
  });
});

// GET /api/v1/admin/devices/config-push-history
// Returns recent config push history for display in SuperAdmin
adminDevicesRouter.get("/devices/config-push-history", requireAdminToken, async (req, res) => {
  const pool = getPool();
  if (!pool) {
    return res.status(503).json({ error: "database unavailable" });
  }

  const limit = Math.min(Math.max(parseInt(String(req.query.limit)) || 50, 1), 200);
  const offset = Math.max(parseInt(String(req.query.offset)) || 0, 0);
  const deviceId = typeof req.query.deviceId === "string" ? req.query.deviceId.trim() : "";

  const conditions: string[] = [];
  const countParams: (string | number)[] = [];
  const queryParams: (string | number)[] = [];
  let countIdx = 1;
  let queryIdx = 1;

  if (deviceId) {
    conditions.push(`cp.device_id = $${countIdx}`);
    countParams.push(deviceId);
    queryParams.push(deviceId);
    countIdx++;
    queryIdx++;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  queryParams.push(limit, offset);

  const [countResult, result] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int as total FROM device_config_pushes cp ${where}`,
      countParams
    ),
    pool.query(
      `SELECT cp.id, cp.device_id, cp.store_id, cp.config_key, cp.config_value,
              cp.message, cp.method, cp.status, cp.delivered_at, cp.created_at
       FROM device_config_pushes cp
       ${where}
       ORDER BY cp.created_at DESC
       LIMIT $${queryIdx} OFFSET $${queryIdx + 1}`,
      queryParams
    ),
  ]);

  return res.json({
    pushes: result.rows,
    total: countResult.rows[0]?.total ?? 0,
    limit,
    offset,
  });
});
