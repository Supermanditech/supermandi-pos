import type { NextFunction, Request, Response } from "express";
import { getPool } from "../db/client";

export type PosDeviceContext = {
  deviceId: string;
  storeId: string;
};

export type PosDeviceStatusContext = {
  deviceId: string;
  storeId: string;
  deviceActive: boolean;
  storeActive: boolean;
};

async function resolveDeviceFromToken(req: Request, res: Response): Promise<PosDeviceStatusContext | null> {
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

  const result = await pool.query(
    `
    SELECT d.id AS device_id, d.store_id, d.active AS device_active, s.active AS store_active
    FROM pos_devices d
    JOIN stores s ON s.id = d.store_id
    WHERE d.device_token = $1
    `,
    [token]
  );

  const row = result.rows[0];
  if (!row) {
    res.status(401).json({ error: "device_unauthorized" });
    return null;
  }

  return {
    deviceId: String(row.device_id),
    storeId: String(row.store_id),
    deviceActive: Boolean(row.device_active),
    storeActive: Boolean(row.store_active)
  };
}

// Require device token for POS endpoints. Derives store/device server-side.
export async function requireDeviceToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  const status = await resolveDeviceFromToken(req, res);
  if (!status) return;

  if (!status.deviceActive) {
    res.status(403).json({ error: "device_inactive" });
    return;
  }
  if (!status.storeActive) {
    res.status(403).json({ error: "store_inactive" });
    return;
  }

  (req as any).posDevice = {
    deviceId: status.deviceId,
    storeId: status.storeId
  } satisfies PosDeviceContext;

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

  (req as any).posDeviceStatus = status satisfies PosDeviceStatusContext;
  (req as any).posDevice = {
    deviceId: status.deviceId,
    storeId: status.storeId
  } satisfies PosDeviceContext;

  next();
}
