import { Router } from "express";
import { fetchLatestPosEvents } from "../../../services/posEventLogger";

export const adminPosEventsRouter = Router();

// GET /api/v1/admin/pos/events?limit=100
// Returns an array (SuperAdmin expects an array, not an object wrapper).
adminPosEventsRouter.get("/pos/events", async (req, res, next) => {
  try {
    const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
    const limit = Math.min(500, Math.max(1, limitRaw ?? 100));
    const events = await fetchLatestPosEvents({ limit });
    res.json(events);
  } catch (e) {
    next(e);
  }
});
