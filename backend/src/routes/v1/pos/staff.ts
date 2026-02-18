// SA-P1-001: POS staff PIN login endpoint
import { Router } from "express";
import bcrypt from "bcryptjs";
import { getPool } from "../../../db/client";
import { requireDeviceToken } from "../../../middleware/deviceToken";
import type { PosDeviceContext } from "../../../middleware/deviceToken";
import { log } from "../../../lib/logger";

export const posStaffRouter = Router();

// POST /api/v1/pos/staff/login
// Authenticates a store staff member by phone + PIN
posStaffRouter.post("/staff/login", requireDeviceToken, async (req, res) => {
  try {
    const { phone, pin } = req.body ?? {};
    const posDevice = (req as any).posDevice as PosDeviceContext;

    if (!phone || typeof phone !== "string" || !pin || typeof pin !== "string") {
      return res.status(400).json({
        error: { code: "INVALID_INPUT", message: "phone and pin are required" }
      });
    }

    // Validate PIN format: 4-6 digits
    if (!/^\d{4,6}$/.test(pin)) {
      return res.status(400).json({
        error: { code: "INVALID_PIN_FORMAT", message: "PIN must be 4-6 digits" }
      });
    }

    const pool = getPool();
    if (!pool) {
      return res.status(503).json({ error: { code: "SERVICE_UNAVAILABLE", message: "Database unavailable" } });
    }

    // Lookup staff by store_id + phone + active
    const result = await pool.query(
      `SELECT id, name, phone, pin_hash, role
       FROM platform.store_staff
       WHERE store_id = $1::uuid AND phone = $2 AND is_active = true`,
      [posDevice.storeId, phone.trim()]
    );

    const staff = result.rows[0];
    if (!staff) {
      return res.status(401).json({
        error: { code: "STAFF_INVALID_CREDENTIALS", message: "Invalid phone or PIN" }
      });
    }

    // Verify PIN
    const pinValid = await bcrypt.compare(pin, staff.pin_hash);
    if (!pinValid) {
      return res.status(401).json({
        error: { code: "STAFF_INVALID_CREDENTIALS", message: "Invalid phone or PIN" }
      });
    }

    return res.json({
      staffId: staff.id,
      name: staff.name,
      role: staff.role
    });
  } catch (err) {
    log.error("[POS Staff Login] Error:", err);
    return res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Staff login failed" }
    });
  }
});
