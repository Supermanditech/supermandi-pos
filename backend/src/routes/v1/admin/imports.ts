// SA-P2-008: Bulk Import Notification — admin visibility into retailer CSV import jobs
import { Router } from "express";
import { getPool } from "../../../db/client";
import { requireAdminToken } from "../../../middleware/adminToken";
import { log } from "../../../lib/logger";

export const adminImportsRouter = Router();

// GET /api/v1/admin/imports/status — list recent import jobs across all stores
adminImportsRouter.get("/imports/status", requireAdminToken, async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      return res.status(503).json({ error: "database unavailable" });
    }

    const limit = Math.min(Math.max(parseInt(String(req.query.limit)) || 50, 1), 200);
    const offset = Math.max(parseInt(String(req.query.offset)) || 0, 0);
    const storeId = typeof req.query.storeId === "string" ? req.query.storeId.trim() : "";
    const status = typeof req.query.status === "string" ? req.query.status.trim().toLowerCase() : "";

    const conditions: string[] = [];
    const countParams: (string | number)[] = [];
    const queryParams: (string | number)[] = [];
    let idx = 1;

    if (storeId) {
      conditions.push(`ci.store_id = $${idx}::uuid`);
      countParams.push(storeId);
      queryParams.push(storeId);
      idx++;
    }

    const VALID_STATUSES = new Set(["pending", "validating", "validated", "committing", "committed", "failed"]);
    if (status && VALID_STATUSES.has(status)) {
      conditions.push(`ci.status = $${idx}`);
      countParams.push(status);
      queryParams.push(status);
      idx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const [countResult, result] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int as total FROM platform.csv_imports ci ${where}`,
        countParams
      ),
      pool.query(
        `SELECT
           ci.id,
           ci.store_id,
           s.name AS store_name,
           ci.file_name,
           ci.import_mode,
           ci.status,
           ci.total_rows,
           ci.valid_rows,
           ci.error_rows,
           ci.products_created,
           ci.products_updated,
           ci.suppliers_created,
           ci.validated_at,
           ci.committed_at,
           ci.created_at,
           ci.updated_at
         FROM platform.csv_imports ci
         LEFT JOIN platform.stores s ON s.id = ci.store_id
         ${where}
         ORDER BY ci.created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...queryParams, limit, offset]
      ),
    ]);

    const total = countResult.rows[0]?.total ?? 0;
    const imports = result.rows.map((row) => ({
      id: row.id,
      store_id: row.store_id,
      store_name: row.store_name ?? null,
      file_name: row.file_name,
      import_mode: row.import_mode,
      status: row.status,
      total_rows: row.total_rows,
      valid_rows: row.valid_rows,
      error_rows: row.error_rows,
      products_created: row.products_created,
      products_updated: row.products_updated,
      suppliers_created: row.suppliers_created,
      validated_at: row.validated_at ? new Date(row.validated_at).toISOString() : null,
      committed_at: row.committed_at ? new Date(row.committed_at).toISOString() : null,
      created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
      updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    }));

    return res.json({ imports, total, limit, offset });
  } catch (error) {
    log.error("[AdminImports] Error listing import jobs:", error);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to list import jobs" });
  }
});
