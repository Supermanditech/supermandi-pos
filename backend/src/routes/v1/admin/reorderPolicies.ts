// SA-P1-015: Reorder Policy Supervision — SuperAdmin endpoints
// Read-only view of reorder policies and audit log across all stores
import { Router } from "express";
import { requireAdminToken, requirePermission } from "../../../middleware/adminToken";
import { getPool } from "../../../db/client";
import { log } from "../../../lib/logger";
import { asError } from "../../../lib/errorUtils";

export const adminReorderPoliciesRouter = Router();

adminReorderPoliciesRouter.use(requireAdminToken);

// =============================================================================
// GET /admin/reorder/policies — list all reorder policies across stores
// =============================================================================
adminReorderPoliciesRouter.get(
  "/reorder/policies",
  requirePermission("stores", "read"),
  async (req, res) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "Database unavailable" });

    const storeId = req.query.storeId as string | undefined;
    const enabledOnly = req.query.enabledOnly === "true";
    const limit = Math.min(Math.max(parseInt(String(req.query.limit)) || 50, 1), 200);
    const offset = Math.max(parseInt(String(req.query.offset)) || 0, 0);

    try {
      const params: unknown[] = [];
      let paramIdx = 1;

      const conditions: string[] = [];
      if (storeId) {
        conditions.push(`rp.store_id = $${paramIdx++}::uuid`);
        params.push(storeId);
      }
      if (enabledOnly) {
        conditions.push(`rp.is_enabled = true`);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      const countQuery = `SELECT COUNT(*)::int AS total FROM reorder.reorder_policies rp ${whereClause}`;
      const dataQuery = `
        SELECT
          rp.id,
          rp.store_id,
          s.name AS store_name,
          rp.product_id,
          p.name AS product_name,
          rp.min_stock,
          rp.target_stock,
          rp.max_reorder_qty,
          rp.preferred_supplier_id,
          sup.business_name AS supplier_name,
          rp.is_enabled,
          rp.created_by_user_id,
          rp.created_at,
          rp.updated_at
        FROM reorder.reorder_policies rp
        LEFT JOIN platform.stores s ON s.id = rp.store_id
        LEFT JOIN catalog.products p ON p.id = rp.product_id
        LEFT JOIN supplier.suppliers sup ON sup.id = rp.preferred_supplier_id
        ${whereClause}
        ORDER BY rp.updated_at DESC
        LIMIT $${paramIdx++} OFFSET $${paramIdx++}
      `;
      params.push(limit, offset);

      // Count query uses fewer params (no limit/offset)
      const countParams = storeId ? [storeId] : [];

      const [countResult, dataResult] = await Promise.all([
        pool.query(countQuery, countParams),
        pool.query(dataQuery, params),
      ]);

      const total = countResult.rows[0]?.total ?? 0;

      return res.json({
        policies: dataResult.rows.map((row: any) => ({
          id: row.id,
          storeId: row.store_id,
          storeName: row.store_name ?? null,
          productId: row.product_id,
          productName: row.product_name ?? null,
          minStock: row.min_stock,
          targetStock: row.target_stock,
          maxReorderQty: row.max_reorder_qty ?? null,
          preferredSupplierId: row.preferred_supplier_id ?? null,
          supplierName: row.supplier_name ?? null,
          isEnabled: row.is_enabled,
          createdByUserId: row.created_by_user_id ?? null,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        })),
        pagination: { total, limit, offset },
      });
    } catch (_error: unknown) {
      const error = asError(_error);
      log.error("[admin/reorder/policies] Query failed:", error?.message);
      return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch reorder policies" });
    }
  }
);

// =============================================================================
// GET /admin/reorder/policies/audit-log — audit log of policy changes
// =============================================================================
adminReorderPoliciesRouter.get(
  "/reorder/policies/audit-log",
  requirePermission("stores", "read"),
  async (req, res) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "Database unavailable" });

    const storeId = req.query.storeId as string | undefined;
    const limit = Math.min(Math.max(parseInt(String(req.query.limit)) || 50, 1), 200);
    const offset = Math.max(parseInt(String(req.query.offset)) || 0, 0);

    try {
      // Use the platform audit_log table which records all mutations via adminAuditMiddleware
      // Also query reorder_policies timestamps to reconstruct change history
      const params: unknown[] = [];
      let paramIdx = 1;

      const conditions: string[] = [
        `(al.route LIKE '%reorder%policy%' OR al.route LIKE '%reorder%policies%')`
      ];

      if (storeId) {
        conditions.push(`al.entity_id = $${paramIdx++}`);
        params.push(storeId);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      // Try audit_log table first; fall back to a synthetic log from reorder_policies timestamps
      let auditEntries: any[] = [];
      let total = 0;

      try {
        const countQuery = `SELECT COUNT(*)::int AS total FROM platform.audit_log al ${whereClause}`;
        const dataQuery = `
          SELECT
            al.id,
            al.admin_id,
            al.admin_email,
            al.method,
            al.route,
            al.status_code,
            al.entity_type,
            al.entity_id,
            al.changes,
            al.created_at
          FROM platform.audit_log al
          ${whereClause}
          ORDER BY al.created_at DESC
          LIMIT $${paramIdx++} OFFSET $${paramIdx++}
        `;

        const countParams = storeId ? [storeId] : [];
        const dataParams = [...params, limit, offset];

        const [countResult, dataResult] = await Promise.all([
          pool.query(countQuery, countParams),
          pool.query(dataQuery, dataParams),
        ]);

        total = countResult.rows[0]?.total ?? 0;
        auditEntries = dataResult.rows.map((row: any) => ({
          id: row.id,
          adminId: row.admin_id ?? null,
          adminEmail: row.admin_email ?? null,
          method: row.method,
          route: row.route,
          statusCode: row.status_code,
          entityType: row.entity_type ?? null,
          entityId: row.entity_id ?? null,
          changes: row.changes ?? null,
          createdAt: row.created_at,
        }));
      } catch {
        // audit_log table may not have reorder entries; fall back to synthetic log
        log.info("[admin/reorder/policies/audit-log] Audit log query failed, using synthetic log");

        const fallbackConditions: string[] = [];
        const fallbackParams: unknown[] = [];
        let fbParamIdx = 1;

        if (storeId) {
          fallbackConditions.push(`rp.store_id = $${fbParamIdx++}::uuid`);
          fallbackParams.push(storeId);
        }

        const fbWhere = fallbackConditions.length > 0 ? `WHERE ${fallbackConditions.join(" AND ")}` : "";

        const fbCountQuery = `SELECT COUNT(*)::int AS total FROM reorder.reorder_policies rp ${fbWhere}`;
        const fbDataQuery = `
          SELECT
            rp.id,
            rp.store_id,
            s.name AS store_name,
            rp.product_id,
            p.name AS product_name,
            rp.created_by_user_id,
            rp.created_at,
            rp.updated_at,
            CASE WHEN rp.created_at = rp.updated_at THEN 'created' ELSE 'updated' END AS action
          FROM reorder.reorder_policies rp
          LEFT JOIN platform.stores s ON s.id = rp.store_id
          LEFT JOIN catalog.products p ON p.id = rp.product_id
          ${fbWhere}
          ORDER BY rp.updated_at DESC
          LIMIT $${fbParamIdx++} OFFSET $${fbParamIdx++}
        `;

        const fbCountParams = storeId ? [storeId] : [];
        const fbDataParams = [...fallbackParams, limit, offset];

        const [fbCountResult, fbDataResult] = await Promise.all([
          pool.query(fbCountQuery, fbCountParams),
          pool.query(fbDataQuery, fbDataParams),
        ]);

        total = fbCountResult.rows[0]?.total ?? 0;
        auditEntries = fbDataResult.rows.map((row: any) => ({
          id: row.id,
          adminId: row.created_by_user_id ?? null,
          adminEmail: null,
          method: row.action === "created" ? "POST" : "PUT",
          route: `/reorder/policies/${row.id}`,
          statusCode: row.action === "created" ? 201 : 200,
          entityType: "reorder_policy",
          entityId: row.store_id,
          storeName: row.store_name ?? null,
          productName: row.product_name ?? null,
          changes: null,
          createdAt: row.updated_at,
        }));
      }

      return res.json({
        auditLog: auditEntries,
        pagination: { total, limit, offset },
      });
    } catch (_error: unknown) {
      const error = asError(_error);
      log.error("[admin/reorder/policies/audit-log] Query failed:", error?.message);
      return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch reorder policy audit log" });
    }
  }
);
