// Retailer Admin Settings Routes
// GL-AUD-004: Store UPI VPA Configuration
// Store-scoped via JWT (x-actor-id header from gateway)

import { Router, Request, Response } from "express";
import { getPool } from "../../../db/client";

export const retailerAdminSettingsRouter = Router();

/**
 * Get store ID from gateway-provided headers
 */
function getStoreId(req: Request): string | null {
  const actorId = req.headers['x-actor-id'];
  return typeof actorId === 'string' ? actorId : null;
}

/**
 * Validate UPI VPA format
 * Format: name@bank (e.g., store@ybl, 9876543210@paytm)
 */
function isValidUpiVpa(vpa: string): boolean {
  // Basic VPA format: alphanumeric.alphanumeric@alphanumeric
  const vpaRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9]+$/;
  return vpaRegex.test(vpa) && vpa.length <= 100;
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
        credit_limit as "creditLimit"
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
    // Verify store exists
    const checkResult = await pool.query(
      `SELECT id, name FROM platform.stores WHERE id = $1`,
      [storeId]
    );

    if (checkResult.rowCount === 0) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Store not found" } });
    }

    // Update UPI VPA
    const result = await pool.query(
      `UPDATE platform.stores
       SET upi_vpa = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING upi_vpa as "upiVpa"`,
      [trimmedVpa, storeId]
    );

    console.log(`[GL-AUD-004] Updated UPI VPA for store ${storeId} to ${trimmedVpa}`);

    return res.json({
      success: true,
      upiVpa: result.rows[0].upiVpa
    });

  } catch (error: any) {
    console.error("[GL-AUD-004] Update UPI VPA error:", error.message);
    return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to update UPI VPA" } });
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
