import { Router } from "express";
import { fetchLatestPosEvents } from "../../../services/posEventLogger";
import { requireAdminToken } from "../../../middleware/adminToken";

export const adminPosEventsRouter = Router();

// Apply admin auth to all routes in this router
adminPosEventsRouter.use(requireAdminToken);

// GET /api/v1/admin/pos/events?limit=100&storeId=...&deviceId=...&eventType=...&from=...&to=...
// Returns an array (SuperAdmin expects an array, not an object wrapper).
adminPosEventsRouter.get("/pos/events", async (req, res, next) => {
  try {
    const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
    const limit = Math.min(500, Math.max(1, limitRaw ?? 100));
    const storeId = typeof req.query.storeId === "string" ? req.query.storeId.trim() : undefined;
    const deviceId = typeof req.query.deviceId === "string" ? req.query.deviceId.trim() : undefined;
    const eventType = typeof req.query.eventType === "string" ? req.query.eventType.trim() : undefined;
    const from = typeof req.query.from === "string" ? req.query.from.trim() : undefined;
    const to = typeof req.query.to === "string" ? req.query.to.trim() : undefined;
    const events = await fetchLatestPosEvents({ limit, storeId: storeId || undefined, deviceId: deviceId || undefined, eventType: eventType || undefined, from: from || undefined, to: to || undefined });
    res.json(events);
  } catch (e) {
    next(e);
  }
});
