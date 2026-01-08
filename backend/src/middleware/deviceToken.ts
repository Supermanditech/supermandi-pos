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
    LEFT JOIN stores s ON s.id = d.store_id
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

  return {
    deviceId: String(row.device_id),
    storeId,
    deviceActive: Boolean(row.device_active),
    storeActive
  };
}

// Require device token for POS endpoints. Derives store/device server-side.
export async function requireDeviceToken(req: Request, res: Response, next: NextFunction): Promise<void> {
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
  if (status.storeActive !== true) {
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
  if (!enforceStoreBinding(req, res, status)) return;

  (req as any).posDeviceStatus = status satisfies PosDeviceStatusContext;
  (req as any).posDevice = {
    deviceId: status.deviceId,
    storeId: status.storeId
  } satisfies PosDeviceContext;

  next();
}
