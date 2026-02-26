import { Router } from "express";
import { getPool } from "../../../db/client";
import { requireDeviceToken } from "../../../middleware/deviceToken";
import { logger } from "../../../lib/logger";

export const posStoreRouter = Router();

// =============================================================================
// PATCH /api/v1/pos/store/payment-settings
// POS device sets UPI VPA + optional bank details after activation
// Auth: requireDeviceToken (x-device-token header)
// =============================================================================
function isValidUpiVpa(vpa: string): boolean {
  const vpaRegex = /^[a-zA-Z0-9._-]{3,}@[a-zA-Z0-9]{2,}$/;
  return vpaRegex.test(vpa) && vpa.length >= 6 && vpa.length <= 100;
}

posStoreRouter.patch("/store/payment-settings", requireDeviceToken, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId } = (req as any).posDevice as { storeId: string };

  const { upiVpa, bankAccountNumber, bankIfsc } = req.body as {
    upiVpa?: string;
    bankAccountNumber?: string;
    bankIfsc?: string;
  };

  // At least one field required
  if (!upiVpa && !bankAccountNumber && !bankIfsc) {
    return res.status(400).json({ error: "At least one payment field is required" });
  }

  // Validate UPI VPA
  const fieldErrors: Record<string, string> = {};
  let trimmedVpa: string | undefined;
  if (upiVpa !== undefined && upiVpa !== null && upiVpa !== "") {
    trimmedVpa = upiVpa.trim().toLowerCase();
    if (!isValidUpiVpa(trimmedVpa)) {
      fieldErrors.upiVpa = "Invalid UPI VPA format. Expected: name@bank (e.g., store@ybl)";
    }
  }

  // Validate bank account number (9-18 digits)
  if (bankAccountNumber !== undefined && bankAccountNumber !== null && bankAccountNumber !== "") {
    const acctRegex = /^\d{9,18}$/;
    if (!acctRegex.test(bankAccountNumber)) {
      fieldErrors.bankAccountNumber = "Bank account number must be 9-18 digits";
    }
  }

  // Validate IFSC code
  if (bankIfsc !== undefined && bankIfsc !== null && bankIfsc !== "") {
    const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
    if (!ifscRegex.test(bankIfsc.toUpperCase())) {
      fieldErrors.bankIfsc = "Invalid IFSC code format. Expected: SBIN0001234";
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return res.status(422).json({ error: { code: "VALIDATION_ERROR", message: "Validation failed", errors: fieldErrors } });
  }

  try {
    // Build dynamic update
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (trimmedVpa !== undefined) {
      updates.push(`upi_vpa = $${paramIndex++}`);
      values.push(trimmedVpa);
    }
    if (bankAccountNumber !== undefined && bankAccountNumber !== "") {
      updates.push(`bank_account_number = $${paramIndex++}`);
      values.push(bankAccountNumber);
    }
    if (bankIfsc !== undefined && bankIfsc !== "") {
      updates.push(`bank_ifsc = $${paramIndex++}`);
      values.push(bankIfsc.toUpperCase());
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    updates.push(`updated_at = NOW()`);
    values.push(storeId);

    const result = await pool.query(
      `UPDATE platform.stores
       SET ${updates.join(", ")}
       WHERE id = $${paramIndex}::uuid
       RETURNING upi_vpa as "upiVpa", bank_account_number as "bankAccountNumber", bank_ifsc as "bankIfsc"`,
      values
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "store not found" });
    }

    const row = result.rows[0];
    return res.json({
      success: true,
      upiVpa: row.upiVpa || null,
      bankAccountNumber: row.bankAccountNumber || null,
      bankIfsc: row.bankIfsc || null,
    });
  } catch (err) {
    logger.error("[POS] payment-settings update error:", { error: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ error: "internal server error" });
  }
});

// GET /api/v1/pos/stores/:storeId/status
posStoreRouter.get("/stores/:storeId/status", requireDeviceToken, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId } = (req as any).posDevice as { storeId: string };

  // SA-P0-001: Return raw status and suspension reason alongside active boolean
  const result = await pool.query(
    `SELECT id::TEXT as id, name, status, status_reason, (status = 'ACTIVE') AS active FROM platform.stores WHERE id = $1::uuid`,
    [storeId]
  );
  const store = result.rows[0];
  if (!store) {
    return res.status(404).json({ error: "store not found" });
  }

  return res.json({
    storeId: store.id,
    active: Boolean(store.active),
    name: store.name,
    status: store.status,
    statusReason: store.status_reason ?? null,
  });
});
