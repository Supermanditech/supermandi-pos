/**
 * STAGING-FIX-014: Application Approval Endpoints
 *
 * Provides SuperAdmin ability to list, review, approve, and reject
 * registration applications from both retailers and suppliers.
 *
 * Endpoints:
 *   GET    /admin/applications          - List pending applications
 *   GET    /admin/applications/:id      - Get full application details
 *   POST   /admin/applications/:id/approve - Approve application
 *   POST   /admin/applications/:id/reject  - Reject application
 */

import { Router, Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { requireAdminToken, requirePermission } from "../../../middleware/adminToken";
import { getPool } from "../../../db/client";
import { generateStoreCode } from "../../../services/storeCodeService";
import rateLimit from "express-rate-limit";

export const adminApplicationsRouter = Router();

adminApplicationsRouter.use(requireAdminToken);

// Rate limit approval/rejection actions
const approvalRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: { code: "RATE_LIMITED", message: "Too many approval actions. Please slow down." } },
});

/**
 * GET /admin/applications
 *
 * List applications with optional filters.
 * Query params:
 *   entity_type - 'retailer' | 'supplier' (optional)
 *   status      - application status filter (optional, default: KYC_SUBMITTED)
 *   limit       - max rows (default 50, max 200)
 *   offset      - pagination offset (default 0)
 */
adminApplicationsRouter.get(
  "/applications",
  requirePermission("stores", "read"),
  async (req: Request, res: Response) => {
    const pool = getPool();
    if (!pool) {
      return res.status(503).json({ error: { code: "DB_UNAVAILABLE", message: "Database unavailable" } });
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
    const entityType = req.query.entity_type as string | undefined;
    const status = req.query.status as string | undefined;

    try {
      const conditions: string[] = [];
      const params: unknown[] = [];
      let paramIdx = 1;

      // Default: show actionable applications (KYC_SUBMITTED, NEEDS_FIX)
      if (status) {
        conditions.push(`a.status = $${paramIdx++}`);
        params.push(status.toUpperCase());
      } else {
        conditions.push(`a.status IN ('KYC_SUBMITTED', 'NEEDS_FIX', 'PAYMENTS_SUBMITTED')`);
      }

      if (entityType && ['retailer', 'supplier'].includes(entityType)) {
        conditions.push(`a.entity_type = $${paramIdx++}`);
        params.push(entityType);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Count total
      const countResult = await pool.query(
        `SELECT COUNT(*) as total FROM auth.applications a ${whereClause}`,
        params
      );
      const total = parseInt(countResult.rows[0]?.total || '0', 10);

      // Fetch applications
      const result = await pool.query(
        `SELECT
          a.id,
          a.entity_type,
          a.phone,
          a.email,
          a.business_name,
          a.owner_name,
          a.gstin,
          a.address_line1,
          a.city,
          a.state,
          a.pincode,
          a.status,
          a.admin_notes,
          a.rejection_reason,
          a.document_urls,
          a.created_at,
          a.updated_at,
          a.submitted_at
        FROM auth.applications a
        ${whereClause}
        ORDER BY
          CASE a.status
            WHEN 'KYC_SUBMITTED' THEN 1
            WHEN 'PAYMENTS_SUBMITTED' THEN 2
            WHEN 'NEEDS_FIX' THEN 3
            ELSE 4
          END,
          a.created_at ASC
        LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
        [...params, limit, offset]
      );

      res.json({
        data: result.rows.map(row => ({
          id: row.id,
          entityType: row.entity_type,
          phone: row.phone,
          email: row.email,
          businessName: row.business_name,
          ownerName: row.owner_name,
          gstin: row.gstin,
          addressLine1: row.address_line1,
          city: row.city,
          state: row.state,
          pincode: row.pincode,
          status: row.status,
          adminNotes: row.admin_notes,
          rejectionReason: row.rejection_reason,
          documentUrls: row.document_urls,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          submittedAt: row.submitted_at,
        })),
        total,
        limit,
        offset,
      });
    } catch (err) {
      console.error("[admin/applications] List error:", err);
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to fetch applications" } });
    }
  }
);

/**
 * GET /admin/applications/:id
 *
 * Get full application details including documents and status history.
 */
adminApplicationsRouter.get(
  "/applications/:id",
  requirePermission("stores", "read"),
  async (req: Request, res: Response) => {
    const pool = getPool();
    if (!pool) {
      return res.status(503).json({ error: { code: "DB_UNAVAILABLE", message: "Database unavailable" } });
    }

    const { id } = req.params;

    try {
      // Fetch application
      const result = await pool.query(
        `SELECT * FROM auth.applications WHERE id = $1`,
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: { code: "NOT_FOUND", message: "Application not found" } });
      }

      const app = result.rows[0];

      // Fetch documents from documents table
      const docsResult = await pool.query(
        `SELECT id, document_type, file_url, file_name, file_size, status, created_at
         FROM auth.documents
         WHERE entity_type = 'application' AND entity_id = $1
         ORDER BY created_at ASC`,
        [id]
      ).catch(() => ({ rows: [] }));

      // Fetch status history
      const historyResult = await pool.query(
        `SELECT old_status, new_status, change_reason, created_at
         FROM auth.application_status_log
         WHERE application_id = $1
         ORDER BY created_at ASC`,
        [id]
      ).catch(() => ({ rows: [] }));

      res.json({
        application: {
          id: app.id,
          entityType: app.entity_type,
          phone: app.phone,
          email: app.email,
          businessName: app.business_name,
          ownerName: app.owner_name,
          gstin: app.gstin,
          addressLine1: app.address_line1,
          addressLine2: app.address_line2,
          city: app.city,
          state: app.state,
          pincode: app.pincode,
          status: app.status,
          adminNotes: app.admin_notes,
          rejectionReason: app.rejection_reason,
          documentUrls: app.document_urls,
          upiVpa: app.upi_vpa,
          bankAccountNumber: app.bank_account_number,
          bankIfsc: app.bank_ifsc,
          bankName: app.bank_name,
          approvedStoreId: app.approved_store_id,
          approvedSupplierId: app.approved_supplier_id,
          createdAt: app.created_at,
          updatedAt: app.updated_at,
          submittedAt: app.submitted_at,
          reviewedAt: app.reviewed_at,
        },
        documents: docsResult.rows.map(d => ({
          id: d.id,
          documentType: d.document_type,
          fileUrl: d.file_url,
          fileName: d.file_name,
          fileSize: d.file_size,
          status: d.status,
          createdAt: d.created_at,
        })),
        statusHistory: historyResult.rows.map(h => ({
          oldStatus: h.old_status,
          newStatus: h.new_status,
          reason: h.change_reason,
          createdAt: h.created_at,
        })),
      });
    } catch (err) {
      console.error("[admin/applications] Detail error:", err);
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to fetch application details" } });
    }
  }
);

/**
 * POST /admin/applications/:id/approve
 *
 * Approve an application:
 * - For retailers: creates a platform.stores record
 * - For suppliers: creates a supplier.suppliers record
 * - Updates application status to ACTIVE
 * - Links approved entity back to application
 */
adminApplicationsRouter.post(
  "/applications/:id/approve",
  requirePermission("stores", "update"),
  approvalRateLimiter,
  async (req: Request, res: Response) => {
    const pool = getPool();
    if (!pool) {
      return res.status(503).json({ error: { code: "DB_UNAVAILABLE", message: "Database unavailable" } });
    }

    const { id } = req.params;
    const { notes } = req.body as { notes?: string };
    const adminId = req.adminId || 'unknown';

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Lock the application row
      const appResult = await client.query(
        `SELECT * FROM auth.applications WHERE id = $1 FOR UPDATE`,
        [id]
      );

      if (appResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: { code: "NOT_FOUND", message: "Application not found" } });
      }

      const app = appResult.rows[0];

      // Validate status allows approval
      if (!['KYC_SUBMITTED', 'PAYMENTS_SUBMITTED'].includes(app.status)) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: {
            code: "INVALID_STATUS",
            message: `Cannot approve application in status '${app.status}'. Must be KYC_SUBMITTED or PAYMENTS_SUBMITTED.`
          }
        });
      }

      let approvedEntityId: string | null = null;
      let entityTable: string;

      if (app.entity_type === 'retailer') {
        // STBT-172: Create a store in platform.stores with correct column names
        // platform.stores requires: id (UUID), name (NOT NULL), code (NOT NULL), status
        const storeId = randomUUID();
        let storeCode: string;
        try {
          storeCode = await generateStoreCode(app.business_name);
        } catch (codeErr: any) {
          await client.query('ROLLBACK');
          console.error("[admin/applications] Store code generation failed:", codeErr?.message);
          return res.status(500).json({
            error: { code: "STORE_CODE_FAILED", message: "Could not generate store code. Please try again." }
          });
        }

        const storeResult = await client.query(
          `INSERT INTO platform.stores (
            id, name, code, phone, email,
            address_line1, address_line2, city, state, pincode,
            gst_number, upi_vpa, contact_name, contact_phone, contact_email,
            status, created_at, updated_at
          ) VALUES (
            $1::uuid, $2, $3, $4, $5,
            $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15,
            'ACTIVE', NOW(), NOW()
          )
          RETURNING id`,
          [
            storeId,
            app.business_name,
            storeCode,
            app.phone,
            app.email,
            app.address_line1,
            app.address_line2,
            app.city,
            app.state,
            app.pincode,
            app.gstin,
            app.upi_vpa,
            app.owner_name,
            app.phone,
            app.email,
          ]
        );
        approvedEntityId = storeResult.rows[0].id;
        entityTable = 'approved_store_id';
      } else {
        // STBT-174: Create a supplier with correct field mapping
        // verification_status must be 'verified' (not 'ACTIVE') per supplier verification flow
        // bank_account_name from owner_name (closest available), bank_name from app.bank_name
        const supplierResult = await client.query(
          `INSERT INTO supplier.suppliers (
            business_name, gstin, primary_phone, primary_email,
            primary_contact_name, address_line1, address_line2, city, state, pincode,
            bank_account_number, bank_ifsc, bank_account_name, bank_name,
            document_urls, verification_status, status, application_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'verified', 'active', $16)
          RETURNING id`,
          [
            app.business_name,
            app.gstin,
            app.phone,
            app.email,
            app.owner_name,
            app.address_line1,
            app.address_line2,
            app.city,
            app.state,
            app.pincode,
            app.bank_account_number,
            app.bank_ifsc,
            app.owner_name,
            app.bank_name,
            JSON.stringify(app.document_urls || {}),
            id,
          ]
        );
        approvedEntityId = supplierResult.rows[0].id;
        entityTable = 'approved_supplier_id';
      }

      // Update application status to ACTIVE
      const adminNote = notes ? `${notes} (by ${adminId})` : `Approved by ${adminId}`;
      await client.query(
        `UPDATE auth.applications
         SET status = 'ACTIVE',
             ${entityTable} = $1,
             reviewed_at = NOW(),
             admin_notes = $2
         WHERE id = $3`,
        [approvedEntityId, adminNote, id]
      );

      // Log status change
      await client.query(
        `INSERT INTO auth.application_status_log (application_id, old_status, new_status, change_reason)
         VALUES ($1, $2, 'ACTIVE', $3)`,
        [id, app.status, adminNote]
      ).catch(() => { /* status_log table may not exist yet */ });

      await client.query('COMMIT');

      res.json({
        success: true,
        message: `${app.entity_type === 'retailer' ? 'Store' : 'Supplier'} approved successfully`,
        applicationId: id,
        approvedEntityId,
        entityType: app.entity_type,
      });
    } catch (err: any) {
      await client.query('ROLLBACK');
      console.error("[admin/applications] Approve error:", err);

      // Handle unique constraint violations gracefully
      if (err.code === '23505') {
        return res.status(409).json({
          error: {
            code: "DUPLICATE_ENTITY",
            message: `A ${(err.constraint || '').includes('gstin') ? 'GSTIN' : 'record'} conflict occurred. This entity may already be approved.`
          }
        });
      }

      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to approve application" } });
    } finally {
      client.release();
    }
  }
);

/**
 * POST /admin/applications/:id/reject
 *
 * Reject an application with a reason.
 * Sets status to NEEDS_FIX with 30-day expiry.
 */
adminApplicationsRouter.post(
  "/applications/:id/reject",
  requirePermission("stores", "update"),
  approvalRateLimiter,
  async (req: Request, res: Response) => {
    const pool = getPool();
    if (!pool) {
      return res.status(503).json({ error: { code: "DB_UNAVAILABLE", message: "Database unavailable" } });
    }

    const { id } = req.params;
    const { reason, notes } = req.body as { reason?: string; notes?: string };
    const adminId = req.adminId || 'unknown';

    const rejectionReason = reason || notes;
    if (!rejectionReason || rejectionReason.trim().length < 5) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Rejection reason is required (minimum 5 characters)" }
      });
    }

    try {
      // Check application exists and is in valid status
      const appResult = await pool.query(
        `SELECT id, status, entity_type FROM auth.applications WHERE id = $1`,
        [id]
      );

      if (appResult.rows.length === 0) {
        return res.status(404).json({ error: { code: "NOT_FOUND", message: "Application not found" } });
      }

      const app = appResult.rows[0];

      // T-012: Allow reject from NEEDS_FIX (admin can re-reject with updated reason)
      if (!['KYC_SUBMITTED', 'PAYMENTS_SUBMITTED', 'NEEDS_FIX'].includes(app.status)) {
        return res.status(400).json({
          error: {
            code: "INVALID_STATUS",
            message: `Cannot reject application in status '${app.status}'. Must be KYC_SUBMITTED, PAYMENTS_SUBMITTED, or NEEDS_FIX.`
          }
        });
      }

      // Update application
      const adminNote = `Rejected by ${adminId}: ${rejectionReason.trim()}`;
      await pool.query(
        `UPDATE auth.applications
         SET status = 'NEEDS_FIX',
             rejection_reason = $1,
             admin_notes = $2,
             reviewed_at = NOW(),
             needs_fix_at = NOW(),
             expires_at = NOW() + INTERVAL '30 days'
         WHERE id = $3`,
        [rejectionReason.trim(), adminNote, id]
      );

      // Log status change
      await pool.query(
        `INSERT INTO auth.application_status_log (application_id, old_status, new_status, change_reason)
         VALUES ($1, $2, 'NEEDS_FIX', $3)`,
        [id, app.status, rejectionReason.trim()]
      ).catch(() => { /* status_log table may not exist yet */ });

      res.json({
        success: true,
        message: "Application rejected. Applicant can resubmit within 30 days.",
        applicationId: id,
        newStatus: "NEEDS_FIX",
      });
    } catch (err) {
      console.error("[admin/applications] Reject error:", err);
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to reject application" } });
    }
  }
);
