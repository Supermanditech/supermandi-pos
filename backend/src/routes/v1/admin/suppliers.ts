import { Router } from "express";
import { getPool } from "../../../db/client";
import { requireAdminToken } from "../../../middleware/adminToken";

export const adminSuppliersRouter = Router();

/**
 * GET /api/v1/admin/pending-suppliers
 * Returns supplier requests pending verification
 * ITER2-002: Fixed response format to match frontend expectations ({ data: [...] })
 * ITER2-004: Fixed schema namespace (supplier.supplier_requests)
 */
adminSuppliersRouter.get("/pending-suppliers", requireAdminToken, async (_req, res) => {
  const pool = getPool();
  if (!pool) {
    return res.status(503).json({ error: "database unavailable" });
  }

  try {
    // ITER2-004: Query supplier.supplier_requests for pending requests
    const result = await pool.query(
      `SELECT
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
        sr.reviewed_at as "reviewedAt"
      FROM supplier.supplier_requests sr
      LEFT JOIN platform.stores st ON st.id = sr.store_id
      WHERE sr.status = 'pending'
      ORDER BY sr.created_at DESC
      LIMIT 100`
    );

    // ITER2-002: Return { data: [...] } to match frontend expectations
    return res.json({
      data: result.rows,
      count: result.rowCount
    });
  } catch (err: any) {
    console.error("[admin/pending-suppliers] Error:", err);
    // If table doesn't exist, return empty array
    if (err.code === "42P01") {
      return res.json({ data: [], count: 0 });
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
adminSuppliersRouter.get("/verified-suppliers", requireAdminToken, async (req, res) => {
  const pool = getPool();
  if (!pool) {
    return res.status(503).json({ error: "database unavailable" });
  }

  const { search } = req.query;

  try {
    // ITER2-004: Query supplier.suppliers with correct column names
    let whereClause = "WHERE (s.verification_status = 'verified' OR s.status = 'active')";
    const params: any[] = [];

    if (search && typeof search === 'string' && search.trim()) {
      whereClause += ` AND (s.business_name ILIKE $1 OR s.gstin ILIKE $1 OR s.trade_name ILIKE $1)`;
      params.push(`%${search.trim()}%`);
    }

    const result = await pool.query(
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
        s.rating
      FROM supplier.suppliers s
      ${whereClause}
      ORDER BY s.verified_at DESC NULLS LAST, s.created_at DESC
      LIMIT 100`,
      params
    );

    // ITER2-002: Return { data: [...] } to match frontend expectations
    return res.json({
      data: result.rows,
      count: result.rowCount
    });
  } catch (err: any) {
    console.error("[admin/verified-suppliers] Error:", err);
    // If table doesn't exist, return empty array
    if (err.code === "42P01") {
      return res.json({ data: [], count: 0 });
    }
    return res.status(500).json({ error: "Failed to fetch verified suppliers" });
  }
});

/**
 * POST /api/v1/admin/pending-suppliers/:supplierId/verify
 * Verify a pending supplier request
 * ITER2-004: Fixed schema namespace (supplier.supplier_requests)
 */
adminSuppliersRouter.post("/pending-suppliers/:supplierId/verify", requireAdminToken, async (req, res) => {
  const { supplierId } = req.params;
  const { supplierId: linkedSupplierId, verifySupplier, notes } = req.body || {};

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

    // Get the supplier request
    const reqResult = await client.query(
      `SELECT * FROM supplier.supplier_requests WHERE id = $1::uuid AND status = 'pending'`,
      [supplierId]
    );

    if (reqResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Supplier request not found or already processed" });
    }

    const request = reqResult.rows[0];
    let finalSupplierId: string | null = linkedSupplierId || null;

    // If verifySupplier=true, create a new supplier from the request data
    if (verifySupplier && !linkedSupplierId) {
      const supplierResult = await client.query(
        `INSERT INTO supplier.suppliers (gstin, business_name, primary_phone, primary_email, verification_status, status)
         VALUES ($1, $2, $3, $4, 'verified', 'active')
         RETURNING id`,
        [
          request.requested_gstin || 'PENDING-' + supplierId.substring(0, 8),
          request.requested_name || 'Unknown Supplier',
          request.requested_phone,
          request.requested_email
        ]
      );
      finalSupplierId = supplierResult.rows[0].id;
    }

    // Update the request to approved
    await client.query(
      `UPDATE supplier.supplier_requests
       SET status = 'approved', review_notes = $2, reviewed_at = NOW(), approved_supplier_id = $3, updated_at = NOW()
       WHERE id = $1::uuid`,
      [supplierId, notes || null, finalSupplierId]
    );

    await client.query("COMMIT");

    return res.json({
      success: true,
      message: "Supplier request approved",
      approvedSupplierId: finalSupplierId
    });
  } catch (err: any) {
    await client.query("ROLLBACK");
    console.error("[admin/verify-supplier] Error:", err);
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
 */
adminSuppliersRouter.post("/pending-suppliers/:supplierId/reject", requireAdminToken, async (req, res) => {
  const { supplierId } = req.params;
  // ITER2-003: Accept both 'notes' (from frontend) and 'reason' (legacy) field names
  const { notes, reason } = req.body || {};
  const reviewNotes = notes || reason || null;

  if (!supplierId) {
    return res.status(400).json({ error: "supplierId (request ID) is required" });
  }

  const pool = getPool();
  if (!pool) {
    return res.status(503).json({ error: "database unavailable" });
  }

  try {
    const result = await pool.query(
      `UPDATE supplier.supplier_requests
       SET status = 'rejected', review_notes = $2, reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $1::uuid AND status = 'pending'
       RETURNING
         id,
         store_id as "storeId",
         requested_name as "requestedName",
         status,
         review_notes as "reviewNotes",
         reviewed_at as "reviewedAt"`,
      [supplierId, reviewNotes]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Supplier request not found or not pending" });
    }

    return res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (err: any) {
    console.error("[admin/reject-supplier] Error:", err);
    if (err.code === "42P01") {
      return res.status(404).json({ error: "Supplier tables not initialized" });
    }
    return res.status(500).json({ error: "Failed to reject supplier" });
  }
});
