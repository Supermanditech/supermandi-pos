import { Router } from "express";
import { logPosEventSafe } from "../../../services/posEventLogger";

export const posEventsRouter = Router();

// POST /api/v1/pos/events
// Fire-and-forget: must NEVER crash POS.
posEventsRouter.post("/events", (req, res) => {
  res.json({ status: "ok" });
  void logPosEventSafe(req.body);
});
