import { Router } from "express";
import { requireDeviceToken } from "../../../middleware/deviceToken";
import { logPosEventSafe } from "../../../services/posEventLogger";

export const posEventsRouter = Router();

// AUDIT-API-038: Whitelist of valid POS event types to prevent arbitrary string injection
const VALID_EVENT_TYPES = new Set([
  "app_open", "app_close", "app_background", "app_foreground",
  "screen_view", "screen_exit",
  "scan_success", "scan_fail", "scan_manual",
  "sale_start", "sale_complete", "sale_cancel", "sale_void",
  "payment_init", "payment_success", "payment_fail", "payment_timeout",
  "stock_in_start", "stock_in_complete", "stock_in_cancel",
  "grn_start", "grn_complete", "grn_cancel",
  "sync_start", "sync_complete", "sync_fail",
  "login", "logout", "session_timeout",
  "error", "crash", "network_error",
  "purchase_start", "purchase_complete", "purchase_cancel",
  "reorder_start", "reorder_complete",
  "bnpl_view", "bnpl_pay", "bnpl_dispute",
  "device_enroll", "device_update",
  "printer_connect", "printer_disconnect", "printer_error",
  "camera_open", "camera_close",
  "ui_status_fetch", "ui_status_error",
]);

// POST /api/v1/pos/events
// Fire-and-forget: must NEVER crash POS.
posEventsRouter.post("/events", requireDeviceToken, async (req, res) => {
  const eventType = typeof req.body?.eventType === "string" ? req.body.eventType.trim() : "";
  if (!eventType) {
    return res.status(400).json({ error: "eventType is required" });
  }
  // AUDIT-API-038: Reject unknown event types longer than 100 chars; allow unknown short ones for forward compat
  if (!VALID_EVENT_TYPES.has(eventType) && eventType.length > 100) {
    return res.status(400).json({ error: "invalid eventType" });
  }

  const payload = req.body?.payload && typeof req.body.payload === "object" ? req.body.payload : { value: req.body?.payload };
  const pendingOutboxCount = req.body?.pendingOutboxCount;

  const posDevice = (req as any).posDevice as { deviceId: string; storeId: string };

  res.json({ status: "ok" });
  void logPosEventSafe({
    deviceId: posDevice.deviceId,
    storeId: posDevice.storeId,
    eventType,
    payload,
    pendingOutboxCount
  });
});
