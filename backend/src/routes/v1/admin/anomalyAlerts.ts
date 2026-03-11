// SA-P1-010: Anomaly Alerts — SuperAdmin endpoints
// GET  /admin/anomaly-alerts          — list active alerts (paginated, severity filter)
// POST /admin/anomaly-alerts/:id/acknowledge — acknowledge/dismiss alert
// GET  /admin/anomaly-alerts/summary  — count by severity (for badge display)

import { Router, Request, Response } from "express";
import { requireAdminToken, requirePermission } from "../../../middleware/adminToken";
import { getPool } from "../../../db/client";
import { log } from "../../../lib/logger";

export const adminAnomalyAlertsRouter = Router();

adminAnomalyAlertsRouter.use(requireAdminToken);

// GET /admin/anomaly-alerts/summary — count by severity for badge display
// Must be registered BEFORE the /:id route to avoid path conflicts
adminAnomalyAlertsRouter.get(
  "/anomaly-alerts/summary",
  requirePermission("stores", "read"),
  async (_req: Request, res: Response) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "Database unavailable" });

    try {
      const result = await pool.query(
        `SELECT
           severity,
           COUNT(*)::int AS count
         FROM ai.anomaly_events
         WHERE is_reviewed = false
         GROUP BY severity
         ORDER BY CASE severity
           WHEN 'critical' THEN 1
           WHEN 'warning' THEN 2
           WHEN 'info' THEN 3
           ELSE 4
         END`,
      );

      const summary: Record<string, number> = { critical: 0, warning: 0, info: 0, total: 0 };
      for (const row of result.rows) {
        summary[row.severity] = row.count;
        summary.total += row.count;
      }

      return res.json({ summary });
    } catch (err: unknown) {
      if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "42P01") {
        return res.json({ summary: { critical: 0, warning: 0, info: 0, total: 0 } });
      }
      const msg = err instanceof Error ? err.message : String(err);
      log.error("[Anomaly Alerts] Summary error:", msg);
      return res.status(500).json({ error: "Failed to fetch alert summary" });
    }
  },
);

// GET /admin/anomaly-alerts — list anomaly events (paginated, filterable)
adminAnomalyAlertsRouter.get(
  "/anomaly-alerts",
  requirePermission("stores", "read"),
  async (req: Request, res: Response) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "Database unavailable" });

    const severity = req.query.severity as string | undefined;
    const storeId = req.query.storeId as string | undefined;
    const reviewed = req.query.reviewed as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;

    let query = `
      SELECT
        ae.id, ae.store_id, ae.anomaly_type, ae.severity,
        ae.description, ae.metadata, ae.is_reviewed, ae.detected_at,
        s.name AS store_name
      FROM ai.anomaly_events ae
      LEFT JOIN platform.stores s ON s.id = ae.store_id
      WHERE 1=1
    `;
    const params: (string | number)[] = [];
    let paramIdx = 1;

    if (severity) {
      query += ` AND ae.severity = $${paramIdx++}`;
      params.push(severity.toLowerCase());
    }

    if (storeId) {
      query += ` AND ae.store_id = $${paramIdx++}::uuid`;
      params.push(storeId);
    }

    if (reviewed === "false") {
      query += ` AND ae.is_reviewed = false`;
    } else if (reviewed === "true") {
      query += ` AND ae.is_reviewed = true`;
    }

    query += ` ORDER BY ae.detected_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(limit, offset);

    // Count query
    let countQuery = `SELECT COUNT(*)::int AS total FROM ai.anomaly_events ae WHERE 1=1`;
    const countParams: (string | number)[] = [];
    let countIdx = 1;

    if (severity) {
      countQuery += ` AND ae.severity = $${countIdx++}`;
      countParams.push(severity.toLowerCase());
    }
    if (storeId) {
      countQuery += ` AND ae.store_id = $${countIdx++}::uuid`;
      countParams.push(storeId);
    }
    if (reviewed === "false") {
      countQuery += ` AND ae.is_reviewed = false`;
    } else if (reviewed === "true") {
      countQuery += ` AND ae.is_reviewed = true`;
    }

    try {
      const [alertsResult, countResult] = await Promise.all([
        pool.query(query, params),
        pool.query(countQuery, countParams),
      ]);

      return res.json({
        alerts: alertsResult.rows.map((r: Record<string, unknown>) => ({
          id: r.id,
          storeId: r.store_id,
          storeName: r.store_name,
          anomalyType: r.anomaly_type,
          severity: r.severity,
          description: r.description,
          metadata: r.metadata,
          isReviewed: r.is_reviewed,
          detectedAt: r.detected_at,
        })),
        pagination: {
          total: countResult.rows[0]?.total || 0,
          limit,
          offset,
        },
      });
    } catch (err: unknown) {
      if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "42P01") {
        return res.json({ alerts: [], pagination: { total: 0, limit, offset } });
      }
      const msg = err instanceof Error ? err.message : String(err);
      log.error("[Anomaly Alerts] List error:", msg);
      return res.status(500).json({ error: "Failed to list anomaly alerts" });
    }
  },
);

// POST /admin/anomaly-alerts/:id/acknowledge — mark an anomaly event as reviewed
adminAnomalyAlertsRouter.post(
  "/anomaly-alerts/:id/acknowledge",
  requirePermission("stores", "update"),
  async (req: Request, res: Response) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "Database unavailable" });

    const { id } = req.params;

    try {
      const result = await pool.query(
        `UPDATE ai.anomaly_events
         SET is_reviewed = true
         WHERE id = $1::uuid AND is_reviewed = false
         RETURNING id, is_reviewed AS "isReviewed"`,
        [id],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Alert not found or already reviewed" });
      }

      return res.json({ alert: result.rows[0] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error("[Anomaly Alerts] Acknowledge error:", msg);
      return res.status(500).json({ error: "Failed to acknowledge alert" });
    }
  },
);
