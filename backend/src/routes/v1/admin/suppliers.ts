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

// =============================================================================
// SM-008: SuperAdmin Approval APIs for self-registered suppliers
// =============================================================================

/**
 * GET /api/v1/admin/suppliers/pending
 * List all self-registered suppliers pending verification (from SM-005)
 */
adminSuppliersRouter.get("/suppliers/pending", requireAdminToken, async (_req, res) => {
  const pool = getPool();
  if (!pool) {
    return res.status(503).json({ error: "database unavailable" });
  }

  try {
    const result = await pool.query(
      `SELECT
        s.id,
        s.business_name as "businessName",
        s.gstin,
        s.primary_email as "email",
        s.primary_phone as "phone",
        s.created_at as "createdAt",
        COALESCE(pc.product_count, 0) as "productCount"
      FROM supplier.suppliers s
      LEFT JOIN (
        SELECT supplier_id, COUNT(*) as product_count
        FROM catalog.supplier_products
        GROUP BY supplier_id
      ) pc ON pc.supplier_id = s.id
      WHERE s.verification_status = 'pending'
      ORDER BY s.created_at DESC
      LIMIT 100`
    );

    return res.json({
      data: result.rows,
      count: result.rowCount
    });
  } catch (err: any) {
    console.error("[admin/suppliers/pending] Error:", err);
    if (err.code === "42P01") {
      return res.json({ data: [], count: 0 });
    }
    return res.status(500).json({ error: "Failed to fetch pending suppliers" });
  }
});

/**
 * POST /api/v1/admin/suppliers/:supplierId/approve
 * Approve a self-registered supplier
 */
adminSuppliersRouter.post("/suppliers/:supplierId/approve", requireAdminToken, async (req, res) => {
  const { supplierId } = req.params;
  // Use a fixed system admin UUID when no admin ID is available
  const adminId = (req as any).adminId || '00000000-0000-0000-0000-000000000001';

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

    if (checkResult.rows[0].verification_status !== 'pending') {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Supplier is not pending verification" });
    }

    // Update supplier to verified
    const updateResult = await client.query(
      `UPDATE supplier.suppliers
       SET verification_status = 'verified', verified_at = NOW(), status = 'active'
       WHERE id = $1::uuid
       RETURNING id, verification_status as "status", verified_at as "verifiedAt"`,
      [supplierId]
    );

    // Log the approval
    await client.query(
      `INSERT INTO supplier.approval_logs (entity_type, entity_id, action, from_status, to_status, actor_id)
       VALUES ('supplier', $1::uuid, 'approve', 'pending', 'verified', $2::uuid)`,
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
    console.error("[admin/suppliers/approve] Error:", err);
    return res.status(500).json({ error: "Failed to approve supplier" });
  } finally {
    client.release();
  }
});

/**
 * POST /api/v1/admin/suppliers/:supplierId/reject
 * Reject a self-registered supplier
 */
adminSuppliersRouter.post("/suppliers/:supplierId/reject", requireAdminToken, async (req, res) => {
  const { supplierId } = req.params;
  const { reason } = req.body || {};
  const adminId = (req as any).adminId || '00000000-0000-0000-0000-000000000001';

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

    if (checkResult.rows[0].verification_status !== 'pending') {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Supplier is not pending verification" });
    }

    // Update supplier to rejected
    const updateResult = await client.query(
      `UPDATE supplier.suppliers
       SET verification_status = 'rejected', status = 'inactive'
       WHERE id = $1::uuid
       RETURNING id, verification_status as "status"`,
      [supplierId]
    );

    // Log the rejection
    await client.query(
      `INSERT INTO supplier.approval_logs (entity_type, entity_id, action, from_status, to_status, actor_id, reason)
       VALUES ('supplier', $1::uuid, 'reject', 'pending', 'rejected', $2::uuid, $3)`,
      [supplierId, adminId, reason || null]
    );

    await client.query("COMMIT");

    return res.json({
      supplierId: updateResult.rows[0].id,
      status: updateResult.rows[0].status
    });
  } catch (err: any) {
    await client.query("ROLLBACK");
    console.error("[admin/suppliers/reject] Error:", err);
    return res.status(500).json({ error: "Failed to reject supplier" });
  } finally {
    client.release();
  }
});

/**
 * GET /api/v1/admin/products/pending
 * List all products pending approval
 */
adminSuppliersRouter.get("/products/pending", requireAdminToken, async (_req, res) => {
  const pool = getPool();
  if (!pool) {
    return res.status(503).json({ error: "database unavailable" });
  }

  try {
    const result = await pool.query(
      `SELECT
        sp.id,
        sp.name as "productName",
        sp.supplier_sku as "skuCode",
        sp.barcode,
        sp.purchase_price as "purchasePrice",
        sp.mrp,
        sp.moq,
        sp.created_at as "createdAt",
        s.id as "supplierId",
        s.business_name as "supplierName"
      FROM catalog.supplier_products sp
      JOIN supplier.suppliers s ON s.id = sp.supplier_id
      WHERE sp.approval_status = 'pending'
      ORDER BY sp.created_at DESC
      LIMIT 100`
    );

    return res.json({
      data: result.rows,
      count: result.rowCount
    });
  } catch (err: any) {
    console.error("[admin/products/pending] Error:", err);
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
adminSuppliersRouter.post("/products/:productId/approve", requireAdminToken, async (req, res) => {
  const { productId } = req.params;
  const adminId = (req as any).adminId || '00000000-0000-0000-0000-000000000001';

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
      `SELECT id, approval_status, supplier_id FROM catalog.supplier_products WHERE id = $1::uuid`,
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

    // Update product to approved
    const updateResult = await client.query(
      `UPDATE catalog.supplier_products
       SET approval_status = 'approved', approved_at = NOW(), approved_by = $2::uuid
       WHERE id = $1::uuid
       RETURNING id, approval_status as "approvalStatus", approved_at as "approvedAt"`,
      [productId, adminId]
    );

    // Log the approval
    await client.query(
      `INSERT INTO supplier.approval_logs (entity_type, entity_id, action, from_status, to_status, actor_id)
       VALUES ('product', $1::uuid, 'approve', 'pending', 'approved', $2::uuid)`,
      [productId, adminId]
    );

    await client.query("COMMIT");

    return res.json({
      productId: updateResult.rows[0].id,
      approvalStatus: updateResult.rows[0].approvalStatus,
      approvedAt: updateResult.rows[0].approvedAt
    });
  } catch (err: any) {
    await client.query("ROLLBACK");
    console.error("[admin/products/approve] Error:", err);
    return res.status(500).json({ error: "Failed to approve product" });
  } finally {
    client.release();
  }
});

/**
 * POST /api/v1/admin/products/:productId/reject
 * Reject a product
 */
adminSuppliersRouter.post("/products/:productId/reject", requireAdminToken, async (req, res) => {
  const { productId } = req.params;
  const { reason } = req.body || {};
  const adminId = (req as any).adminId || '00000000-0000-0000-0000-000000000001';

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
    await client.query(
      `INSERT INTO supplier.approval_logs (entity_type, entity_id, action, from_status, to_status, actor_id, reason)
       VALUES ('product', $1::uuid, 'reject', 'pending', 'rejected', $2::uuid, $3)`,
      [productId, adminId, reason || null]
    );

    await client.query("COMMIT");

    return res.json({
      productId: updateResult.rows[0].id,
      approvalStatus: updateResult.rows[0].approvalStatus
    });
  } catch (err: any) {
    await client.query("ROLLBACK");
    console.error("[admin/products/reject] Error:", err);
    return res.status(500).json({ error: "Failed to reject product" });
  } finally {
    client.release();
  }
});

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
adminSuppliersRouter.put("/products/:productId/edit", requireAdminToken, async (req, res) => {
  const { productId } = req.params;
  const {
    editedName,
    editedCategory,
    superMandiMarginMinor,
    marginPercent,
    bnplEligible,
    bnplMaxDays
  } = req.body || {};
  const adminId = (req as any).adminId || '00000000-0000-0000-0000-000000000001';

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

  const pool = getPool();
  if (!pool) {
    return res.status(503).json({ error: "database unavailable" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Get current product data for comparison
    const checkResult = await client.query(
      `SELECT
        id, name, category, purchase_price,
        edited_name, edited_category,
        supermandi_margin_minor, margin_percent,
        bnpl_eligible, bnpl_max_days,
        approval_status
       FROM catalog.supplier_products
       WHERE id = $1::uuid`,
      [productId]
    );

    if (checkResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Product not found" });
    }

    const current = checkResult.rows[0];
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
         bnpl_max_days as "bnplMaxDays"`,
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
         VALUES ('product', $1::uuid, 'edit', $2::uuid, $3::jsonb)`,
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
    console.error("[admin/products/edit] Error:", err);
    return res.status(500).json({ error: "Failed to edit product" });
  } finally {
    client.release();
  }
});
