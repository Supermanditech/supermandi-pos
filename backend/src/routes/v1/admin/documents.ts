// DOCS-001: Admin Document Management Routes
// SuperAdmin endpoints for reviewing, approving, and rejecting documents

import { Router, Request, Response, NextFunction } from "express";
import { getPool } from "../../../db/client";
import { requireAdminToken } from "../../../middleware/adminToken";

const router = Router();

// All admin document routes require admin token authentication
router.use(requireAdminToken);

// =============================================================================
// ROUTES
// =============================================================================

/**
 * GET /api/v1/admin/documents/pending
 * DOCS-001: Get pending documents queue
 */
router.get("/pending", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: 'DB_UNAVAILABLE', message: 'Database unavailable' });
      return;
    }

    const { entity_type, limit = '50', offset = '0' } = req.query;

    let query = `
      SELECT
        d.id,
        d.entity_type,
        d.entity_id,
        d.document_type,
        d.file_name,
        d.file_size,
        d.content_type,
        d.status,
        d.uploaded_at,
        CASE
          WHEN d.entity_type = 'store' THEN s.name
          WHEN d.entity_type = 'supplier' THEN sup.business_name
        END AS entity_name,
        CASE
          WHEN d.entity_type = 'store' THEN s.contact_name
          WHEN d.entity_type = 'supplier' THEN sup.primary_contact_name
        END AS owner_name,
        CASE
          WHEN d.entity_type = 'store' THEN s.status
          WHEN d.entity_type = 'supplier' THEN sup.verification_status
        END AS entity_status
      FROM platform.documents d
      LEFT JOIN platform.stores s ON d.entity_type = 'store' AND d.entity_id = s.id
      LEFT JOIN supplier.suppliers sup ON d.entity_type = 'supplier' AND d.entity_id = sup.id
      WHERE d.status = 'pending' AND d.deleted_at IS NULL
    `;

    const params: any[] = [];
    let paramIndex = 1;

    if (entity_type) {
      query += ` AND d.entity_type = $${paramIndex}`;
      params.push(entity_type);
      paramIndex++;
    }

    query += ` ORDER BY d.uploaded_at ASC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit as string, 10), parseInt(offset as string, 10));

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = `
      SELECT COUNT(*) FROM platform.documents d
      WHERE d.status = 'pending' AND d.deleted_at IS NULL
    `;
    if (entity_type) {
      countQuery += ` AND d.entity_type = $1`;
    }
    const countResult = await pool.query(countQuery, entity_type ? [entity_type] : []);
    const total = parseInt(countResult.rows[0].count, 10);

    res.json({
      documents: result.rows.map(doc => ({
        id: doc.id,
        entity_type: doc.entity_type,
        entity_id: doc.entity_id,
        entity_name: doc.entity_name,
        owner_name: doc.owner_name,
        entity_status: doc.entity_status,
        document_type: doc.document_type,
        file_name: doc.file_name,
        file_size: doc.file_size,
        content_type: doc.content_type,
        status: doc.status,
        uploaded_at: doc.uploaded_at,
        view_url: `/api/v1/documents/${doc.id}`,
      })),
      pagination: {
        total,
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/admin/documents/:id
 * DOCS-001: Get document details for admin review
 */
router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: 'DB_UNAVAILABLE', message: 'Database unavailable' });
      return;
    }

    const result = await pool.query(
      `SELECT
        d.*,
        CASE
          WHEN d.entity_type = 'store' THEN s.name
          WHEN d.entity_type = 'supplier' THEN sup.business_name
        END AS entity_name,
        CASE
          WHEN d.entity_type = 'store' THEN s.contact_name
          WHEN d.entity_type = 'supplier' THEN sup.primary_contact_name
        END AS owner_name,
        CASE
          WHEN d.entity_type = 'store' THEN s.contact_phone
          WHEN d.entity_type = 'supplier' THEN sup.primary_phone
        END AS contact_phone
      FROM platform.documents d
      LEFT JOIN platform.stores s ON d.entity_type = 'store' AND d.entity_id = s.id
      LEFT JOIN supplier.suppliers sup ON d.entity_type = 'supplier' AND d.entity_id = sup.id
      WHERE d.id = $1::uuid`,
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Document not found',
      });
      return;
    }

    const doc = result.rows[0];

    // Get audit history
    const auditResult = await pool.query(
      `SELECT action, old_status, new_status, reason, created_at
       FROM platform.document_audit
       WHERE document_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [id]
    );

    res.json({
      id: doc.id,
      entity_type: doc.entity_type,
      entity_id: doc.entity_id,
      entity_name: doc.entity_name,
      owner_name: doc.owner_name,
      contact_phone: doc.contact_phone,
      document_type: doc.document_type,
      file_name: doc.file_name,
      file_size: doc.file_size,
      content_type: doc.content_type,
      status: doc.status,
      rejection_reason: doc.rejection_reason,
      verified_by: doc.verified_by,
      verified_at: doc.verified_at,
      uploaded_at: doc.uploaded_at,
      created_at: doc.created_at,
      is_deleted: !!doc.deleted_at,
      view_url: `/api/v1/documents/${doc.id}`,
      audit_history: auditResult.rows,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/v1/admin/documents/:id/verify
 * DOCS-001: Approve a document
 */
router.patch("/:id/verify", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const adminId = (req as any).adminUserId || (req as any).userId;

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: 'DB_UNAVAILABLE', message: 'Database unavailable' });
      return;
    }

    // PRA-086: Wrap verify + entity status update in transaction
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const result = await client.query(
        `UPDATE platform.documents
         SET status = 'approved',
             verified_by = $2::uuid,
             verified_at = NOW(),
             rejection_reason = NULL,
             updated_at = NOW()
         WHERE id = $1::uuid AND deleted_at IS NULL
         RETURNING id, entity_type, entity_id, document_type, status`,
        [id, adminId]
      );

      if (result.rows.length === 0) {
        await client.query("ROLLBACK");
        client.release();
        res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Document not found or already deleted',
        });
        return;
      }

      const doc = result.rows[0];

      // Update entity kyc_complete flag if all docs approved
      await updateEntityDocumentStatus(client, doc.entity_type, doc.entity_id);

      await client.query("COMMIT");

      res.json({
        success: true,
        document: {
          id: doc.id,
          entity_type: doc.entity_type,
          entity_id: doc.entity_id,
          document_type: doc.document_type,
          status: doc.status,
        },
        message: 'Document approved successfully',
      });
    } catch (txErr) {
      await client.query("ROLLBACK");
      throw txErr;
    } finally {
      client.release();
    }
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/v1/admin/documents/:id/reject
 * DOCS-001: Reject a document with reason
 */
router.patch("/:id/reject", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const adminId = (req as any).adminUserId || (req as any).userId;

    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Rejection reason is required (minimum 5 characters)',
      });
      return;
    }

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: 'DB_UNAVAILABLE', message: 'Database unavailable' });
      return;
    }

    // PRA-086: Wrap reject + entity status update in transaction
    const client = await pool.connect();
    let doc: any;
    try {
      await client.query("BEGIN");

      const result = await client.query(
        `UPDATE platform.documents
         SET status = 'rejected',
             verified_by = $2::uuid,
             verified_at = NOW(),
             rejection_reason = $3,
             updated_at = NOW()
         WHERE id = $1::uuid AND deleted_at IS NULL
         RETURNING id, entity_type, entity_id, document_type, status, rejection_reason`,
        [id, adminId, reason.trim()]
      );

      if (result.rows.length === 0) {
        await client.query("ROLLBACK");
        client.release();
        res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Document not found or already deleted',
        });
        return;
      }

      doc = result.rows[0];

      // Update entity kyc_complete flag
      await updateEntityDocumentStatus(client, doc.entity_type, doc.entity_id);

      await client.query("COMMIT");
    } catch (txErr) {
      await client.query("ROLLBACK");
      throw txErr;
    } finally {
      client.release();
    }

    res.json({
      success: true,
      document: {
        id: doc.id,
        entity_type: doc.entity_type,
        entity_id: doc.entity_id,
        document_type: doc.document_type,
        status: doc.status,
        rejection_reason: doc.rejection_reason,
      },
      message: 'Document rejected',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/admin/documents/entity/:entityType/:entityId
 * DOCS-001: Get all documents for an entity (admin view)
 */
router.get("/entity/:entityType/:entityId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { entityType, entityId } = req.params;

    if (!['store', 'supplier'].includes(entityType)) {
      res.status(400).json({
        error: 'INVALID_ENTITY_TYPE',
        message: 'entityType must be "store" or "supplier"',
      });
      return;
    }

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: 'DB_UNAVAILABLE', message: 'Database unavailable' });
      return;
    }

    const result = await pool.query(
      `SELECT
        id, document_type, file_name, file_size, content_type,
        status, rejection_reason, uploaded_at, verified_at, verified_by
      FROM platform.documents
      WHERE entity_type = $1 AND entity_id = $2::uuid AND deleted_at IS NULL
      ORDER BY document_type, uploaded_at DESC`,
      [entityType, entityId]
    );

    // Get entity info
    let entityInfo: any = null;
    if (entityType === 'store') {
      const storeResult = await pool.query(
        `SELECT id, name, contact_name, contact_phone, status, kyc_complete
         FROM platform.stores WHERE id = $1::uuid`,
        [entityId]
      );
      entityInfo = storeResult.rows[0];
    } else {
      const supplierResult = await pool.query(
        `SELECT id, business_name, primary_contact_name, primary_phone, verification_status
         FROM supplier.suppliers WHERE id = $1::uuid`,
        [entityId]
      );
      entityInfo = supplierResult.rows[0];
    }

    res.json({
      entity_type: entityType,
      entity_id: entityId,
      entity_info: entityInfo,
      documents: result.rows.map(doc => ({
        id: doc.id,
        document_type: doc.document_type,
        file_name: doc.file_name,
        file_size: doc.file_size,
        content_type: doc.content_type,
        status: doc.status,
        rejection_reason: doc.rejection_reason,
        uploaded_at: doc.uploaded_at,
        verified_at: doc.verified_at,
        view_url: `/api/v1/documents/${doc.id}`,
      })),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Helper: Update entity document status flags
 */
async function updateEntityDocumentStatus(pool: any, entityType: string, entityId: string): Promise<void> {
  if (entityType === 'store') {
    // Count approved vs total documents for store
    const result = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'approved') as approved_count,
         COUNT(*) FILTER (WHERE status = 'rejected') as rejected_count,
         COUNT(*) as total_count
       FROM platform.documents
       WHERE entity_type = 'store' AND entity_id = $1::uuid AND deleted_at IS NULL`,
      [entityId]
    );

    const { approved_count, rejected_count } = result.rows[0];

    // Update store kyc_complete flag
    // Consider KYC complete if at least 2 docs approved and none rejected
    const kycComplete = parseInt(approved_count, 10) >= 2 && parseInt(rejected_count, 10) === 0;

    await pool.query(
      `UPDATE platform.stores
       SET kyc_complete = $2, updated_at = NOW()
       WHERE id = $1::uuid`,
      [entityId, kycComplete]
    );

    // If any doc rejected, set store status to NEEDS_FIX
    if (parseInt(rejected_count, 10) > 0) {
      await pool.query(
        `UPDATE platform.stores
         SET status = 'NEEDS_FIX', status_reason = 'Document rejected - please resubmit', updated_at = NOW()
         WHERE id = $1::uuid AND status NOT IN ('SUSPENDED', 'ACTIVE')`,
        [entityId]
      );
    }
  }
  // Note: Supplier documents are also handled via supplier.kyc_documents table
  // for backward compatibility with existing KYC flow
}

export const adminDocumentsRouter = router;
