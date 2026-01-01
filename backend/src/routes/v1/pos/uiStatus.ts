import { Router } from "express";
import { getPool } from "../../../db/client";
import { requireDeviceTokenAllowInactive, type PosDeviceStatusContext } from "../../../middleware/deviceToken";

export const posUiStatusRouter = Router();

// GET /api/v1/pos/ui-status
posUiStatusRouter.get("/ui-status", requireDeviceTokenAllowInactive, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const status = (req as any).posDeviceStatus as PosDeviceStatusContext;

  const result = await pool.query(
    `SELECT pending_outbox_count, last_sync_at, last_seen_online FROM pos_devices WHERE id = $1`,
    [status.deviceId]
  );
  const row = result.rows[0] ?? {};
  const nowIso = new Date().toISOString();

  let storeName: string | null = null;
  let upiVpa: string | null = null;
  if (status.storeId) {
    const storeRes = await pool.query(
      `SELECT name, upi_vpa FROM stores WHERE id = $1`,
      [status.storeId]
    );
    const storeRow = storeRes.rows[0];
    storeName = storeRow?.name ? String(storeRow.name) : null;
    upiVpa = storeRow?.upi_vpa ? String(storeRow.upi_vpa) : null;
  }

  await pool.query(
    `UPDATE pos_devices SET last_seen_online = NOW(), updated_at = NOW() WHERE id = $1`,
    [status.deviceId]
  );

  const pending =
    typeof row.pending_outbox_count === "number" && Number.isFinite(row.pending_outbox_count)
      ? row.pending_outbox_count
      : 0;

  return res.json({
    storeId: status.storeId,
    storeName,
    deviceId: status.deviceId,
    storeActive: status.storeActive,
    deviceActive: status.deviceActive,
    pendingOutboxCount: pending,
    lastSyncAt: row.last_sync_at ? new Date(row.last_sync_at).toISOString() : null,
    lastSeenOnline: nowIso,
    upiVpa,
    printerOk: null,
    scannerOk: null
  });
});
