import { Router } from "express";
import { getPool } from "../../../db/client";
import { requireDeviceTokenAllowInactive, type PosDeviceStatusContext } from "../../../middleware/deviceToken";

export const posDevicesRouter = Router();

// GET /api/v1/pos/devices/me
posDevicesRouter.get("/devices/me", requireDeviceTokenAllowInactive, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const status = (req as any).posDeviceStatus as PosDeviceStatusContext;

  const result = await pool.query(
    `
    SELECT d.id AS device_id, d.store_id, s.name AS store_name
    FROM pos_devices d
    LEFT JOIN stores s ON s.id = d.store_id
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
