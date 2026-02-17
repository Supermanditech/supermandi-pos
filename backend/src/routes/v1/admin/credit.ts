// CL-020: SuperAdmin Credit Approval Routes
// Removes auto-approve from POS credit flow, requires SuperAdmin review
// Provides endpoints for reviewing and approving/rejecting credit applications

import { Router, Request, Response } from "express";
import { getPool } from "../../../db/client";
import { requireAdminToken, requirePermission } from "../../../middleware/adminToken";
import { log } from "../../../lib/logger";
import { asError } from "../../../lib/errorUtils";

export const adminCreditRouter = Router();

// =============================================================================
// GET /api/v1/admin/credit/applications
// List credit applications pending approval
// =============================================================================
adminCreditRouter.get(
  "/credit/applications",
  requireAdminToken,
  requirePermission("stores", "read"),
  async (req: Request, res: Response) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "database unavailable" });

    const status = (req.query.status as string) || "kyc_verified";
    const limit = Math.min(parseInt(String(req.query.limit)) || 50, 100);
    const offset = Math.max(parseInt(String(req.query.offset)) || 0, 0);

    try {
      const result = await pool.query(
        `SELECT
          ca.id,
          ca.store_id as "storeId",
          s.name as "storeName",
          s.store_code as "storeCode",
          ca.requested_amount_minor as "requestedAmountMinor",
          ca.approved_amount_minor as "approvedAmountMinor",
          ca.kyc_status as "kycStatus",
          ca.status,
          ca.pan_number as "panNumber",
          ca.aadhaar_last4 as "aadhaarLast4",
          ca.created_at as "createdAt",
          ca.updated_at as "updatedAt"
        FROM payments.credit_applications ca
        JOIN platform.stores s ON s.id = ca.store_id
        WHERE ca.status = $1
        ORDER BY ca.created_at ASC
        LIMIT $2 OFFSET $3`,
        [status, limit, offset]
      );

      const countResult = await pool.query(
        `SELECT COUNT(*)::int as total FROM payments.credit_applications WHERE status = $1`,
        [status]
      );

      return res.json({
        data: result.rows,
        total: Number(countResult.rows[0]?.total || 0),
      });
    } catch (_error: unknown) {
    const error = asError(_error);
      log.error("[Admin Credit] List applications error:", error.message);
      return res.status(500).json({ error: "Failed to list credit applications" });
    }
  }
);

// =============================================================================
// POST /api/v1/admin/credit/applications/:id/approve
// Approve a credit application with optional amount adjustment
// =============================================================================
adminCreditRouter.post(
  "/credit/applications/:id/approve",
  requireAdminToken,
  requirePermission("stores", "write"),
  async (req: Request, res: Response) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "database unavailable" });

    const { id } = req.params;
    const { approvedAmountMinor, notes } = req.body;

    try {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const appResult = await client.query(
          `SELECT id, store_id, status, kyc_status, requested_amount_minor, offer_id
           FROM payments.credit_applications WHERE id = $1`,
          [id]
        );

        if (appResult.rows.length === 0) {
          await client.query("ROLLBACK");
          return res.status(404).json({ error: "Application not found" });
        }

        const app = appResult.rows[0];

        if (app.status !== 'kyc_verified' && app.status !== 'pending') {
          await client.query("ROLLBACK");
          return res.status(400).json({
            error: `Cannot approve application in ${app.status} status`,
          });
        }

        const amount = approvedAmountMinor || app.requested_amount_minor;

        await client.query(
          `UPDATE payments.credit_applications
           SET status = 'approved', approved_amount_minor = $1, updated_at = NOW()
           WHERE id = $2`,
          [amount, id]
        );

        // Update credit offer if exists
        if (app.offer_id) {
          await client.query(
            `UPDATE payments.credit_offers
             SET status = 'approved' WHERE id = $1 AND store_id = $2`,
            [app.offer_id, app.store_id]
          );
        }

        await client.query("COMMIT");

        return res.json({
          success: true,
          data: {
            applicationId: id,
            storeId: app.store_id,
            status: "approved",
            approvedAmountMinor: amount,
          },
        });
      } finally {
        client.release();
      }
    } catch (_error: unknown) {
    const error = asError(_error);
      log.error("[Admin Credit] Approve error:", error.message);
      return res.status(500).json({ error: "Failed to approve credit application" });
    }
  }
);

// =============================================================================
// POST /api/v1/admin/credit/applications/:id/reject
// Reject a credit application with reason
// =============================================================================
adminCreditRouter.post(
  "/credit/applications/:id/reject",
  requireAdminToken,
  requirePermission("stores", "write"),
  async (req: Request, res: Response) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "database unavailable" });

    const { id } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ error: "Rejection reason is required" });
    }

    try {
      const appResult = await pool.query(
        `SELECT id, status FROM payments.credit_applications WHERE id = $1`,
        [id]
      );

      if (appResult.rows.length === 0) {
        return res.status(404).json({ error: "Application not found" });
      }

      if (appResult.rows[0].status === 'approved') {
        return res.status(400).json({ error: "Cannot reject an already approved application" });
      }

      await pool.query(
        `UPDATE payments.credit_applications
         SET status = 'rejected', rejection_reason = $1, updated_at = NOW()
         WHERE id = $2`,
        [reason, id]
      );

      return res.json({
        success: true,
        data: { applicationId: id, status: "rejected", reason },
      });
    } catch (_error: unknown) {
    const error = asError(_error);
      log.error("[Admin Credit] Reject error:", error.message);
      return res.status(500).json({ error: "Failed to reject credit application" });
    }
  }
);
