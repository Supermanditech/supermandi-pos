// Retailer Admin Settings Routes
// GL-AUD-004: Store UPI VPA Configuration
// RET-WEB-003: PAYMENTS_SUBMITTED status transition on UPI save
// Store-scoped via JWT (x-actor-id header from gateway)

import { Router, Request, Response } from "express";
import { getPool } from "../../../db/client";
import { StoreStatus, type StoreStatusType } from "../../../services/storeStateMachine";

export const retailerAdminSettingsRouter = Router();

/**
 * Get store ID from gateway-provided headers
 */
function getStoreId(req: Request): string | null {
  const actorId = req.headers['x-actor-id'];
  return typeof actorId === 'string' ? actorId : null;
}

/**
 * GO-LIVE-123: Strict UPI VPA validation
 * Format: name@bank (e.g., store@ybl, 9876543210@paytm)
 * Rules:
 * - Min 3 chars before @
 * - Min 2 chars after @ (valid bank handles are 2+ chars)
 * - Max 100 chars total
 * - Only alphanumeric, dots, underscores, dashes allowed
 */
function isValidUpiVpa(vpa: string): boolean {
  // GO-LIVE-123: Stricter regex - at least 3 chars before @, 2+ chars for bank handle
  const vpaRegex = /^[a-zA-Z0-9._-]{3,}@[a-zA-Z0-9]{2,}$/;
  return vpaRegex.test(vpa) && vpa.length >= 6 && vpa.length <= 100;
}

// =============================================================================
// GET /api/v1/retailer-admin/settings
// Get current store settings
// =============================================================================

retailerAdminSettingsRouter.get("/settings", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: { code: "INTERNAL_ERROR", message: "Database unavailable" } });

  const storeId = getStoreId(req);
  if (!storeId) {
    return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Store not identified" } });
  }

  try {
    const result = await pool.query(
      `SELECT
        id,
        name,
        upi_vpa as "upiVpa",
        razorpay_account_id as "razorpayAccountId",
        bnpl_enabled as "bnplEnabled",
        bnpl_credit_limit as "bnplCreditLimit",
        bnpl_max_days as "bnplMaxDays",
        credit_enabled as "creditEnabled",
        credit_limit as "creditLimit",
        receipt_footer as "receiptFooter",
        address,
        phone,
        gst_number as "gstNumber",
        tax_rate as "taxRate",
        operating_hours as "operatingHours"
      FROM platform.stores
      WHERE id = $1`,
      [storeId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Store not found" } });
    }

    const store = result.rows[0];

    return res.json({
      success: true,
      settings: {
        storeName: store.name,
        upiVpa: store.upiVpa || null,
        razorpayAccountId: store.razorpayAccountId || null,
        bnplEnabled: store.bnplEnabled || false,
        bnplCreditLimit: store.bnplCreditLimit || 5000000,
        bnplMaxDays: store.bnplMaxDays || 7,
        creditEnabled: store.creditEnabled || false,
        creditLimit: store.creditLimit || 0,
        receiptFooter: store.receiptFooter || '',
        address: store.address || '',
        phone: store.phone || '',
        gstNumber: store.gstNumber || '',
        taxRate: store.taxRate ?? 18.0,
        operatingHours: store.operatingHours || { open: '09:00', close: '21:00' },
      }
    });

  } catch (error: any) {
    console.error("[GL-AUD-004] Get settings error:", error.message);
    return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to get settings" } });
  }
});

// =============================================================================
// PUT /api/v1/retailer-admin/settings/upi
// GL-AUD-004: Update store UPI VPA
// =============================================================================

retailerAdminSettingsRouter.put("/settings/upi", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: { code: "INTERNAL_ERROR", message: "Database unavailable" } });

  const storeId = getStoreId(req);
  if (!storeId) {
    return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Store not identified" } });
  }

  const { upiVpa } = req.body as { upiVpa?: string };

  // Validate UPI VPA format
  if (!upiVpa || typeof upiVpa !== 'string') {
    return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "upiVpa is required" } });
  }

  const trimmedVpa = upiVpa.trim().toLowerCase();

  if (!isValidUpiVpa(trimmedVpa)) {
    return res.status(422).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid UPI VPA format. Expected format: name@bank (e.g., store@ybl)"
      }
    });
  }

  try {
    // RET-WEB-003: Get current store status for transition check
    const checkResult = await pool.query(
      `SELECT id, name, status FROM platform.stores WHERE id = $1`,
      [storeId]
    );

    if (checkResult.rowCount === 0) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Store not found" } });
    }

    const currentStatus = checkResult.rows[0].status as StoreStatusType;

    // RET-WEB-003: Determine if status should transition to PAYMENTS_SUBMITTED
    // Valid transition: KYC_SUBMITTED → PAYMENTS_SUBMITTED when UPI is saved
    const shouldTransition = currentStatus === StoreStatus.KYC_SUBMITTED;
    const newStatus = shouldTransition ? StoreStatus.PAYMENTS_SUBMITTED : currentStatus;

    // Update UPI VPA and upi_complete flag, optionally transition status
    // Note: status_reason is set for the audit trigger; status_updated_by is retailer's store ID
    // RET-WEB-003: Use explicit values to avoid type inference issues
    const statusReason = shouldTransition ? 'UPI VPA saved via retailer-admin settings' : null;
    const statusUpdatedBy = shouldTransition ? storeId : null;
    const result = await pool.query(
      `UPDATE platform.stores
       SET upi_vpa = $1,
           upi_complete = true,
           status = $3::varchar,
           status_reason = COALESCE($4, status_reason),
           status_updated_by = COALESCE($5::uuid, status_updated_by),
           updated_at = NOW()
       WHERE id = $2
       RETURNING upi_vpa as "upiVpa", status`,
      [trimmedVpa, storeId, newStatus, statusReason, statusUpdatedBy]
    );

    // RET-WEB-003: Log status transition if it occurred
    if (shouldTransition) {
      console.log(`[RET-WEB-003] Store ${storeId} transitioned: ${currentStatus} → ${newStatus}`);
      // Audit log automatically created by trigger on platform.stores
    }

    console.log(`[GL-AUD-004] Updated UPI VPA for store ${storeId} to ${trimmedVpa}`);

    return res.json({
      success: true,
      upiVpa: result.rows[0].upiVpa,
      status: result.rows[0].status,
      statusTransitioned: shouldTransition
    });

  } catch (error: any) {
    console.error("[GL-AUD-004] Update UPI VPA error:", error.message);
    return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to update UPI VPA" } });
  }
});

// =============================================================================
// PATCH /api/v1/retailer-admin/settings
// GO-LIVE-016: Update store settings including receipt footer
// =============================================================================

retailerAdminSettingsRouter.patch("/settings", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: { code: "INTERNAL_ERROR", message: "Database unavailable" } });

  const storeId = getStoreId(req);
  if (!storeId) {
    return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Store not identified" } });
  }

  const {
    storeName, upiVpa, receiptFooter, address, phone, gstNumber,
    taxRate, operatingHours
  } = req.body;

  // GO-LIVE-251: Collect all validation errors as field-mapped
  const fieldErrors: Record<string, string> = {};

  // GO-LIVE-016: Receipt footer max length validation
  const MAX_RECEIPT_FOOTER = 200;
  if (receiptFooter !== undefined && receiptFooter.length > MAX_RECEIPT_FOOTER) {
    fieldErrors.receiptFooter = `Receipt footer cannot exceed ${MAX_RECEIPT_FOOTER} characters`;
  }

  // Validate UPI VPA if provided
  if (upiVpa !== undefined && upiVpa !== null && upiVpa !== '') {
    const trimmedVpa = upiVpa.trim().toLowerCase();
    if (!isValidUpiVpa(trimmedVpa)) {
      fieldErrors.upiVpa = "Invalid UPI VPA format. Expected format: name@bank (e.g., store@ybl)";
    }
  }

  // Validate phone if provided
  if (phone !== undefined && phone !== null && phone !== '') {
    const phoneRegex = /^[6-9]\d{9}$/;
    if (!phoneRegex.test(phone)) {
      fieldErrors.phone = "Invalid phone number. Must be 10 digits starting with 6-9";
    }
  }

  // Validate GST number if provided
  if (gstNumber !== undefined && gstNumber !== null && gstNumber !== '') {
    const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    if (!gstRegex.test(gstNumber)) {
      fieldErrors.gstNumber = "Invalid GSTIN format";
    }
  }

  // GO-LIVE-251: Return all field errors at once
  if (Object.keys(fieldErrors).length > 0) {
    return res.status(422).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Validation failed",
        errors: fieldErrors
      }
    });
  }

  try {
    // Build dynamic update query
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (storeName !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(storeName.trim());
    }
    if (upiVpa !== undefined) {
      updates.push(`upi_vpa = $${paramIndex++}`);
      values.push(upiVpa ? upiVpa.trim().toLowerCase() : null);
    }
    if (receiptFooter !== undefined) {
      updates.push(`receipt_footer = $${paramIndex++}`);
      values.push(receiptFooter || '');
    }
    if (address !== undefined) {
      updates.push(`address = $${paramIndex++}`);
      values.push(address || null);
    }
    if (phone !== undefined) {
      updates.push(`phone = $${paramIndex++}`);
      values.push(phone || null);
    }
    if (gstNumber !== undefined) {
      updates.push(`gst_number = $${paramIndex++}`);
      values.push(gstNumber || null);
    }
    if (taxRate !== undefined) {
      updates.push(`tax_rate = $${paramIndex++}`);
      values.push(taxRate !== null ? parseFloat(taxRate) : 18.0);
    }
    if (operatingHours !== undefined) {
      updates.push(`operating_hours = $${paramIndex++}`);
      values.push(JSON.stringify(operatingHours || { open: '09:00', close: '21:00' }));
    }

    if (updates.length === 0) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "No settings to update" }
      });
    }

    updates.push(`updated_at = NOW()`);
    values.push(storeId);

    const result = await pool.query(
      `UPDATE platform.stores
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING
         name as "storeName",
         upi_vpa as "upiVpa",
         receipt_footer as "receiptFooter",
         address,
         phone,
         gst_number as "gstNumber",
         tax_rate as "taxRate",
         operating_hours as "operatingHours"`,
      values
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Store not found" } });
    }

    console.log(`[GO-LIVE-016] Updated settings for store ${storeId}`);

    return res.json({
      success: true,
      settings: result.rows[0]
    });

  } catch (error: any) {
    console.error("[GO-LIVE-016] Update settings error:", error.message);
    return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to update settings" } });
  }
});

// =============================================================================
// DELETE /api/v1/retailer-admin/settings/upi
// Remove store UPI VPA (disable UPI payments)
// =============================================================================

retailerAdminSettingsRouter.delete("/settings/upi", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: { code: "INTERNAL_ERROR", message: "Database unavailable" } });

  const storeId = getStoreId(req);
  if (!storeId) {
    return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Store not identified" } });
  }

  try {
    await pool.query(
      `UPDATE platform.stores
       SET upi_vpa = NULL, updated_at = NOW()
       WHERE id = $1`,
      [storeId]
    );

    console.log(`[GL-AUD-004] Removed UPI VPA for store ${storeId}`);

    return res.json({ success: true, upiVpa: null });

  } catch (error: any) {
    console.error("[GL-AUD-004] Remove UPI VPA error:", error.message);
    return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to remove UPI VPA" } });
  }
});

export default retailerAdminSettingsRouter;
