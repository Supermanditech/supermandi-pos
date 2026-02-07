/**
 * RO-007: Registration Events Admin Endpoint
 *
 * GET /api/v1/admin/registration-events
 *
 * Provides SuperAdmin visibility into all registration activity
 * across surfaces (Portal, POS Device, POS Mobile).
 * Supports filtering by source, outcome, store, and date range.
 */

import { Router } from "express";
import { requireAdminToken, requirePermission } from "../../../middleware/adminToken";
import { getPool } from "../../../db/client";

export const adminRegistrationEventsRouter = Router();

adminRegistrationEventsRouter.use(requireAdminToken);

/**
 * GET /api/v1/admin/registration-events
 *
 * Query params:
 *   limit   - max rows (default 50, max 200)
 *   offset  - pagination offset (default 0)
 *   source  - filter by source (PORTAL, POS_DEVICE, POS_MOBILE, ADMIN)
 *   outcome - filter by outcome (SUCCESS, IDEMPOTENT, BLOCKED, ERROR)
 *   storeId - filter by store UUID
 *   from    - ISO date (created_at >= from)
 *   to      - ISO date (created_at <= to)
 */
adminRegistrationEventsRouter.get(
  "/registration-events",
  requirePermission("stores:read"),
  async (req, res) => {
    const pool = getPool();
    if (!pool) {
      return res.status(503).json({ error: "DATABASE_UNAVAILABLE" });
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
    const source = req.query.source as string | undefined;
    const outcome = req.query.outcome as string | undefined;
    const storeId = req.query.storeId as string | undefined;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;

    // Build WHERE clause
    const conditions: string[] = [];
    const params: (string | number)[] = [];
    let paramIdx = 1;

    if (source) {
      conditions.push(`re.source = $${paramIdx++}`);
      params.push(source);
    }
    if (outcome) {
      conditions.push(`re.outcome = $${paramIdx++}`);
      params.push(outcome);
    }
    if (storeId) {
      conditions.push(`re.store_id = $${paramIdx++}::uuid`);
      params.push(storeId);
    }
    if (from) {
      conditions.push(`re.created_at >= $${paramIdx++}::timestamptz`);
      params.push(from);
    }
    if (to) {
      conditions.push(`re.created_at <= $${paramIdx++}::timestamptz`);
      params.push(to);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    try {
      // Count query
      const countResult = await pool.query(
        `SELECT COUNT(*) as total FROM auth.registration_events re ${whereClause}`,
        params
      );
      const total = parseInt(countResult.rows[0].total);

      // Data query with store name join
      const dataResult = await pool.query(
        `SELECT
          re.id,
          re.store_id,
          re.user_id,
          re.source,
          re.outcome,
          re.error_code,
          re.ip_address,
          re.user_agent,
          re.device_meta,
          re.phone,
          re.business_name,
          re.gstin,
          re.created_at,
          s.name as store_name,
          s.code as store_code
        FROM auth.registration_events re
        LEFT JOIN platform.stores s ON s.id = re.store_id
        ${whereClause}
        ORDER BY re.created_at DESC
        LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
        [...params, limit, offset]
      );

      return res.json({
        events: dataResult.rows.map((row) => ({
          id: row.id,
          storeId: row.store_id,
          storeName: row.store_name || null,
          storeCode: row.store_code || null,
          userId: row.user_id,
          source: row.source,
          outcome: row.outcome,
          errorCode: row.error_code || null,
          ipAddress: row.ip_address || null,
          userAgent: row.user_agent || null,
          deviceMeta: row.device_meta || null,
          phone: row.phone,
          businessName: row.business_name,
          gstin: row.gstin || null,
          createdAt: row.created_at,
        })),
        pagination: { total, limit, offset },
      });
    } catch (err: any) {
      console.error("[admin/registration-events] Query failed:", err?.message);
      return res.status(500).json({ error: "QUERY_FAILED" });
    }
  }
);

/**
 * GET /api/v1/admin/registration-events/summary
 *
 * Returns aggregate counts by source and outcome for a dashboard widget.
 * Optional date range via from/to query params.
 */
adminRegistrationEventsRouter.get(
  "/registration-events/summary",
  requirePermission("stores:read"),
  async (req, res) => {
    const pool = getPool();
    if (!pool) {
      return res.status(503).json({ error: "DATABASE_UNAVAILABLE" });
    }

    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;

    const conditions: string[] = [];
    const params: string[] = [];
    let paramIdx = 1;

    if (from) {
      conditions.push(`created_at >= $${paramIdx++}::timestamptz`);
      params.push(from);
    }
    if (to) {
      conditions.push(`created_at <= $${paramIdx++}::timestamptz`);
      params.push(to);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    try {
      const result = await pool.query(
        `SELECT
          source,
          outcome,
          COUNT(*) as count
        FROM auth.registration_events
        ${whereClause}
        GROUP BY source, outcome
        ORDER BY source, outcome`,
        params
      );

      // Aggregate into structured format
      const bySource: Record<string, Record<string, number>> = {};
      let total = 0;

      for (const row of result.rows) {
        const src = row.source;
        const out = row.outcome;
        const cnt = parseInt(row.count);
        if (!bySource[src]) bySource[src] = {};
        bySource[src][out] = cnt;
        total += cnt;
      }

      return res.json({
        total,
        bySource,
      });
    } catch (err: any) {
      console.error("[admin/registration-events/summary] Query failed:", err?.message);
      return res.status(500).json({ error: "QUERY_FAILED" });
    }
  }
);
