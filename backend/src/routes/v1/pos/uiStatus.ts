import { Router } from "express";
import { getPool } from "../../../db/client";
import { requireDeviceTokenAllowInactive, type PosDeviceStatusContext } from "../../../middleware/deviceToken";

export const posUiStatusRouter = Router();

const scanLookupV2LogState = new Map<string, string>();

// GET /api/v1/pos/ui-status
posUiStatusRouter.get("/ui-status", requireDeviceTokenAllowInactive, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const status = (req as any).posDeviceStatus as PosDeviceStatusContext;

  const result = await pool.query(
    `
    SELECT pending_outbox_count,
           last_sync_at,
           last_seen_online,
           scan_lookup_v2_enabled
    FROM pos_devices
    WHERE id = $1
    `,
    [status.deviceId]
  );
  const row = result.rows[0] ?? {};
  const nowIso = new Date().toISOString();

  let storeName: string | null = null;
  let storeCode: string | null = null; // STORECODE-003
  let upiVpa: string | null = null;
  let storeScanLookupV2Enabled = false;
  // GO-LIVE-REVEAL-001: Feature flags for tab visibility (default enabled for live testing)
  let buyEnabled = true;
  let reorderEnabled = true;
  // CONTRACT-LOCK-UI-STATUS-001: Add missing feature flags expected by frontend
  let inventoryEnabled = true;
  let suppliersEnabled = true;
  if (status.storeId) {
    try {
      const storeRes = await pool.query(
        `SELECT name, code, status FROM platform.stores WHERE id = $1::uuid`,
        [status.storeId]
      );
      const storeRow = storeRes.rows[0];
      storeName = storeRow?.name ? String(storeRow.name) : null;
      storeCode = storeRow?.code ? String(storeRow.code) : null;
    } catch (storeErr: any) {
      console.error("[uiStatus] Store lookup failed:", storeErr?.message);
    }

    // GO-LIVE-REVEAL-001: Check reorder_settings for reorderEnabled if store has settings
    try {
      const reorderRes = await pool.query(
        `SELECT reorder_enabled FROM reorder_settings WHERE store_id = $1`,
        [status.storeId]
      );
      if (reorderRes.rows[0] !== undefined) {
        reorderEnabled = Boolean(reorderRes.rows[0].reorder_enabled);
      }
      // buyEnabled stays true (no store-level override currently)
    } catch {
      // Table may not exist in all environments - default to enabled
    }
  }

  await pool.query(
    `UPDATE pos_devices SET last_seen_online = NOW(), updated_at = NOW() WHERE id = $1`,
    [status.deviceId]
  );

  const pending =
    typeof row.pending_outbox_count === "number" && Number.isFinite(row.pending_outbox_count)
      ? row.pending_outbox_count
      : 0;

  const deviceScanLookupV2Enabled =
    typeof row.scan_lookup_v2_enabled === "boolean" ? row.scan_lookup_v2_enabled : null;
  const scanLookupV2Enabled =
    deviceScanLookupV2Enabled !== null ? deviceScanLookupV2Enabled : storeScanLookupV2Enabled;
  const scanLookupV2Source = deviceScanLookupV2Enabled !== null ? "device" : "store";
  const logKey = [
    scanLookupV2Source,
    String(deviceScanLookupV2Enabled),
    String(storeScanLookupV2Enabled),
    String(scanLookupV2Enabled)
  ].join(":");
  const prior = scanLookupV2LogState.get(status.deviceId);
  if (prior !== logKey) {
    scanLookupV2LogState.set(status.deviceId, logKey);
    console.log(
      "[scan_lookup_v2] deviceId=%s storeId=%s source=%s deviceFlag=%s storeFlag=%s effective=%s",
      status.deviceId,
      status.storeId ?? "none",
      scanLookupV2Source,
      deviceScanLookupV2Enabled ?? "null",
      storeScanLookupV2Enabled,
      scanLookupV2Enabled
    );
  }

  return res.json({
    storeId: status.storeId,
    storeName,
    storeCode, // STORECODE-003: Human-readable store code
    deviceId: status.deviceId,
    storeActive: status.storeActive,
    deviceActive: status.deviceActive,
    pendingOutboxCount: pending,
    lastSyncAt: row.last_sync_at ? new Date(row.last_sync_at).toISOString() : null,
    lastSeenOnline: nowIso,
    upiVpa,
    printerOk: null,
    scannerOk: null,
    features: {
      scan_lookup_v2: scanLookupV2Enabled,
      // GO-LIVE-REVEAL-001: Feature flags for POS tab visibility
      buyEnabled,
      reorderEnabled,
      // CONTRACT-LOCK-UI-STATUS-001: Missing feature flags
      inventoryEnabled,
      suppliersEnabled,
      // Legacy alias for buyEnabled
      ordersEnabled: buyEnabled
    }
  });
});
