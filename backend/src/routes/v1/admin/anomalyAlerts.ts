/**
 * SA-P1-010: Anomaly Alerts Admin API
 *
 * GET  /anomaly-alerts          — paginated list with severity/store/reviewed filters
 * GET  /anomaly-alerts/summary  — count by severity
 * POST /anomaly-alerts/:id/acknowledge — mark as reviewed
 *
 * All endpoints require admin auth.
 */

import { Router, Request, Response } from "express";
import { requireAdminToken } from "../../../middleware/adminToken";
import {
  getAnomalyAlerts,
  getAlertSummary,
  acknowledgeAlert,
} from "../../../services/ai/anomalyAlertingService";
import { log } from "../../../lib/logger";

export const adminAnomalyAlertsRouter = Router();

adminAnomalyAlertsRouter.use(requireAdminToken);

// GET /admin/anomaly-alerts — paginated list
adminAnomalyAlertsRouter.get("/anomaly-alerts", async (req: Request, res: Response) => {
  try {
    const severity = req.query.severity as string | undefined;
    const storeId = req.query.storeId as string | undefined;
    const reviewedParam = req.query.reviewed as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;

    const reviewed = reviewedParam === "true" ? true : reviewedParam === "false" ? false : undefined;

    const result = await getAnomalyAlerts({ severity, storeId, reviewed, limit, offset });
    return res.json({ success: true, data: result.alerts, total: result.total });
  } catch (err) {
    log.error("[AnomalyAlerts] List error:", err);
    return res.status(500).json({ error: "Failed to fetch anomaly alerts" });
  }
});

// GET /admin/anomaly-alerts/summary — count by severity
adminAnomalyAlertsRouter.get("/anomaly-alerts/summary", async (_req: Request, res: Response) => {
  try {
    const summary = await getAlertSummary();
    return res.json({ success: true, data: summary });
  } catch (err) {
    log.error("[AnomalyAlerts] Summary error:", err);
    return res.status(500).json({ error: "Failed to fetch alert summary" });
  }
});

// POST /admin/anomaly-alerts/:id/acknowledge — mark as reviewed
adminAnomalyAlertsRouter.post("/anomaly-alerts/:id/acknowledge", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: "Alert ID is required" });
    }

    const updated = await acknowledgeAlert(id);
    if (!updated) {
      return res.status(404).json({ error: "Alert not found" });
    }

    return res.json({ success: true });
  } catch (err) {
    log.error("[AnomalyAlerts] Acknowledge error:", err);
    return res.status(500).json({ error: "Failed to acknowledge alert" });
  }
});
