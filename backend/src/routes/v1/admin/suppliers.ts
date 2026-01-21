import { Router } from "express";
import { getPool } from "../../../db/client";
import { requireAdminToken } from "../../../middleware/adminToken";

export const adminSuppliersRouter = Router();

/**
 * GET /api/v1/admin/pending-suppliers
 * Returns suppliers pending verification
 */
adminSuppliersRouter.get("/pending-suppliers", requireAdminToken, async (_req, res) => {
  const pool = getPool();
  if (!pool) {
    return res.status(503).json({ error: "database unavailable" });
  }

  try {
    const result = await pool.query(
      `SELECT
        s.id,
        s.business_name,
        s.gstin,
        s.contact_name,
        s.contact_phone,
        s.contact_email,
        s.address,
        s.city,
        s.state,
        s.pincode,
        s.status,
        s.created_at,
        s.updated_at
      FROM suppliers s
      WHERE s.status = 'pending'
      ORDER BY s.created_at DESC
      LIMIT 100`
    );

    return res.json({
      suppliers: result.rows,
      count: result.rowCount
    });
  } catch (err) {
    console.error("[admin/pending-suppliers] Error:", err);
    return res.status(500).json({ error: "Failed to fetch pending suppliers" });
  }
});

/**
 * GET /api/v1/admin/verified-suppliers
 * Returns verified/active suppliers
 */
adminSuppliersRouter.get("/verified-suppliers", requireAdminToken, async (_req, res) => {
  const pool = getPool();
  if (!pool) {
    return res.status(503).json({ error: "database unavailable" });
  }

  try {
    const result = await pool.query(
      `SELECT
        s.id,
        s.business_name,
        s.gstin,
        s.contact_name,
        s.contact_phone,
        s.contact_email,
        s.address,
        s.city,
        s.state,
        s.pincode,
        s.status,
        s.verified_at,
        s.created_at,
        s.updated_at
      FROM suppliers s
      WHERE s.status = 'verified' OR s.status = 'active'
      ORDER BY s.verified_at DESC NULLS LAST, s.created_at DESC
      LIMIT 100`
    );

    return res.json({
      suppliers: result.rows,
      count: result.rowCount
    });
  } catch (err) {
    console.error("[admin/verified-suppliers] Error:", err);
    return res.status(500).json({ error: "Failed to fetch verified suppliers" });
  }
});

/**
 * POST /api/v1/admin/pending-suppliers/:supplierId/verify
 * Verify a pending supplier
 */
adminSuppliersRouter.post("/pending-suppliers/:supplierId/verify", requireAdminToken, async (req, res) => {
  const { supplierId } = req.params;

  if (!supplierId) {
    return res.status(400).json({ error: "supplierId is required" });
  }

  const pool = getPool();
  if (!pool) {
    return res.status(503).json({ error: "database unavailable" });
  }

  try {
    const result = await pool.query(
      `UPDATE suppliers
       SET status = 'verified', verified_at = NOW(), updated_at = NOW()
       WHERE id = $1::uuid AND status = 'pending'
       RETURNING *`,
      [supplierId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Supplier not found or already verified" });
    }

    return res.json({
      success: true,
      supplier: result.rows[0]
    });
  } catch (err) {
    console.error("[admin/verify-supplier] Error:", err);
    return res.status(500).json({ error: "Failed to verify supplier" });
  }
});

/**
 * POST /api/v1/admin/pending-suppliers/:supplierId/reject
 * Reject a pending supplier
 */
adminSuppliersRouter.post("/pending-suppliers/:supplierId/reject", requireAdminToken, async (req, res) => {
  const { supplierId } = req.params;
  const { reason } = req.body || {};

  if (!supplierId) {
    return res.status(400).json({ error: "supplierId is required" });
  }

  const pool = getPool();
  if (!pool) {
    return res.status(503).json({ error: "database unavailable" });
  }

  try {
    const result = await pool.query(
      `UPDATE suppliers
       SET status = 'rejected', rejection_reason = $2, updated_at = NOW()
       WHERE id = $1::uuid AND status = 'pending'
       RETURNING *`,
      [supplierId, reason || null]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Supplier not found or not pending" });
    }

    return res.json({
      success: true,
      supplier: result.rows[0]
    });
  } catch (err) {
    console.error("[admin/reject-supplier] Error:", err);
    return res.status(500).json({ error: "Failed to reject supplier" });
  }
});
