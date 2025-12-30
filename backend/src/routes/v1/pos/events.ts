import { Router } from "express";
import { requireDeviceToken } from "../../../middleware/deviceToken";
import { logPosEventSafe } from "../../../services/posEventLogger";

export const posEventsRouter = Router();

// POST /api/v1/pos/events
// Fire-and-forget: must NEVER crash POS.
posEventsRouter.post("/events", requireDeviceToken, async (req, res) => {
  const eventType = typeof req.body?.eventType === "string" ? req.body.eventType.trim() : "";
  if (!eventType) {
    return res.status(400).json({ error: "eventType is required" });
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
