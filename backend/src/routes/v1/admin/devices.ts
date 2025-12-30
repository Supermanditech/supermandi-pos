import { Router } from "express";
import { getPool } from "../../../db/client";
import { requireAdminToken } from "../../../middleware/adminToken";

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

  const pool = getPool();
  if (!pool) {
    return res.status(503).json({ error: "database unavailable" });
  }

  const params: string[] = [];
  const where = storeId ? "WHERE store_id = $1" : "";
  if (storeId) params.push(storeId);

  const result = await pool.query(
    `
    SELECT id,
           store_id,
           active,
           label,
           device_type,
           manufacturer,
           model,
           android_version,
           app_version,
           printing_mode,
           last_seen_online,
           last_sync_at,
           pending_outbox_count,
           created_at,
           updated_at
    FROM pos_devices
    ${where}
    ORDER BY last_seen_online DESC NULLS LAST
    `,
    params
  );

  const devices = result.rows.map((row) => ({
    id: row.id,
    store_id: row.store_id,
    active: row.active,
    label: row.label,
    device_type: row.device_type,
    manufacturer: row.manufacturer,
    model: row.model,
    android_version: row.android_version,
    app_version: row.app_version,
    printing_mode: row.printing_mode,
    last_seen_online: row.last_seen_online ? new Date(row.last_seen_online).toISOString() : null,
    last_sync_at: row.last_sync_at ? new Date(row.last_sync_at).toISOString() : null,
    pending_outbox_count: row.pending_outbox_count,
    created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
    updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : null
  }));

  return res.json({ devices });
});

// PATCH /api/v1/admin/devices/:deviceId
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
  const resetToken = body.resetToken === true;

  const label = hasLabel ? asTrimmedString(body.label) : null;
  const deviceType = hasDeviceType ? normalizeEnum(asTrimmedString(body.deviceType)) : null;
  const printingMode = hasPrintingMode ? normalizeEnum(asTrimmedString(body.printingMode)) : null;
  const active = hasActive && typeof body.active === "boolean" ? body.active : null;

  if (hasLabel && !label) {
    return res.status(400).json({ error: "label is required" });
  }
  if (hasDeviceType && (!deviceType || !DEVICE_TYPES.has(deviceType))) {
    return res.status(400).json({ error: "deviceType invalid" });
  }
  if (hasPrintingMode && (!printingMode || !PRINTING_MODES.has(printingMode))) {
    return res.status(400).json({ error: "printingMode invalid" });
  }

  if (!hasLabel && !hasDeviceType && !hasActive && !hasPrintingMode && !resetToken) {
    return res.status(400).json({ error: "no updates provided" });
  }

  const updates: string[] = [];
  const params: Array<string | boolean> = [];

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

  return res.json({
    device: {
      id: row.id,
      store_id: row.store_id,
      active: row.active,
      label: row.label,
      device_type: row.device_type,
      manufacturer: row.manufacturer,
      model: row.model,
      android_version: row.android_version,
      app_version: row.app_version,
      printing_mode: row.printing_mode,
      last_seen_online: row.last_seen_online ? new Date(row.last_seen_online).toISOString() : null,
      last_sync_at: row.last_sync_at ? new Date(row.last_sync_at).toISOString() : null,
      pending_outbox_count: row.pending_outbox_count,
      created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
      updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : null
    }
  });
});
