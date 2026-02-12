// GL-CRIT-0049: Admin Audit Log API
// Provides endpoints to fetch audit logs for the SuperAdmin UI

import { Router } from "express";
import { requireAdminToken } from "../../../middleware/adminToken";
import { getPool } from "../../../db/client";

export const adminAuditRouter = Router();

adminAuditRouter.use(requireAdminToken);

// AUDIT-API-015: PII fields to redact from request_body before returning
const PII_FIELDS = new Set([
  "pan_number", "pan", "aadhaar", "aadhaar_number",
  "password", "new_password", "old_password", "confirm_password",
  "otp", "otp_code", "verification_code",
  "bank_account", "account_number", "ifsc",
  "device_token", "token", "id_token", "refresh_token",
]);

function redactPII(body: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!body || typeof body !== "object") return body;
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (PII_FIELDS.has(key.toLowerCase())) {
      redacted[key] = "[REDACTED]";
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      redacted[key] = redactPII(value as Record<string, unknown>);
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

export interface AuditLogRecord {
  id: string;
  actor_user_id: string | null;
  actor_ip: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  store_id: string | null;
  request_body: Record<string, unknown> | null;
  response_status: number | null;
  error_message: string | null;
  created_at: string;
}

// GET /api/v1/admin/audit - Fetch audit logs
adminAuditRouter.get("/audit", async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const {
    limit = "100",
    offset = "0",
    action,
    resource_type,
    resource_id,
    store_id,
    from_date,
    to_date,
  } = req.query as Record<string, string>;

  try {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (action) {
      conditions.push(`action = $${paramIndex++}`);
      values.push(action);
    }

    if (resource_type) {
      conditions.push(`resource_type = $${paramIndex++}`);
      values.push(resource_type);
    }

    if (resource_id) {
      conditions.push(`resource_id = $${paramIndex++}`);
      values.push(resource_id);
    }

    if (store_id) {
      conditions.push(`store_id = $${paramIndex++}::uuid`);
      values.push(store_id);
    }

    if (from_date) {
      conditions.push(`created_at >= $${paramIndex++}::timestamptz`);
      values.push(from_date);
    }

    if (to_date) {
      conditions.push(`created_at <= $${paramIndex++}::timestamptz`);
      values.push(to_date);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limitNum = Math.min(parseInt(limit, 10) || 100, 500);
    const offsetNum = parseInt(offset, 10) || 0;

    values.push(limitNum, offsetNum);

    const result = await pool.query<AuditLogRecord>(
      `SELECT
        id::TEXT,
        actor_user_id::TEXT,
        actor_ip,
        action,
        resource_type,
        resource_id,
        store_id::TEXT,
        request_body,
        response_status,
        error_message,
        created_at
      FROM admin.audit_log
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex++}
      OFFSET $${paramIndex++}`,
      values
    );

    // Get total count for pagination
    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM admin.audit_log ${whereClause}`,
      values.slice(0, -2) // Remove limit and offset
    );

    // AUDIT-API-015: Redact PII from request_body before returning
    const redactedLogs = result.rows.map((row) => ({
      ...row,
      request_body: redactPII(row.request_body),
    }));

    return res.json({
      logs: redactedLogs,
      total: parseInt(countResult.rows[0]?.total || "0", 10),
      limit: limitNum,
      offset: offsetNum,
    });
  } catch (error: unknown) {
    console.error("[admin/audit] Failed to fetch audit logs:", error);
    return res.status(500).json({ error: "fetch_audit_failed" });
  }
});

// GET /api/v1/admin/audit/stats - Get audit statistics
adminAuditRouter.get("/audit/stats", async (_req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  try {
    // Get action counts for last 24 hours
    const actionStats = await pool.query(`
      SELECT action, COUNT(*) as count
      FROM admin.audit_log
      WHERE created_at > NOW() - INTERVAL '24 hours'
      GROUP BY action
      ORDER BY count DESC
      LIMIT 20
    `);

    // Get total counts
    const totalStats = await pool.query(`
      SELECT
        COUNT(*) as total_logs,
        COUNT(CASE WHEN response_status >= 400 THEN 1 END) as error_count,
        COUNT(DISTINCT actor_user_id) as unique_actors
      FROM admin.audit_log
      WHERE created_at > NOW() - INTERVAL '24 hours'
    `);

    return res.json({
      actions: actionStats.rows,
      summary: totalStats.rows[0] || { total_logs: 0, error_count: 0, unique_actors: 0 },
    });
  } catch (error: unknown) {
    console.error("[admin/audit] Failed to fetch audit stats:", error);
    return res.status(500).json({ error: "fetch_audit_stats_failed" });
  }
});
