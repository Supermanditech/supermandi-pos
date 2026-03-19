import { Router } from "express";
import { getPool } from "../../../db/client";
import { requireAdminToken, requirePermission } from "../../../middleware/adminToken";
// V3-HARDEN-101: Shared status helpers
import { isSupplierActive, SQL_SUPPLIER_IS_ACTIVE, SQL_LINK_IS_ACTIVE, SQL_SUPPLIER_VERIFIED, STATUS } from "../../../services/statusHelpers";
import { validateBnplMaxDays, validateMargin, validateMoq } from "@supermandi/common";
// GO-LIVE-185: Import rate limiter for approval operations
import { supplierApprovalRateLimiter } from "../../../middleware/posRateLimiter";
// CORE-002: Import supplier state machine service
import {
  SupplierStatus,
  type SupplierStatusType,
  transitionSupplier,
  getSuppliersByStatus,
  getPendingSuppliersCount,
  getSupplierStatusHistory,
  getSupplierStatus,
  isValidTransition,
  getValidTransitions,
} from "../../../services/supplierStateMachine";

export const adminSuppliersRouter = Router();

/**
 * GET /api/v1/admin/pending-suppliers
 * Returns supplier requests pending verification
 * ITER2-002: Fixed response format to match frontend expectations ({ data: [...] })
 * ITER2-004: Fixed schema namespace (supplier.supplier_requests)
 */
// GO-LIVE-128: Requires 'suppliers:read' permission
adminSuppliersRouter.get("/pending-suppliers", requireAdminToken, requirePermission("suppliers", "read"), async (req, res) => {
  const pool = getPool();
  if (!pool) {
    return res.status(503).json({ error: "database unavailable" });
  }

  // ADMIN-PAGINATION-001: Support limit/offset pagination
  const limit = Math.min(Math.max(parseInt(String(req.query.limit)) || 50, 1), 200);
  const offset = Math.max(parseInt(String(req.query.offset)) || 0, 0);

  try {
    // STBT-190.3: UNION both sources — retailer-requested (supplier_requests)
    // AND self-registered (auth.applications where entity_type='supplier')
    // Self-registered suppliers were invisible to SuperAdmin before this fix
    const combinedQuery = `
      SELECT * FROM (
        SELECT
          sr.id,
          sr.store_id as "storeId",
          st.name as "storeName",
          sr.requested_gstin as "requestedGstin",
          sr.requested_name as "requestedName",
          sr.requested_phone as "requestedPhone",
          sr.requested_email as "requestedEmail",
          sr.status,
          sr.review_notes as "reviewNotes",
          sr.created_at as "createdAt",
          sr.reviewed_at as "reviewedAt",
          'supplier_request' as "source"
        FROM supplier.supplier_requests sr
        LEFT JOIN platform.stores st ON st.id = sr.store_id
        WHERE sr.status = 'pending'

        UNION ALL

        SELECT
          a.id,
          NULL as "storeId",
          NULL as "storeName",
          a.gstin as "requestedGstin",
          a.business_name as "requestedName",
          a.phone as "requestedPhone",
          a.email as "requestedEmail",
          a.status,
          a.admin_notes as "reviewNotes",
          a.created_at as "createdAt",
          a.reviewed_at as "reviewedAt",
          'self_registered' as "source"
        FROM auth.applications a
        WHERE a.entity_type = 'supplier'
          AND a.status IN ('KYC_SUBMITTED', 'PAYMENTS_SUBMITTED')
          AND a.approved_supplier_id IS NULL
      ) combined
      ORDER BY "createdAt" DESC
      LIMIT $1 OFFSET $2`;

    const countQuery = `
      SELECT (
        (SELECT COUNT(*) FROM supplier.supplier_requests WHERE status = 'pending') +
        (SELECT COUNT(*) FROM auth.applications
         WHERE entity_type = 'supplier'
           AND status IN ('KYC_SUBMITTED', 'PAYMENTS_SUBMITTED')
           AND approved_supplier_id IS NULL)
      )::int as total`;

    const [countResult, result] = await Promise.all([
      pool.query(countQuery),
      pool.query(combinedQuery, [limit, offset]),
    ]);

    const total = countResult.rows[0]?.total ?? 0;
    return res.json({
      data: result.rows,
      count: result.rowCount,
      total, limit, offset
    });
  } catch (err: any) {
    log.error("[admin/pending-suppliers] Error:", err);
    if (err.code === "42P01") {
      return res.json({ data: [], count: 0, total: 0, limit, offset });
    }
    return res.status(500).json({ error: "Failed to fetch pending suppliers" });
  }
});

/**
 * GET /api/v1/admin/verified-suppliers
 * Returns verified/active suppliers
 * ITER2-002: Fixed response format to match frontend expectations ({ data: [...] })
 * ITER2-004: Fixed schema namespace (supplier.suppliers)
 */
// GO-LIVE-128: Requires 'suppliers:read' permission
adminSuppliersRouter.get("/verified-suppliers", requireAdminToken, requirePermission("suppliers", "read"), async (req, res) => {
  const pool = getPool();
  if (!pool) {
    return res.status(503).json({ error: "database unavailable" });
  }

  const { search } = req.query;

  // ADMIN-PAGINATION-001: Support limit/offset pagination
  const limit = Math.min(Math.max(parseInt(String(req.query.limit)) || 50, 1), 200);
  const offset = Math.max(parseInt(String(req.query.offset)) || 0, 0);

  try {
    // V3-HARDEN-101: Shared status SQL constant
    let whereClause = `WHERE (${SQL_SUPPLIER_IS_ACTIVE})`;
    const params: any[] = [];
    let paramIdx = 1;

    if (search && typeof search === 'string' && search.trim()) {
      whereClause += ` AND (s.business_name ILIKE $${paramIdx} OR s.gstin ILIKE $${paramIdx} OR s.trade_name ILIKE $${paramIdx})`;
      params.push(`%${search.trim()}%`);
      paramIdx++;
    }

    const countParams = [...params];
    params.push(limit, offset);

    const [countResult, result] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int as total FROM supplier.suppliers s ${whereClause}`,
        countParams
      ),
      pool.query(
        `SELECT
          s.id,
          s.gstin,
          s.business_name as "businessName",
          s.trade_name as "tradeName",
          s.primary_phone as "primaryPhone",
          s.primary_email as "primaryEmail",
          s.city,
          s.state,
          s.verification_status as "verificationStatus",
          s.status,
          s.rating,
          COALESCE(s.auto_approve_products, false) as "autoApproveProducts"
        FROM supplier.suppliers s
        ${whereClause}
        ORDER BY s.verified_at DESC NULLS LAST, s.created_at DESC
        LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
        params
      ),
    ]);

    const total = countResult.rows[0]?.total ?? 0;
    return res.json({
      data: result.rows,
      count: result.rowCount,
      total, limit, offset
    });
  } catch (err: any) {
    log.error("[admin/verified-suppliers] Error:", err);
    if (err.code === "42P01") {
      return res.json({ data: [], count: 0, total: 0, limit, offset });
    }
    return res.status(500).json({ error: "Failed to fetch verified suppliers" });
  }
});

/**
 * POST /api/v1/admin/pending-suppliers/:supplierId/verify
 * Verify a pending supplier request
 * ITER2-004: Fixed schema namespace (supplier.supplier_requests)
 * GO-LIVE-130: Enhanced authorization with admin tracking and audit logging
 */
// GO-LIVE-128: Requires 'suppliers:approve' permission
// GO-LIVE-185: Rate limit approval operations to 10/min per IP
adminSuppliersRouter.post("/pending-suppliers/:supplierId/verify", requireAdminToken, requirePermission("suppliers", "approve"), supplierApprovalRateLimiter, async (req, res) => {
  const { supplierId } = req.params;
  const { supplierId: linkedSupplierId, verifySupplier, notes } = req.body || {};

  // GO-LIVE-130: Get admin ID for audit trail
  const adminId = (req as any).adminId;
  const adminEmail = (req as any).adminInfo?.email || 'master-token';

  if (!supplierId) {
    return res.status(400).json({ error: "supplierId (request ID) is required" });
  }

  const pool = getPool();
  if (!pool) {
    return res.status(503).json({ error: "database unavailable" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Get the supplier request — check supplier_requests first, fall back to auth.applications
    const reqResult = await client.query(
      `SELECT sr.*, st.name as store_name, st.status as store_status
       FROM supplier.supplier_requests sr
       LEFT JOIN platform.stores st ON st.id = sr.store_id
       WHERE sr.id = $1::uuid AND sr.status = 'pending'`,
      [supplierId]
    );

    // STG-038: Fall back to auth.applications for self-registered suppliers
    let request: any;
    let isApplicationFallback = false;
    if (reqResult.rowCount === 0) {
      const appResult = await client.query(
        `SELECT a.id, a.business_name AS requested_name, a.gstin AS requested_gstin,
                a.phone AS requested_phone, a.email AS requested_email, a.status,
                a.entity_type, a.created_at,
                NULL::uuid as store_id, NULL as store_name, NULL as store_status
         FROM auth.applications a
         WHERE a.id = $1::uuid AND a.status IN ('pending', 'KYC_SUBMITTED', 'PAYMENTS_SUBMITTED') AND a.entity_type = 'supplier'`,
        [supplierId]
      );
      if (appResult.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Supplier request not found or already processed" });
      }
      request = appResult.rows[0];
      isApplicationFallback = true;
    } else {
      request = reqResult.rows[0];
    }

    // GO-LIVE-130: Validate that the requesting store exists and is active
    if (request.store_id && request.store_status === 'deleted') {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: "requesting_store_deleted",
        message: "Cannot approve supplier request: the requesting store has been deleted"
      });
    }

    let finalSupplierId: string | null = linkedSupplierId || null;

    // If verifySupplier=true, create a new supplier from the request data
    if (verifySupplier && !linkedSupplierId) {
      // GSTIN fallback: truncate to 15 chars (VARCHAR(15) constraint)
      const gstin = request.requested_gstin || ('PND-' + supplierId.substring(0, 11));
      // V3-HARDEN-101: Canonical status vocabulary — both fields use uppercase ACTIVE
      const supplierResult = await client.query(
        `INSERT INTO supplier.suppliers (gstin, business_name, primary_phone, primary_email, verification_status, status, application_id)
         VALUES ($1, $2, $3, $4, 'ACTIVE', 'ACTIVE', $5::uuid)
         RETURNING id`,
        [
          gstin,
          request.requested_name || 'Unknown Supplier',
          request.requested_phone,
          request.requested_email,
          supplierId
        ]
      );
      finalSupplierId = supplierResult.rows[0].id;
    }

    // GO-LIVE-130: Update the request with reviewer information
    if (isApplicationFallback) {
      // Self-registered supplier: update auth.applications status
      await client.query(
        `UPDATE auth.applications
         SET status = 'approved', updated_at = NOW()
         WHERE id = $1::uuid`,
        [supplierId]
      );
    } else {
      await client.query(
        `UPDATE supplier.supplier_requests
         SET status = 'approved',
             review_notes = $2,
             reviewed_at = NOW(),
             reviewed_by = $3,
             approved_supplier_id = $4,
             updated_at = NOW()
         WHERE id = $1::uuid`,
        [supplierId, notes || null, adminId !== 'master-token' ? adminId : null, finalSupplierId]
      );
    }

    // GO-LIVE-130: Log to audit table
    try {
      await client.query(
        `INSERT INTO admin.audit_log (actor_user_id, action, resource_type, resource_id, store_id, request_body, response_status)
         VALUES ($1::uuid, 'supplier_request.approve', 'supplier_request', $2, $3::uuid, $4::jsonb, 200)`,
        [
          adminId !== 'master-token' ? adminId : null,
          supplierId,
          request.store_id,
          JSON.stringify({
            adminEmail,
            requestedName: request.requested_name,
            requestedGstin: request.requested_gstin,
            notes: notes || null,
            createdSupplierId: finalSupplierId
          })
        ]
      );
    } catch (auditErr: any) {
      // Don't fail the operation if audit logging fails
      log.warn('[admin/verify-supplier] GO-LIVE-130: Audit log failed:', auditErr?.message);
    }

    await client.query("COMMIT");

    log.info(`[admin/verify-supplier] GO-LIVE-130: Supplier request ${supplierId} approved by ${adminEmail}`);

    return res.json({
      success: true,
      message: "Supplier request approved",
      approvedSupplierId: finalSupplierId,
      approvedBy: adminEmail
    });
  } catch (err: any) {
    await client.query("ROLLBACK");
    log.error("[admin/verify-supplier] Error:", err);
    if (err.code === "42P01") {
      return res.status(404).json({ error: "Supplier tables not initialized" });
    }
    return res.status(500).json({ error: "Failed to verify supplier" });
  } finally {
    client.release();
  }
});

/**
 * POST /api/v1/admin/pending-suppliers/:supplierId/reject
 * Reject a pending supplier request
 * ITER2-003: Fixed field name mismatch - accept both 'notes' and 'reason'
 * ITER2-004: Fixed schema namespace (supplier.supplier_requests)
 * GO-LIVE-130: Enhanced authorization with admin tracking and audit logging
 */
// GO-LIVE-128: Requires 'suppliers:reject' permission
// GO-LIVE-185: Rate limit approval operations to 10/min per IP
adminSuppliersRouter.post("/pending-suppliers/:supplierId/reject", requireAdminToken, requirePermission("suppliers", "reject"), supplierApprovalRateLimiter, async (req, res) => {
  const { supplierId } = req.params;
  // ITER2-003: Accept both 'notes' (from frontend) and 'reason' (legacy) field names
  const { notes, reason } = req.body || {};
  const reviewNotes = notes || reason || null;

  // GO-LIVE-130: Get admin ID for audit trail
  const adminId = (req as any).adminId;
  const adminEmail = (req as any).adminInfo?.email || 'master-token';

  if (!supplierId) {
    return res.status(400).json({ error: "supplierId (request ID) is required" });
  }

  const pool = getPool();
  if (!pool) {
    return res.status(503).json({ error: "database unavailable" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // GO-LIVE-130: Get request details for audit logging
    const reqCheck = await client.query(
      `SELECT store_id, requested_name, requested_gstin FROM supplier.supplier_requests
       WHERE id = $1::uuid AND status = 'pending'`,
      [supplierId]
    );

    if (reqCheck.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Supplier request not found or not pending" });
    }

    const requestInfo = reqCheck.rows[0];

    // GO-LIVE-130: Update with reviewed_by information
    const result = await client.query(
      `UPDATE supplier.supplier_requests
       SET status = 'rejected',
           review_notes = $2,
           reviewed_at = NOW(),
           reviewed_by = $3,
           updated_at = NOW()
       WHERE id = $1::uuid
       RETURNING
         id,
         store_id as "storeId",
         requested_name as "requestedName",
         status,
         review_notes as "reviewNotes",
         reviewed_at as "reviewedAt"`,
      [supplierId, reviewNotes, adminId !== 'master-token' ? adminId : null]
    );

    // GO-LIVE-130: Log to audit table
    try {
      await client.query(
        `INSERT INTO admin.audit_log (actor_user_id, action, resource_type, resource_id, store_id, request_body, response_status)
         VALUES ($1::uuid, 'supplier_request.reject', 'supplier_request', $2, $3::uuid, $4::jsonb, 200)`,
        [
          adminId !== 'master-token' ? adminId : null,
          supplierId,
          requestInfo.store_id,
          JSON.stringify({
            adminEmail,
            requestedName: requestInfo.requested_name,
            requestedGstin: requestInfo.requested_gstin,
            rejectionReason: reviewNotes
          })
        ]
      );
    } catch (auditErr: any) {
      log.warn('[admin/reject-supplier] GO-LIVE-130: Audit log failed:', auditErr?.message);
    }

    await client.query("COMMIT");

    log.info(`[admin/reject-supplier] GO-LIVE-130: Supplier request ${supplierId} rejected by ${adminEmail}`);

    return res.json({
      success: true,
      data: result.rows[0],
      rejectedBy: adminEmail
    });
  } catch (err: any) {
    await client.query("ROLLBACK");
    log.error("[admin/reject-supplier] Error:", err);
    if (err.code === "42P01") {
      return res.status(404).json({ error: "Supplier tables not initialized" });
    }
    return res.status(500).json({ error: "Failed to reject supplier" });
  } finally {
    client.release();
  }
});

// =============================================================================
// SM-008: SuperAdmin Approval APIs for self-registered suppliers
// =============================================================================

/**
 * GET /api/v1/admin/suppliers/pending
 * List all self-registered suppliers pending verification (from SM-005)
 */
// GO-LIVE-128: Requires 'suppliers:read' permission
adminSuppliersRouter.get("/suppliers/pending", requireAdminToken, requirePermission("suppliers", "read"), async (req, res) => {
  const pool = getPool();
  if (!pool) {
    return res.status(503).json({ error: "database unavailable" });
  }

  // T-065: Pagination support
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
  const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

  try {
    // T-065: Use LATERAL join instead of full-table subquery aggregation
    // This only counts products for the suppliers actually in the result set
    const result = await pool.query(
      `SELECT
        s.id,
        s.business_name as "businessName",
        s.gstin,
        s.primary_email as "email",
        s.primary_phone as "phone",
        s.created_at as "createdAt",
        COALESCE(pc.cnt, 0)::int as "productCount"
      FROM supplier.suppliers s
      LEFT JOIN LATERAL (
        SELECT COUNT(*) as cnt
        FROM catalog.supplier_products sp
        WHERE sp.supplier_id = s.id
      ) pc ON true
      WHERE s.verification_status = 'pending'
      ORDER BY s.created_at DESC
      LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return res.json({
      data: result.rows,
      count: result.rowCount
    });
  } catch (err: any) {
    log.error("[admin/suppliers/pending] Error:", err);
    if (err.code === "42P01") {
      return res.json({ data: [], count: 0 });
    }
    return res.status(500).json({ error: "Failed to fetch pending suppliers" });
  }
});

/**
 * T-066: POST /api/v1/admin/suppliers/:supplierId/auto-approve
 * Toggle auto-approval for a supplier's products
 * Only verified suppliers can have auto-approval enabled
 */
adminSuppliersRouter.post("/suppliers/:supplierId/auto-approve", requireAdminToken, requirePermission("suppliers", "approve"), async (req, res) => {
  const { supplierId } = req.params;
  const { enabled } = req.body;
  const adminId = (req as any).adminId;

  if (!adminId) {
    return res.status(401).json({ error: "Admin ID required for audit trail" });
  }

  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: "enabled (boolean) is required" });
  }

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  try {
    // Verify supplier exists and is verified
    const check = await pool.query(
      `SELECT id, verification_status, business_name FROM supplier.suppliers WHERE id = $1::uuid`,
      [supplierId]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({ error: "Supplier not found" });
    }

    // V3-HARDEN-101: Use canonical status helper
    if (enabled && !isSupplierActive(check.rows[0].verification_status)) {
      return res.status(400).json({
        error: "supplier_not_verified",
        message: "Cannot enable auto-approval for non-verified suppliers"
      });
    }

    await pool.query(
      `UPDATE supplier.suppliers SET auto_approve_products = $2 WHERE id = $1::uuid`,
      [supplierId, enabled]
    );

    // Audit log — use valid entity_type/action per chk_approval_logs constraints
    await pool.query(
      `INSERT INTO supplier.approval_logs (entity_type, entity_id, action, from_status, to_status, actor_id, changes)
       VALUES ('supplier', $1::uuid, 'edit', NULL, NULL, $2, $3::jsonb)`,
      [supplierId, adminId, JSON.stringify({ auto_approve_products: enabled })]
    );

    log.info(`[T-066] Auto-approval ${enabled ? 'enabled' : 'disabled'} for supplier ${check.rows[0].business_name} by admin ${adminId}`);

    return res.json({
      supplierId,
      autoApproveProducts: enabled,
      message: `Auto-approval ${enabled ? 'enabled' : 'disabled'} for ${check.rows[0].business_name}`
    });
  } catch (err: any) {
    log.error("[admin/suppliers/auto-approve] Error:", err);
    return res.status(500).json({ error: "Failed to update auto-approval setting" });
  }
});

/**
 * POST /api/v1/admin/suppliers/:supplierId/approve
 * Approve a self-registered supplier
 */
// GO-LIVE-128: Requires 'suppliers:approve' permission
// GO-LIVE-185: Rate limit approval operations to 10/min per IP
adminSuppliersRouter.post("/suppliers/:supplierId/approve", requireAdminToken, requirePermission("suppliers", "approve"), supplierApprovalRateLimiter, async (req, res) => {
  const { supplierId } = req.params;
  // ITER4-P0-008: Require valid admin ID for audit trail - no fallback
  const adminId = (req as any).adminId;

  if (!adminId) {
    log.warn("[admin/suppliers/approve] Missing adminId in request - rejecting for audit compliance");
    return res.status(401).json({ error: "Admin ID required for audit trail" });
  }

  if (!supplierId) {
    return res.status(400).json({ error: "supplierId is required" });
  }

  const pool = getPool();
  if (!pool) {
    return res.status(503).json({ error: "database unavailable" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Check supplier exists and is pending
    const checkResult = await client.query(
      `SELECT id, verification_status FROM supplier.suppliers WHERE id = $1::uuid`,
      [supplierId]
    );

    if (checkResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Supplier not found" });
    }

    if (checkResult.rows[0].verification_status !== 'KYC_SUBMITTED') {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Supplier is not pending verification" });
    }

    // Update supplier to ACTIVE
    const updateResult = await client.query(
      `UPDATE supplier.suppliers
       SET verification_status = 'ACTIVE', verified_at = NOW(), status = 'ACTIVE'
       WHERE id = $1::uuid
       RETURNING id, verification_status as "status", verified_at as "verifiedAt"`,
      [supplierId]
    );

    // Log the approval
    await client.query(
      `INSERT INTO supplier.approval_logs (entity_type, entity_id, action, from_status, to_status, actor_id)
       VALUES ('supplier', $1::uuid, 'approve', 'KYC_SUBMITTED', 'verified', $2)`,
      [supplierId, adminId]
    );

    await client.query("COMMIT");

    return res.json({
      supplierId: updateResult.rows[0].id,
      status: updateResult.rows[0].status,
      verifiedAt: updateResult.rows[0].verifiedAt
    });
  } catch (err: any) {
    await client.query("ROLLBACK");
    log.error("[admin/suppliers/approve] Error:", err);
    return res.status(500).json({ error: "Failed to approve supplier" });
  } finally {
    client.release();
  }
});

/**
 * POST /api/v1/admin/suppliers/:supplierId/reject
 * Reject a self-registered supplier
 */
// GO-LIVE-128: Requires 'suppliers:reject' permission
// GO-LIVE-185: Rate limit approval operations to 10/min per IP
adminSuppliersRouter.post("/suppliers/:supplierId/reject", requireAdminToken, requirePermission("suppliers", "reject"), supplierApprovalRateLimiter, async (req, res) => {
  const { supplierId } = req.params;
  const { reason } = req.body || {};
  // ITER4-P0-008: Require valid admin ID for audit trail - no fallback
  const adminId = (req as any).adminId;

  if (!adminId) {
    log.warn("[admin/suppliers/reject] Missing adminId in request - rejecting for audit compliance");
    return res.status(401).json({ error: "Admin ID required for audit trail" });
  }

  if (!supplierId) {
    return res.status(400).json({ error: "supplierId is required" });
  }

  const pool = getPool();
  if (!pool) {
    return res.status(503).json({ error: "database unavailable" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Check supplier exists and is pending
    const checkResult = await client.query(
      `SELECT id, verification_status FROM supplier.suppliers WHERE id = $1::uuid`,
      [supplierId]
    );

    if (checkResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Supplier not found" });
    }

    if (!['pending', 'KYC_SUBMITTED', 'PAYMENTS_SUBMITTED'].includes(checkResult.rows[0].verification_status)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Supplier is not pending verification" });
    }

    // Update supplier to rejected
    const updateResult = await client.query(
      `UPDATE supplier.suppliers
       SET verification_status = 'REJECTED', status = 'INACTIVE'
       WHERE id = $1::uuid
       RETURNING id, verification_status as "status"`,
      [supplierId]
    );

    // Log the rejection
    await client.query(
      `INSERT INTO supplier.approval_logs (entity_type, entity_id, action, from_status, to_status, actor_id, reason)
       VALUES ('supplier', $1::uuid, 'reject', 'pending', 'rejected', $2, $3)`,
      [supplierId, adminId, reason || null]
    );

    await client.query("COMMIT");

    return res.json({
      supplierId: updateResult.rows[0].id,
      status: updateResult.rows[0].status
    });
  } catch (err: any) {
    await client.query("ROLLBACK");
    log.error("[admin/suppliers/reject] Error:", err);
    return res.status(500).json({ error: "Failed to reject supplier" });
  } finally {
    client.release();
  }
});

/**
 * GET /api/v1/admin/products/pending
 * List all products pending approval
 */
// GO-LIVE-128: Requires 'products:read' permission
adminSuppliersRouter.get("/products/pending", requireAdminToken, requirePermission("products", "read"), async (req, res) => {
  const pool = getPool();
  if (!pool) {
    return res.status(503).json({ error: "database unavailable" });
  }

  // T-065: Pagination support for scalability
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
  const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

  try {
    // T-064: Enhanced pending products query with category, unit, brand, margin info
    // T-065: Uses approval_status index for efficient lookups at scale
    const countResult = await pool.query(
      `SELECT COUNT(*)::int as total FROM catalog.supplier_products WHERE approval_status = 'pending'`
    );
    const total = countResult.rows[0]?.total || 0;

    const result = await pool.query(
      `SELECT
        sp.id,
        sp.name as "productName",
        sp.supplier_sku as "skuCode",
        sp.barcode,
        sp.category,
        sp.brand,
        sp.unit,
        sp.purchase_price as "purchasePrice",
        sp.mrp,
        sp.moq,
        sp.supermandi_margin_minor as "marginMinor",
        sp.margin_percent as "marginPercent",
        sp.image_url as "imageUrl",
        sp.thumbnail_url as "thumbnailUrl",
        sp.edited_name as "editedName",
        sp.edited_category as "editedCategory",
        sp.created_at as "createdAt",
        s.id as "supplierId",
        s.business_name as "supplierName",
        s.verification_status as "supplierStatus"
      FROM catalog.supplier_products sp
      JOIN supplier.suppliers s ON s.id = sp.supplier_id
      WHERE sp.approval_status = 'pending'
      ORDER BY sp.created_at DESC
      LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return res.json({
      data: result.rows,
      count: result.rowCount,
      total,
      pagination: { limit, offset, hasMore: offset + result.rows.length < total },
    });
  } catch (err: any) {
    log.error("[admin/products/pending] Error:", err);
    if (err.code === "42P01") {
      return res.json({ data: [], count: 0 });
    }
    return res.status(500).json({ error: "Failed to fetch pending products" });
  }
});

/**
 * POST /api/v1/admin/products/:productId/approve
 * Approve a product for catalog visibility
 */
// GO-LIVE-128: Requires 'products:approve' permission
// GO-LIVE-185: Rate limit approval operations to 10/min per IP
adminSuppliersRouter.post("/products/:productId/approve", requireAdminToken, requirePermission("products", "approve"), supplierApprovalRateLimiter, async (req, res) => {
  const { productId } = req.params;
  // ITER4-P0-008: Require valid admin ID for audit trail - no fallback
  const adminId = (req as any).adminId;

  if (!adminId) {
    log.warn("[admin/products/approve] Missing adminId in request - rejecting for audit compliance");
    return res.status(401).json({ error: "Admin ID required for audit trail" });
  }

  if (!productId) {
    return res.status(400).json({ error: "productId is required" });
  }

  const pool = getPool();
  if (!pool) {
    return res.status(503).json({ error: "database unavailable" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // GO-LIVE-131: Check product exists and verify supplier relationship
    const checkResult = await client.query(
      `SELECT sp.id, sp.approval_status, sp.supplier_id, sp.name as product_name,
              s.business_name as supplier_name, s.verification_status as supplier_status
       FROM catalog.supplier_products sp
       LEFT JOIN supplier.suppliers s ON s.id = sp.supplier_id
       WHERE sp.id = $1::uuid`,
      [productId]
    );

    if (checkResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Product not found" });
    }

    const product = checkResult.rows[0];

    if (product.approval_status !== 'pending') {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Product is not pending approval" });
    }

    // GO-LIVE-131: Verify supplier-product relationship
    if (!product.supplier_id) {
      await client.query("ROLLBACK");
      log.warn(`[admin/products/approve] GO-LIVE-131: Product ${productId} has no supplier_id`);
      return res.status(400).json({
        error: "product_no_supplier",
        message: "Cannot approve product without supplier association"
      });
    }

    // V3-HARDEN-101: Use canonical status helper instead of raw string comparison
    // V3-HARDEN-101: isSupplierActive imported at top
    if (!isSupplierActive(product.supplier_status)) {
      await client.query("ROLLBACK");
      log.warn(`[admin/products/approve] GO-LIVE-131: Cannot approve product from non-ACTIVE supplier: ${product.supplier_name}`);
      return res.status(400).json({
        error: "supplier_not_verified",
        message: `Cannot approve product - supplier "${product.supplier_name}" is not ACTIVE (status: ${product.supplier_status || 'unknown'})`
      });
    }

    // Update product to approved
    // ISSUE-023: approved_by and actor_id are TEXT columns (migration 172), so pass adminId directly
    const updateResult = await client.query(
      `UPDATE catalog.supplier_products
       SET approval_status = 'approved', approved_at = NOW(), approved_by = $2
       WHERE id = $1::uuid
       RETURNING id, approval_status as "approvalStatus", approved_at as "approvedAt"`,
      [productId, adminId]
    );

    // Log the approval
    await client.query(
      `INSERT INTO supplier.approval_logs (entity_type, entity_id, action, from_status, to_status, actor_id)
       VALUES ('product', $1::uuid, 'approve', 'pending', 'approved', $2)`,
      [productId, adminId]
    );

    // SUP-POS-005: Auto-map approved product to master catalog
    let mappingResult: { catalogProductId: string; confidence: number; type: 'auto' } | null = null;
    try {
      const spDetails = await client.query(
        `SELECT name, edited_name, category, edited_category, brand, unit, barcode
         FROM catalog.supplier_products WHERE id = $1`,
        [productId]
      );

      if (spDetails.rows.length > 0) {
        const sp = spDetails.rows[0];
        const spName = sp.edited_name || sp.name;
        const spCategory = sp.edited_category || sp.category;

        // Check if mapping already exists
        const existingMap = await client.query(
          `SELECT supplier_product_id FROM catalog.supplier_product_map WHERE supplier_product_id = $1::uuid`,
          [productId]
        );

        if (existingMap.rows.length === 0) {
          let mappedProductId: string | null = null;
          let mappingConfidence = 0;

          // Step 1: Try barcode match (highest confidence)
          if (sp.barcode) {
            const barcodeMatch = await client.query(
              `SELECT id FROM catalog.products WHERE primary_barcode = $1 LIMIT 1`,
              [sp.barcode]
            );
            if (barcodeMatch.rows.length > 0) {
              mappedProductId = barcodeMatch.rows[0].id;
              mappingConfidence = 1.0;
            }
          }

          // Step 2: Try name similarity (requires pg_trgm extension)
          if (!mappedProductId) {
            try {
              const nameMatch = await client.query(
                `SELECT id, similarity(name, $1) as sim
                 FROM catalog.products
                 WHERE similarity(name, $1) > 0.6
                 ORDER BY sim DESC LIMIT 1`,
                [spName]
              );
              if (nameMatch.rows.length > 0) {
                mappedProductId = nameMatch.rows[0].id;
                mappingConfidence = parseFloat(nameMatch.rows[0].sim);
              }
            } catch {
              // pg_trgm not available, skip name matching
            }
          }

          // Step 3: No match — create new master product
          if (!mappedProductId) {
            const newProduct = await client.query(
              `INSERT INTO catalog.products (name, category, brand, unit, primary_barcode)
               VALUES ($1, $2, $3, $4, $5)
               RETURNING id`,
              [spName, spCategory, sp.brand, sp.unit, sp.barcode]
            );
            mappedProductId = newProduct.rows[0].id;
            mappingConfidence = 1.0;
          }

          // Insert mapping
          if (mappedProductId) {
            await client.query(
              `INSERT INTO catalog.supplier_product_map (supplier_product_id, product_id, mapping_type, confidence, is_verified)
               VALUES ($1::uuid, $2::uuid, 'auto', $3, false)`,
              [productId, mappedProductId, mappingConfidence]
            );
            log.info(`[SUP-POS-005] Auto-mapped product ${productId} → ${mappedProductId} (confidence=${mappingConfidence})`);
            mappingResult = { catalogProductId: mappedProductId, confidence: mappingConfidence, type: 'auto' as const };
          }
        }
      }
    } catch (mapErr: any) {
      // Non-critical — mapping failure should not block approval
      log.warn("[SUP-POS-005] Auto-mapping failed (non-blocking):", mapErr.message);
    }

    await client.query("COMMIT");

    // T-064: Include mapping result in approval response
    return res.json({
      productId: updateResult.rows[0].id,
      approvalStatus: updateResult.rows[0].approvalStatus,
      approvedAt: updateResult.rows[0].approvedAt,
      mapping: mappingResult,
    });
  } catch (err: any) {
    await client.query("ROLLBACK");
    log.error("[admin/products/approve] Error:", err);
    return res.status(500).json({ error: "Failed to approve product" });
  } finally {
    client.release();
  }
});

/**
 * POST /api/v1/admin/products/:productId/reject
 * Reject a product
 */
// GO-LIVE-128: Requires 'products:reject' permission
// GO-LIVE-185: Rate limit approval operations to 10/min per IP
adminSuppliersRouter.post("/products/:productId/reject", requireAdminToken, requirePermission("products", "reject"), supplierApprovalRateLimiter, async (req, res) => {
  const { productId } = req.params;
  const { reason } = req.body || {};
  // ITER4-P0-008: Require valid admin ID for audit trail - no fallback
  const adminId = (req as any).adminId;

  if (!adminId) {
    log.warn("[admin/products/reject] Missing adminId in request - rejecting for audit compliance");
    return res.status(401).json({ error: "Admin ID required for audit trail" });
  }

  if (!productId) {
    return res.status(400).json({ error: "productId is required" });
  }

  const pool = getPool();
  if (!pool) {
    return res.status(503).json({ error: "database unavailable" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Check product exists and is pending
    const checkResult = await client.query(
      `SELECT id, approval_status FROM catalog.supplier_products WHERE id = $1::uuid`,
      [productId]
    );

    if (checkResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Product not found" });
    }

    if (checkResult.rows[0].approval_status !== 'pending') {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Product is not pending approval" });
    }

    // Update product to rejected
    const updateResult = await client.query(
      `UPDATE catalog.supplier_products
       SET approval_status = 'rejected', rejection_reason = $2
       WHERE id = $1::uuid
       RETURNING id, approval_status as "approvalStatus"`,
      [productId, reason || null]
    );

    // Log the rejection
    // ISSUE-023: actor_id is TEXT column (migration 172), pass adminId directly
    await client.query(
      `INSERT INTO supplier.approval_logs (entity_type, entity_id, action, from_status, to_status, actor_id, reason)
       VALUES ('product', $1::uuid, 'reject', 'pending', 'rejected', $2, $3)`,
      [productId, adminId, reason || null]
    );

    await client.query("COMMIT");

    return res.json({
      productId: updateResult.rows[0].id,
      approvalStatus: updateResult.rows[0].approvalStatus
    });
  } catch (err: any) {
    await client.query("ROLLBACK");
    log.error("[admin/products/reject] Error:", err);
    return res.status(500).json({ error: "Failed to reject product" });
  } finally {
    client.release();
  }
});

// =============================================================================
// T-188: Batch Approval/Rejection for SuperAdmin
// =============================================================================

/**
 * POST /api/v1/admin/applications/products/batch-action
 * Batch approve or reject multiple products in a single transaction.
 *
 * Body: { action: 'approve' | 'reject', productIds: string[], rejectionReason?: string }
 * Response: { success: true, data: { processed: number, failed: number, errors?: Array } }
 */
adminSuppliersRouter.post(
  "/applications/products/batch-action",
  requireAdminToken,
  requirePermission("products", "approve"),
  supplierApprovalRateLimiter,
  async (req, res) => {
    const { action, productIds, rejectionReason } = req.body as {
      action?: string;
      productIds?: string[];
      rejectionReason?: string;
    };

    const adminId = (req as any).adminId;
    if (!adminId) {
      return res.status(401).json({ error: "Admin ID required for audit trail" });
    }

    // Validate action
    if (!action || !['approve', 'reject'].includes(action)) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "action must be 'approve' or 'reject'" }
      });
    }

    // Validate productIds
    if (!Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "productIds must be a non-empty array" }
      });
    }

    // Cap batch size to prevent abuse
    const MAX_BATCH_SIZE = 100;
    if (productIds.length > MAX_BATCH_SIZE) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: `Maximum ${MAX_BATCH_SIZE} products per batch` }
      });
    }

    // Validate rejection reason for reject action
    if (action === 'reject' && (!rejectionReason || rejectionReason.trim().length < 3)) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "rejectionReason is required for reject action (min 3 chars)" }
      });
    }

    // Validate all IDs are valid UUIDs
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const id of productIds) {
      if (typeof id !== 'string' || !UUID_REGEX.test(id)) {
        return res.status(400).json({
          error: { code: "VALIDATION_ERROR", message: `Invalid product ID: ${id}` }
        });
      }
    }

    const pool = getPool();
    if (!pool) {
      return res.status(503).json({ error: { code: "DB_UNAVAILABLE", message: "Database unavailable" } });
    }

    const client = await pool.connect();
    let processed = 0;
    const errors: Array<{ productId: string; error: string }> = [];

    try {
      await client.query("BEGIN");

      for (const productId of productIds) {
        try {
          // Validate product exists and is pending
          const checkResult = await client.query(
            `SELECT sp.id, sp.approval_status, sp.supplier_id, sp.name as product_name,
                    s.business_name as supplier_name, s.verification_status as supplier_status
             FROM catalog.supplier_products sp
             LEFT JOIN supplier.suppliers s ON s.id = sp.supplier_id
             WHERE sp.id = $1::uuid
             FOR UPDATE`,
            [productId]
          );

          if (checkResult.rowCount === 0) {
            errors.push({ productId, error: "Product not found" });
            continue;
          }

          const product = checkResult.rows[0];

          if (product.approval_status !== 'pending') {
            errors.push({ productId, error: `Product is not pending (status: ${product.approval_status})` });
            continue;
          }

          if (action === 'approve') {
            // Verify supplier relationship
            if (!product.supplier_id) {
              errors.push({ productId, error: "Cannot approve product without supplier association" });
              continue;
            }

            if (product.supplier_status !== 'ACTIVE') {
              errors.push({
                productId,
                error: `Supplier "${product.supplier_name}" is not ACTIVE (status: ${product.supplier_status || 'unknown'})`
              });
              continue;
            }

            // Approve the product
            await client.query(
              `UPDATE catalog.supplier_products
               SET approval_status = 'approved', approved_at = NOW(), approved_by = $2
               WHERE id = $1::uuid`,
              [productId, adminId]
            );

            // Log approval
            await client.query(
              `INSERT INTO supplier.approval_logs (entity_type, entity_id, action, from_status, to_status, actor_id)
               VALUES ('product', $1::uuid, 'approve', 'pending', 'approved', $2)`,
              [productId, adminId]
            );

            // SUP-POS-005: Auto-map approved product to master catalog
            try {
              const spDetails = await client.query(
                `SELECT name, edited_name, category, edited_category, brand, unit, barcode
                 FROM catalog.supplier_products WHERE id = $1`,
                [productId]
              );

              if (spDetails.rows.length > 0) {
                const sp = spDetails.rows[0];
                const spName = sp.edited_name || sp.name;
                const spCategory = sp.edited_category || sp.category;

                const existingMap = await client.query(
                  `SELECT supplier_product_id FROM catalog.supplier_product_map WHERE supplier_product_id = $1::uuid`,
                  [productId]
                );

                if (existingMap.rows.length === 0) {
                  let mappedProductId: string | null = null;
                  let mappingConfidence = 0;

                  // Try barcode match
                  if (sp.barcode) {
                    const barcodeMatch = await client.query(
                      `SELECT id FROM catalog.products WHERE primary_barcode = $1 LIMIT 1`,
                      [sp.barcode]
                    );
                    if (barcodeMatch.rows.length > 0) {
                      mappedProductId = barcodeMatch.rows[0].id;
                      mappingConfidence = 1.0;
                    }
                  }

                  // No barcode match - create new master product
                  if (!mappedProductId) {
                    const newProduct = await client.query(
                      `INSERT INTO catalog.products (name, category, brand, unit, primary_barcode)
                       VALUES ($1, $2, $3, $4, $5)
                       RETURNING id`,
                      [spName, spCategory, sp.brand, sp.unit, sp.barcode]
                    );
                    mappedProductId = newProduct.rows[0].id;
                    mappingConfidence = 1.0;
                  }

                  if (mappedProductId) {
                    await client.query(
                      `INSERT INTO catalog.supplier_product_map (supplier_product_id, product_id, mapping_type, confidence, is_verified)
                       VALUES ($1::uuid, $2::uuid, 'auto', $3, false)`,
                      [productId, mappedProductId, mappingConfidence]
                    );
                  }
                }
              }
            } catch (mapErr: any) {
              // Non-critical — mapping failure should not block approval
              log.warn(`[T-188] Auto-mapping failed for ${productId} (non-blocking):`, mapErr.message);
            }
          } else {
            // Reject the product
            await client.query(
              `UPDATE catalog.supplier_products
               SET approval_status = 'rejected', rejection_reason = $2
               WHERE id = $1::uuid`,
              [productId, rejectionReason?.trim() || null]
            );

            // Log rejection
            await client.query(
              `INSERT INTO supplier.approval_logs (entity_type, entity_id, action, from_status, to_status, actor_id, reason)
               VALUES ('product', $1::uuid, 'reject', 'pending', 'rejected', $2, $3)`,
              [productId, adminId, rejectionReason?.trim() || null]
            );
          }

          processed++;
        } catch (itemErr: any) {
          errors.push({ productId, error: itemErr?.message || "Unknown error" });
        }
      }

      await client.query("COMMIT");

      log.info(`[T-188] Batch ${action}: processed=${processed}, failed=${errors.length}, admin=${adminId}`);

      return res.json({
        success: true,
        data: {
          processed,
          failed: errors.length,
          ...(errors.length > 0 ? { errors } : {}),
        },
      });
    } catch (err: any) {
      await client.query("ROLLBACK");
      log.error("[T-188] Batch action error:", err);
      return res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Batch action failed" }
      });
    } finally {
      client.release();
    }
  }
);

// =============================================================================
// SM-009: SuperAdmin Edit SKU + Set Margin + BNPL API
// =============================================================================

/**
 * PUT /api/v1/admin/products/:productId/edit
 * Edit product details, set margin, and configure BNPL eligibility
 *
 * Request body:
 * - editedName: string (override supplier product name)
 * - editedCategory: string (override category)
 * - superMandiMarginMinor: number (fixed margin in paise, mutually exclusive with marginPercent)
 * - marginPercent: number (percentage margin, mutually exclusive with superMandiMarginMinor)
 * - bnplEligible: boolean
 * - bnplMaxDays: number
 *
 * Response:
 * - productId, editedName, superMandiMarginMinor, bnplEligible, retailerPrice
 */
// GO-LIVE-128: Requires 'products:update' permission
adminSuppliersRouter.put("/products/:productId/edit", requireAdminToken, requirePermission("products", "update"), async (req, res) => {
  const { productId } = req.params;
  const {
    editedName,
    editedCategory,
    superMandiMarginMinor,
    marginPercent,
    bnplEligible,
    bnplMaxDays,
    // T-070: Invoice config fields
    invoiceModel,
    hsnCode,
    gstRate,
  } = req.body || {};
  // ITER4-P0-008: Require valid admin ID for audit trail - no fallback
  const adminId = (req as any).adminId;

  if (!adminId) {
    log.warn("[admin/products/edit] Missing adminId in request - rejecting for audit compliance");
    return res.status(401).json({ error: "Admin ID required for audit trail" });
  }

  if (!productId) {
    return res.status(400).json({ error: "productId is required" });
  }

  // Validate: margin types are mutually exclusive
  if (superMandiMarginMinor !== undefined && superMandiMarginMinor !== null &&
      marginPercent !== undefined && marginPercent !== null) {
    return res.status(400).json({
      error: "superMandiMarginMinor and marginPercent are mutually exclusive. Provide only one."
    });
  }

  // GO-LIVE-164: Validate margin percentage
  if (marginPercent !== undefined && marginPercent !== null) {
    const marginValidation = validateMargin(marginPercent);
    if (!marginValidation.valid) {
      return res.status(400).json({ error: marginValidation.error });
    }
  }

  // GO-LIVE-165: Validate BNPL max days (positive, 1-90 days)
  if (bnplMaxDays !== undefined && bnplMaxDays !== null) {
    const bnplValidation = validateBnplMaxDays(bnplMaxDays);
    if (!bnplValidation.valid) {
      return res.status(400).json({ error: bnplValidation.error });
    }
  }

  const pool = getPool();
  if (!pool) {
    return res.status(503).json({ error: "database unavailable" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // GO-LIVE-131: Get current product data with supplier verification
    const checkResult = await client.query(
      `SELECT
        sp.id, sp.name, sp.category, sp.purchase_price,
        sp.edited_name, sp.edited_category,
        sp.supermandi_margin_minor, sp.margin_percent,
        sp.bnpl_eligible, sp.bnpl_max_days,
        sp.invoice_model, sp.hsn_code, sp.gst_rate,
        sp.approval_status,
        sp.supplier_id,
        s.business_name as supplier_name,
        s.verification_status as supplier_status
       FROM catalog.supplier_products sp
       LEFT JOIN supplier.suppliers s ON s.id = sp.supplier_id
       WHERE sp.id = $1::uuid`,
      [productId]
    );

    if (checkResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Product not found" });
    }

    const current = checkResult.rows[0];

    // GO-LIVE-131: Verify supplier-product relationship
    if (!current.supplier_id) {
      await client.query("ROLLBACK");
      log.warn(`[admin/products/edit] GO-LIVE-131: Product ${productId} has no supplier_id`);
      return res.status(400).json({
        error: "product_no_supplier",
        message: "Product is not associated with any supplier"
      });
    }

    // GO-LIVE-131: Warn if supplier is not ACTIVE (but allow edit for admin)
    if (current.supplier_status && current.supplier_status !== 'ACTIVE') {
      log.warn(`[admin/products/edit] GO-LIVE-131: Editing product from non-ACTIVE supplier: ${current.supplier_name} (${current.supplier_status})`);
    }

    const purchasePrice = current.purchase_price;

    // Build dynamic update query
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    // Track changes for audit log
    const changes: Record<string, { from: any; to: any }> = {};

    if (editedName !== undefined) {
      updates.push(`edited_name = $${paramIndex++}`);
      values.push(editedName);
      if (current.edited_name !== editedName) {
        changes.editedName = { from: current.edited_name, to: editedName };
      }
    }

    if (editedCategory !== undefined) {
      updates.push(`edited_category = $${paramIndex++}`);
      values.push(editedCategory);
      if (current.edited_category !== editedCategory) {
        changes.editedCategory = { from: current.edited_category, to: editedCategory };
      }
    }

    if (superMandiMarginMinor !== undefined) {
      updates.push(`supermandi_margin_minor = $${paramIndex++}`);
      values.push(superMandiMarginMinor);
      updates.push(`margin_percent = NULL`); // Clear percentage when fixed margin set
      if (current.supermandi_margin_minor !== superMandiMarginMinor) {
        changes.superMandiMarginMinor = { from: current.supermandi_margin_minor, to: superMandiMarginMinor };
      }
    } else if (marginPercent !== undefined) {
      updates.push(`margin_percent = $${paramIndex++}`);
      values.push(marginPercent);
      updates.push(`supermandi_margin_minor = NULL`); // Clear fixed margin when percentage set
      if (current.margin_percent !== marginPercent) {
        changes.marginPercent = { from: current.margin_percent, to: marginPercent };
      }
    }

    if (bnplEligible !== undefined) {
      updates.push(`bnpl_eligible = $${paramIndex++}`);
      values.push(bnplEligible);
      if (current.bnpl_eligible !== bnplEligible) {
        changes.bnplEligible = { from: current.bnpl_eligible, to: bnplEligible };
      }
    }

    if (bnplMaxDays !== undefined) {
      updates.push(`bnpl_max_days = $${paramIndex++}`);
      values.push(bnplMaxDays);
      if (current.bnpl_max_days !== bnplMaxDays) {
        changes.bnplMaxDays = { from: current.bnpl_max_days, to: bnplMaxDays };
      }
    }

    // T-070: Invoice configuration fields
    if (invoiceModel !== undefined) {
      if (!['buy_resell', 'platform_fee'].includes(invoiceModel)) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "invoiceModel must be 'buy_resell' or 'platform_fee'" });
      }
      updates.push(`invoice_model = $${paramIndex++}`);
      values.push(invoiceModel);
      changes.invoiceModel = { from: current.invoice_model, to: invoiceModel };
    }

    if (hsnCode !== undefined) {
      updates.push(`hsn_code = $${paramIndex++}`);
      values.push(hsnCode || null);
      changes.hsnCode = { from: current.hsn_code, to: hsnCode };
    }

    if (gstRate !== undefined) {
      const validGstRates = [0, 5, 12, 18, 28];
      if (!validGstRates.includes(Number(gstRate))) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: `gstRate must be one of: ${validGstRates.join(', ')}` });
      }
      updates.push(`gst_rate = $${paramIndex++}`);
      values.push(gstRate);
      changes.gstRate = { from: current.gst_rate, to: gstRate };
    }

    if (updates.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "No fields to update" });
    }

    // Add productId as last parameter
    values.push(productId);

    // Execute update
    const updateResult = await client.query(
      `UPDATE catalog.supplier_products
       SET ${updates.join(", ")}, updated_at = NOW()
       WHERE id = $${paramIndex}::uuid
       RETURNING
         id,
         name,
         edited_name as "editedName",
         edited_category as "editedCategory",
         purchase_price as "purchasePrice",
         supermandi_margin_minor as "superMandiMarginMinor",
         margin_percent as "marginPercent",
         bnpl_eligible as "bnplEligible",
         bnpl_max_days as "bnplMaxDays",
         invoice_model as "invoiceModel",
         hsn_code as "hsnCode",
         gst_rate as "gstRate"`,
      values
    );

    const updated = updateResult.rows[0];

    // Calculate retailer price
    let calculatedMargin = 0;
    if (updated.superMandiMarginMinor !== null && updated.superMandiMarginMinor !== undefined) {
      calculatedMargin = updated.superMandiMarginMinor;
    } else if (updated.marginPercent !== null && updated.marginPercent !== undefined) {
      calculatedMargin = Math.round((purchasePrice * updated.marginPercent) / 100);
    }
    const retailerPrice = purchasePrice + calculatedMargin;

    // Log the edit action with changes
    if (Object.keys(changes).length > 0) {
      await client.query(
        `INSERT INTO supplier.approval_logs
         (entity_type, entity_id, action, actor_id, changes)
         VALUES ('product', $1::uuid, 'edit', $2, $3::jsonb)`,
        [productId, adminId, JSON.stringify(changes)]
      );
    }

    await client.query("COMMIT");

    return res.json({
      productId: updated.id,
      editedName: updated.editedName || updated.name,
      editedCategory: updated.editedCategory,
      superMandiMarginMinor: updated.superMandiMarginMinor,
      marginPercent: updated.marginPercent,
      bnplEligible: updated.bnplEligible,
      bnplMaxDays: updated.bnplMaxDays,
      purchasePrice: purchasePrice,
      retailerPrice: retailerPrice
    });
  } catch (err: any) {
    await client.query("ROLLBACK");
    log.error("[admin/products/edit] Error:", err);
    return res.status(500).json({ error: "Failed to edit product" });
  } finally {
    client.release();
  }
});

// =============================================================================
// T-068: SuperAdmin Publish Product → POS Visibility
// Publish an approved product to all linked stores (auto-add to store catalogs)
// =============================================================================

/**
 * POST /api/v1/admin/products/:productId/publish
 * T-068: Publish an approved product to all stores linked to its supplier
 * Creates store_products entries for each linked store that doesn't already have it
 */
adminSuppliersRouter.post("/products/:productId/publish", requireAdminToken, requirePermission("products", "approve"), async (req, res) => {
  const { productId } = req.params;
  const adminId = (req as any).adminId;

  if (!adminId) {
    return res.status(401).json({ error: "Admin ID required for audit trail" });
  }

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Verify product is approved — V3-FIX-169: include conversion fields
    const productCheck = await client.query(
      `SELECT sp.id, sp.name, sp.barcode, sp.category, sp.unit,
              sp.purchase_price, sp.supermandi_margin_minor, sp.margin_percent,
              sp.supplier_id, s.business_name as supplier_name,
              sp.procurement_unit, sp.procurement_pack_qty,
              sp.base_stock_unit, sp.split_sell_eligible
       FROM catalog.supplier_products sp
       JOIN supplier.suppliers s ON s.id = sp.supplier_id
       WHERE sp.id = $1::uuid AND sp.approval_status = 'approved'`,
      [productId]
    );

    if (productCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Product not found or not approved" });
    }

    const product = productCheck.rows[0];

    // Resolve the catalog product_id via supplier_product_map
    let catalogProductId: string = productId;
    const mapResult = await client.query(
      `SELECT product_id FROM catalog.supplier_product_map
       WHERE supplier_product_id = $1::uuid LIMIT 1`,
      [productId]
    );
    if (mapResult.rows.length > 0) {
      catalogProductId = mapResult.rows[0].product_id;
    } else {
      // No mapping — ensure catalog.products entry exists
      await client.query(
        `INSERT INTO catalog.products (id, name, primary_barcode, category, unit)
         VALUES ($1::uuid, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
        [productId, product.name, product.barcode, product.category, product.unit]
      );
    }

    // V3-FIX-098: Use canonical pricing engine instead of inline margin math
    const { calculateRetailerPrice } = require("../../../services/pricingEngine");
    const pricingResult = calculateRetailerPrice({
      supplierPriceMinor: product.purchase_price,
      mrpMinor: product.mrp ? Math.round(product.mrp * 100) : undefined,
      productMargin: product.supermandi_margin_minor > 0 ? { type: "fixed" as const, value: product.supermandi_margin_minor } : null,
      supplierMargin: product.margin_percent > 0 ? { type: "percentage" as const, value: product.margin_percent } : null,
    });
    const retailerPrice = pricingResult.retailerPriceMinor;

    // Find all stores linked to this supplier that don't already have the product
    const linkedStores = await client.query(
      `SELECT ssl.store_id
       FROM supplier.supplier_store_links ssl
       WHERE ssl.supplier_id = $1::uuid AND ${SQL_LINK_IS_ACTIVE}
         AND ssl.store_id NOT IN (
           SELECT store_id FROM catalog.store_products
           WHERE product_id = $2::uuid
         )`,
      [product.supplier_id, catalogProductId]
    );

    let publishedCount = 0;
    // V3-FIX-169: Infer base stock unit for published products
    const { inferBaseStockUnit } = require("../../../services/conversionEngine");
    const resolvedBaseStockUnit = product.base_stock_unit ||
      inferBaseStockUnit(null, null, null, product.unit);
    const resolvedProcurementUnit = product.procurement_unit || resolvedBaseStockUnit;
    const resolvedPackQty = product.procurement_pack_qty || 1;

    for (const store of linkedStores.rows) {
      // Add product to store catalog — V3-FIX-169: propagate conversion profile
      const insertResult = await client.query(
        `INSERT INTO catalog.store_products (
          store_id, product_id, display_name, sell_price, purchase_price,
          current_stock, is_active, supplier_id,
          procurement_unit, procurement_pack_qty, base_stock_unit,
          allow_fractional_sell, conversion_confirmed
        ) VALUES ($1, $2::uuid, $3, $4, $5, 0, true, $6::uuid,
          $7, $8, $9, $10, false)
        RETURNING id`,
        [store.store_id, catalogProductId, product.name, retailerPrice,
         product.purchase_price, product.supplier_id,
         resolvedProcurementUnit, resolvedPackQty, resolvedBaseStockUnit,
         product.split_sell_eligible || false]
      );

      // Add barcode mapping
      if (product.barcode) {
        await client.query(
          `INSERT INTO catalog.store_product_barcodes (store_id, store_product_id, barcode, source)
           VALUES ($1, $2, $3, 'admin_publish')
           ON CONFLICT (store_id, barcode) DO NOTHING`,
          [store.store_id, insertResult.rows[0].id, product.barcode]
        );
      }

      publishedCount++;
    }

    // Audit log — use valid entity_type/action per chk_approval_logs constraints
    await client.query(
      `INSERT INTO supplier.approval_logs (entity_type, entity_id, action, from_status, to_status, actor_id, changes)
       VALUES ('product', $1::uuid, 'approve', 'approved', 'published', $2, '{"action":"publish"}'::jsonb)`,
      [productId, adminId]
    );

    await client.query("COMMIT");

    log.info(`[T-068] Published product ${product.name} to ${publishedCount} stores by admin ${adminId}`);

    return res.json({
      productId,
      productName: product.name,
      supplierName: product.supplier_name,
      publishedToStores: publishedCount,
      alreadyInStores: linkedStores.rows.length === 0 ? 'all' : undefined,
    });
  } catch (err: any) {
    await client.query("ROLLBACK");
    log.error("[admin/products/publish] Error:", err);
    return res.status(500).json({ error: "Failed to publish product" });
  } finally {
    client.release();
  }
});

/**
 * POST /api/v1/admin/products/publish-bulk
 * T-068: Publish all approved products from a supplier to linked stores
 */
adminSuppliersRouter.post("/products/publish-bulk", requireAdminToken, requirePermission("products", "approve"), async (req, res) => {
  const { supplierId } = req.body;
  const adminId = (req as any).adminId;

  if (!adminId) {
    return res.status(401).json({ error: "Admin ID required" });
  }
  if (!supplierId) {
    return res.status(400).json({ error: "supplierId is required" });
  }

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  try {
    // Get all approved products from this supplier
    const products = await pool.query(
      `SELECT id FROM catalog.supplier_products
       WHERE supplier_id = $1::uuid AND approval_status = 'approved'`,
      [supplierId]
    );

    let totalPublished = 0;
    let productsProcessed = 0;

    // Publish each product (reuses the single publish logic via internal fetch)
    for (const product of products.rows) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        // Get product details
        const pResult = await client.query(
          `SELECT sp.id, sp.name, sp.barcode, sp.category, sp.unit,
                  sp.purchase_price, sp.supermandi_margin_minor, sp.margin_percent,
                  sp.supplier_id
           FROM catalog.supplier_products sp WHERE sp.id = $1`,
          [product.id]
        );
        if (pResult.rows.length === 0) { await client.query("ROLLBACK"); continue; }
        const p = pResult.rows[0];

        // Resolve catalog product_id
        let catalogProductId: string = product.id;
        const mapResult = await client.query(
          `SELECT product_id FROM catalog.supplier_product_map WHERE supplier_product_id = $1::uuid LIMIT 1`,
          [product.id]
        );
        if (mapResult.rows.length > 0) {
          catalogProductId = mapResult.rows[0].product_id;
        } else {
          await client.query(
            `INSERT INTO catalog.products (id, name, primary_barcode, category, unit)
             VALUES ($1::uuid, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
            [product.id, p.name, p.barcode, p.category, p.unit]
          );
        }

        // Calculate price
        let margin = 0;
        if (p.supermandi_margin_minor > 0) margin = p.supermandi_margin_minor;
        else if (p.margin_percent > 0) margin = Math.round(p.purchase_price * p.margin_percent / 100);

        // Find stores that don't have it yet
        const stores = await client.query(
          `SELECT ssl.store_id FROM supplier.supplier_store_links ssl
           WHERE ssl.supplier_id = $1::uuid AND ${SQL_LINK_IS_ACTIVE}
             AND ssl.store_id NOT IN (
               SELECT store_id FROM catalog.store_products WHERE product_id = $2::uuid
             )`,
          [supplierId, catalogProductId]
        );

        for (const store of stores.rows) {
          const ins = await client.query(
            `INSERT INTO catalog.store_products (
              store_id, product_id, display_name, sell_price, purchase_price,
              current_stock, is_active, supplier_id
            ) VALUES ($1, $2::uuid, $3, $4, $5, 0, true, $6::uuid) RETURNING id`,
            [store.store_id, catalogProductId, p.name, p.purchase_price + margin,
             p.purchase_price, p.supplier_id]
          );
          if (p.barcode) {
            await client.query(
              `INSERT INTO catalog.store_product_barcodes (store_id, store_product_id, barcode, source)
               VALUES ($1, $2, $3, 'admin_publish') ON CONFLICT (store_id, barcode) DO NOTHING`,
              [store.store_id, ins.rows[0].id, p.barcode]
            );
          }
          totalPublished++;
        }

        await client.query("COMMIT");
        productsProcessed++;
      } catch (err) {
        await client.query("ROLLBACK");
        log.warn(`[T-068] Bulk publish error for product ${product.id}:`, err);
      } finally {
        client.release();
      }
    }

    return res.json({
      supplierId,
      productsProcessed,
      totalPublishedToStores: totalPublished,
    });
  } catch (err: any) {
    log.error("[admin/products/publish-bulk] Error:", err);
    return res.status(500).json({ error: "Failed to bulk publish products" });
  }
});

// =============================================================================
// GO-LIVE-145: Admin-Triggered Password Reset for Suppliers
// =============================================================================

import { generateSecureResetToken, hashResetToken, sendPasswordResetEmail, isEmailServiceEnabled } from "../../../services/emailService";
import { log } from "../../../lib/logger";

/**
 * POST /api/v1/admin/suppliers/:supplierId/reset-password
 * GO-LIVE-145: Admin triggers password reset for a supplier
 * Generates a reset token and sends email to supplier
 */
// GO-LIVE-128: Requires 'suppliers:update' permission
adminSuppliersRouter.post("/suppliers/:supplierId/reset-password", requireAdminToken, requirePermission("suppliers", "update"), async (req, res) => {
  const { supplierId } = req.params;
  const { reason } = req.body || {};
  const adminId = (req as any).adminId;
  const adminEmail = (req as any).adminInfo?.email || 'admin';

  if (!supplierId) {
    return res.status(400).json({ error: "supplierId is required" });
  }

  const pool = getPool();
  if (!pool) {
    return res.status(503).json({ error: "database unavailable" });
  }

  try {
    // Get supplier details
    const supplierResult = await pool.query(
      `SELECT id, primary_email, business_name, status
       FROM supplier.suppliers
       WHERE id = $1::uuid`,
      [supplierId]
    );

    if (supplierResult.rowCount === 0) {
      return res.status(404).json({ error: "Supplier not found" });
    }

    const supplier = supplierResult.rows[0];

    if (!supplier.primary_email) {
      return res.status(400).json({ error: "Supplier has no email address" });
    }

    // Generate secure reset token
    const resetToken = generateSecureResetToken();
    const tokenHash = hashResetToken(resetToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Store hashed token in database
    await pool.query(
      `UPDATE supplier.suppliers
       SET password_reset_token = $1,
           password_reset_expires = $2,
           updated_at = NOW()
       WHERE id = $3::uuid`,
      [tokenHash, expiresAt, supplierId]
    );

    // Log the admin action to audit table
    try {
      await pool.query(
        `INSERT INTO admin.audit_log (actor_user_id, action, resource_type, resource_id, request_body, response_status)
         VALUES ($1::uuid, 'supplier.password_reset_triggered', 'supplier', $2, $3::jsonb, 200)`,
        [
          adminId !== 'master-token' ? adminId : null,
          supplierId,
          JSON.stringify({
            adminEmail,
            reason: reason || 'Admin-triggered reset',
            supplierEmail: supplier.primary_email,
            supplierName: supplier.business_name,
          })
        ]
      );
    } catch (auditErr) {
      log.warn('[GO-LIVE-145] Audit log failed:', auditErr);
    }

    // GO-LIVE-166: Send password reset email with proper error handling and reporting
    let emailSent = false;
    let emailError: string | undefined;

    if (isEmailServiceEnabled()) {
      try {
        const emailResult = await sendPasswordResetEmail(supplier.primary_email, resetToken, supplier.business_name, 'supplier');
        emailSent = emailResult.sent;
        if (emailResult.sent) {
          log.info(`[GO-LIVE-145] Password reset email sent to ${supplier.primary_email} (triggered by ${adminEmail})`);
        } else {
          emailError = emailResult.errorMessage || emailResult.errorCode || 'Unknown error';
          log.error(`[GO-LIVE-145] Failed to send reset email to ${supplier.primary_email}: ${emailResult.errorCode} - ${emailResult.errorMessage}`);
        }
      } catch (emailErr: any) {
        emailError = emailErr.message || 'Email service exception';
        log.error(`[GO-LIVE-145] Exception sending reset email:`, emailErr);
      }
    } else {
      emailError = 'Email service is not configured';
      log.warn(`[GO-LIVE-145] Email service is disabled - admin must share reset link manually`);
    }

    log.info(`[GO-LIVE-145] Admin ***@${adminEmail?.split('@')[1] || '***'} triggered password reset for supplier ${supplier.business_name} (***@${supplier.primary_email?.split('@')[1] || '***'})`);

    return res.json({
      success: true,
      message: `Password reset initiated for ${supplier.primary_email}`,
      supplierId,
      supplierEmail: supplier.primary_email,
      supplierName: supplier.business_name,
      expiresAt,
      // GO-LIVE-166: Report email delivery status to admin
      emailSent,
      emailError: emailSent ? undefined : emailError,
      // Only return token in non-production OR if email failed (so admin can share manually)
      ...((process.env.NODE_ENV !== 'production' || !emailSent) && { resetToken }),
    });
  } catch (err: any) {
    log.error("[GO-LIVE-145] Admin password reset failed:", err);
    return res.status(500).json({ error: "Failed to initiate password reset" });
  }
});

// =============================================================================
// CORE-002: Supplier State Machine Endpoints
// =============================================================================

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/v1/admin/suppliers/queue
 * Get suppliers pending review (KYC_SUBMITTED, NEEDS_FIX)
 */
adminSuppliersRouter.get("/suppliers/queue", requireAdminToken, requirePermission("suppliers", "read"), async (_req, res) => {
  try {
    const [suppliers, counts] = await Promise.all([
      getSuppliersByStatus([SupplierStatus.KYC_SUBMITTED, SupplierStatus.NEEDS_FIX], { limit: 50 }),
      getPendingSuppliersCount(),
    ]);

    return res.json({
      count: counts.total_pending,
      kyc_submitted_count: counts.kyc_submitted,
      needs_fix_count: counts.needs_fix,
      suppliers: suppliers.map((supplier) => ({
        id: supplier.id,
        business_name: supplier.business_name,
        gstin: supplier.gstin,
        verification_status: supplier.verification_status,
        rejection_reason: supplier.rejection_reason,
        status_updated_at: supplier.status_updated_at,
        primary_phone: supplier.primary_phone,
        primary_email: supplier.primary_email,
      })),
    });
  } catch (err: any) {
    log.error("[admin/suppliers/queue] Query failed:", err?.message);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch supplier queue" });
  }
});

/**
 * GET /api/v1/admin/suppliers/:supplierId/kyc
 * Get full supplier KYC data for review
 */
adminSuppliersRouter.get("/suppliers/:supplierId/kyc", requireAdminToken, requirePermission("suppliers", "read"), async (req, res) => {
  const supplierId = typeof req.params.supplierId === "string" ? req.params.supplierId.trim() : "";
  if (!supplierId || !UUID_PATTERN.test(supplierId)) {
    return res.status(400).json({ error: "supplierId must be a valid UUID" });
  }

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  try {
    // Get supplier details
    const supplierResult = await pool.query(
      `SELECT
        id,
        gstin,
        pan,
        business_name,
        trade_name,
        business_type,
        primary_contact_name,
        primary_phone,
        primary_email,
        address_line1,
        address_line2,
        city,
        state,
        pincode,
        verification_status,
        rejection_reason,
        verified_by_user_id,
        verified_at,
        bank_account_number,
        bank_ifsc,
        bank_account_name,
        upi_vpa,
        status_updated_at,
        status_updated_by,
        created_at,
        updated_at
      FROM supplier.suppliers
      WHERE id = $1::uuid`,
      [supplierId]
    );

    const supplier = supplierResult.rows[0];
    if (!supplier) {
      return res.status(404).json({ error: "Supplier not found" });
    }

    // Get documents (if table exists)
    let documents: any[] = [];
    try {
      const docsResult = await pool.query(
        `SELECT id, document_type, file_url, verified, verified_at, needs_reupload, reupload_reason, uploaded_at
         FROM supplier.supplier_documents
         WHERE supplier_id = $1
         ORDER BY uploaded_at DESC`,
        [supplierId]
      );
      documents = docsResult.rows;
    } catch (e) {
      // Table may not exist yet
      log.info("[admin/suppliers/kyc] supplier_documents table not available");
    }

    // Get status history
    let statusHistory: any[] = [];
    try {
      statusHistory = await getSupplierStatusHistory(supplierId, { limit: 20 });
    } catch (e) {
      log.info("[admin/suppliers/kyc] status history not available");
    }

    // Mask bank account
    const bankAccountMasked = supplier.bank_account_number
      ? "******" + supplier.bank_account_number.slice(-4)
      : null;

    return res.json({
      supplier: {
        id: supplier.id,
        gstin: supplier.gstin,
        pan: supplier.pan,
        business_name: supplier.business_name,
        trade_name: supplier.trade_name,
        business_type: supplier.business_type,
        contact_name: supplier.primary_contact_name,
        phone: supplier.primary_phone,
        email: supplier.primary_email,
        address: {
          line1: supplier.address_line1,
          line2: supplier.address_line2,
          city: supplier.city,
          state: supplier.state,
          pincode: supplier.pincode,
        },
        verification_status: supplier.verification_status,
        rejection_reason: supplier.rejection_reason,
        verified_at: supplier.verified_at,
        status_updated_at: supplier.status_updated_at,
        created_at: supplier.created_at,
      },
      bank_details: {
        account_number_masked: bankAccountMasked,
        ifsc: supplier.bank_ifsc,
        account_name: supplier.bank_account_name,
        upi_vpa: supplier.upi_vpa,
      },
      documents,
      status_history: statusHistory,
    });
  } catch (err: any) {
    log.error("[admin/suppliers/kyc] Query failed:", err?.message);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch supplier KYC" });
  }
});

/**
 * GET /api/v1/admin/suppliers/:supplierId/status-history
 * Get supplier status change history
 */
adminSuppliersRouter.get("/suppliers/:supplierId/status-history", requireAdminToken, requirePermission("suppliers", "read"), async (req, res) => {
  const supplierId = typeof req.params.supplierId === "string" ? req.params.supplierId.trim() : "";
  if (!supplierId || !UUID_PATTERN.test(supplierId)) {
    return res.status(400).json({ error: "supplierId must be a valid UUID" });
  }

  try {
    const history = await getSupplierStatusHistory(supplierId, { limit: 50 });
    return res.json({ status_history: history });
  } catch (err: any) {
    log.error("[admin/suppliers/status-history] Query failed:", err?.message);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch status history" });
  }
});

/**
 * PATCH /api/v1/admin/suppliers/:supplierId/verification-status
 * Update supplier verification status (state machine)
 */
adminSuppliersRouter.patch("/suppliers/:supplierId/verification-status", requireAdminToken, requirePermission("suppliers", "approve"), supplierApprovalRateLimiter, async (req, res) => {
  const supplierId = typeof req.params.supplierId === "string" ? req.params.supplierId.trim() : "";
  if (!supplierId || !UUID_PATTERN.test(supplierId)) {
    return res.status(400).json({ error: "supplierId must be a valid UUID" });
  }

  const { status, reason } = req.body as { status?: string; reason?: string };

  if (!status) {
    return res.status(400).json({ error: "status is required" });
  }

  // Validate status is a valid SupplierStatus
  const validStatuses = Object.values(SupplierStatus) as string[];
  if (!validStatuses.includes(status.toUpperCase())) {
    return res.status(400).json({
      error: "invalid_status",
      message: `Status must be one of: ${validStatuses.join(", ")}`,
    });
  }

  const newStatus = status.toUpperCase() as SupplierStatusType;

  // Get admin ID from token
  const adminId = (req as any).adminId || null;

  try {
    // Get current status first for validation
    const currentSupplier = await getSupplierStatus(supplierId);
    if (!currentSupplier) {
      return res.status(404).json({ error: "Supplier not found" });
    }

    // Check if transition is valid
    if (!isValidTransition(currentSupplier.verification_status, newStatus)) {
      return res.status(400).json({
        error: "invalid_transition",
        message: `Cannot transition from ${currentSupplier.verification_status} to ${newStatus}`,
        current_status: currentSupplier.verification_status,
        valid_transitions: getValidTransitions(currentSupplier.verification_status),
      });
    }

    // Perform the transition
    const result = await transitionSupplier(supplierId, newStatus, {
      reason: reason || undefined,
      changedBy: adminId,
      changedByType: "admin",
    });

    if (!result.success) {
      return res.status(400).json({
        error: "transition_failed",
        message: result.error,
        previous_status: result.previousStatus,
      });
    }

    // Get updated status history
    const statusHistory = await getSupplierStatusHistory(supplierId, { limit: 5 });

    return res.json({
      supplier: {
        id: result.supplier!.id,
        business_name: result.supplier!.business_name,
        gstin: result.supplier!.gstin,
        verification_status: result.supplier!.verification_status,
        rejection_reason: result.supplier!.rejection_reason,
        status_updated_at: result.supplier!.status_updated_at,
      },
      previous_status: result.previousStatus,
      status_history: statusHistory,
    });
  } catch (err: any) {
    log.error("[admin/suppliers/verification-status] Update failed:", err?.message);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to update supplier status" });
  }
});

// =============================================================================
// SA-P1-008: Supplier Bank Detail Re-Verification
// =============================================================================

/**
 * GET /api/v1/admin/suppliers/bank-changes
 * List suppliers with pending bank verifications
 */
adminSuppliersRouter.get("/suppliers/bank-changes", requireAdminToken, requirePermission("suppliers", "read"), async (_req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  try {
    const result = await pool.query(
      `SELECT s.id, s.business_name, s.gstin, s.primary_phone, s.primary_email,
              s.bank_account_number, s.bank_ifsc, s.bank_account_name,
              s.bank_verification_status, s.updated_at
       FROM supplier.suppliers s
       WHERE s.bank_verification_status = 'pending'
         AND s.bank_account_number IS NOT NULL
       ORDER BY s.updated_at DESC`
    );

    const data = result.rows.map((s) => ({
      id: s.id,
      businessName: s.business_name,
      gstin: s.gstin,
      phone: s.primary_phone,
      email: s.primary_email,
      bankAccountMasked: s.bank_account_number
        ? "******" + s.bank_account_number.slice(-4)
        : null,
      bankIfsc: s.bank_ifsc,
      bankAccountName: s.bank_account_name,
      bankVerificationStatus: s.bank_verification_status,
      updatedAt: s.updated_at,
    }));

    return res.json({ data, count: data.length });
  } catch (err: any) {
    log.error("[admin/suppliers/bank-changes] Query failed:", err?.message);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch pending bank changes" });
  }
});

/**
 * POST /api/v1/admin/suppliers/:supplierId/bank-verify
 * Approve or reject a supplier's pending bank detail change
 */
adminSuppliersRouter.post("/suppliers/:supplierId/bank-verify", requireAdminToken, requirePermission("suppliers", "approve"), supplierApprovalRateLimiter, async (req, res) => {
  const supplierId = typeof req.params.supplierId === "string" ? req.params.supplierId.trim() : "";
  if (!supplierId || !UUID_PATTERN.test(supplierId)) {
    return res.status(400).json({ error: "supplierId must be a valid UUID" });
  }

  const { action, reason } = req.body as { action?: string; reason?: string };
  if (!action || !["approve", "reject"].includes(action)) {
    return res.status(400).json({ error: "action must be 'approve' or 'reject'" });
  }

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  try {
    // Verify supplier exists and has pending bank verification
    const check = await pool.query(
      `SELECT id, bank_verification_status FROM supplier.suppliers WHERE id = $1::uuid`,
      [supplierId]
    );
    if (!check.rows[0]) {
      return res.status(404).json({ error: "Supplier not found" });
    }
    if (check.rows[0].bank_verification_status !== "pending") {
      return res.status(400).json({
        error: "no_pending_verification",
        message: `Bank verification status is '${check.rows[0].bank_verification_status}', not 'pending'`,
      });
    }

    // adminId may be "master-token" or "jwt-session" (not a UUID) for legacy/session auth
    const rawAdminId = (req as any).adminId || null;
    const adminId = rawAdminId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawAdminId) ? rawAdminId : null;

    if (action === "approve") {
      await pool.query(
        `UPDATE supplier.suppliers
         SET bank_verification_status = 'VERIFIED', bank_verified_at = NOW(), updated_at = NOW()
         WHERE id = $1::uuid`,
        [supplierId]
      );
    } else {
      await pool.query(
        `UPDATE supplier.suppliers
         SET bank_verification_status = 'REJECTED', updated_at = NOW()
         WHERE id = $1::uuid`,
        [supplierId]
      );
    }

    // Log to approval_logs
    try {
      await pool.query(
        `INSERT INTO supplier.approval_logs (entity_type, entity_id, action, from_status, to_status, reason, actor_id)
         VALUES ('bank_change', $1::uuid, $2, 'pending', $3, $4, $5)`,
        [supplierId, action, action === "approve" ? "verified" : "rejected", reason || (action === "approve" ? "Approved by admin" : "Rejected by admin"), adminId || supplierId]
      );
    } catch (logErr) {
      log.error("[SA-P1-008] Failed to log bank verification:", (logErr as Error).message);
    }

    return res.json({
      supplierId,
      bankVerificationStatus: action === "approve" ? "verified" : "rejected",
      action,
    });
  } catch (err: any) {
    log.error("[admin/suppliers/bank-verify] Failed:", err?.message);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to verify bank details" });
  }
});

// =============================================================================
// T-158: BNPL Interest Rate Configuration
// PUT /api/v1/admin/suppliers/:supplierId/bnpl-interest
// Set or update BNPL interest rate for a supplier-store link
// =============================================================================

adminSuppliersRouter.put("/suppliers/:supplierId/bnpl-interest", requireAdminToken, requirePermission("suppliers", "write"), async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { supplierId } = req.params;
  const { storeId, interestRatePercent } = req.body as {
    storeId?: string;
    interestRatePercent?: number;
  };

  // Validate interest rate: 0-100%, with max 2 decimal places
  if (interestRatePercent === undefined || interestRatePercent === null) {
    return res.status(400).json({ error: "interestRatePercent is required" });
  }
  if (typeof interestRatePercent !== 'number' || interestRatePercent < 0 || interestRatePercent > 100) {
    return res.status(422).json({ error: "interestRatePercent must be between 0 and 100" });
  }

  try {
    if (storeId) {
      // Update a specific supplier-store link
      const result = await pool.query(
        `UPDATE supplier.supplier_store_links
         SET bnpl_interest_rate = $1, updated_at = NOW()
         WHERE supplier_id = $2::uuid AND store_id = $3::uuid
         RETURNING supplier_id as "supplierId", store_id as "storeId", bnpl_interest_rate as "bnplInterestRate"`,
        [interestRatePercent, supplierId, storeId]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ error: "Supplier-store link not found" });
      }

      return res.json({ success: true, link: result.rows[0] });
    } else {
      // Update ALL supplier-store links for this supplier (bulk rate)
      const result = await pool.query(
        `UPDATE supplier.supplier_store_links
         SET bnpl_interest_rate = $1, updated_at = NOW()
         WHERE supplier_id = $2::uuid
         RETURNING supplier_id as "supplierId", store_id as "storeId", bnpl_interest_rate as "bnplInterestRate"`,
        [interestRatePercent, supplierId]
      );

      return res.json({
        success: true,
        updatedCount: result.rowCount,
        links: result.rows,
      });
    }
  } catch (err: any) {
    log.error("[T-158] BNPL interest rate update failed:", err?.message);
    return res.status(500).json({ error: "Failed to update BNPL interest rate" });
  }
});

// T-158: GET BNPL interest rate for a supplier
adminSuppliersRouter.get("/suppliers/:supplierId/bnpl-interest", requireAdminToken, requirePermission("suppliers", "read"), async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { supplierId } = req.params;
  const storeId = req.query.storeId as string | undefined;

  try {
    let query = `
      SELECT ssl.supplier_id as "supplierId",
             ssl.store_id as "storeId",
             s.name as "storeName",
             COALESCE(ssl.bnpl_interest_rate, 0) as "bnplInterestRate"
      FROM supplier.supplier_store_links ssl
      LEFT JOIN platform.stores s ON s.id = ssl.store_id
      WHERE ssl.supplier_id = $1::uuid`;
    const params: any[] = [supplierId];

    if (storeId) {
      query += ` AND ssl.store_id = $2::uuid`;
      params.push(storeId);
    }

    query += ` ORDER BY s.name ASC`;

    const result = await pool.query(query, params);
    return res.json({ success: true, links: result.rows });
  } catch (err: any) {
    log.error("[T-158] BNPL interest rate fetch failed:", err?.message);
    return res.status(500).json({ error: "Failed to fetch BNPL interest rates" });
  }
});
