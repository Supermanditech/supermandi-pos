// SA-P1-004: GRN Excess Receipt Alerts — SuperAdmin endpoints
import { Router } from "express";
import { requireAdminToken, requirePermission } from "../../../middleware/adminToken";
import { getPool } from "../../../db/client";
import { log } from "../../../lib/logger";

export const adminGrnAlertsRouter = Router();

adminGrnAlertsRouter.use(requireAdminToken);

// GET /admin/grn/alerts — list GRN excess receipt alerts (paginated, filterable)
adminGrnAlertsRouter.get(
  "/grn/alerts",
  requirePermission("stores", "read"),
  async (req, res) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "Database unavailable" });

    const status = req.query.status as string | undefined;
    const storeId = req.query.storeId as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;

    let query = `
      SELECT
        a.id, a.store_id, a.purchase_order_id, a.order_item_id, a.receive_id,
        a.product_name, a.ordered_qty, a.total_received_qty,
        a.excess_qty, a.excess_pct,
        a.status, a.acknowledged_by, a.acknowledged_at, a.notes,
        a.created_at,
        s.name AS store_name,
        po.order_number
      FROM platform.grn_excess_alerts a
      LEFT JOIN platform.stores s ON s.id = a.store_id
      LEFT JOIN orders.purchase_orders po ON po.id = a.purchase_order_id
      WHERE 1=1
    `;
    const params: (string | number)[] = [];
    let paramIdx = 1;

    if (status) {
      query += ` AND a.status = $${paramIdx++}`;
      params.push(status.toUpperCase());
    }

    if (storeId) {
      query += ` AND a.store_id = $${paramIdx++}::uuid`;
      params.push(storeId);
    }

    query += ` ORDER BY a.created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(limit, offset);

    // Count query for pagination
    let countQuery = `
      SELECT COUNT(*)::int AS total
      FROM platform.grn_excess_alerts a
      WHERE 1=1
    `;
    const countParams: (string | number)[] = [];
    let countIdx = 1;

    if (status) {
      countQuery += ` AND a.status = $${countIdx++}`;
      countParams.push(status.toUpperCase());
    }
    if (storeId) {
      countQuery += ` AND a.store_id = $${countIdx++}::uuid`;
      countParams.push(storeId);
    }

    try {
      const [alertsResult, countResult] = await Promise.all([
        pool.query(query, params),
        pool.query(countQuery, countParams),
      ]);

      // Also get count of OPEN alerts for badge
      const openCountResult = await pool.query(
        `SELECT COUNT(*)::int AS open_count FROM platform.grn_excess_alerts WHERE status = 'OPEN'`
      );

      return res.json({
        alerts: alertsResult.rows,
        pagination: {
          total: countResult.rows[0]?.total || 0,
          limit,
          offset,
        },
        openCount: openCountResult.rows[0]?.open_count || 0,
      });
    } catch (err: unknown) {
      // Table may not exist yet if migration hasn't run
      if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "42P01") {
        return res.json({ alerts: [], pagination: { total: 0, limit, offset }, openCount: 0 });
      }
      const msg = err instanceof Error ? err.message : String(err);
      log.error("[Admin GRN Alerts] List error:", msg);
      return res.status(500).json({ error: "Failed to list GRN alerts" });
    }
  }
);

// PATCH /admin/grn/alerts/:alertId — acknowledge or dismiss an alert
adminGrnAlertsRouter.patch(
  "/grn/alerts/:alertId",
  requirePermission("stores", "update"),
  async (req, res) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "Database unavailable" });

    const { alertId } = req.params;
    const { status, notes } = req.body;

    if (!status || !["ACKNOWLEDGED", "DISMISSED"].includes(status)) {
      return res.status(400).json({
        error: "status must be 'ACKNOWLEDGED' or 'DISMISSED'",
      });
    }

    const adminUserId = (req as { adminId?: string }).adminId || null;

    try {
      const result = await pool.query(
        `UPDATE platform.grn_excess_alerts
         SET status = $1, acknowledged_by = $2, acknowledged_at = NOW(), notes = COALESCE($3, notes)
         WHERE id = $4::uuid AND status = 'OPEN'
         RETURNING id, status, acknowledged_at`,
        [status, adminUserId, notes || null, alertId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: "Alert not found or already resolved",
        });
      }

      return res.json({ alert: result.rows[0] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error("[Admin GRN Alerts] Update error:", msg);
      return res.status(500).json({ error: "Failed to update GRN alert" });
    }
  }
);
