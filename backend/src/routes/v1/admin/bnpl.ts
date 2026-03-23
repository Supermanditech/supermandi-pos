// GCP-STG-0411: Admin BNPL Management — SuperMandi as Credit Provider
// Endpoints for reviewing and approving/rejecting BNPL credit applications

import { Router, Request, Response } from "express";
import { getPool } from "../../../db/client";
import { requireAdminToken, requirePermission } from "../../../middleware/adminToken";
import { log } from "../../../lib/logger";
import { asError } from "../../../lib/errorUtils";

export const adminBnplRouter = Router();

// =============================================================================
// GET /api/v1/admin/bnpl/applications
// List pending BNPL credit applications
// =============================================================================
adminBnplRouter.get(
  "/bnpl/applications",
  requireAdminToken,
  requirePermission("stores", "read"),
  async (req: Request, res: Response) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "database unavailable" });

    const status = (req.query.status as string) || "pending";
    const limit = Math.min(parseInt(String(req.query.limit)) || 50, 100);
    const offset = Math.max(parseInt(String(req.query.offset)) || 0, 0);

    try {
      const result = await pool.query(
        `SELECT
          ba.id,
          ba.store_id AS "storeId",
          s.name AS "storeName",
          s.store_code AS "storeCode",
          ba.business_name AS "businessName",
          ba.gstin,
          ba.requested_amount_minor AS "requestedAmountMinor",
          ba.status,
          ba.reviewed_by AS "reviewedBy",
          ba.reviewed_at AS "reviewedAt",
          ba.notes,
          ba.created_at AS "createdAt"
        FROM payments.bnpl_applications ba
        LEFT JOIN platform.stores s ON s.id = ba.store_id
        WHERE ba.status = $1
        ORDER BY ba.created_at ASC
        LIMIT $2 OFFSET $3`,
        [status, limit, offset]
      );

      const countResult = await pool.query(
        `SELECT COUNT(*)::int AS total FROM payments.bnpl_applications WHERE status = $1`,
        [status]
      );

      return res.json({
        data: result.rows,
        total: Number(countResult.rows[0]?.total || 0),
      });
    } catch (_error: unknown) {
      const error = asError(_error);
      log.error("[Admin BNPL] List applications error:", error.message);
      return res.status(500).json({ error: "Failed to list BNPL applications" });
    }
  }
);

// =============================================================================
// POST /api/v1/admin/bnpl/applications/:id/approve
// Approve a BNPL application — creates or updates credit line for the store
// =============================================================================
adminBnplRouter.post(
  "/bnpl/applications/:id/approve",
  requireAdminToken,
  requirePermission("stores", "write"),
  async (req: Request, res: Response) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "database unavailable" });

    const { id } = req.params;
    const { approvedLimitMinor, notes } = req.body;
    const adminId = (req as any).adminUser?.id ?? null;

    if (!approvedLimitMinor || typeof approvedLimitMinor !== "number" || approvedLimitMinor <= 0) {
      return res.status(400).json({ error: "approvedLimitMinor must be a positive number" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const appResult = await client.query(
        `SELECT id, store_id, status, requested_amount_minor
         FROM payments.bnpl_applications WHERE id = $1`,
        [id]
      );

      if (appResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Application not found" });
      }

      const app = appResult.rows[0];

      if (app.status !== "pending") {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error: `Cannot approve application in '${app.status}' status`,
        });
      }

      // Update application status
      await client.query(
        `UPDATE payments.bnpl_applications
         SET status = 'approved', reviewed_by = $1, reviewed_at = NOW(), notes = COALESCE($2, notes)
         WHERE id = $3`,
        [adminId, notes ?? null, id]
      );

      // Upsert credit line for the store
      await client.query(
        `INSERT INTO payments.bnpl_credit_lines (store_id, approved_limit_minor, status, approved_by, approved_at)
         VALUES ($1, $2, 'approved', $3, NOW())
         ON CONFLICT (store_id) DO UPDATE
         SET approved_limit_minor = $2, status = 'approved', approved_by = $3, approved_at = NOW(), updated_at = NOW()`,
        [app.store_id, approvedLimitMinor, adminId]
      );

      await client.query("COMMIT");

      log.info(`[GCP-STG-0411] BNPL application ${id} approved: store=${app.store_id}, limit=${approvedLimitMinor}`);

      return res.json({
        success: true,
        data: {
          applicationId: id,
          storeId: app.store_id,
          status: "approved",
          approvedLimitMinor,
        },
      });
    } catch (_error: unknown) {
      const error = asError(_error);
      await client.query("ROLLBACK").catch(() => {});
      log.error("[Admin BNPL] Approve error:", error.message);
      return res.status(500).json({ error: "Failed to approve BNPL application" });
    } finally {
      client.release();
    }
  }
);

// =============================================================================
// POST /api/v1/admin/bnpl/applications/:id/reject
// Reject a BNPL application with reason
// =============================================================================
adminBnplRouter.post(
  "/bnpl/applications/:id/reject",
  requireAdminToken,
  requirePermission("stores", "write"),
  async (req: Request, res: Response) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "database unavailable" });

    const { id } = req.params;
    const { notes } = req.body;
    const adminId = (req as any).adminUser?.id ?? null;

    if (!notes || typeof notes !== "string" || notes.trim().length === 0) {
      return res.status(400).json({ error: "Rejection notes are required" });
    }

    try {
      const appResult = await pool.query(
        `SELECT id, status FROM payments.bnpl_applications WHERE id = $1`,
        [id]
      );

      if (appResult.rows.length === 0) {
        return res.status(404).json({ error: "Application not found" });
      }

      if (appResult.rows[0].status !== "pending") {
        return res.status(400).json({
          error: `Cannot reject application in '${appResult.rows[0].status}' status`,
        });
      }

      await pool.query(
        `UPDATE payments.bnpl_applications
         SET status = 'rejected', reviewed_by = $1, reviewed_at = NOW(), notes = $2
         WHERE id = $3`,
        [adminId, notes.trim(), id]
      );

      log.info(`[GCP-STG-0411] BNPL application ${id} rejected`);

      return res.json({
        success: true,
        data: { applicationId: id, status: "rejected", notes: notes.trim() },
      });
    } catch (_error: unknown) {
      const error = asError(_error);
      log.error("[Admin BNPL] Reject error:", error.message);
      return res.status(500).json({ error: "Failed to reject BNPL application" });
    }
  }
);
